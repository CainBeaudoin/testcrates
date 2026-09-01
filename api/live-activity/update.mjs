// Live Activity push relay: pushes a pack-opening state to APNs so the
// Dynamic Island updates from the backend rather than only from the phone.
//
// Why this exists at all. The Chosen iOS companion app can update its own
// Live Activity locally the instant the web layer resolves a pack, and that
// is the fast path — no network, no latency, works offline (see
// LiveActivityController.swift). This endpoint is the *remote* path, for the
// cases a local update can't cover:
//
//   - the result is settled after the app is backgrounded or killed
//   - a result that becomes authoritative server-side later (a real
//     settlement, a shipped item, a corrected balance)
//   - ending an activity the app is no longer running to end
//
// It deliberately holds no pack logic. It takes an already-decided result and
// forwards it. Rolling a pack here would put the same rules in two places.
//
// It is also stateless: the caller supplies the activity's push token, which
// the app already holds. Nothing is stored, so there's no device table to
// keep, and the only reason the hop through the server exists is that the
// APNs signing key must never reach a client.
//
// Configure with APNS_KEY_ID, APNS_TEAM_ID, APNS_AUTH_KEY (the .p8 contents),
// APNS_BUNDLE_ID and optionally APNS_ENV=sandbox. Unconfigured it 503s, the
// same shape as api/stockx.mjs — the app keeps updating locally and nothing
// user-facing breaks.

import { createPrivateKey, sign as cryptoSign } from "node:crypto";
import http2 from "node:http2";

const HOST_PROD = "https://api.push.apple.com";
const HOST_SANDBOX = "https://api.sandbox.push.apple.com";

// Apple's ceiling for a Live Activity content state.
const MAX_STATE_BYTES = 4096;

// The phases the widget knows how to draw (see PackActivityAttributes.swift).
const PHASES = new Set(["opening", "creditsWon", "itemWon"]);

// APNs rejects tokens older than an hour and rate-limits regeneration, so one
// token is reused across invocations of a warm lambda.
let cachedToken = null;

function providerToken() {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const authKey = process.env.APNS_AUTH_KEY;
  if (!keyId || !teamId || !authKey) return null;

  const now = Math.floor(Date.now() / 1000);
  // Refreshed well inside the hour, and well outside the 20-minute floor
  // Apple asks providers to respect.
  if (cachedToken && now - cachedToken.issued < 45 * 60) return cachedToken.jwt;

  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const claims = { iss: teamId, iat: now };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${b64(header)}.${b64(claims)}`;

  // The .p8 arrives from the environment with its newlines escaped more often
  // than not, depending on how it was pasted in.
  const pem = authKey.includes("\\n") ? authKey.replace(/\\n/g, "\n") : authKey;
  // ES256 in a JWT is the raw r||s pair, not the DER sequence Node signs with
  // by default.
  const signature = cryptoSign(null, Buffer.from(body), {
    key: createPrivateKey(pem),
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");

  cachedToken = { jwt: `${body}.${signature}`, issued: now };
  return cachedToken.jwt;
}

// One request per connection. A pooled client would save the handshake, but a
// serverless instance can be frozen between invocations with the socket still
// open, and a half-dead connection is worse than a fresh one.
function push({ host, path, headers, payload }) {
  return new Promise((resolve) => {
    const client = http2.connect(host);
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      client.close();
      resolve(result);
    };

    client.on("error", (err) => finish({ status: 502, body: String(err) }));

    const req = client.request({ ":method": "POST", ":path": path, ...headers });
    req.setTimeout(10000, () => {
      req.close();
      finish({ status: 504, body: "apns_timeout" });
    });

    let status = 0;
    let body = "";
    req.on("response", (h) => {
      status = h[":status"];
    });
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => finish({ status, body }));
    req.on("error", (err) => finish({ status: 502, body: String(err) }));

    req.end(payload);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const jwt = providerToken();
  const bundleId = process.env.APNS_BUNDLE_ID;
  if (!jwt || !bundleId) {
    // Not configured is not an outage: the app updates its own activity
    // locally and never needed this.
    return res.status(503).json({ error: "not_configured" });
  }

  const { token, event = "update", state, dismissInSeconds, staleInSeconds } = req.body ?? {};
  if (!token || typeof token !== "string") {
    return res.status(400).json({ error: "missing_push_token" });
  }
  if (event !== "update" && event !== "end") {
    return res.status(400).json({ error: "unknown_event" });
  }
  if (event === "update" && (!state || !PHASES.has(state.phase))) {
    return res.status(400).json({ error: "unknown_phase" });
  }

  const now = Math.floor(Date.now() / 1000);
  const aps = { timestamp: now, event };
  if (state) aps["content-state"] = state;
  // Tells the widget when its data should be treated as out of date, so a
  // dropped follow-up push shows a stale state rather than a wrong one.
  if (staleInSeconds) aps["stale-date"] = now + Number(staleInSeconds);
  // "Ended" and "gone" are separate things — an ended activity stays on the
  // Lock Screen until this passes, or up to four hours by default.
  if (event === "end") aps["dismissal-date"] = now + Number(dismissInSeconds ?? 0);

  const payload = JSON.stringify({ aps });
  if (Buffer.byteLength(payload) > MAX_STATE_BYTES) {
    return res.status(413).json({ error: "state_too_large" });
  }

  const result = await push({
    host: process.env.APNS_ENV === "sandbox" ? HOST_SANDBOX : HOST_PROD,
    path: `/3/device/${encodeURIComponent(token)}`,
    headers: {
      authorization: `bearer ${jwt}`,
      // The Live Activity topic is the app's bundle id with this suffix — not
      // the plain bundle id, which is a silent 400 from APNs.
      "apns-topic": `${bundleId}.push-type.liveactivity`,
      "apns-push-type": "liveactivity",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    payload,
  });

  if (result.status !== 200) {
    // A 410/BadDeviceToken means the activity is over and the token is dead —
    // the caller should stop pushing to it.
    return res.status(result.status || 502).json({
      error: "apns_error",
      status: result.status,
      detail: result.body?.slice(0, 400),
    });
  }
  return res.status(200).json({ ok: true });
}
