// Odds: mystery boxes built from collectors' own vaulted pieces.
//
// There are three boxes, $300, $500 and $800, each sold in runs of ten: a
// run holds ten pieces, one for each box. Nothing opens one at a time.
// Buyers take boxes in a run, and when the tenth is taken the whole run
// opens at once, the ten pieces dealt out at random. Every box has the
// same shot at every piece: no run ever ends with only the leftovers, or
// with the grail saved for last.
//
// The money (shown to collectors, not to buyers):
//   the pieces in a run are worth BUYER_RETURN of what its boxes sell for
//     (75%: $2,250 of pieces in a $3,000 run of $300 boxes);
//   Chosen keeps PLATFORM_CUT of every box (10%);
//   the other 90% goes to the collectors, 90 / 75 = 1.2 times their
//     piece's value, paid when the run opens.
// That's more than the 80% instant cash-out, or a marketplace sale after
// fees: a reason to vault a piece and put it to work.
//
// A run that isn't full by its deadline closes early instead: each box
// that was taken gets one of the most valuable pieces at or under the box
// price, and the difference back as Credits, so its buyer breaks even;
// those collectors are paid their piece's full value; Chosen takes
// nothing; every other piece goes into the next run.
//
// Each box takes pieces worth a quarter of its price up to four times it,
// and every run has at least one piece worth twice the price or more. A
// collector whose own piece lands in their own box just gets it back,
// unpaid (otherwise buying out a run of your own pieces would pay you).
//
// The other collectors and buyers are simulated, as elsewhere on the site;
// your boxes, pieces and payouts are real within the demo. The window a
// run has to fill is short here (minutes, not days) so it can be seen.

import { createBoxViewer } from "./boxViewer.js";

export const BUYER_RETURN = 0.75;
export const PLATFORM_CUT = 0.1;
export const CREATOR_MULTIPLE = (1 - PLATFORM_CUT) / BUYER_RETURN; // 1.2
export const RUN_SIZE = 10;
export const BOX_PRICES = [300, 500, 800];
const RUN_WINDOW_MS = 8 * 60 * 1000; // how long a run has to fill (demo)
const BAND = [0.25, 4]; // what a box takes, as multiples of its price
const HIT = 2; // every run has a piece worth at least this many times the price
const CASH_OUT_RATE = 0.8; // the site's instant cash-out, for comparison
const STORAGE_KEY = "gotcha_odds_v2";
const CROWD_EVERY_MS = [5000, 9000];
const CROWD_WEIGHT = { 300: 0.5, 500: 0.32, 800: 0.18 };

// ---- Shared bits ---------------------------------------------------------

const TIER_ICON = {
  grail: "M239.75,90.81c0,.11,0,.21-.07.32L217,195a16,16,0,0,1-15.72,13H54.71A16,16,0,0,1,39,195L16.32,91.13c0-.11-.05-.21-.07-.32A16,16,0,0,1,44,77.39l33.67,36.29,35.8-80.29a1,1,0,0,0,0-.1,16,16,0,0,1,29.06,0,1,1,0,0,0,0,.1l35.8,80.29L212,77.39a16,16,0,0,1,27.71,13.42Z",
  epic: "M240,128a15.85,15.85,0,0,1-4.67,11.28l-96.05,96.06a16,16,0,0,1-22.56,0h0l-96-96.06a16,16,0,0,1,0-22.56l96.05-96.06a16,16,0,0,1,22.56,0l96.05,96.06A15.85,15.85,0,0,1,240,128Z",
  rare: "M234.29,114.85l-45,38.83L203,211.75a16.4,16.4,0,0,1-24.5,17.82L128,198.49,77.47,229.57A16.4,16.4,0,0,1,53,211.75l13.76-58.07-45-38.83A16.46,16.46,0,0,1,31.08,86l59-4.76,22.76-55.08a16.36,16.36,0,0,1,30.27,0l22.75,55.08,59,4.76a16.46,16.46,0,0,1,9.37,28.86Z",
  uncommon: "M232,80.18v95.64a16,16,0,0,1-8.32,14l-88,48.17a15.88,15.88,0,0,1-15.36,0l-88-48.17a16,16,0,0,1-8.32-14V80.18a16,16,0,0,1,8.32-14l88-48.17a15.88,15.88,0,0,1,15.36,0l88,48.17A16,16,0,0,1,232,80.18Z",
  common: "M232,128A104,104,0,1,1,128,24,104.13,104.13,0,0,1,232,128Z",
};
const TIER_LABEL = { grail: "Grail", epic: "Epic", rare: "Rare", uncommon: "Uncommon", common: "Common" };
// The site's own rarity names for the same five steps (My Items uses these).
const SITE_RARITY = { grail: "legendary", epic: "epic", rare: "rare", uncommon: "uncommon", common: "common" };

// A piece's tier in a box: how it compares to what the box cost.
function tierFor(value, price) {
  const x = value / price;
  if (x >= 3) return "grail";
  if (x >= 1.5) return "epic";
  if (x >= 1) return "rare";
  if (x >= 0.5) return "uncommon";
  return "common";
}

const icon = (tier, size = 13) =>
  `<svg viewBox="0 0 256 256" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="${TIER_ICON[tier]}"/></svg>`;
const chip = (tier) => `<span class="dm-chip dm-t-${tier}">${icon(tier)}${TIER_LABEL[tier]}</span>`;
const money = (v) => `$${Math.round(v).toLocaleString("en-US")}`;
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const uid = () => Math.random().toString(36).slice(2, 10);
const band = (price) => [Math.round(price * BAND[0]), Math.round(price * BAND[1])];
const fits = (value, price) => value >= price * BAND[0] && value <= price * BAND[1];
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ago(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 48 * 3600) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function countdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

// ---- State ---------------------------------------------------------------
// boxes[price] = { run, closesAt, pieces, spots, queue }
//   piece: { id, name, image, value, category, creator, mineId? }
//   spot:  { id, by, mine }
//   queue: pieces waiting for that box's next run (yours, or ones a run
//          that closed early didn't need)
// mine:    your pieces, start to finish: { id, name, image, value, category,
//          price, status: "queued" | "in-run" | "sold" | "returned",
//          run?, paid?, full?, at }
// results: opened runs, newest first: { id, price, run, early, at,
//          deals: [{ piece, to, yours, refund? }] }
// seen:    ids of results with your boxes in them you've been shown

let deps = null;
let state = null;
let root = null;
let viewer = null;
let crowdTimer = 0;
let clockTimer = 0;
let current = BOX_PRICES[0];
let qty = 1;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // unreadable: start over
  }
  return null;
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable: this visit only
  }
}

// ---- Runs ------------------------------------------------------------------

// Ten pieces for a box's next run: queued pieces first (yours, and any a
// run that closed early handed back; up to four), then collectors' pieces
// from the catalog, picked so the ten together are worth BUYER_RETURN of
// what the run sells for, with at least one piece worth HIT times the
// price.
function assembleRun(price) {
  const box = state.boxes[price];
  const target = BUYER_RETURN * RUN_SIZE * price;
  const carried = box.queue.splice(0, 4);
  const [lo, hi] = band(price);
  const names = new Set(carried.map((p) => p.name));
  const pool = deps.catalog.filter((p) => p.price >= lo && p.price <= hi && !names.has(p.name));
  const hits = pool.filter((p) => p.price >= price * HIT);
  const needHit = !carried.some((s) => s.value >= price * HIT) && hits.length;
  const fixed = carried.reduce((s, x) => s + x.value, 0);
  const free = RUN_SIZE - carried.length;
  let best = null;
  for (let attempt = 0; attempt < 600; attempt++) {
    const picks = [];
    if (needHit) picks.push(hits[Math.floor(Math.random() * hits.length)]);
    const rest = target - fixed - picks.reduce((s, p) => s + p.price, 0);
    const want = Math.max(lo, rest / Math.max(1, free - picks.length));
    const near = pool.filter((p) => p.price >= want * 0.35 && p.price <= want * 1.9 && !picks.includes(p));
    const from = near.length >= free ? near : pool;
    while (picks.length < free) {
      const p = from[Math.floor(Math.random() * from.length)];
      if (!picks.includes(p)) picks.push(p);
    }
    const sum = fixed + picks.reduce((s, p) => s + p.price, 0);
    const miss = Math.abs(sum - target);
    if (!best || miss < best.miss) best = { picks, miss };
    if (miss / target < 0.015) break;
  }
  const others = best.picks.map((p) => ({
    id: uid(),
    name: p.name,
    image: p.image,
    value: p.price,
    category: p.category,
    creator: deps.randomUsername(),
  }));
  box.run += 1;
  box.pieces = [...carried, ...others].sort((a, b) => b.value - a.value);
  box.spots = [];
  box.closesAt = Date.now() + RUN_WINDOW_MS;
  carried.forEach((s) => {
    const m = s.mineId && state.mine.find((x) => x.id === s.mineId);
    if (m) Object.assign(m, { status: "in-run", run: box.run });
  });
}

const taken = (price) => state.boxes[price].spots.length;
const free = (price) => RUN_SIZE - taken(price);
const yoursIn = (price) => state.boxes[price].spots.filter((s) => s.mine).length;

// Take boxes in a run. The one that fills it opens the run.
function takeSpots(price, n, byYou) {
  const box = state.boxes[price];
  const by = byYou ? deps.username() : deps.randomUsername();
  for (let i = 0; i < n && box.spots.length < RUN_SIZE; i++) box.spots.push({ id: uid(), by, mine: byYou });
  if (box.spots.length >= RUN_SIZE) return settle(price, false);
  save();
  return null;
}

// Open a run: full, every piece dealt to a box at random; early, only as
// many pieces as boxes were taken: the most valuable ones at or under the
// box price (and, only if there aren't enough, the cheapest above it), so
// each box's piece plus its Credits back comes to exactly what it cost.
function settle(price, early) {
  const box = state.boxes[price];
  const spots = shuffle(box.spots);
  if (early && !spots.length) {
    box.closesAt = Date.now() + RUN_WINDOW_MS; // nobody's in yet: give it longer
    save();
    return null;
  }
  const under = box.pieces.filter((p) => p.value <= price).sort((a, b) => b.value - a.value);
  const over = box.pieces.filter((p) => p.value > price).sort((a, b) => a.value - b.value);
  const pieces = early ? [...under, ...over].slice(0, spots.length) : box.pieces;
  const dealt = shuffle(pieces);
  const deals = spots.map((spot, i) => {
    const piece = dealt[i];
    const deal = { piece: { ...piece }, to: spot.by, yours: spot.mine };
    const m = piece.mineId && state.mine.find((x) => x.id === piece.mineId);
    if (m && spot.mine) {
      // Your own piece, in your own box: back to you, unpaid.
      Object.assign(m, { status: "returned", at: Date.now() });
    } else if (m) {
      const paid = Math.round(piece.value * (early ? 1 : CREATOR_MULTIPLE));
      Object.assign(m, { status: "sold", paid, full: !early, by: spot.by, at: Date.now() });
      deps.addCash(paid);
      deps.showToast(`${spot.by} got your ${piece.name}: +${money(paid)} paid to you`, 4200);
    }
    if (spot.mine) {
      deps.giveItem({ name: piece.name, price: piece.value, image: piece.image, category: piece.category, rarity: SITE_RARITY[tierFor(piece.value, price)] });
      // Closed early, a box short of what it cost gets the difference back.
      if (early && piece.value < price) {
        deal.refund = Math.round(price - piece.value);
        deps.addCredits(deal.refund);
      }
    }
    return deal;
  });
  // Early: the pieces nobody needed go into the next run.
  if (early) {
    const used = new Set(pieces.map((p) => p.id));
    const back = box.pieces.filter((p) => !used.has(p.id));
    box.queue.unshift(...back);
    back.forEach((p) => {
      const m = p.mineId && state.mine.find((x) => x.id === p.mineId);
      if (m) Object.assign(m, { status: "queued", run: null });
    });
  }
  const result = { id: uid(), price, run: box.run, early, at: Date.now(), deals };
  state.results.unshift(result);
  state.results = state.results.slice(0, 40);
  assembleRun(price);
  save();
  return result;
}

// Runs past their deadline close early.
function closeDue() {
  const due = BOX_PRICES.filter((p) => Date.now() >= state.boxes[p].closesAt);
  return due.map((p) => settle(p, true)).filter(Boolean);
}

// ---- Setup -----------------------------------------------------------------

export function initOdds(el, appDeps) {
  root = el;
  deps = appDeps;
  state = load();
  if (!state || !state.boxes || !BOX_PRICES.every((p) => state.boxes[p])) {
    state = { boxes: {}, mine: [], results: [], seen: [], lastTick: Date.now() };
    BOX_PRICES.forEach((p, i) => {
      state.boxes[p] = { run: 11 + i * 3, pieces: [], spots: [], queue: [], closesAt: 0 };
      assembleRun(p);
      // A couple of opened runs behind it, and the current one part-way.
      for (let r = 0; r < 2; r++) takeSpots(p, RUN_SIZE, false);
      takeSpots(p, 2 + Math.floor(Math.random() * 5), false);
      state.boxes[p].closesAt = Date.now() + RUN_WINDOW_MS * (0.4 + Math.random() * 0.5);
    });
    state.results.forEach((r) => (r.at -= Math.floor(Math.random() * 40 * 60 * 1000)));
  }
  // Time away: the crowd kept taking boxes, and runs past their deadline
  // closed (capped, so a long absence doesn't churn through everything).
  const steps = Math.min(30, Math.floor((Date.now() - (state.lastTick ?? Date.now())) / 7000));
  for (let i = 0; i < steps; i++) crowdTake();
  closeDue();
  state.lastTick = Date.now();
  save();
  root.addEventListener("click", onClick);
  scheduleCrowd();
}

// The simulated crowd: someone takes a box every few seconds, the cheaper
// box more often. Runs everywhere, so your runs fill (and your pieces
// sell) wherever you are on the site.
function scheduleCrowd() {
  clearTimeout(crowdTimer);
  const [a, b] = CROWD_EVERY_MS;
  crowdTimer = setTimeout(() => {
    if (!document.hidden) tick();
    scheduleCrowd();
  }, a + Math.random() * (b - a));
}

function crowdTake() {
  const r = Math.random();
  const price = r < CROWD_WEIGHT[300] ? 300 : r < CROWD_WEIGHT[300] + CROWD_WEIGHT[500] ? 500 : 800;
  return takeSpots(price, Math.random() < 0.2 ? 2 : 1, false);
}

function tick() {
  const opened = [crowdTake(), ...closeDue()].filter(Boolean);
  state.lastTick = Date.now();
  save();
  opened.forEach(announce);
  if (opened.length) deps.renderWallet();
  if (isOpen()) refresh();
}

// A run you had boxes in has opened: show it here, or say so elsewhere.
function announce(result) {
  const mine = result.deals.filter((d) => d.yours);
  if (!mine.length || state.seen.includes(result.id)) return;
  if (isOpen() && result.price === current) {
    state.seen.push(result.id);
    save();
    showReveal(result);
  } else {
    deps.showToast(`Your ${money(result.price)} ${mine.length > 1 ? "boxes" : "box"} opened${result.early ? " (closed early)" : ""}: see what you got in Odds`, 4200);
  }
}

const isOpen = () => !!root?.isConnected && root.closest(".screen")?.classList.contains("active");

// ---- Page ----------------------------------------------------------------

export function renderOdds() {
  if (!root) return;
  qty = Math.max(1, Math.min(qty, free(current)));
  root.innerHTML = `
    <div class="dm-layout od-layout">
      <div class="dm-main">
        <div class="od-boxes" role="tablist" aria-label="Box">${tabsHTML()}</div>
        <div id="odHero">${heroHTML()}</div>
        <section class="dm-sec">
          <div class="dm-sec-head">
            <div>
              <h2 class="dm-h2">In this run</h2>
              <p class="dm-sub">Ten pieces, one for every box, each put in by a collector. They&rsquo;re dealt out when the run opens.</p>
            </div>
          </div>
          <ul class="dm-grid od-grid" id="odGrid">${gridHTML()}</ul>
        </section>
        <section class="dm-sec">
          <h2 class="dm-h2">Opened runs</h2>
          <p class="dm-sub">What came out of the ${money(current)} box&rsquo;s last runs, and who got it. Drag to see more.</p>
          <ul class="dm-strip" id="odStrip">${stripHTML()}</ul>
        </section>
        <section class="dm-sec" id="odYours">${yoursHTML()}</section>
        <section class="dm-sec od-sell" id="odSell">${sellHTML()}</section>
      </div>
    </div>
    <div class="dm-reveal hidden" id="odReveal" role="dialog" aria-modal="true" aria-label="What came out"></div>`;
  mountBox();
  initStripDrag();
  startClock();
  // A run of yours that opened while you were elsewhere.
  const unseen = state.results.find((r) => r.price === current && r.deals.some((d) => d.yours) && !state.seen.includes(r.id));
  if (unseen) {
    state.seen.push(unseen.id);
    save();
    showReveal(unseen);
  }
}

export function leaveOdds() {
  viewer?.dispose();
  viewer = null;
  clearInterval(clockTimer);
}

function tabsHTML() {
  return BOX_PRICES.map(
    (p) =>
      `<button class="od-box-tab${p === current ? " active" : ""}" data-od-box="${p}" role="tab" aria-selected="${p === current}"><b>${money(p)}</b> box<span>${taken(p)} of ${RUN_SIZE} taken${yoursIn(p) ? ` &middot; ${yoursIn(p)} yours` : ""}</span></button>`
  ).join("");
}

// Redraw what a box taken or a run opened changes, keeping the rest (and
// the turning box).
function refresh() {
  if (!isOpen()) return;
  root.querySelector(".od-boxes").innerHTML = tabsHTML();
  qty = Math.max(1, Math.min(qty, free(current)));
  const copy = root.querySelector(".od-hero-copy");
  if (copy) copy.innerHTML = heroCopyHTML();
  root.querySelector("#odGrid").innerHTML = gridHTML();
  const strip = root.querySelector("#odStrip");
  const keep = strip.scrollLeft;
  strip.innerHTML = stripHTML();
  strip.scrollLeft = keep;
  root.querySelector("#odYours").innerHTML = yoursHTML();
  root.querySelector("#odSell").innerHTML = sellHTML();
}

// The countdowns tick every second while the page is up.
function startClock() {
  clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    if (!isOpen()) return;
    root.querySelectorAll("[data-closes]").forEach((el) => {
      el.textContent = countdown(Number(el.dataset.closes) - Date.now());
    });
    if (BOX_PRICES.some((p) => Date.now() >= state.boxes[p].closesAt)) {
      const opened = closeDue();
      opened.forEach(announce);
      if (opened.length) deps.renderWallet();
      refresh();
    }
  }, 1000);
}

function heroHTML() {
  return `
    <section class="dm-hero od-hero">
      <div class="dm-hero-media">
        <canvas class="dm-box" id="odBox"></canvas>
      </div>
      <div class="dm-hero-copy od-hero-copy">${heroCopyHTML()}</div>
    </section>`;
}

function heroCopyHTML() {
  const box = state.boxes[current];
  const n = taken(current);
  const cells = Array.from({ length: RUN_SIZE }, (_, i) => {
    const s = box.spots[i];
    return `<i class="${s ? "is-taken" : ""}${s?.mine ? " is-mine" : ""}"></i>`;
  }).join("");
  const mine = yoursIn(current);
  return `
    <span class="dm-pill">Run #${box.run}</span>
    <h1 class="dm-title">The ${money(current)} box</h1>
    <p class="dm-blurb">Ten boxes, ten real pieces from collectors&rsquo; vaults. Nothing opens until all ten are taken. Then they open together, so every box has the same shot at every piece.</p>
    <div class="dm-buyline">
      <div class="dm-price"><b>${money(current)}</b><span>per box</span></div>
    </div>
    <div class="dm-open-row">
      <div class="dm-qty">
        <button data-od="minus" aria-label="One fewer">&minus;</button>
        <b id="odQty">${qty}</b>
        <button data-od="plus" aria-label="One more">+</button>
        <button class="dm-max${qty === free(current) ? " active" : ""}" data-od="max">Max</button>
      </div>
      <button class="dm-open" data-od="take">${takeLabel()}</button>
    </div>
    <p class="dm-paid">Paid in credit or balance. Your box opens with the rest of the run.</p>
    <div class="od-meter" aria-label="${n} of ${RUN_SIZE} boxes taken">${cells}</div>
    <p class="od-run-line"><b>${n} of ${RUN_SIZE} taken</b>${mine ? ` &middot; ${plural(mine, "is", "are")} yours` : ""} &middot; opens when it&rsquo;s full &middot; closes in <span class="od-clock" data-closes="${box.closesAt}">${countdown(box.closesAt - Date.now())}</span></p>
    <p class="od-fallback">Not full in time? It closes early: each box taken gets a piece, plus Credits to make up exactly what it cost, and the other pieces go into the next run.</p>`;
}

function takeLabel() {
  return `<span>Take ${qty} box${qty > 1 ? "es" : ""}</span><span class="dm-open-price">${money(current * qty)}<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></span>`;
}

function creatorHTML(p) {
  return `<span class="od-creator">${p.mineId ? `<span class="od-you">You</span>` : `${deps.avatarHTML(p.creator, "od-avatar")}${esc(p.creator)}`}</span>`;
}

function gridHTML() {
  return state.boxes[current].pieces
    .map((p) => {
      const t = tierFor(p.value, current);
      return `<li class="dm-piece dm-t-${t}${p.mineId ? " is-mine" : ""}">
        <span class="dm-card-top">${chip(t)}</span>
        <span class="dm-img"><img src="${p.image}" alt="" loading="lazy"></span>
        <span class="dm-piece-text">
          <span class="dm-name" title="${esc(p.name)}">${esc(p.name)}</span>
          <b class="dm-money">${money(p.value)}</b>
        </span>
        ${creatorHTML(p)}
      </li>`;
    })
    .join("");
}

function stripHTML() {
  const deals = state.results
    .filter((r) => r.price === current)
    .flatMap((r) => r.deals.map((d) => ({ ...d, run: r.run, at: r.at, early: r.early })))
    .slice(0, 24);
  if (!deals.length) return `<li class="od-empty">No runs of this box have opened yet.</li>`;
  return deals
    .map((d) => {
      const t = tierFor(d.piece.value, current);
      return `<li class="dm-pull dm-t-${t}${d.yours ? " is-yours" : ""}">
        <span class="dm-card-top">${chip(t)}<span class="dm-ago">${ago(Date.now() - d.at)}</span></span>
        <span class="dm-img"><img src="${d.piece.image}" alt="" loading="lazy" draggable="false"></span>
        <span class="dm-name" title="${esc(d.piece.name)}">${esc(d.piece.name)}</span>
        <b class="dm-money">${money(d.piece.value)}</b>
        <span class="od-to">Run #${d.run}${d.early ? " (early)" : ""} &middot; ${d.yours ? "you" : esc(d.to)}</span>
      </li>`;
    })
    .join("");
}

// ---- Your boxes ------------------------------------------------------------

function yoursHTML() {
  const open = BOX_PRICES.filter((p) => yoursIn(p)).map((p) => {
    const box = state.boxes[p];
    return `<li class="od-mine-row is-waiting">
        <span class="od-mine-badge">${yoursIn(p)}&times;</span>
        <span class="od-mine-text"><span class="dm-name">${money(p)} box, run #${box.run}</span><span>${taken(p)} of ${RUN_SIZE} taken &middot; closes in <span data-closes="${box.closesAt}">${countdown(box.closesAt - Date.now())}</span></span></span>
        <b class="dm-money">${money(p * yoursIn(p))}</b>
      </li>`;
  });
  const got = state.results
    .flatMap((r) => r.deals.filter((d) => d.yours).map((d) => ({ ...d, r })))
    .slice(0, 8)
    .map(
      (d) => `<li class="od-mine-row${d.piece.value >= d.r.price ? " is-up" : ""}">
        <span class="dm-img"><img src="${d.piece.image}" alt=""></span>
        <span class="od-mine-text"><span class="dm-name">${esc(d.piece.name)}</span><span>${money(d.r.price)} box, run #${d.r.run}${d.r.early ? " &middot; closed early" : ""}${d.refund ? ` &middot; ${money(d.refund)} back in Credits` : ""} &middot; ${ago(Date.now() - d.r.at)}</span></span>
        <b class="dm-money">${money(d.piece.value)}</b>
      </li>`
    );
  if (!open.length && !got.length) return "";
  return `
    <h2 class="dm-h2">Your boxes</h2>
    <p class="dm-sub">Boxes you&rsquo;re waiting on, and what came out of the ones that opened. Everything you got is in My Items.</p>
    <ul class="od-mine">${open.join("")}${got.join("")}</ul>`;
}

// ---- Put an item in --------------------------------------------------------

function statusLine(m) {
  const box = state.boxes[m.price];
  if (m.status === "queued") return `Waiting for the next run of the ${money(m.price)} box`;
  if (m.status === "in-run") return `In run #${m.run} of the ${money(m.price)} box${box.run === m.run ? `, ${taken(m.price)} of ${RUN_SIZE} taken` : ""}`;
  if (m.status === "sold") return `${esc(m.by)} got it &middot; <b>${money(m.paid)}</b> paid to you${m.full ? "" : " (run closed early: full value)"}`;
  return `It came out in your own box, so it&rsquo;s back in My Items`;
}

function sellHTML() {
  const [lo, hi] = band(current);
  const vault = deps.vault();
  const mine = [...state.mine].sort((a, b) => b.at - a.at).slice(0, 8);
  const cards = vault.length
    ? vault
        .map((v) => {
          const ok = fits(v.value, current);
          const elsewhere = BOX_PRICES.find((p) => fits(v.value, p));
          return `<li class="od-vault${ok ? "" : " is-off"}">
            <span class="dm-img"><img src="${v.image}" alt="" loading="lazy"></span>
            <span class="dm-name" title="${esc(v.name)}">${esc(v.name)}</span>
            <span class="od-vault-row"><span>Worth</span><b>${money(v.value)}</b></span>
            <span class="od-vault-row is-pay"><span>Paid when it sells</span><b>${money(v.value * CREATOR_MULTIPLE)}</b></span>
            <span class="od-vault-row is-cash"><span>Cash out today</span><span>${money(v.value * CASH_OUT_RATE)}</span></span>
            ${
              ok
                ? `<button class="od-put" data-od-put="${v.id}">Put in the ${money(current)} box</button>`
                : `<span class="od-off">${elsewhere ? `Fits the <button class="od-link" data-od-box="${elsewhere}">${money(elsewhere)} box</button>` : "Outside every box&rsquo;s range"}</span>`
            }
          </li>`;
        })
        .join("")
    : `<li class="od-empty">Nothing in your vault yet. Keep a pull, and it can go in a box.</li>`;
  return `
    <div class="dm-sec-head">
      <div>
        <h2 class="dm-h2">Put an item in</h2>
        <p class="dm-sub">Sell a piece from your vault through the boxes. When the run it&rsquo;s in opens you&rsquo;re paid <b>${Math.round(CREATOR_MULTIPLE * 100)}% of its value</b>, against ${Math.round(CASH_OUT_RATE * 100)}% to cash out. If the run closes early and your piece is used, you&rsquo;re paid its full value; if not, it goes into the next run. The ${money(current)} box takes pieces worth ${money(lo)} to ${money(hi)}.</p>
      </div>
    </div>
    ${
      mine.length
        ? `<ul class="od-mine">${mine
            .map(
              (m) => `<li class="od-mine-row is-${m.status}">
              <span class="dm-img"><img src="${m.image}" alt=""></span>
              <span class="od-mine-text"><span class="dm-name">${esc(m.name)}</span><span>${statusLine(m)}</span></span>
              <b class="dm-money">${money(m.status === "sold" ? m.paid : m.value * CREATOR_MULTIPLE)}</b>
            </li>`
            )
            .join("")}</ul>`
        : ""
    }
    <ul class="od-vaults">${cards}</ul>`;
}

function putIn(itemId) {
  const v = deps.vault().find((x) => x.id === itemId);
  if (!v || !fits(v.value, current)) return;
  if (!deps.takeItem(itemId)) return;
  const id = uid();
  state.mine.unshift({ id, name: v.name, image: v.image, value: v.value, category: v.category, price: current, status: "queued", at: Date.now() });
  state.boxes[current].queue.push({ id: uid(), mineId: id, name: v.name, image: v.image, value: v.value, category: v.category, creator: deps.username() });
  save();
  deps.showToast(`${v.name} goes into the ${money(current)} box's next run. You'll be paid ${money(v.value * CREATOR_MULTIPLE)} when it sells`, 3800);
  refresh();
}

// ---- Taking boxes ----------------------------------------------------------

function takeBoxes() {
  const n = Math.min(qty, free(current));
  if (!n) return;
  const cost = current * n;
  if (!deps.pay(cost)) return deps.showToast(`Not enough credit or balance for ${money(cost)}`, 2400);
  const result = takeSpots(current, n, true);
  deps.renderWallet();
  qty = 1;
  viewer?.spin?.(900);
  if (result) {
    state.seen.push(result.id);
    save();
    showReveal(result);
    deps.renderWallet();
  } else {
    deps.showToast(`${plural(n, "box", "boxes")} taken in run #${state.boxes[current].run}. ${free(current)} to go before it opens`, 3000);
  }
  refresh();
}

function showReveal(result) {
  const mine = result.deals.filter((d) => d.yours);
  const total = mine.reduce((s, d) => s + d.piece.value, 0);
  const cost = mine.length * result.price;
  const refunds = mine.reduce((s, d) => s + (d.refund || 0), 0);
  const reveal = root.querySelector("#odReveal");
  reveal.innerHTML = `
    <div class="dm-reveal-card">
      <h3 class="dm-h2">Run #${result.run} ${result.early ? "closed early" : "opened"}</h3>
      <p class="od-reveal-sub">${
        result.early
          ? `It closed with ${plural(result.deals.length, "box", "boxes")} taken, so each got a piece and Credits that come to its ${money(result.price)}.`
          : `All ten ${money(result.price)} boxes were taken, and opened together.`
      }</p>
      <ul class="dm-reveal-list${mine.length === 1 ? " is-one" : ""}">${mine
        .map((d, i) => {
          const t = tierFor(d.piece.value, result.price);
          return `<li class="dm-piece dm-t-${t}" style="--i:${i}">
            <span class="dm-card-top">${chip(t)}</span>
            <span class="dm-img"><img src="${d.piece.image}" alt=""></span>
            <span class="dm-name">${esc(d.piece.name)}</span>
            <b class="dm-money">${money(d.piece.value)}</b>
            <span class="od-creator">${d.piece.mineId ? "Your own piece: back to you, unpaid" : `from ${esc(d.piece.creator)}`}</span>
          </li>`;
        })
        .join("")}</ul>
      <p class="dm-reveal-total">${mine.length > 1 ? `Worth ${money(total)} together, from ${money(cost)} of boxes.` : `${(total / result.price).toFixed(2)}&times; what the box cost.`}${refunds ? ` ${money(refunds)} back in Credits.` : ""}</p>
      <p class="dm-reveal-note">In My Items now: keep it, ship it, list it, cash it out, or put it in a box yourself.</p>
      <div class="dm-reveal-actions"><button class="dm-ghost" data-od="reveal-close">Done</button></div>
    </div>`;
  reveal.classList.remove("hidden");
  requestAnimationFrame(() => reveal.classList.add("visible"));
}

function closeReveal() {
  const reveal = root.querySelector("#odReveal");
  reveal.classList.remove("visible");
  setTimeout(() => reveal.classList.add("hidden"), 220);
}

// ---- Controls --------------------------------------------------------------

function setQty(n) {
  qty = Math.max(1, Math.min(free(current), n));
  const copy = root.querySelector(".od-hero-copy");
  if (copy) copy.innerHTML = heroCopyHTML();
}

function onClick(e) {
  if (e.target.classList.contains("dm-reveal")) return closeReveal();
  const tab = e.target.closest("[data-od-box]");
  if (tab) {
    current = Number(tab.dataset.odBox);
    qty = 1;
    renderOdds();
    if (!tab.classList.contains("od-box-tab")) root.scrollIntoView({ behavior: "smooth" });
    return;
  }
  const put = e.target.closest("[data-od-put]");
  if (put) return putIn(put.dataset.odPut);
  const act = e.target.closest("[data-od]")?.dataset.od;
  if (!act) return;
  if (act === "minus") setQty(qty - 1);
  else if (act === "plus") setQty(qty + 1);
  else if (act === "max") setQty(free(current));
  else if (act === "reveal-close") closeReveal();
  else if (act === "take") takeBoxes();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && root?.querySelector("#odReveal.visible")) closeReveal();
});

function mountBox() {
  viewer?.dispose();
  viewer = null;
  const canvas = root.querySelector("#odBox");
  if (!canvas) return;
  createBoxViewer(canvas, "odds", "od", { fitOpen: true }).then((v) => {
    if (!canvas.isConnected) return v.dispose();
    viewer = v;
  });
}

// The opened-runs strip: drag it sideways with the mouse (touch scrolls it).
let dragBound = false;
function initStripDrag() {
  if (dragBound) return;
  dragBound = true;
  let drag = null;
  root.addEventListener("pointerdown", (e) => {
    const strip = e.target.closest("#odStrip");
    if (!strip || e.pointerType !== "mouse" || e.button !== 0) return;
    drag = { strip, x: e.clientX, left: strip.scrollLeft };
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) drag.strip.classList.add("is-dragging");
    drag.strip.scrollLeft = drag.left - dx;
  });
  window.addEventListener("pointerup", () => {
    drag?.strip.classList.remove("is-dragging");
    drag = null;
  });
}
