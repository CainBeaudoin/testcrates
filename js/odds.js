// Odds: mystery boxes built from collectors' own vaulted pieces.
//
// There are three boxes, $300, $500 and $800, each sold in runs of ten.
// A run holds exactly ten pieces, one per box, so by the time it sells out
// every piece in it has been pulled. Every box sold goes into the run's
// pot; Chosen takes its cut, and the rest is paid out to the collectors
// who put the pieces in, each in proportion to their piece's value:
//
//   the pieces in a run are worth BUYER_RETURN of what its boxes sell for
//     (75%: $2,250 of pieces in a $3,000 run of $300 boxes);
//   Chosen keeps PLATFORM_CUT of every box (10%);
//   the other 90% goes to the collectors, which is 90 / 75 = 1.2 times
//     their piece's value, paid the moment it's pulled.
//
// So a collector is paid 120% of what their piece is worth, from every box
// anyone opens in the run, not just the one that pulls it: it doesn't
// matter whether it goes first or last. That's more than the 80% instant
// cash-out, or a marketplace sale after fees: a reason to vault a piece
// and put it to work.
//
// Each box takes pieces worth a quarter of its price up to four times it,
// and every run has at least one piece worth twice the price or more. A
// collector who pulls their own piece just gets it back, unpaid (otherwise
// buying your own run would pay you for your own pieces).
//
// The other collectors and buyers are simulated, as elsewhere on the site;
// your boxes, pieces and payouts are real within the demo.

import { createBoxViewer } from "./boxViewer.js";

export const BUYER_RETURN = 0.75;
export const PLATFORM_CUT = 0.1;
export const CREATOR_MULTIPLE = (1 - PLATFORM_CUT) / BUYER_RETURN; // 1.2
export const RUN_SIZE = 10;
export const BOX_PRICES = [300, 500, 800];
const BAND = [0.25, 4]; // what a box takes, as multiples of its price
const HIT = 2; // every run has a piece worth at least this many times the price
const CASH_OUT_RATE = 0.8; // the site's instant cash-out, for comparison
const STORAGE_KEY = "gotcha_odds_v1";
const CROWD_EVERY_MS = [5000, 9000];

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

function ago(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 48 * 3600) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ---- State ---------------------------------------------------------------
// boxes[price] = { run, slots, queue }
//   slot:  { id, name, image, value, category, creator, mineId?, pulled?: { by, at } }
//   queue: your pieces waiting for that box's next run (same shape as a slot)
// mine:  your pieces, start to finish: { id, name, image, value, category,
//        price, status: "queued" | "in-run" | "paid" | "returned", run?, paid?, by?, at }
// feed:  pulls, newest first: { name, image, value, price, by, at }

let deps = null;
let state = null;
let root = null;
let viewer = null;
let crowdTimer = 0;
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

// Ten pieces for a run of a box: your queued pieces first (up to three),
// then collectors' pieces from the catalog, picked so the ten together are
// worth BUYER_RETURN of what the run sells for, with at least one piece
// worth HIT times the price.
function assembleRun(price) {
  const box = state.boxes[price];
  const target = BUYER_RETURN * RUN_SIZE * price;
  const mine = box.queue.splice(0, 3);
  const [lo, hi] = band(price);
  const pool = deps.catalog.filter((p) => p.price >= lo && p.price <= hi);
  const hits = pool.filter((p) => p.price >= price * HIT);
  const needHit = !mine.some((s) => s.value >= price * HIT) && hits.length;
  const fixed = mine.reduce((s, x) => s + x.value, 0);
  const free = RUN_SIZE - mine.length;
  let best = null;
  for (let attempt = 0; attempt < 600; attempt++) {
    const picks = [];
    if (needHit) picks.push(hits[Math.floor(Math.random() * hits.length)]);
    const left = target - fixed - picks.reduce((s, p) => s + p.price, 0);
    const want = Math.max(lo, left / Math.max(1, free - picks.length));
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
  box.slots = [...mine, ...others].sort((a, b) => b.value - a.value);
  mine.forEach((s) => {
    const m = state.mine.find((x) => x.id === s.mineId);
    if (m) Object.assign(m, { status: "in-run", run: box.run });
  });
}

function left(price) {
  return state.boxes[price].slots.filter((s) => !s.pulled);
}

// One box opened: a piece at random from the ones left in the run. Pays
// its collector, or hands your own piece back if it's yours and you
// opened it. Starts the next run once the last box goes.
function pull(price, byYou) {
  const box = state.boxes[price];
  if (!left(price).length) assembleRun(price);
  const pool = left(price);
  const slot = pool[Math.floor(Math.random() * pool.length)];
  const by = byYou ? deps.username() : deps.randomUsername();
  slot.pulled = { by, at: Date.now() };
  state.feed.unshift({ name: slot.name, image: slot.image, value: slot.value, price, by, at: Date.now(), mine: !!slot.mineId });
  state.feed = state.feed.slice(0, 60);
  let event = null;
  if (slot.mineId) {
    const m = state.mine.find((x) => x.id === slot.mineId);
    if (byYou) {
      Object.assign(m, { status: "returned", at: Date.now() });
      event = { kind: "returned", piece: slot };
    } else {
      const paid = Math.round(slot.value * CREATOR_MULTIPLE); // whole dollars, like every balance on the site
      Object.assign(m, { status: "paid", paid, by, at: Date.now() });
      deps.addCash(paid);
      event = { kind: "paid", piece: slot, paid, by, price };
    }
  }
  const result = { ...slot, run: box.run };
  if (!left(price).length) assembleRun(price);
  save();
  return { result, event };
}

// ---- Setup -----------------------------------------------------------------

export function initOdds(el, appDeps) {
  root = el;
  deps = appDeps;
  state = load();
  if (!state || !state.boxes || !BOX_PRICES.every((p) => state.boxes[p])) {
    state = { boxes: {}, mine: [], feed: [], lastTick: Date.now() };
    BOX_PRICES.forEach((p, i) => {
      state.boxes[p] = { run: 11 + i * 3, slots: [], queue: [] };
      assembleRun(p);
    });
    // A few already pulled, so the runs look under way.
    BOX_PRICES.forEach((p) => {
      for (let i = 0; i < 2 + Math.floor(Math.random() * 5); i++) pull(p, false);
    });
  }
  // Time away: the crowd kept opening (capped, so a long absence doesn't
  // drain every run at once).
  const steps = Math.min(30, Math.floor((Date.now() - (state.lastTick ?? Date.now())) / 7000));
  for (let i = 0; i < steps; i++) crowdStep({ quiet: true });
  state.lastTick = Date.now();
  save();
  root.addEventListener("click", onClick);
  scheduleCrowd();
}

// The simulated crowd: someone opens a box every few seconds, the cheaper
// box more often. Runs everywhere, so your pieces get pulled (and you get
// paid) wherever you are on the site.
function scheduleCrowd() {
  clearTimeout(crowdTimer);
  const [a, b] = CROWD_EVERY_MS;
  crowdTimer = setTimeout(() => {
    if (!document.hidden) crowdStep();
    scheduleCrowd();
  }, a + Math.random() * (b - a));
}

function crowdStep({ quiet = false } = {}) {
  const r = Math.random();
  const price = r < 0.5 ? 300 : r < 0.82 ? 500 : 800;
  const { event } = pull(price, false);
  state.lastTick = Date.now();
  save();
  if (event?.kind === "paid" && !quiet) {
    deps.showToast(`${event.by} pulled your ${event.piece.name} from a ${money(event.price)} box: +${money(event.paid)} paid to you`, 4200);
    deps.renderWallet();
  }
  if (isOpen()) refresh(price);
}

const isOpen = () => !!root?.isConnected && root.closest(".screen")?.classList.contains("active");

// ---- Page ----------------------------------------------------------------

export function renderOdds() {
  if (!root) return;
  qty = Math.min(qty, left(current).length || 1);
  root.innerHTML = `
    <div class="dm-layout od-layout">
      <div class="dm-main">
        <div class="od-boxes" role="tablist" aria-label="Box">${BOX_PRICES.map(
          (p) =>
            `<button class="od-box-tab${p === current ? " active" : ""}" data-od-box="${p}" role="tab" aria-selected="${p === current}"><b>${money(p)}</b> box<span>${left(p).length} of ${RUN_SIZE} left</span></button>`
        ).join("")}</div>
        <div id="odHero">${heroHTML()}</div>
        <section class="dm-sec">
          <div class="dm-sec-head">
            <div>
              <h2 class="dm-h2">In this run</h2>
              <p class="dm-sub">Ten pieces, one in every box, each put in by a collector. Pulled pieces stay on show.</p>
            </div>
          </div>
          <ul class="dm-grid od-grid" id="odGrid">${gridHTML()}</ul>
        </section>
        <section class="dm-sec">
          <h2 class="dm-h2">Pulled from the ${money(current)} box</h2>
          <p class="dm-sub">The latest opens, as they happen. Drag to see more.</p>
          <ul class="dm-strip" id="odStrip">${stripHTML()}</ul>
        </section>
        <section class="dm-sec od-sell" id="odSell">${sellHTML()}</section>
      </div>
    </div>
    <div class="dm-reveal hidden" id="odReveal" role="dialog" aria-modal="true" aria-label="What came out"></div>`;
  mountBox();
  initStripDrag();
}

export function leaveOdds() {
  viewer?.dispose();
  viewer = null;
}

// Redraw what a pull changes, keeping the rest (and the turning box).
function refresh(price) {
  if (!isOpen()) return;
  root.querySelectorAll(".od-box-tab").forEach((t) => {
    const p = Number(t.dataset.odBox);
    t.querySelector("span").textContent = `${left(p).length} of ${RUN_SIZE} left`;
  });
  if (price !== current) return;
  qty = Math.min(qty, left(current).length || 1);
  const copy = root.querySelector(".od-hero-copy");
  if (copy) copy.innerHTML = heroCopyHTML();
  root.querySelector("#odGrid").innerHTML = gridHTML();
  const strip = root.querySelector("#odStrip");
  const keep = strip.scrollLeft;
  strip.innerHTML = stripHTML();
  strip.scrollLeft = keep;
  root.querySelector("#odSell").innerHTML = sellHTML();
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
  const rest = left(current);
  const best = rest[0];
  const sales = RUN_SIZE * current;
  const cells = box.slots
    .map((s) => `<i class="${s.pulled ? "is-pulled" : ""}${s.mineId ? " is-mine" : ""}" title="${esc(s.name)}"></i>`)
    .join("");
  return `
    <span class="dm-pill">Run #${box.run}</span>
    <h1 class="dm-title">The ${money(current)} box</h1>
    <p class="dm-blurb">Every box holds one real, vaulted piece, put in by a collector. Ten boxes, ten pieces: when they&rsquo;re gone, a new run starts.</p>
    <div class="dm-buyline">
      <div class="dm-price"><b>${money(current)}</b><span>per box</span></div>
      ${best ? `<span class="od-best">Biggest piece left: <b>${money(best.value)}</b></span>` : ""}
    </div>
    <div class="dm-open-row">
      <div class="dm-qty">
        <button data-od="minus" aria-label="One fewer">&minus;</button>
        <b id="odQty">${qty}</b>
        <button data-od="plus" aria-label="One more">+</button>
        <button class="dm-max${qty === rest.length ? " active" : ""}" data-od="max">Max</button>
      </div>
      <button class="dm-open" data-od="open">${openLabel()}</button>
    </div>
    <p class="dm-paid">Paid in credit or balance.</p>
    <div class="od-meter" aria-label="${rest.length} of ${RUN_SIZE} boxes left">${cells}<span>${rest.length} of ${RUN_SIZE} left</span></div>
    <div class="od-split">
      <div class="od-split-card"><span>Buyers</span><b>${Math.round(BUYER_RETURN * 100)}%</b><small>back on average, in pieces</small></div>
      <div class="od-split-card is-creator"><span>Collectors</span><b>${Math.round(CREATOR_MULTIPLE * 100)}%</b><small>of their piece&rsquo;s value, when it&rsquo;s pulled</small></div>
      <div class="od-split-card"><span>Chosen</span><b>${Math.round(PLATFORM_CUT * 100)}%</b><small>of every box</small></div>
    </div>
    <p class="od-math">This run: ${money(sales)} of boxes holds ${money(sales * BUYER_RETURN)} of pieces. ${money(sales * (1 - PLATFORM_CUT))} goes to the collectors, ${money(sales * PLATFORM_CUT)} to Chosen.</p>`;
}

function openLabel() {
  return `<span>Open ${qty} box${qty > 1 ? "es" : ""}</span><span class="dm-open-price">${money(current * qty)}<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></span>`;
}

function creatorHTML(s) {
  return `<span class="od-creator">${s.mineId ? `<span class="od-you">You</span>` : `${deps.avatarHTML(s.creator, "od-avatar")}${esc(s.creator)}`}</span>`;
}

function gridHTML() {
  const rest = left(current).length;
  return state.boxes[current].slots
    .map((s) => {
      const t = tierFor(s.value, current);
      return `<li class="dm-piece dm-t-${t}${s.pulled ? " is-pulled" : ""}${s.mineId ? " is-mine" : ""}">
        <span class="dm-card-top">${chip(t)}<span class="od-odds">${s.pulled ? "Pulled" : `1 in ${rest}`}</span></span>
        <span class="dm-img"><img src="${s.image}" alt="" loading="lazy"></span>
        <span class="dm-piece-text">
          <span class="dm-name" title="${esc(s.name)}">${esc(s.name)}</span>
          <b class="dm-money">${money(s.value)}</b>
        </span>
        ${creatorHTML(s)}
        ${s.pulled ? `<span class="od-pulled-by">Pulled by ${s.pulled.by === deps.username() ? "you" : esc(s.pulled.by)}</span>` : ""}
      </li>`;
    })
    .join("");
}

function stripHTML() {
  const items = state.feed.filter((f) => f.price === current).slice(0, 20);
  if (!items.length) return `<li class="od-empty">Nothing pulled yet in this box.</li>`;
  return items
    .map((p) => {
      const t = tierFor(p.value, p.price);
      return `<li class="dm-pull dm-t-${t}">
        <span class="dm-card-top">${chip(t)}<span class="dm-ago">${ago(Date.now() - p.at)}</span></span>
        <span class="dm-img"><img src="${p.image}" alt="" loading="lazy" draggable="false"></span>
        <span class="dm-name" title="${esc(p.name)}">${esc(p.name)}</span>
        <b class="dm-money">${money(p.value)}</b>
      </li>`;
    })
    .join("");
}

// ---- Put an item in --------------------------------------------------------

function statusLine(m) {
  const box = state.boxes[m.price];
  if (m.status === "queued") return `Waiting for the next run of the ${money(m.price)} box (${left(m.price).length} of ${RUN_SIZE} left in this one)`;
  if (m.status === "in-run") return `In run #${m.run} of the ${money(m.price)} box${box.run === m.run ? `, ${left(m.price).length} boxes left` : ""}`;
  if (m.status === "paid") return `Pulled by ${esc(m.by)} &middot; <b>${money(m.paid)}</b> paid to you`;
  return `You pulled it yourself, so it&rsquo;s back in My Items`;
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
            <span class="od-vault-row is-pay"><span>Paid when pulled</span><b>${money(v.value * CREATOR_MULTIPLE)}</b></span>
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
        <p class="dm-sub">Sell a piece from your vault through the boxes. When it&rsquo;s pulled you&rsquo;re paid <b>${Math.round(CREATOR_MULTIPLE * 100)}% of its value</b>, against ${Math.round(CASH_OUT_RATE * 100)}% to cash out. The ${money(current)} box takes pieces worth ${money(lo)} to ${money(hi)}.</p>
      </div>
    </div>
    ${
      mine.length
        ? `<ul class="od-mine">${mine
            .map(
              (m) => `<li class="od-mine-row is-${m.status}">
              <span class="dm-img"><img src="${m.image}" alt=""></span>
              <span class="od-mine-text"><span class="dm-name">${esc(m.name)}</span><span>${statusLine(m)}</span></span>
              <b class="dm-money">${money(m.status === "paid" ? m.paid : m.value * CREATOR_MULTIPLE)}</b>
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
  const taken = deps.takeItem(itemId);
  if (!taken) return;
  const id = uid();
  state.mine.unshift({ id, name: v.name, image: v.image, value: v.value, category: v.category, price: current, status: "queued", at: Date.now() });
  state.boxes[current].queue.push({ id: uid(), mineId: id, name: v.name, image: v.image, value: v.value, category: v.category, creator: deps.username() });
  save();
  deps.showToast(`${v.name} is in the ${money(current)} box's next run. You'll be paid ${money(v.value * CREATOR_MULTIPLE)} when it's pulled`, 3800);
  refresh(current);
}

// ---- Opening ---------------------------------------------------------------

function openBoxes() {
  const n = Math.min(qty, left(current).length);
  if (!n) return;
  const cost = current * n;
  if (!deps.pay(cost)) return deps.showToast(`Not enough credit or balance for ${money(cost)}`, 2400);
  const out = [];
  for (let i = 0; i < n; i++) {
    const { result, event } = pull(current, true);
    // Either way it lands in My Items: your own piece comes back unpaid.
    deps.giveItem({ name: result.name, price: result.value, image: result.image, category: result.category, rarity: SITE_RARITY[tierFor(result.value, current)] });
    out.push(event?.kind === "returned" ? { ...result, returned: true } : result);
  }
  deps.renderWallet();
  qty = 1;
  showReveal(out, cost);
  viewer?.spin?.(900);
  refresh(current);
}

function showReveal(out, cost) {
  const total = out.reduce((s, p) => s + p.value, 0);
  const reveal = root.querySelector("#odReveal");
  reveal.innerHTML = `
    <div class="dm-reveal-card">
      <h3 class="dm-h2">${out.length > 1 ? `${out.length} boxes opened` : "You pulled"}</h3>
      <ul class="dm-reveal-list${out.length === 1 ? " is-one" : ""}">${out
        .map((p, i) => {
          const t = tierFor(p.value, current);
          return `<li class="dm-piece dm-t-${t}" style="--i:${i}">
            <span class="dm-card-top">${chip(t)}</span>
            <span class="dm-img"><img src="${p.image}" alt=""></span>
            <span class="dm-name">${esc(p.name)}</span>
            <b class="dm-money">${money(p.value)}</b>
            ${p.returned ? `<span class="od-pulled-by">Your own piece: back in My Items, unpaid</span>` : `<span class="od-creator">from ${p.mineId ? "you" : esc(p.creator)}</span>`}
          </li>`;
        })
        .join("")}</ul>
      <p class="dm-reveal-total">${out.length > 1 ? `Worth ${money(total)} together, from ${money(cost)} of boxes.` : `${(total / current).toFixed(2)}&times; what the box cost.`}</p>
      <p class="dm-reveal-note">In My Items now: keep it, ship it, list it, cash it out, or put it in a box yourself.</p>
      <div class="dm-reveal-actions">
        ${left(current).length ? `<button class="dm-open" data-od="open">${openLabel()}</button>` : ""}
        <button class="dm-ghost" data-od="reveal-close">Done</button>
      </div>
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
  qty = Math.max(1, Math.min(left(current).length || 1, n));
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
  else if (act === "max") setQty(left(current).length);
  else if (act === "reveal-close") closeReveal();
  else if (act === "open") {
    const shown = !root.querySelector("#odReveal").classList.contains("hidden");
    if (shown) closeReveal();
    setTimeout(openBoxes, shown ? 240 : 0);
  }
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

// The pulls strip: drag it sideways with the mouse (touch scrolls it).
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
