// Demo: one crate's page, laid out the way the team's other Chosen build
// lays it out (dev.od-rwa.xyz, Genesis Drop Bronze), with its real pieces,
// values and odds (see demoData.js). Everything that page has is here:
//
//   the crate, live, beside its name, price and odds, with the quantity
//     and Open;
//   the five tiers as cards, each with its range and its share of opens;
//   Pulled from this crate: the latest opens, a strip you can drag;
//   What could be inside: every piece, dearest first, filterable by
//     tier, the top grail on a wide card;
//   the rail: today's top pull, and live pulls as they land.
//
// Opens are a demo: Open draws at the crate's odds and shows what came
// out (nothing is charged or kept), and simulated opens land in the feed
// every few seconds, so it moves the way the real page does.

import { DEMO_CRATE, DEMO_PIECES, DEMO_RECENT, DEMO_TOP, DEMO_TIER_ODDS } from "./demoData.js";
import { createBoxViewer } from "./boxViewer.js";

const TIERS = ["grail", "epic", "rare", "uncommon", "common"];
// The page's own tier marks (Phosphor, filled): a crown, a diamond, a
// star, a hexagon and a dot.
const TIER_ICON = {
  grail: "M239.75,90.81c0,.11,0,.21-.07.32L217,195a16,16,0,0,1-15.72,13H54.71A16,16,0,0,1,39,195L16.32,91.13c0-.11-.05-.21-.07-.32A16,16,0,0,1,44,77.39l33.67,36.29,35.8-80.29a1,1,0,0,0,0-.1,16,16,0,0,1,29.06,0,1,1,0,0,0,0,.1l35.8,80.29L212,77.39a16,16,0,0,1,27.71,13.42Z",
  epic: "M240,128a15.85,15.85,0,0,1-4.67,11.28l-96.05,96.06a16,16,0,0,1-22.56,0h0l-96-96.06a16,16,0,0,1,0-22.56l96.05-96.06a16,16,0,0,1,22.56,0l96.05,96.06A15.85,15.85,0,0,1,240,128Z",
  rare: "M234.29,114.85l-45,38.83L203,211.75a16.4,16.4,0,0,1-24.5,17.82L128,198.49,77.47,229.57A16.4,16.4,0,0,1,53,211.75l13.76-58.07-45-38.83A16.46,16.46,0,0,1,31.08,86l59-4.76,22.76-55.08a16.36,16.36,0,0,1,30.27,0l22.75,55.08,59,4.76a16.46,16.46,0,0,1,9.37,28.86Z",
  uncommon: "M232,80.18v95.64a16,16,0,0,1-8.32,14l-88,48.17a15.88,15.88,0,0,1-15.36,0l-88-48.17a16,16,0,0,1-8.32-14V80.18a16,16,0,0,1,8.32-14l88-48.17a15.88,15.88,0,0,1,15.36,0l88,48.17A16,16,0,0,1,232,80.18Z",
  common: "M232,128A104,104,0,1,1,128,24,104.13,104.13,0,0,1,232,128Z",
};
const TIER_LABEL = { grail: "Grail", epic: "Epic", rare: "Rare", uncommon: "Uncommon", common: "Common" };
const MAX_QTY = 10;
const PIECES = [...DEMO_PIECES].sort((a, b) => b.value - a.value);
const PRICE = DEMO_CRATE.price;

const icon = (tier, size = 14) =>
  `<svg viewBox="0 0 256 256" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="${TIER_ICON[tier]}"/></svg>`;

// $23,599.90, $4,500, $0: cents only when there are some.
function money(v) {
  const cents = Math.round(v * 100) % 100 !== 0;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })}`;
}
const tierPct = (p) => `${p >= 1 ? Math.round(p) : p}%`;
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

function ago(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 48 * 3600) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// One piece at the crate's odds: a tier by its published share, then a
// piece in it by weight.
function draw() {
  let r = Math.random() * TIERS.reduce((s, t) => s + DEMO_TIER_ODDS[t], 0);
  let tier = "common";
  for (const t of TIERS) {
    r -= DEMO_TIER_ODDS[t];
    if (r < 0) {
      tier = t;
      break;
    }
  }
  const pool = PIECES.filter((p) => p.tier === tier);
  let w = Math.random() * pool.reduce((s, p) => s + p.weight, 0);
  for (const p of pool) {
    w -= p.weight;
    if (w < 0) return p;
  }
  return pool[pool.length - 1];
}

// ---- State ---------------------------------------------------------------

let root = null;
let viewer = null;
let liveTimer = 0;
let clockTimer = 0;
let qty = 1;
let filter = "all";
let railOpen = true;
// The feed, newest first: { name, tier, value, image, at }. Seeded from the
// page's own latest pulls at the ages they had when it was copied (the
// newest 17 hours old); new opens land on top as they happen.
let pulls = null;
const SNAPSHOT_AGE = 17 * 3600 * 1000;

function seedPulls() {
  const base = Date.now() - SNAPSHOT_AGE;
  pulls = DEMO_RECENT.map((p) => ({ name: p.name, tier: p.rarity, value: p.value, image: p.image, at: base - p.ago }));
}

// ---- Page ----------------------------------------------------------------

export function initDemo(el) {
  root = el;
  root.addEventListener("click", onClick);
  initStripDrag();
}

export function renderDemo() {
  if (!root) return;
  if (!pulls) seedPulls();
  root.innerHTML = `
    <div class="dm-layout${railOpen ? "" : " rail-closed"}">
      <div class="dm-main">
        ${heroHTML()}
        <section class="dm-sec">
          <h2 class="dm-h2">Pulled from this crate</h2>
          <p class="dm-sub">The latest opens, as they happen. Drag to see more.</p>
          <ul class="dm-strip" id="dmStrip">${stripHTML()}</ul>
        </section>
        <section class="dm-sec">
          <div class="dm-sec-head">
            <div>
              <h2 class="dm-h2">What could be inside</h2>
              <p class="dm-sub">${PIECES.length} pieces, dearest first.</p>
            </div>
            <div class="dm-filters" role="tablist">${filtersHTML()}</div>
          </div>
          <ul class="dm-grid" id="dmGrid">${gridHTML()}</ul>
        </section>
      </div>
      <aside class="dm-rail" id="dmRail">${railHTML()}</aside>
      <button class="dm-rail-reopen" data-dm="rail-open" aria-label="Show top and live pulls"><i class="dm-live-dot"></i>Pulls</button>
    </div>
    <div class="dm-reveal hidden" id="dmReveal" role="dialog" aria-modal="true" aria-label="What came out"></div>`;
  mountBox();
  startLive();
}

export function leaveDemo() {
  viewer?.dispose();
  viewer = null;
  clearInterval(clockTimer);
  clearTimeout(liveTimer);
}

function heroHTML() {
  const counts = TIERS.map((t) => PIECES.filter((p) => p.tier === t));
  const tiers = TIERS.map((t, i) => {
    const items = counts[i];
    const lo = Math.min(...items.map((p) => p.value));
    const hi = Math.max(...items.map((p) => p.value));
    const odds = DEMO_TIER_ODDS[t];
    return `<div class="dm-tier dm-t-${t}">
        <span class="dm-tier-name">${icon(t)}${TIER_LABEL[t]}</span>
        <span class="dm-tier-range">${lo === hi ? money(hi) : `${money(lo)} to ${money(hi)}`}</span>
        <b class="dm-tier-pct">${tierPct(odds)}</b>
        <span class="dm-tier-bar"><i style="width:${Math.max(2, odds)}%"></i></span>
      </div>`;
  }).join("");
  return `
    <section class="dm-hero">
      <div class="dm-hero-media">
        <button class="dm-back" data-dm="back"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>All crates</button>
        <canvas class="dm-box" id="dmBox"></canvas>
      </div>
      <div class="dm-hero-copy">
        <span class="dm-pill">${esc(DEMO_CRATE.eyebrow)}</span>
        <h1 class="dm-title">${esc(DEMO_CRATE.title)}</h1>
        <p class="dm-blurb">${esc(DEMO_CRATE.blurb)}</p>
        <div class="dm-buyline">
          <div class="dm-price"><b>${money(PRICE)}</b><span>per crate, or 1 credit</span></div>
        </div>
        <div class="dm-open-row">
          <div class="dm-qty">
            <button data-dm="minus" aria-label="One fewer">&minus;</button>
            <b id="dmQty">${qty}</b>
            <button data-dm="plus" aria-label="One more">+</button>
            <button class="dm-max" data-dm="max">Max</button>
          </div>
          <button class="dm-open" data-dm="open" id="dmOpen">${openLabel()}</button>
        </div>
        <p class="dm-paid">Paid in credit or balance.</p>
        <div class="dm-tiers">${tiers}</div>
      </div>
    </section>`;
}

function openLabel() {
  return `<span>Open ${qty} crate${qty > 1 ? "s" : ""}</span><span class="dm-open-price">${money(PRICE * qty)}<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></span>`;
}

function chipHTML(tier, label = TIER_LABEL[tier]) {
  return `<span class="dm-chip dm-t-${tier}${label === "Top Grail" ? " is-top" : ""}">${icon(tier, 13)}${label}</span>`;
}

function stripHTML() {
  return pulls
    .slice(0, 24)
    .map(
      (p) => `<li class="dm-pull dm-t-${p.tier}">
        <span class="dm-card-top">${chipHTML(p.tier)}<span class="dm-ago" data-at="${p.at}">${ago(Date.now() - p.at)}</span></span>
        <span class="dm-img"><img src="${p.image}" alt="" loading="lazy" draggable="false"></span>
        <span class="dm-name" title="${esc(p.name)}">${esc(p.name)}</span>
        <b class="dm-money">${money(p.value)}</b>
      </li>`
    )
    .join("");
}

function filtersHTML() {
  return ["all", ...TIERS]
    .map(
      (t) =>
        `<button class="dm-filter${t === "all" ? "" : ` dm-t-${t}`}${filter === t ? " active" : ""}" data-dm-filter="${t}" role="tab" aria-selected="${filter === t}">${
          t === "all" ? "All" : `${icon(t, 13)}${TIER_LABEL[t]}`
        }</button>`
    )
    .join("");
}

function gridHTML() {
  const list = PIECES.filter((p) => filter === "all" || p.tier === filter);
  return list
    .map((p, i) => {
      const top = i === 0 && p === PIECES[0];
      return `<li class="dm-piece dm-t-${p.tier}${top ? " is-top" : ""}">
        <span class="dm-card-top">${chipHTML(p.tier, top ? "Top Grail" : TIER_LABEL[p.tier])}</span>
        <span class="dm-img"><img src="${p.image}" alt="" loading="lazy"></span>
        <span class="dm-piece-text">
          <span class="dm-name" title="${esc(p.name)}">${esc(p.name)}</span>
          <b class="dm-money">${money(p.value)}</b>
        </span>
        ${top ? `<span class="dm-sheen" aria-hidden="true"></span>` : ""}
      </li>`;
    })
    .join("");
}

function railHTML() {
  const day = Date.now() - 24 * 3600 * 1000;
  const today = pulls.filter((p) => p.at >= day);
  const best = [...(today.length ? today : pulls)].sort((a, b) => b.value - a.value)[0];
  return `
    <div class="dm-rail-head">
      <span class="dm-rail-title"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.4 6.7 19.1l1-5.8L3.5 9.2l5.9-.9z"/></svg>Top pulls <small>today</small></span>
      <span class="dm-rail-btns">
        <button data-dm="rail-close" aria-label="Collapse"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg></button>
        <button data-dm="rail-close" aria-label="Close"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg></button>
      </span>
    </div>
    ${
      best
        ? `<div class="dm-top dm-t-${best.tier}">
        <span class="dm-top-rank">1</span>
        <span class="dm-img"><img src="${best.image}" alt=""></span>
        <span class="dm-name">${esc(best.name)}</span>
        <b class="dm-money">${money(best.value)}</b>
        <small>from a ${money(PRICE)} crate</small>
      </div>`
        : ""
    }
    <div class="dm-rail-head is-live"><span class="dm-rail-title"><i class="dm-live-dot"></i>Live pulls</span></div>
    <ul class="dm-live" id="dmLive">${pulls
      .slice(0, 14)
      .map(
        (p) => `<li class="dm-live-row dm-t-${p.tier}">
          <span class="dm-img"><img src="${p.image}" alt="" loading="lazy"></span>
          <span class="dm-live-text"><span class="dm-name">${esc(p.name)}</span><span><b>${money(p.value)}</b> from a ${money(PRICE)} crate</span></span>
        </li>`
      )
      .join("")}</ul>`;
}

// ---- The crate itself: the CHOSEN box, turning, as on Drops. ---------------

function mountBox() {
  viewer?.dispose();
  viewer = null;
  const canvas = root.querySelector("#dmBox");
  if (!canvas) return;
  createBoxViewer(canvas, "demo", "od", { fitOpen: true }).then((v) => {
    if (!canvas.isConnected) return v.dispose();
    viewer = v;
  });
}

// ---- Live: the feed moves on its own, the times count up. ------------------

function startLive() {
  clearInterval(clockTimer);
  clearTimeout(liveTimer);
  clockTimer = setInterval(() => {
    root.querySelectorAll(".dm-ago").forEach((el) => (el.textContent = ago(Date.now() - Number(el.dataset.at))));
  }, 15000);
  const next = () => {
    liveTimer = setTimeout(() => {
      if (root?.isConnected && !document.hidden) addPulls([draw()]);
      next();
    }, 5000 + Math.random() * 6000);
  };
  next();
}

function addPulls(pieces) {
  const now = Date.now();
  pulls = [...pieces.map((p, i) => ({ name: p.name, tier: p.tier, value: p.value, image: p.image, at: now - i })), ...pulls].slice(0, 60);
  const strip = root.querySelector("#dmStrip");
  if (strip) {
    const keep = strip.scrollLeft;
    strip.innerHTML = stripHTML();
    strip.scrollLeft = keep;
    [...strip.children].slice(0, pieces.length).forEach((li) => li.classList.add("is-new"));
  }
  const rail = root.querySelector("#dmRail");
  if (rail) {
    rail.innerHTML = railHTML();
    [...rail.querySelectorAll(".dm-live-row")].slice(0, pieces.length).forEach((li) => li.classList.add("is-new"));
  }
}

// ---- Opening ---------------------------------------------------------------

function openCrates() {
  const out = Array.from({ length: qty }, draw).sort((a, b) => b.value - a.value);
  const total = out.reduce((s, p) => s + p.value, 0);
  const reveal = root.querySelector("#dmReveal");
  reveal.innerHTML = `
    <div class="dm-reveal-card">
      <h3 class="dm-h2">${qty > 1 ? `${qty} crates opened` : "You pulled"}</h3>
      <ul class="dm-reveal-list${out.length === 1 ? " is-one" : ""}">${out
        .map(
          (p, i) => `<li class="dm-piece dm-t-${p.tier}" style="--i:${i}">
            <span class="dm-card-top">${chipHTML(p.tier)}</span>
            <span class="dm-img"><img src="${p.image}" alt=""></span>
            <span class="dm-name">${esc(p.name)}</span>
            <b class="dm-money">${money(p.value)}</b>
          </li>`
        )
        .join("")}</ul>
      ${out.length > 1 ? `<p class="dm-reveal-total">Worth ${money(total)} together, from ${money(PRICE * qty)} of crates.</p>` : ""}
      <p class="dm-reveal-note">A demo open: nothing was charged, and nothing&rsquo;s been added to your items.</p>
      <div class="dm-reveal-actions">
        <button class="dm-open is-again" data-dm="open">${openLabel()}</button>
        <button class="dm-ghost" data-dm="reveal-close">Done</button>
      </div>
    </div>`;
  reveal.classList.remove("hidden");
  requestAnimationFrame(() => reveal.classList.add("visible"));
  viewer?.spin?.(900);
  addPulls(out);
}

function closeReveal() {
  const reveal = root.querySelector("#dmReveal");
  reveal.classList.remove("visible");
  setTimeout(() => reveal.classList.add("hidden"), 220);
}

// ---- Controls ------------------------------------------------------------

function setQty(n) {
  qty = Math.max(1, Math.min(MAX_QTY, n));
  root.querySelector("#dmQty").textContent = qty;
  root.querySelectorAll(".dm-open").forEach((b) => (b.innerHTML = openLabel()));
  root.querySelector(".dm-max")?.classList.toggle("active", qty === MAX_QTY);
}

function onClick(e) {
  const f = e.target.closest("[data-dm-filter]");
  if (f) {
    filter = f.dataset.dmFilter;
    root.querySelector(".dm-filters").innerHTML = filtersHTML();
    root.querySelector("#dmGrid").innerHTML = gridHTML();
    return;
  }
  if (e.target.classList.contains("dm-reveal")) return closeReveal();
  const act = e.target.closest("[data-dm]")?.dataset.dm;
  if (!act) return;
  if (act === "minus") setQty(qty - 1);
  else if (act === "plus") setQty(qty + 1);
  else if (act === "max") setQty(MAX_QTY);
  else if (act === "open") {
    if (!root.querySelector("#dmReveal").classList.contains("hidden")) closeReveal();
    setTimeout(openCrates, root.querySelector("#dmReveal").classList.contains("hidden") ? 0 : 240);
  } else if (act === "reveal-close") closeReveal();
  else if (act === "back") document.querySelector('.nav-tab[data-nav="screen-category"]')?.click();
  else if (act === "rail-close" || act === "rail-open") {
    railOpen = act === "rail-open";
    root.querySelector(".dm-layout").classList.toggle("rail-closed", !railOpen);
  }
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && root?.querySelector("#dmReveal.visible")) closeReveal();
});

// Pulled from this crate: drag it sideways with the mouse (touch scrolls
// it natively).
function initStripDrag() {
  let drag = null;
  root.addEventListener("pointerdown", (e) => {
    const strip = e.target.closest("#dmStrip");
    if (!strip || e.pointerType !== "mouse" || e.button !== 0) return;
    drag = { strip, x: e.clientX, left: strip.scrollLeft, moved: false };
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) {
      drag.moved = true;
      drag.strip.classList.add("is-dragging");
    }
    drag.strip.scrollLeft = drag.left - dx;
  });
  window.addEventListener("pointerup", () => {
    drag?.strip.classList.remove("is-dragging");
    drag = null;
  });
}
