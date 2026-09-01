// iPhone Dynamic Island / Live Activity bridge.
//
// A web page cannot render into the Dynamic Island — only ActivityKit can,
// and only from a native process. So this file is *just* a messenger: when
// the page is running inside the Chosen iOS companion app (ios/, a WKWebView
// host), it forwards pack-opening milestones to the native layer, which owns
// the Live Activity. Everywhere else — desktop, iPad, mobile Safari, any
// browser at all — `bridge` is undefined and every function here returns
// immediately, so the existing open flow is untouched.
//
// Nothing in here renders, measures or styles anything. There is deliberately
// no web-drawn "Dynamic Island" mock: on a device that has one, the real one
// is used; on a device that doesn't, nothing appears.
//
// The result is decided in the web layer (see startRound/onPick in app.js) and
// handed over already resolved. The iOS layer never rolls a pack, never picks
// a rarity and never touches a balance — it only renders what it is told.
// That keeps this app's opening logic in exactly one place, which is the
// point of the bridge being one-way.

const NATIVE = typeof window !== "undefined" ? window.ChosenNative : undefined;

// Injected by the companion app at document start (see WebView.swift). The
// flag is false when the device or the user's settings can't run Live
// Activities — an older iPhone, or Live Activities switched off in Settings —
// so an unsupported device takes the same path as a plain browser.
const bridge =
  NATIVE && NATIVE.liveActivities ? window.webkit?.messageHandlers?.chosen : undefined;

export const isSupported = Boolean(bridge);

// The scheme the widget's tap target uses; the app maps it back onto a route
// in this page (see handleDeepLink below).
const SCHEME = "chosen://result";

function send(type, payload = {}) {
  if (!bridge) return;
  try {
    bridge.postMessage({ type, ...payload });
  } catch {
    // A malformed bridge message must never take the opening flow down with
    // it — the pack is already paid for and the reveal has to play out.
  }
}

// Prize images ship as relative paths; the native side needs something it can
// actually fetch.
function absolute(url) {
  try {
    return new URL(url, location.href).href;
  } catch {
    return null;
  }
}

// ---- The four milestones of an open ---------------------------------------

// Crate paid for, reel spinning, result not yet known → "◈ OPENING".
export function startOpening({ crate } = {}) {
  send("liveActivity.start", { crate: crate ?? "Crate" });
}

// Result known. Called the moment the pick locks in, and again after Keep —
// the second call only adds the vault id, so the tap target can go straight
// to the item instead of back to the reveal.
export function reportItem({ rarity, rarityLabel, name, value, image, itemId } = {}) {
  send("liveActivity.item", {
    rarity,
    rarityLabel,
    itemName: name,
    itemValue: typeof value === "number" ? value : null,
    imageURL: image ? absolute(image) : null,
    deepLink: itemId ? `${SCHEME}?item=${encodeURIComponent(itemId)}` : `${SCHEME}?screen=game`,
  });
}

// The Cash Out exit — the one place an open pays out a balance instead of an
// item.
export function reportCredits({ amount, currency, balance } = {}) {
  send("liveActivity.credits", {
    amount,
    currency: currency === "cash" ? "cash" : "credits",
    balance: typeof balance === "number" ? balance : null,
    deepLink: `${SCHEME}?credits=${encodeURIComponent(amount)}`,
  });
}

// Dismiss now rather than waiting out the dwell timer — leaving the opening
// screen, or starting the next crate in a batch.
export function end() {
  send("liveActivity.end");
}

// ---- Deep links -----------------------------------------------------------

// Tapping the Live Activity opens the app on `chosen://result?...`, which the
// app hands back here (warm, no reload — see WebView.swift). Registered by
// app.js, which owns the routes.
export function onDeepLink(handler) {
  if (typeof window === "undefined") return;
  window.Chosen = window.Chosen || {};
  window.Chosen.handleDeepLink = (url) => {
    try {
      handler(new URL(url).searchParams);
    } catch {
      // Ignore anything that isn't a URL we produced.
    }
  };
}
