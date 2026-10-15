// Flip: call heads or tails for a piece from Chosen's catalog.
//
// You pick the piece you want. The other side of the coin is a smaller
// piece, paired automatically (how much smaller is yours to choose:
// Safer, Balanced or Bolder). Land your call and the piece you picked is
// yours; miss and you get the other one. Either way something lands in
// My Items: there's no losing everything on a flip.
//
// The coin is a true 50/50. Chosen's edge is in the price, not the coin:
// a flip costs the average of the two pieces divided by RETURN (92%), so
// over many flips players get back 92% of what they spend, in items at
// market value, and Chosen keeps 8% to source and ship them.
//
//   price = (win + other) / 2 / RETURN
//
// Provably fair: before you flip, the page shows the SHA-256 hash of a
// secret server seed. The result is HMAC-SHA256(server seed, "your
// seed:flip #"), Heads when its first 8 hex digits are under 80000000.
// After the flip the server seed is revealed, so anyone can check both
// that it matches the hash shown beforehand and that it gives that
// result. In this demo the seed lives in the browser; live, it stays on
// Chosen's server until the flip.
//
// Everyone else's flips are simulated, as elsewhere on the site.

export const RETURN = 0.92; // what players get back, over many flips
const EDGE = 1 - RETURN;
const MIN_WIN = 150; // smallest piece you can flip for
const FLOORS = {
  safer: { label: "Safer", ratio: 0.5 },
  balanced: { label: "Balanced", ratio: 0.3 },
  bolder: { label: "Bolder", ratio: 0.12 },
};
const BANDS = [
  { key: "all", label: "All", min: 0, max: Infinity },
  { key: "u300", label: "Under $300", min: 0, max: 300 },
  { key: "300", label: "$300 to $700", min: 300, max: 700 },
  { key: "700", label: "$700 to $1,500", min: 700, max: 1500 },
  { key: "1500", label: "$1,500+", min: 1500, max: Infinity },
];
const PAGE = 24;
const FLIP_MS = 2300;
const STORAGE_KEY = "gotcha_flip_v1";
const CROWD_EVERY_MS = [6000, 11000];

// The two sides' marks: the Chosen cube for Heads, the wordmark's badge
// for Tails. Small, for the call buttons and the flip lists.
const CUBE = `<polygon points="50,6 90,28 90,72 50,94 10,72 10,28" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/><polygon points="50,50 90,28 90,72 50,94" fill="currentColor"/><polyline points="10,28 50,50 50,94" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/>`;
const EMBLEM = {
  heads: CUBE,
  tails: `<rect x="6" y="30" width="88" height="40" rx="11" fill="none" stroke="currentColor" stroke-width="8"/><rect x="22" y="44" width="56" height="12" rx="4" fill="currentColor"/>`,
};
const SIDE = { heads: "Heads", tails: "Tails" };
const other = (side) => (side === "heads" ? "tails" : "heads");
const emblem = (side, size) => `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">${EMBLEM[side]}</svg>`;
const mini = (side) => `<span class="fl-mini">${emblem(side, 12)}</span>`;

const money = (v) => `$${Math.round(v).toLocaleString("en-US")}`;
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const uid = () => Math.random().toString(36).slice(2, 10);
const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
function ago(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 48 * 3600) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ---- Provably fair ----------------------------------------------------------

const enc = (t) => new TextEncoder().encode(t);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const newSeed = (bytes = 32) => hex(crypto.getRandomValues(new Uint8Array(bytes)));
async function sha256(text) {
  return hex(await crypto.subtle.digest("SHA-256", enc(text)));
}
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey("raw", enc(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc(msg)));
}
async function sideFor(server, client, nonce) {
  const h = await hmac(server, `${client}:${nonce}`);
  return parseInt(h.slice(0, 8), 16) < 0x80000000 ? "heads" : "tails";
}
const short = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "…");

// ---- State ------------------------------------------------------------------
// side, pick (a piece's name), mode (a FLOORS key), band, server, hash,
// client, nonce, history: your flips, newest first.

let deps = null;
let root = null;
let state = null;
let items = []; // the catalog, priciest first: { name, image, value, category, rarity }
let shown = PAGE;
let query = "";
let busy = false;
let mathOpen = false;
let coinRot = 0; // the coin's resting angle: 0 Heads up, 180 Tails up
let crowd = [];
let crowdTimer = null;
const proofs = new Set(); // flips whose proof is open

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function initFlip(el, appDeps) {
  root = el;
  deps = appDeps;
  items = deps.catalog
    .filter((p) => p.price > 0 && p.image)
    .map((p) => ({ name: p.name, image: p.image, value: p.price, category: p.category, rarity: p.rarity }))
    .sort((a, b) => b.value - a.value);
  state = load() || {};
  state.side ??= "heads";
  state.mode = FLOORS[state.mode] ? state.mode : "balanced";
  state.band ??= "all";
  state.client ??= newSeed(8);
  state.nonce ??= 1;
  state.history ??= [];
  if (!findItem(state.pick)) state.pick = nearest(700)?.name;
  if (!state.server) {
    state.server = newSeed();
    state.hash = null;
  }
  ensureHash();
  seedCrowd();
  save();
  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  scheduleCrowd();
}

async function ensureHash() {
  if (state.hash) return;
  state.hash = await sha256(state.server);
  save();
  const el = root?.querySelector("[data-fl-hash]");
  if (el) root.querySelectorAll("[data-fl-hash]").forEach((n) => (n.textContent = n.dataset.flHash === "full" ? state.hash : short(state.hash)));
}

const findItem = (name) => items.find((i) => i.name === name);
const nearest = (value) => flippable().reduce((best, i) => (!best || Math.abs(i.value - value) < Math.abs(best.value - value) ? i : best), null);
const flippable = () => items.filter((i) => i.value >= MIN_WIN);

// The other side of the coin for a piece: the catalog piece closest to the
// mode's share of its value, and always clearly under it.
function floorFor(win, mode = state.mode) {
  const target = win.value * FLOORS[mode].ratio;
  let best = null;
  for (const i of items) {
    if (i === win || i.value > win.value * 0.85) continue;
    if (!best || Math.abs(i.value - target) < Math.abs(best.value - target)) best = i;
  }
  return best;
}
const priceFor = (win, floor) => Math.round((win.value + floor.value) / 2 / RETURN);
function current() {
  const win = findItem(state.pick) || nearest(700);
  const floor = floorFor(win);
  return { win, floor, price: priceFor(win, floor) };
}

// ---- Page -------------------------------------------------------------------

export function renderFlip() {
  if (!root) return;
  root.innerHTML = `
    <div class="fl-page">
      <section class="dm-hero fl-hero">
        <div class="fl-media">${stageHTML()}</div>
        <div class="dm-hero-copy fl-copy" id="flCopy">${copyHTML()}</div>
      </section>
      <section class="dm-sec" id="flPicker">
        <div class="dm-sec-head">
          <div>
            <h2 class="dm-h2">Pick what you&rsquo;re flipping for</h2>
            <p class="dm-sub">Any piece from ${money(MIN_WIN)} up. The price and the other side of the coin update as you pick.</p>
          </div>
          <input class="fl-search" id="flSearch" type="search" placeholder="Search pieces" value="${esc(query)}" aria-label="Search pieces">
        </div>
        <div class="dm-filters fl-bands" id="flBands">${bandsHTML()}</div>
        <ul class="fl-grid" id="flGrid">${gridHTML()}</ul>
      </section>
      <section class="dm-sec" id="flMine">${mineHTML()}</section>
      <section class="dm-sec">
        <h2 class="dm-h2">Flipping now</h2>
        <p class="dm-sub">Everyone&rsquo;s flips as they land.</p>
        <ul class="fl-list" id="flCrowd">${crowdHTML()}</ul>
      </section>
      <section class="dm-sec" id="flFair">${fairHTML()}</section>
    </div>`;
  setCoin(coinRot);
  if (busy) setBusy(true);
  startLight();
}

// ---- Light on the coin ---------------------------------------------------------
// One light, up and to the left. Every frame the coin's faces darken as
// they turn from it, a band of shine crosses a face as it passes the angle
// that catches the light, and each slice of the reeded edge is lit by the
// way it faces.

const unit = (x, y, z) => {
  const l = Math.hypot(x, y, z);
  return { x: x / l, y: y / l, z: z / l };
};
const LIGHT = unit(-0.35, -0.55, 0.76);
const HALF = unit(LIGHT.x, LIGHT.y, LIGHT.z + 1); // halfway to the viewer
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
let lightOn = false;

function startLight() {
  if (lightOn) return;
  lightOn = true;
  const edgeDirs = Array.from({ length: EDGES }, (_, k) => {
    const a = (k * 2 * Math.PI) / EDGES;
    return { x: Math.sin(a), y: -Math.cos(a) };
  });
  const frame = () => {
    const coin = root?.querySelector("#flCoin");
    if (!coin || !isOpen()) {
      lightOn = false;
      return;
    }
    if (!document.hidden) {
      const tilt = root.querySelector("#flTilt");
      const m = new DOMMatrix(getComputedStyle(tilt).transform).multiply(new DOMMatrix(getComputedStyle(coin).transform));
      const n = { x: m.m31, y: m.m32, z: m.m33 };
      coin.querySelectorAll(".fl-face").forEach((face, i) => {
        const s = i ? -1 : 1;
        const f = { x: n.x * s, y: n.y * s, z: n.z * s };
        const diffuse = Math.max(0, dot(f, LIGHT));
        const spec = Math.max(0, dot(f, HALF));
        face.style.setProperty("--dark", Math.min(0.4, Math.max(0, (0.8 - diffuse) * 0.6)).toFixed(3));
        face.style.setProperty("--gy", `${((f.y - HALF.y) * 220).toFixed(1)}%`);
        face.style.setProperty("--go", (spec ** 6).toFixed(3));
      });
      coin.querySelectorAll(".fl-edge").forEach((edge, k) => {
        const d = edgeDirs[k];
        const e = { x: m.m11 * d.x + m.m21 * d.y, y: m.m12 * d.x + m.m22 * d.y, z: m.m13 * d.x + m.m23 * d.y };
        edge.style.setProperty("--l", (0.45 + 0.85 * Math.max(0, dot(e, LIGHT))).toFixed(3));
      });
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// The coin's two faces, drawn on a 200 x 200 field: lettering round the
// rim inside a ring of beads, and the side's mark in the middle.
function laurel() {
  const parts = [];
  const pt = (deg, r) => [100 + r * Math.cos((deg * Math.PI) / 180), 100 + r * Math.sin((deg * Math.PI) / 180)];
  for (const side of [1, -1]) {
    // A stem along the rim, from under the badge to near the bottom.
    const [x0, y0] = pt(30, 58);
    const [x1, y1] = pt(84, 58);
    const mx = (x) => (side === 1 ? x : 200 - x);
    parts.push(`<path d="M ${mx(x0).toFixed(1)},${y0.toFixed(1)} A 58,58 0 0 ${side === 1 ? 1 : 0} ${mx(x1).toFixed(1)},${y1.toFixed(1)}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`);
    // Leaves in pairs, one either side of the stem, leaning along it.
    for (let k = 0; k < 6; k++) {
      const deg = 33 + k * 9;
      for (const o of [-1, 1]) {
        const [x, y] = pt(deg, 58 + o * 4.6);
        const rot = deg + 90 + o * 38;
        const X = mx(x);
        const R = side === 1 ? rot : 180 - rot;
        parts.push(`<ellipse cx="${X.toFixed(1)}" cy="${y.toFixed(1)}" rx="5.4" ry="2.1" transform="rotate(${R.toFixed(1)} ${X.toFixed(1)} ${y.toFixed(1)})"/>`);
      }
    }
  }
  return parts.join("");
}
function faceArt(side) {
  const top = side === "heads" ? "CHOSEN" : "FIFTY · FIFTY";
  const topStyle = side === "heads" ? `font-size="16" letter-spacing="5"` : `font-size="12.5" letter-spacing="3"`;
  const mark =
    side === "heads"
      ? `<g transform="translate(57 52) scale(0.86)" class="fl-cube">${CUBE}<text transform="matrix(1 0.55 0 1 0 0)" x="30" y="50" text-anchor="middle" font-size="13" letter-spacing="0.5">WIN</text></g>`
      : `<rect x="40" y="78" width="120" height="38" rx="11" fill="none" stroke="currentColor" stroke-width="4.5"/>
         <text x="100" y="105.5" text-anchor="middle" font-size="23" letter-spacing="1">CHOSEN</text>
         <g class="fl-laurel">${laurel()}</g>`;
  return `
    <svg class="fl-art" viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="87" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="0.01 6.06"/>
      <text ${topStyle}><textPath href="#flArcTop" startOffset="50%" text-anchor="middle">${top}</textPath></text>
      ${mark}
      <text font-size="14" letter-spacing="6"><textPath href="#flArcBot" startOffset="50%" text-anchor="middle">${SIDE[side].toUpperCase()}</textPath></text>
    </svg>
    <i class="fl-glint"></i>`;
}
const EDGES = 48;

function stageHTML() {
  return `
    <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
      <path id="flArcTop" d="M 30,100 A 70,70 0 0 1 170,100"/>
      <path id="flArcBot" d="M 23,100 A 77,77 0 0 0 177,100"/>
    </defs></svg>
    <div class="fl-stage">
      <div class="fl-toss" id="flToss">
        <div class="fl-tilt" id="flTilt">
          <div class="fl-coin" id="flCoin">
            ${Array.from({ length: EDGES }, (_, k) => `<i class="fl-edge" style="--a:${(k * 360) / EDGES}deg"></i>`).join("")}
            <span class="fl-face fl-heads">${faceArt("heads")}</span>
            <span class="fl-face fl-tails">${faceArt("tails")}</span>
          </div>
        </div>
      </div>
      <i class="fl-shadow" id="flShadow"></i>
    </div>
    <p class="fl-result" id="flResult" aria-live="polite">Call it</p>
    <div class="fl-sides" role="radiogroup" aria-label="Your call">
      ${["heads", "tails"]
        .map(
          (s) =>
            `<button class="fl-side${state.side === s ? " active" : ""}" data-fl-side="${s}" role="radio" aria-checked="${state.side === s}">${mini(s)}${SIDE[s]}</button>`
        )
        .join("")}
    </div>
    ${goHTML(current().price, "fl-go-m")}`;
}

// The flip button: beside the pieces on desktop, under the coin on a phone.
const goHTML = (price, cls = "") =>
  `<button class="dm-open fl-go ${cls}" data-fl="go"><span>${busy ? "Flipping…" : `Flip for ${SIDE[state.side]}`}</span><span class="dm-open-price">${money(price)}</span></button>`;

function copyHTML() {
  const { win, floor, price } = current();
  const call = state.side;
  return `
    <div class="od-hero-tags"><span class="dm-pill">50 / 50 coin</span>${mathHTML(win, floor, price)}</div>
    <h1 class="dm-title">Coin flip</h1>
    <p class="dm-blurb">Call it and flip. Land your side and the piece you picked is yours. Miss and you still take the other one home.</p>
    <div class="fl-match">
      <div class="fl-card is-win" data-fl-card="${call}">
        <span class="fl-card-tag">${mini(call)}Lands ${SIDE[call]}</span>
        <span class="dm-img"><img src="${win.image}" alt=""></span>
        <span class="dm-name">${esc(win.name)}</span>
        <b class="dm-money">${money(win.value)}</b>
      </div>
      <div class="fl-card" data-fl-card="${other(call)}">
        <span class="fl-card-tag">${mini(other(call))}Lands ${SIDE[other(call)]}</span>
        <span class="dm-img"><img src="${floor.image}" alt=""></span>
        <span class="dm-name">${esc(floor.name)}</span>
        <b class="dm-money">${money(floor.value)}</b>
      </div>
    </div>
    <div class="fl-modes" role="radiogroup" aria-label="The other side">
      <span>Other side</span>
      ${Object.entries(FLOORS)
        .map(([k, f]) => `<button class="fl-mode${state.mode === k ? " active" : ""}" data-fl-mode="${k}" role="radio" aria-checked="${state.mode === k}">${f.label}</button>`)
        .join("")}
    </div>
    <div class="dm-buyline">
      <div class="dm-price"><b>${money(price)}</b><span>per flip</span></div>
    </div>
    ${goHTML(price)}
    <p class="dm-paid">Paid in credit or balance. Whichever piece lands goes straight to My Items.</p>
    <p class="fl-fairline">Provably fair. This flip is already locked to seed hash <code data-fl-hash="short">${short(state.hash)}</code>. <a href="#flFair" data-fl="fair">How to check it</a></p>`;
}

// Dev mode: the math behind this flip, from the two pieces on the coin.
function mathHTML(win, floor, price) {
  const ev = (win.value + floor.value) / 2;
  const row = (k, v, note = "") => `<span class="od-math-row"><span>${k}${note ? ` <i>${note}</i>` : ""}</span><b>${v}</b></span>`;
  return `
    <span class="od-math${mathOpen ? " open" : ""}">
      <button class="od-math-btn" data-fl="math" aria-expanded="${mathOpen}">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16.5"/><circle cx="12" cy="7.6" r="0.6" fill="currentColor"/></svg>
        Dev mode
      </button>
      <span class="od-math-pop" role="note">
        <span class="od-math-title">How a flip pays<em>Live, for the piece you&rsquo;ve picked</em></span>
        <span class="od-math-sec">The coin</span>
        ${row("Heads", "50%")}
        ${row("Tails", "50%")}
        <span class="od-math-note">The coin itself is never weighted. Chosen&rsquo;s edge is in the price.</span>
        <span class="od-math-sec">This flip</span>
        ${row("Price", money(price))}
        ${row("Land your call", money(win.value), `+${money(win.value - price)}`)}
        ${row("Miss", money(floor.value), `&minus;${money(price - floor.value)}`)}
        ${row("Expected value", money(ev), "half of each")}
        ${row("Return to the player", pct(ev / price, 1))}
        ${row("If both are cashed out at 80%", money(ev * 0.8))}
        <span class="od-math-sec">Chosen</span>
        ${row("Keeps per flip", money(price - ev), pct((price - ev) / price, 1))}
        ${row("Over 100 flips like this", money((price - ev) * 100))}
        <span class="od-math-note">Pieces go out at market value; the edge pays for sourcing and shipping them. Safer, Balanced and Bolder change the spread, never the edge.</span>
        <span class="od-math-sec">Fairness</span>
        <span class="od-math-note">Result = HMAC-SHA256(server seed, your seed:flip #). First 8 hex under 80000000 is Heads. The seed&rsquo;s hash is shown before you flip, the seed after. In this demo the seed lives in your browser; live, it stays on Chosen&rsquo;s server until the flip.</span>
        <span class="od-math-formula">Price = (${money(win.value)} + ${money(floor.value)}) &divide; 2 &divide; ${RETURN} = ${money(price)}</span>
      </span>
    </span>`;
}

function bandsHTML() {
  return BANDS.map((b) => `<button class="dm-filter${state.band === b.key ? " active" : ""}" data-fl-band="${b.key}">${b.label}</button>`).join("");
}

function listed() {
  const band = BANDS.find((b) => b.key === state.band) || BANDS[0];
  const q = query.trim().toLowerCase();
  return flippable().filter((i) => i.value >= band.min && i.value < band.max && (!q || i.name.toLowerCase().includes(q)));
}

function gridHTML() {
  const list = listed();
  if (!list.length) return `<li class="fl-empty">Nothing matches that. Try another price or search.</li>`;
  const cards = list
    .slice(0, shown)
    .map((i) => {
      const floor = floorFor(i);
      return `<li><button class="fl-pick${i.name === state.pick ? " is-picked" : ""}" data-fl-pick="${esc(i.name)}">
        <span class="dm-img"><img src="${i.image}" alt="" loading="lazy"></span>
        <span class="dm-name">${esc(i.name)}</span>
        <b class="dm-money">${money(i.value)}</b>
        <span class="fl-pick-sub">Flip ${money(priceFor(i, floor))} &middot; or ${money(floor.value)}</span>
      </button></li>`;
    })
    .join("");
  const more = list.length > shown ? `<li class="fl-more-wrap"><button class="dm-ghost fl-more" data-fl="more">Show more (${list.length - shown})</button></li>` : "";
  return cards + more;
}

function rowHTML(f, { mine = false } = {}) {
  const got = f.won ? f.win : f.floor;
  const open = proofs.has(f.id);
  return `
    <li class="fl-row${f.won ? " is-won" : ""}" data-flip="${f.id}">
      <span class="fl-row-coin fl-${f.result}" title="Landed ${SIDE[f.result]}">${emblem(f.result, 13)}</span>
      <span class="dm-img"><img src="${got.image}" alt="" loading="lazy"></span>
      <span class="fl-row-text">
        <b>${esc(got.name)}</b>
        <span>${mine ? "You" : esc(f.by)} called ${SIDE[f.call]}, landed ${SIDE[f.result]} &middot; paid ${money(f.price)} &middot; ${ago(Date.now() - f.at)}</span>
      </span>
      <b class="fl-row-val">${money(got.value)}</b>
      ${mine ? `<button class="fl-verify-btn" data-fl-verify="${f.id}" aria-expanded="${open}">${open ? "Hide" : "Verify"}</button>` : ""}
      ${mine && open ? proofHTML(f) : ""}
    </li>`;
}

function proofHTML(f) {
  return `
    <div class="fl-proof" id="proof-${f.id}">
      <span><em>Hash shown before</em><code>${f.hash}</code></span>
      <span><em>Server seed</em><code>${f.server}</code></span>
      <span><em>Your seed</em><code>${esc(f.client)}</code></span>
      <span><em>Flip #</em><code>${f.nonce}</code></span>
      <span class="fl-proof-check" data-fl-check="${f.id}">Checking&hellip;</span>
    </div>`;
}

async function runCheck(f) {
  const [hash, side] = await Promise.all([sha256(f.server), sideFor(f.server, f.client, f.nonce)]);
  const el = root.querySelector(`[data-fl-check="${f.id}"]`);
  if (!el) return;
  const ok = hash === f.hash && side === f.result;
  el.classList.add(ok ? "is-ok" : "is-bad");
  el.innerHTML = ok
    ? `&check; The seed matches the hash shown before the flip, and gives ${SIDE[side]}.`
    : `&times; This doesn&rsquo;t check out: ${hash !== f.hash ? "the seed doesn&rsquo;t match its hash" : `the seed gives ${SIDE[side]}`}.`;
}

function mineHTML() {
  const list = state.history;
  const won = list.filter((f) => f.won).length;
  const spent = list.reduce((s, f) => s + f.price, 0);
  const got = list.reduce((s, f) => s + (f.won ? f.win.value : f.floor.value), 0);
  return `
    <div class="dm-sec-head">
      <div>
        <h2 class="dm-h2">Your flips</h2>
        <p class="dm-sub">${
          list.length
            ? `${won} of ${list.length} landed your way. ${money(spent)} in, ${money(got)} of pieces out. Open any one to check it.`
            : "Nothing yet. Every flip you make shows here, with what it took to prove it fair."
        }</p>
      </div>
      ${list.length ? `<button class="dm-ghost fl-items-btn" data-fl-go-items>See My Items</button>` : ""}
    </div>
    ${list.length ? `<ul class="fl-list">${list.map((f) => rowHTML(f, { mine: true })).join("")}</ul>` : ""}`;
}

function crowdHTML() {
  return crowd.map((f) => rowHTML(f)).join("");
}

function fairHTML() {
  return `
    <h2 class="dm-h2">Check any flip</h2>
    <p class="dm-sub">Every flip is decided before the coin leaves your hand, and you can prove nothing changed after.</p>
    <ol class="fl-steps">
      <li><b>Locked in first.</b> Before you flip, you see the hash of a secret seed. The next flip&rsquo;s: <code data-fl-hash="full">${state.hash || "…"}</code></li>
      <li><b>Your seed goes in too.</b> It&rsquo;s mixed with ours, so neither side sets the result alone. Change it any time.
        <label class="fl-client"><span>Your seed</span><input id="flClient" value="${esc(state.client)}" maxlength="32" spellcheck="false" autocomplete="off"></label></li>
      <li><b>Shown after.</b> The secret seed is revealed with the result. HMAC-SHA256(seed, your seed:flip #): first 8 hex under 80000000 is Heads. Anyone can rerun it; Verify on a flip does it for you.</li>
    </ol>`;
}

// ---- The flip ---------------------------------------------------------------

async function flip() {
  if (busy) return;
  const { win, floor, price } = current();
  if (!deps.pay(price)) {
    deps.showToast(`Not enough Credits or Cash for a ${money(price)} flip`, 2200, { log: false });
    return;
  }
  busy = true;
  setBusy(true);
  deps.renderWallet();
  if (!state.hash) await ensureHash();
  const { server, hash, client, nonce } = state;
  const result = await sideFor(server, client, nonce);
  const won = result === state.side;
  const got = won ? win : floor;
  // Settled now, before the coin lands, so leaving mid-flip loses nothing.
  deps.giveItem({ name: got.name, price: got.value, image: got.image, category: got.category, rarity: got.rarity });
  const slim = (i) => ({ name: i.name, image: i.image, value: i.value });
  const entry = { id: uid(), at: Date.now(), call: state.side, result, won, price, win: slim(win), floor: slim(floor), server, hash, client, nonce };
  state.history = [entry, ...state.history].slice(0, 30);
  state.nonce = nonce + 1;
  state.server = newSeed();
  state.hash = await sha256(state.server);
  save();
  const result$ = root.querySelector("#flResult");
  if (result$) {
    result$.className = "fl-result";
    result$.textContent = "Flipping…";
  }
  root.querySelectorAll(".fl-card").forEach((c) => c.classList.remove("is-hit", "is-miss"));
  setTimeout(() => land(entry), spin(result));
}

// Toss the coin: up, over and over, and down on the side already decided.
function spin(result) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ms = reduce ? 500 : FLIP_MS;
  const coin = root.querySelector("#flCoin");
  const toss = root.querySelector("#flToss");
  const shadow = root.querySelector("#flShadow");
  const target = result === "heads" ? 0 : 180;
  const from = coinRot;
  const to = from + (reduce ? 1 : 8) * 360 + ((target - (from % 360) + 360) % 360);
  coinRot = target;
  if (!coin || !coin.isConnected) return ms;
  coin.style.transition = "none";
  coin.style.transform = `rotateX(${from}deg)`;
  coin.getAnimations().forEach((a) => a.cancel());
  coin.animate([{ transform: `rotateX(${from}deg)` }, { transform: `rotateX(${to}deg)` }], {
    duration: ms,
    easing: "cubic-bezier(0.18, 0.6, 0.28, 1)",
    fill: "forwards",
  });
  if (!reduce) {
    toss.animate(
      [
        { transform: "translateY(0) scale(1)", easing: "cubic-bezier(0.2, 0.7, 0.4, 1)" },
        { transform: "translateY(-150px) scale(1.14)", offset: 0.42, easing: "cubic-bezier(0.6, 0, 0.8, 0.4)" },
        { transform: "translateY(0) scale(1)", offset: 0.8, easing: "ease-out" },
        { transform: "translateY(-16px) scale(1)", offset: 0.89, easing: "ease-in" },
        { transform: "translateY(0) scale(1)" },
      ],
      { duration: ms }
    );
    shadow.animate(
      [
        { transform: "scale(1)", opacity: 1 },
        { transform: "scale(0.5)", opacity: 0.35, offset: 0.42 },
        { transform: "scale(1)", opacity: 1, offset: 0.8 },
        { transform: "scale(0.9)", opacity: 0.85, offset: 0.89 },
        { transform: "scale(1)", opacity: 1 },
      ],
      { duration: ms }
    );
  }
  return ms;
}

function setCoin(angle) {
  const coin = root.querySelector("#flCoin");
  if (!coin) return;
  coin.style.transition = "none";
  coin.style.transform = `rotateX(${angle}deg)`;
  coin.getAnimations().forEach((a) => a.cancel());
}

function land(f) {
  busy = false;
  deps.renderWallet();
  deps.itemsChanged();
  const got = f.won ? f.win : f.floor;
  if (f.won) deps.playWin?.();
  else deps.playLand?.();
  deps.showToast(
    f.won
      ? `${SIDE[f.result]}! The ${got.name} (${money(got.value)}) is yours, in My Items`
      : `${SIDE[f.result]}. You got the ${got.name} (${money(got.value)}), in My Items`,
    3200
  );
  crowd = [{ ...f, by: deps.username() }, ...crowd].slice(0, 8);
  if (!isOpen()) return;
  setCoin(coinRot);
  setBusy(false);
  const r = root.querySelector("#flResult");
  if (r) {
    r.className = `fl-result ${f.won ? "is-won" : "is-lost"}`;
    r.textContent = f.won ? `${SIDE[f.result]}. You won it` : `${SIDE[f.result]}. Not this time`;
  }
  root.querySelectorAll(".fl-card").forEach((c) => {
    const hit = c.dataset.flCard === f.result;
    c.classList.toggle("is-hit", hit);
    c.classList.toggle("is-miss", !hit);
  });
  root.querySelectorAll("[data-fl-hash]").forEach((n) => (n.textContent = n.dataset.flHash === "full" ? state.hash : short(state.hash)));
  root.querySelector("#flMine").innerHTML = mineHTML();
  root.querySelector("#flCrowd").innerHTML = crowdHTML();
}

function setBusy(on) {
  root.classList.toggle("is-flipping", on);
  root.querySelectorAll(".fl-go, .fl-side, .fl-mode, .fl-pick").forEach((b) => (b.disabled = on));
  root.querySelectorAll(".fl-go").forEach((b) => (b.firstElementChild.textContent = on ? "Flipping…" : `Flip for ${SIDE[state.side]}`));
}

// ---- Everyone else ------------------------------------------------------------

function crowdFlip(at = Date.now()) {
  const pool = flippable().filter((i) => i.value <= 2500);
  const win = pool[Math.floor(Math.random() * pool.length)];
  const mode = Object.keys(FLOORS)[Math.floor(Math.random() * 3)];
  const floor = floorFor(win, mode);
  const call = Math.random() < 0.5 ? "heads" : "tails";
  const result = Math.random() < 0.5 ? "heads" : "tails";
  const slim = (i) => ({ name: i.name, image: i.image, value: i.value });
  return { id: uid(), at, by: deps.randomUsername(), call, result, won: call === result, price: priceFor(win, floor), win: slim(win), floor: slim(floor) };
}

function seedCrowd() {
  crowd = Array.from({ length: 8 }, (_, i) => crowdFlip(Date.now() - (i + 1) * (40 + Math.random() * 80) * 1000));
}

function scheduleCrowd() {
  clearTimeout(crowdTimer);
  const [a, b] = CROWD_EVERY_MS;
  crowdTimer = setTimeout(() => {
    if (!document.hidden) {
      crowd = [crowdFlip(), ...crowd].slice(0, 8);
      const list = isOpen() && root.querySelector("#flCrowd");
      if (list) {
        list.innerHTML = crowdHTML();
        list.firstElementChild?.classList.add("is-new");
      }
    }
    scheduleCrowd();
  }, a + Math.random() * (b - a));
}

const isOpen = () => !!root?.isConnected && root.closest(".screen")?.classList.contains("active");

// ---- Controls -------------------------------------------------------------------

function refreshCopy() {
  const copy = root.querySelector("#flCopy");
  if (copy) copy.innerHTML = copyHTML();
  root.querySelector(".fl-go-m")?.replaceWith(Object.assign(document.createElement("div"), { innerHTML: goHTML(current().price, "fl-go-m") }).firstElementChild);
  if (busy) setBusy(true);
}
function refreshGrid() {
  const grid = root.querySelector("#flGrid");
  if (grid) grid.innerHTML = gridHTML();
  if (busy) setBusy(true);
}

function onClick(e) {
  if (mathOpen && !e.target.closest(".od-math")) {
    mathOpen = false;
    root.querySelector(".od-math")?.classList.remove("open");
  }
  if (e.target.closest("[data-fl-go-items]")) return deps.goToItems();
  const side = e.target.closest("[data-fl-side]");
  if (side) {
    if (busy) return;
    state.side = side.dataset.flSide;
    save();
    root.querySelectorAll(".fl-side").forEach((b) => {
      const on = b === side;
      b.classList.toggle("active", on);
      b.setAttribute("aria-checked", on);
    });
    // The coin turns to show the side you called, ready to toss.
    coinRot = state.side === "heads" ? 0 : 180;
    const coin = root.querySelector("#flCoin");
    if (coin) {
      coin.getAnimations().forEach((a) => a.cancel());
      coin.style.transition = "transform 0.45s cubic-bezier(0.3, 0.7, 0.3, 1)";
      coin.style.transform = `rotateX(${coinRot}deg)`;
    }
    const r = root.querySelector("#flResult");
    if (r) {
      r.className = "fl-result";
      r.textContent = `You called ${SIDE[state.side]}`;
    }
    return refreshCopy();
  }
  const mode = e.target.closest("[data-fl-mode]");
  if (mode) {
    if (busy) return;
    state.mode = mode.dataset.flMode;
    save();
    refreshCopy();
    return refreshGrid();
  }
  const pick = e.target.closest("[data-fl-pick]");
  if (pick) {
    if (busy) return;
    state.pick = pick.dataset.flPick;
    save();
    refreshCopy();
    root.querySelectorAll(".fl-pick").forEach((b) => b.classList.toggle("is-picked", b === pick));
    root.querySelector(".fl-hero")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const band = e.target.closest("[data-fl-band]");
  if (band) {
    state.band = band.dataset.flBand;
    shown = PAGE;
    save();
    root.querySelector("#flBands").innerHTML = bandsHTML();
    return refreshGrid();
  }
  const verify = e.target.closest("[data-fl-verify]");
  if (verify) {
    const id = verify.dataset.flVerify;
    if (proofs.has(id)) proofs.delete(id);
    else proofs.add(id);
    root.querySelector("#flMine").innerHTML = mineHTML();
    const f = state.history.find((x) => x.id === id);
    if (f && proofs.has(id)) runCheck(f);
    return;
  }
  const act = e.target.closest("[data-fl]")?.dataset.fl;
  if (!act) return;
  if (act === "go") flip();
  else if (act === "more") {
    shown += PAGE;
    refreshGrid();
  } else if (act === "fair") {
    e.preventDefault();
    root.querySelector("#flFair")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (act === "math") {
    mathOpen = !mathOpen;
    const m = root.querySelector(".od-math");
    m?.classList.toggle("open", mathOpen);
    m?.querySelector(".od-math-btn").setAttribute("aria-expanded", mathOpen);
  }
}

function onInput(e) {
  if (e.target.id !== "flSearch") return;
  query = e.target.value;
  shown = PAGE;
  refreshGrid();
}

function onChange(e) {
  if (e.target.id !== "flClient") return;
  const v = e.target.value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || newSeed(8);
  e.target.value = v;
  state.client = v;
  save();
  deps.showToast("Your seed is set. It goes into every flip from now on", 2000, { log: false });
}
