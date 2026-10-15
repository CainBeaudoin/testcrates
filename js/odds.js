// Odds: mystery boxes built from collectors' own vaulted items.
//
// It starts with one box, $300, kept scarce so its runs sell out; more
// prices ($500, $800) can be added to BOX_PRICES as demand shows. Boxes
// sell in runs of ten: a run holds ten items, one for each box. Nothing
// opens one at a time.
// Buyers choose boxes in a run, and when the tenth is chosen the whole run
// opens at once, the ten items dealt out at random. Every box has the same
// shot at every item: no run ever ends with only the leftovers, or with
// the grail saved for last. A chosen box is a place in a run, not a thing
// you hold: it can't be listed or sold on, since what's in it depends on
// the run selling out.
//
// The money (shown to collectors, not to buyers):
//   the items in a run are worth BUYER_RETURN of what its boxes sell for
//     (75%: $2,250 of items in a $3,000 run of $300 boxes);
//   Chosen keeps PLATFORM_CUT of every box (10%);
//   the other 90% goes to the collectors, 90 / 75 = 1.2 times their
//     item's value, paid when the run opens.
// That's more than the 80% instant cash-out, or a marketplace sale after
// fees: a reason to vault an item and put it to work.
//
// A run has a week to fill. One that doesn't closes early: each box chosen
// gets one of the run's most valuable items at or under the box price,
// plus Credits making up exactly what the box cost (a box with no such
// item left gets its whole price back in Credits). Those collectors are
// paid their item's full value. What goes out is exactly what came in, so
// Chosen never loses on an early close (and takes nothing from it). Every
// other item is released back to its collector, to put in again or not.
//
// An item in a box is held by Chosen until it's won or released: it stays
// in its owner's vault, locked, and can't be listed, sold, shipped, sent
// or cashed out meanwhile. Each box takes items worth a quarter of its
// price up to four times it, and every run has at least one item worth
// twice the price or more. A collector whose own item lands in their own
// box just gets it back, unpaid (otherwise buying out a run of your own
// items would pay you for them).
//
// When a run you chose boxes in fills, nothing pops up: you're told it's
// complete, and each of your boxes waits in My Items marked Ready to open,
// to open when you like. That's when its item (and any Credits) are yours.
//
// The other collectors and buyers are simulated, as elsewhere on the site;
// your boxes, items and payouts are real within the demo.

import { createBoxViewer } from "./boxViewer.js";

export const BUYER_RETURN = 0.75;
export const PLATFORM_CUT = 0.1;
export const CREATOR_MULTIPLE = (1 - PLATFORM_CUT) / BUYER_RETURN; // 1.2
export const RUN_SIZE = 10;
export const BOX_PRICES = [300]; // add 500, 800 as demand shows
const RUN_WINDOW_MS = 7 * 24 * 3600 * 1000; // a week to fill
const BAND = [0.25, 4]; // what a box takes, as multiples of its price
const HIT = 2; // every run has an item worth at least this many times the price (an Epic)
const RARES = 2; // and at least this many Rares (worth the price to 1.5 times it)
const CASH_OUT_RATE = 0.8; // the site's instant cash-out, for comparison
const STORAGE_KEY = "gotcha_odds_v3";
const CROWD_EVERY_MS = [5000, 9000];
const CROWD_WEIGHT = { 300: 0.5, 500: 0.32, 800: 0.18 }; // relative, among the boxes on offer

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

// An item's tier in a box: how it compares to what the box cost. Odds
// boxes top out at Epic: a run of ten collectors' items is too small to
// promise a grail in every one.
const ODDS_TIERS = ["epic", "rare", "uncommon", "common"];
const FEATURED_TIERS = 2; // shown up front; the rest behind All tiers
function tierFor(value, price) {
  const x = value / price;
  if (x >= 1.5) return "epic";
  if (x >= 1) return "rare";
  if (x >= 0.5) return "uncommon";
  return "common";
}

const icon = (tier, size = 13) =>
  `<svg viewBox="0 0 256 256" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="${TIER_ICON[tier]}"/></svg>`;
export const chip = (tier) => `<span class="dm-chip dm-t-${tier}">${icon(tier)}${TIER_LABEL[tier]}</span>`;
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
// 6d 23h, 4h 12m, 9:41 as it gets close.
function countdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// ---- State ---------------------------------------------------------------
// boxes[price] = { run, closesAt, items, spots, queue }
//   item:  { id, name, image, value, category, creator, mineId? }
//   spot:  { id, by, mine }
//   queue: your items waiting for that box's next run
// mine:    your items, start to finish: { id, invId, name, image, value,
//          category, price, status: "queued" | "in-run" | "sold" |
//          "released" | "returned", run?, paid?, full?, by?, why?, at }
// results: opened runs, newest first: { id, price, run, early, at,
//          deals: [{ item, to, yours, refund? }] }
// ready:   your boxes from runs that have opened, waiting in My Items:
//          { id, price, run, early, item | null, refund, ownInvId?, at }

let deps = null;
let state = null;
let root = null;
let viewer = null;
let crowdTimer = 0;
let clockTimer = 0;
let current = BOX_PRICES[0];
let qty = 1;
let tiersOpen = false;
let mathOpen = false;

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

// Ten items for a box's next run: yours first (up to four), then
// collectors' items from the catalog, picked so the ten together are
// worth BUYER_RETURN of what the run sells for, with at least one Epic
// worth HIT times the price and RARES Rares, so every run has something
// worth more than the box in it.
function assembleRun(price) {
  const box = state.boxes[price];
  const target = BUYER_RETURN * RUN_SIZE * price;
  const carried = box.queue.splice(0, 4);
  const [lo, hi] = band(price);
  const names = new Set(carried.map((p) => p.name));
  const pool = deps.catalog.filter((p) => p.price >= lo && p.price <= hi && !names.has(p.name));
  const hits = pool.filter((p) => p.price >= price * HIT);
  const needHit = !carried.some((s) => s.value >= price * HIT) && hits.length;
  const isRare = (v) => v >= price && v < price * 1.5;
  const rares = pool.filter((p) => isRare(p.price));
  const needRares = Math.max(0, RARES - carried.filter((s) => isRare(s.value)).length);
  const fixed = carried.reduce((s, x) => s + x.value, 0);
  const open = RUN_SIZE - carried.length;
  let best = null;
  for (let attempt = 0; attempt < 600; attempt++) {
    const picks = [];
    if (needHit) picks.push(hits[Math.floor(Math.random() * hits.length)]);
    for (let r = 0; r < needRares && rares.length > r; r++) {
      let p;
      do p = rares[Math.floor(Math.random() * rares.length)];
      while (picks.includes(p));
      picks.push(p);
    }
    const rest = target - fixed - picks.reduce((s, p) => s + p.price, 0);
    const want = Math.max(lo, rest / Math.max(1, open - picks.length));
    const near = pool.filter((p) => p.price >= want * 0.35 && p.price <= want * 1.9 && !picks.includes(p));
    const from = near.length >= open ? near : pool;
    while (picks.length < open) {
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
  box.items = [...carried, ...others].sort((a, b) => b.value - a.value);
  box.spots = [];
  box.closesAt = Date.now() + RUN_WINDOW_MS;
  carried.forEach((s) => {
    const m = s.mineId && state.mine.find((x) => x.id === s.mineId);
    if (m) Object.assign(m, { status: "in-run", run: box.run });
  });
}

const chosen = (price) => state.boxes[price].spots.length;
const left = (price) => RUN_SIZE - chosen(price);
const yoursIn = (price) => state.boxes[price].spots.filter((s) => s.mine).length;
const mineFor = (item) => item.mineId && state.mine.find((x) => x.id === item.mineId);

// Choose boxes in a run. The one that fills it opens the run.
function choose(price, n, byYou) {
  const box = state.boxes[price];
  const by = byYou ? deps.username() : deps.randomUsername();
  for (let i = 0; i < n && box.spots.length < RUN_SIZE; i++) box.spots.push({ id: uid(), by, mine: byYou });
  if (box.spots.length >= RUN_SIZE) return settle(price, false);
  save();
  return null;
}

// Release one of your items from a box: back to an ordinary vault item.
function release(m, why) {
  Object.assign(m, { status: "released", why, at: Date.now() });
  deps.unlockItem(m.invId);
}

// Open a run. Full: every item dealt to a box at random. Early: only the
// run's most valuable items at or under the box price, one per box chosen
// while they last, each box topped up in Credits to exactly what it cost
// (a box with none left gets its whole price back); the rest released.
function settle(price, early) {
  const box = state.boxes[price];
  const spots = shuffle(box.spots);
  if (early && !spots.length) {
    box.closesAt = Date.now() + RUN_WINDOW_MS; // nobody's in yet: give it another week
    save();
    return null;
  }
  const used = early
    ? box.items.filter((p) => p.value <= price).sort((a, b) => b.value - a.value).slice(0, spots.length)
    : box.items;
  const dealt = shuffle(used);
  const deals = spots.map((spot, i) => {
    const item = dealt[i] ?? null;
    const deal = { item: item && { ...item }, to: spot.by, yours: spot.mine };
    const m = item && mineFor(item);
    if (m && spot.mine) {
      // Your own item, in your own box: back to you, unpaid (when you open it).
      Object.assign(m, { status: "returned", at: Date.now() });
    } else if (m) {
      const paid = Math.round(item.value * (early ? 1 : CREATOR_MULTIPLE));
      Object.assign(m, { status: "sold", paid, full: !early, by: spot.by, at: Date.now() });
      deps.removeItem(m.invId);
      deps.addCash(paid);
      deps.showToast(`${spot.by} won your ${item.name}: +${money(paid)} paid to you`, 4200);
    }
    if (spot.mine) {
      // Closed early, the box is made up to exactly what it cost.
      const refund = early ? Math.max(0, Math.round(price - (item?.value ?? 0))) : 0;
      if (refund) deal.refund = refund;
      state.ready.push({ id: uid(), price, run: box.run, early, item: item && { ...item }, refund, ownInvId: m && spot.mine ? m.invId : null, at: Date.now() });
    }
    return deal;
  });
  if (early) {
    const usedIds = new Set(used.map((p) => p.id));
    box.items.filter((p) => !usedIds.has(p.id)).forEach((p) => {
      const m = mineFor(p);
      if (m) release(m, "early");
    });
  }
  const result = { id: uid(), price, run: box.run, early, at: Date.now(), deals };
  state.results.unshift(result);
  state.results = state.results.slice(0, 40);
  assembleRun(price);
  save();
  const yours = deals.filter((d) => d.yours).length;
  if (yours) {
    deps.showToast(
      `Odds complete: run #${result.run} of the ${money(price)} box ${early ? "closed early" : "is full"}. ${plural(yours, "box", "boxes")} ready to open in My Items`,
      4600
    );
  }
  deps.itemsChanged();
  return result;
}

// Runs past their deadline close early.
function closeDue() {
  const due = BOX_PRICES.filter((p) => Date.now() >= state.boxes[p].closesAt);
  return due.map((p) => settle(p, true)).filter(Boolean);
}

// ---- Setup -----------------------------------------------------------------

// Boxes no longer on offer (BOX_PRICES shrank): your items in them are
// released, your chosen boxes refunded in Credits, and the box goes.
// Boxes already ready to open stay in My Items.
function retireBoxes() {
  Object.keys(state.boxes)
    .map(Number)
    .filter((p) => !BOX_PRICES.includes(p))
    .forEach((p) => {
      const box = state.boxes[p];
      state.mine.filter((m) => m.price === p && (m.status === "queued" || m.status === "in-run")).forEach((m) => release(m, "retired"));
      const refund = box.spots.filter((s) => s.mine).length * p;
      if (refund) {
        deps.addCredits(refund);
        deps.showToast(`The ${money(p)} box is closed for now: ${money(refund)} back in Credits for your boxes`, 4200);
      }
      delete state.boxes[p];
    });
}

export function initOdds(el, appDeps) {
  root = el;
  deps = appDeps;
  state = load();
  if (!state || !state.boxes || !BOX_PRICES.every((p) => state.boxes[p])) {
    state = { boxes: {}, mine: [], results: [], ready: [], lastTick: Date.now() };
    BOX_PRICES.forEach((p, i) => {
      state.boxes[p] = { run: 11 + i * 3, items: [], spots: [], queue: [], closesAt: 0 };
      assembleRun(p);
      // A couple of opened runs behind it, and the current one part-way.
      for (let r = 0; r < 2; r++) choose(p, RUN_SIZE, false);
      choose(p, 2 + Math.floor(Math.random() * 5), false);
      state.boxes[p].closesAt = Date.now() + RUN_WINDOW_MS * (0.4 + Math.random() * 0.5);
    });
    state.results.forEach((r) => (r.at -= Math.floor(Math.random() * 40 * 60 * 1000)));
  }
  state.ready ??= [];
  retireBoxes();
  // Anything locked in a box that this state no longer knows about (an
  // older build's) is released, so nothing stays locked for good.
  const known = new Set([
    ...state.mine.filter((m) => m.status === "queued" || m.status === "in-run").map((m) => m.invId),
    ...state.ready.map((r) => r.ownInvId).filter(Boolean),
  ]);
  deps.lockedIds().filter((id) => !known.has(id)).forEach((id) => deps.unlockItem(id));
  // Time away: the crowd kept choosing boxes, and runs past their deadline
  // closed (capped, so a long absence doesn't churn through everything).
  const steps = Math.min(30, Math.floor((Date.now() - (state.lastTick ?? Date.now())) / 7000));
  for (let i = 0; i < steps; i++) crowdChoose();
  closeDue();
  state.lastTick = Date.now();
  save();
  root.addEventListener("click", onClick);
  scheduleCrowd();
}

// The simulated crowd: someone chooses a box every few seconds, the
// cheaper box more often. Runs everywhere, so your runs fill (and your
// items sell) wherever you are on the site.
function scheduleCrowd() {
  clearTimeout(crowdTimer);
  const [a, b] = CROWD_EVERY_MS;
  crowdTimer = setTimeout(() => {
    if (!document.hidden) tick();
    scheduleCrowd();
  }, a + Math.random() * (b - a));
}

function crowdChoose() {
  const total = BOX_PRICES.reduce((s, p) => s + (CROWD_WEIGHT[p] ?? 0.2), 0);
  let r = Math.random() * total;
  const price = BOX_PRICES.find((p) => (r -= CROWD_WEIGHT[p] ?? 0.2) < 0) ?? BOX_PRICES[0];
  return choose(price, Math.random() < 0.2 ? 2 : 1, false);
}

function tick() {
  const opened = [crowdChoose(), ...closeDue()].filter(Boolean);
  state.lastTick = Date.now();
  save();
  if (opened.length) deps.renderWallet();
  if (isOpen()) refresh();
}

const isOpen = () => !!root?.isConnected && root.closest(".screen")?.classList.contains("active");

// ---- Your items in boxes (also for My Items) -------------------------------

// Where one of your vault items stands, for its card in My Items.
export function boxStatus(invId) {
  const m = state?.mine.find((x) => x.invId === invId && (x.status === "queued" || x.status === "in-run"));
  if (!m) return null;
  if (m.status === "queued") return { text: `Waiting for the next run of the ${money(m.price)} box`, canTakeBack: true };
  return { text: `In run #${m.run}: ${chosen(m.price)} of ${RUN_SIZE} chosen`, canTakeBack: false };
}

// Put a vault item in a box: it joins the box's next run, locked.
function putIn(itemId, price) {
  const v = deps.vault().find((x) => x.id === itemId);
  if (!v || !fits(v.value, price)) return false;
  if (!deps.lockItem(itemId, { price })) return false;
  const id = uid();
  state.mine.unshift({ id, invId: itemId, name: v.name, image: v.image, value: v.value, category: v.category, price, status: "queued", at: Date.now() });
  state.boxes[price].queue.push({ id: uid(), mineId: id, name: v.name, image: v.image, value: v.value, category: v.category, creator: deps.username() });
  save();
  deps.showToast(`${v.name} is in the ${money(price)} box's next run, locked until it's won or released. You'll be paid ${money(v.value * CREATOR_MULTIPLE)} if it's won`, 4200);
  deps.itemsChanged();
  refresh();
  return true;
}

// Take an item back while it's still waiting for a run.
export function takeBack(invId) {
  const m = state.mine.find((x) => x.invId === invId && x.status === "queued");
  if (!m) return;
  const box = state.boxes[m.price];
  box.queue = box.queue.filter((q) => q.mineId !== m.id);
  release(m, "taken back");
  save();
  deps.showToast(`${m.name} is back in your vault, unlocked`, 2800);
  deps.itemsChanged();
  refresh();
}

// Putting an item in from My Items: which box, and what it'd pay.
export function openPutIn(itemId) {
  const v = deps.vault().find((x) => x.id === itemId);
  if (!v) return;
  const fitting = BOX_PRICES.filter((p) => fits(v.value, p));
  if (fitting.length === 1) return openWaitlist(itemId, fitting[0]);
  let wrap = document.getElementById("odChooser");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "odChooser";
    wrap.className = "dm od";
    document.body.appendChild(wrap);
    wrap.addEventListener("click", (e) => {
      const opt = e.target.closest("[data-od-choose]");
      if (opt && !opt.disabled) {
        closeChooser();
        return setTimeout(() => openWaitlist(wrap.dataset.item, Number(opt.dataset.odChoose)), 230);
      }
      if (e.target.closest("[data-od-cancel]") || e.target.classList.contains("dm-reveal")) closeChooser();
    });
  }
  wrap.dataset.item = itemId;
  wrap.innerHTML = `
    <div class="dm-reveal">
      <div class="dm-reveal-card od-chooser" role="dialog" aria-modal="true" aria-label="Put it in a box">
        <h3 class="dm-h2">Put it in a box</h3>
        <div class="od-chooser-item">
          <span class="dm-img"><img src="${v.image}" alt=""></span>
          <span><span class="dm-name">${esc(v.name)}</span><span class="od-chooser-worth">Worth ${money(v.value)} &middot; ${money(v.value * CASH_OUT_RATE)} to cash out</span></span>
        </div>
        <div class="od-chooser-opts">${BOX_PRICES.map((p) => {
          const ok = fits(v.value, p);
          const [lo, hi] = band(p);
          return `<button class="od-chooser-opt" data-od-choose="${p}"${ok ? "" : " disabled"}>
              <b>${money(p)} box</b>
              <span>${ok ? `Paid <strong>${money(v.value * CREATOR_MULTIPLE)}</strong> if it&rsquo;s won` : `Takes items worth ${money(lo)} to ${money(hi)}`}</span>
            </button>`;
        }).join("")}</div>
        <p class="dm-reveal-note">It joins the box&rsquo;s next run. Until it&rsquo;s won or released, Chosen holds it: it stays in your vault, locked, and can&rsquo;t be listed, sold, shipped, sent or cashed out. You can take it back until its run starts.</p>
        <div class="dm-reveal-actions"><button class="dm-ghost" data-od-cancel>Cancel</button></div>
      </div>
    </div>`;
  const reveal = wrap.querySelector(".dm-reveal");
  requestAnimationFrame(() => reveal.classList.add("visible"));
}

// ---- Waitlist --------------------------------------------------------------
// Putting an item in is gated while Odds is new: a run only has ten spots,
// and letting every vault in at once would mean more boxes than buyers. So a
// "Put in" asks to join the waitlist instead; spots open a few at a time.

function waitlisted(itemId) {
  return !!state.waitlist?.[itemId];
}

function openWaitlist(itemId, price) {
  const v = deps.vault().find((x) => x.id === itemId);
  if (!v) return;
  const on = waitlisted(itemId);
  let wrap = document.getElementById("odWait");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "odWait";
    wrap.className = "dm od";
    document.body.appendChild(wrap);
    wrap.addEventListener("click", (e) => {
      const act = e.target.closest("[data-od-wait]")?.dataset.odWait;
      const { item, price: p } = wrap.dataset;
      const name = deps.vault().find((x) => x.id === item)?.name ?? "item";
      if (act === "join") {
        state.waitlist = { ...(state.waitlist ?? {}), [item]: { price: Number(p), at: Date.now() } };
        save();
        deps.showToast(`You're on the waitlist for the ${money(Number(p))} box with your ${name}. We'll let you know when a spot opens`, 4200);
      } else if (act === "leave") {
        delete state.waitlist[item];
        save();
        deps.showToast(`Your ${name} is off the waitlist`, 2400, { log: false });
      }
      if (act || e.target.classList.contains("dm-reveal")) {
        closeWaitlist();
        refresh();
      }
    });
  }
  Object.assign(wrap.dataset, { item: itemId, price });
  wrap.innerHTML = `
    <div class="dm-reveal">
      <div class="dm-reveal-card od-chooser od-wait" role="dialog" aria-modal="true" aria-label="Join the waitlist">
        <span class="od-wait-live"><i></i>Live now</span>
        <h3 class="dm-h2">The ${money(price)} box is full of collectors</h3>
        <p class="od-wait-lead">${
          on
            ? `You&rsquo;re on the list. When a spot opens we&rsquo;ll let you know, and your item can go into the next run.`
            : `Every run holds just ten items, so spots to put one in are limited and open a few at a time. Join the waitlist and we&rsquo;ll let you know when it&rsquo;s your turn.`
        }</p>
        <div class="od-chooser-item">
          <span class="dm-img"><img src="${v.image}" alt=""></span>
          <span><span class="dm-name">${esc(v.name)}</span><span class="od-chooser-worth">Worth ${money(v.value)} &middot; paid <b>${money(v.value * CREATOR_MULTIPLE)}</b> if it&rsquo;s won</span></span>
        </div>
        <p class="dm-reveal-note">Joining doesn&rsquo;t lock anything: your item stays free to list, sell or ship until it actually goes into a box.</p>
        <div class="dm-reveal-actions">${
          on
            ? `<button class="dm-ghost" data-od-wait="leave">Leave the waitlist</button><button class="dm-open" data-od-wait="close">Done</button>`
            : `<button class="dm-ghost" data-od-wait="close">Not now</button><button class="dm-open" data-od-wait="join">Join the waitlist</button>`
        }</div>
      </div>
    </div>`;
  const reveal = wrap.querySelector(".dm-reveal");
  requestAnimationFrame(() => reveal.classList.add("visible"));
}

function closeWaitlist() {
  const reveal = document.querySelector("#odWait .dm-reveal");
  if (!reveal) return;
  reveal.classList.remove("visible");
  setTimeout(() => (document.getElementById("odWait").innerHTML = ""), 220);
}

function closeChooser() {
  const reveal = document.querySelector("#odChooser .dm-reveal");
  if (!reveal) return;
  reveal.classList.remove("visible");
  setTimeout(() => (document.getElementById("odChooser").innerHTML = ""), 220);
}

// ---- Page ----------------------------------------------------------------

export function renderOdds() {
  if (!root) return;
  qty = Math.max(1, Math.min(qty, left(current)));
  root.innerHTML = `
    <div class="dm-layout od-layout">
      <div class="dm-main">
        ${BOX_PRICES.length > 1 ? `<div class="od-boxes" role="tablist" aria-label="Box">${tabsHTML()}</div>` : ""}
        <div id="odHero">${heroHTML()}</div>
        <section class="dm-sec">
          <div class="dm-sec-head">
            <div>
              <h2 class="dm-h2">In this run</h2>
              <p class="dm-sub">Ten items, one for every box, each put in by a collector. They&rsquo;re dealt out when the run opens.</p>
            </div>
          </div>
          <ul class="dm-grid od-grid" id="odGrid">${gridHTML()}</ul>
        </section>
        <section class="dm-sec">
          <h2 class="dm-h2">Opened runs</h2>
          <p class="dm-sub">What came out of the ${money(current)} box&rsquo;s last runs, and who won it. Drag to see more.</p>
          <ul class="dm-strip" id="odStrip">${stripHTML()}</ul>
        </section>
        <section class="dm-sec" id="odYours">${yoursHTML()}</section>
        <section class="dm-sec od-sell" id="odSell">${sellHTML()}</section>
      </div>
    </div>
`;
  mountBox();
  initStripDrag();
  startClock();
}

export function leaveOdds() {
  viewer?.dispose();
  viewer = null;
  clearInterval(clockTimer);
}

function tabsHTML() {
  return BOX_PRICES.map(
    (p) =>
      `<button class="od-box-tab${p === current ? " active" : ""}" data-od-box="${p}" role="tab" aria-selected="${p === current}"><b>${money(p)}</b> box<span>${chosen(p)} of ${RUN_SIZE} chosen${yoursIn(p) ? ` &middot; ${yoursIn(p)} yours` : ""}</span></button>`
  ).join("");
}

// Redraw what a box chosen or a run opened changes, keeping the rest (and
// the turning box).
function refresh() {
  if (!isOpen()) return;
  const tabs = root.querySelector(".od-boxes");
  if (tabs) tabs.innerHTML = tabsHTML();
  qty = Math.max(1, Math.min(qty, left(current)));
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

// The countdowns tick while the page is up.
function startClock() {
  clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    if (!isOpen()) return;
    root.querySelectorAll("[data-closes]").forEach((el) => {
      el.textContent = countdown(Number(el.dataset.closes) - Date.now());
    });
    if (BOX_PRICES.some((p) => Date.now() >= state.boxes[p].closesAt)) {
      if (closeDue().length) deps.renderWallet();
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
  const n = chosen(current);
  const cells = Array.from({ length: RUN_SIZE }, (_, i) => {
    const s = box.spots[i];
    return `<i class="${s ? "is-taken" : ""}${s?.mine ? " is-mine" : ""}"></i>`;
  }).join("");
  const mine = yoursIn(current);
  return `
    <div class="od-hero-tags"><span class="dm-pill">Run #${box.run}</span>${mathHTML()}</div>
    <h1 class="dm-title">The ${money(current)} box</h1>
    <p class="dm-blurb">Ten boxes, ten real items from collectors&rsquo; vaults. Nothing opens until all ten are chosen. Then they open together, so every box has the same shot at every item.</p>
    <div class="dm-buyline">
      <div class="dm-price"><b>${money(current)}</b><span>per box</span></div>
    </div>
    <div class="dm-open-row">
      <div class="dm-qty">
        <button data-od="minus" aria-label="One fewer">&minus;</button>
        <b id="odQty">${qty}</b>
        <button data-od="plus" aria-label="One more">+</button>
        <button class="dm-max${qty === left(current) ? " active" : ""}" data-od="max">Max</button>
      </div>
      <button class="dm-open" data-od="choose">${chooseLabel()}</button>
    </div>
    <p class="dm-paid">Paid in credit or balance. Your box opens with the rest of the run, and can&rsquo;t be resold before it does.</p>
    <div class="od-meter" aria-label="${n} of ${RUN_SIZE} boxes chosen">${cells}</div>
    <p class="od-run-line"><b>${n} of ${RUN_SIZE} chosen</b>${mine ? ` &middot; ${plural(mine, "is", "are")} yours` : ""} &middot; opens when it&rsquo;s full &middot; closes in <span class="od-clock" data-closes="${box.closesAt}">${countdown(box.closesAt - Date.now())}</span></p>
    ${pullTiersHTML()}
    <p class="od-fallback">Not full in time? It closes early: each box chosen gets an item, plus Credits to make up what it cost.</p>`;
}

// Dev mode: the run's economics with this run's real numbers, behind an
// info button. Buyers' price funds the collectors' payout; what's left is
// Chosen's. Not for buyers: it's how we check the math holds.
function mathHTML() {
  const box = state.boxes[current];
  const vals = box.items.map((i) => i.value);
  const pot = vals.reduce((a, b) => a + b, 0);
  const take = RUN_SIZE * current;
  const paid = pot * CREATOR_MULTIPLE;
  const keep = take - paid;
  const ev = pot / RUN_SIZE;
  const up = vals.filter((v) => v >= current).length;
  const pct = (x) => `${Math.round((x / take) * 1000) / 10}%`;
  const row = (k, v, note = "") => `<span class="od-math-row"><span>${k}${note ? ` <i>${note}</i>` : ""}</span><b>${v}</b></span>`;
  return `
    <span class="od-math${mathOpen ? " open" : ""}">
      <button class="od-math-btn" data-od="math" aria-expanded="${mathOpen}" aria-label="How the odds work (dev mode)">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><line x1="12" y1="11" x2="12" y2="16.5"/><circle cx="12" cy="7.6" r="0.6" fill="currentColor"/></svg>
        <span>Dev mode</span>
      </button>
      <span class="od-math-pop" role="tooltip">
        <span class="od-math-title">How the odds work <em>Run #${box.run}, live numbers</em></span>
        <span class="od-math-sec">The run: ${RUN_SIZE} boxes</span>
        ${row("Buyers pay", money(take), `${RUN_SIZE} &times; ${money(current)}`)}
        ${row("Items inside, at market", money(pot), pct(pot))}
        ${row(`Collectors paid (${CREATOR_MULTIPLE.toFixed(1)}&times;)`, money(paid), pct(paid))}
        ${row("Chosen keeps", money(keep), pct(keep))}
        <span class="od-math-sec">Buyer, per box</span>
        ${row("Expected value", money(ev), `${Math.round((ev / current) * 100)}% of ${money(current)}`)}
        ${row(`If they cash it out (${Math.round(CASH_OUT_RATE * 100)}%)`, money(ev * CASH_OUT_RATE), `${Math.round(((ev * CASH_OUT_RATE) / current) * 100)}%`)}
        ${row(`Pulls worth ${money(current)}+`, `${up} of ${RUN_SIZE}`, `${Math.round((up / RUN_SIZE) * 100)}% chance`)}
        ${row("Best / worst pull", `${money(Math.max(...vals))} / ${money(Math.min(...vals))}`)}
        <span class="od-math-sec">Collector, per item</span>
        ${row("Paid when it&rsquo;s won", `${CREATOR_MULTIPLE.toFixed(1)}&times; value`, `vs ${CASH_OUT_RATE.toFixed(1)}&times; to cash out`)}
        ${row("Average item here", money(ev), `paid ${money(ev * CREATOR_MULTIPLE)} vs ${money(ev * CASH_OUT_RATE)}`)}
        <span class="od-math-sec">Not full in a week</span>
        <span class="od-math-note">Closes early. Each chosen box gets an item worth up to ${money(current)}, plus Credits making up the rest of ${money(current)}. Collectors of the items used are paid 1&times; value; the rest are released. Chosen pays out exactly what came in, and the top-up is Credits, so it can&rsquo;t lose.</span>
        <span class="od-math-formula">Margin = 1 &minus; ${BUYER_RETURN} buyer return &times; ${CREATOR_MULTIPLE.toFixed(1)} collector multiple = ${Math.round(PLATFORM_CUT * 100)}%</span>
      </span>
    </span>`;
}

// What you could pull, by tier: each tier's value range in this run, and
// its share of the ten boxes (every box has the same shot at every item,
// so that share is the chance). Epic and Rare up front; the rest behind
// All tiers.
function pullTiersHTML() {
  const items = state.boxes[current].items;
  const rows = ODDS_TIERS.map((t) => {
    const vals = items.filter((i) => tierFor(i.value, current) === t).map((i) => i.value);
    return vals.length ? { t, n: vals.length, lo: Math.min(...vals), hi: Math.max(...vals) } : null;
  }).filter(Boolean);
  const more = rows.length > FEATURED_TIERS;
  const shown = tiersOpen || !more ? rows : rows.slice(0, FEATURED_TIERS);
  return `
    <div class="od-tiers">
      <div class="od-tiers-head">
        <span>What you could pull</span>
        ${
          more
            ? `<button class="od-tiers-toggle" data-od="tiers" aria-expanded="${tiersOpen}">All tiers <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="${tiersOpen ? "6 15 12 9 18 15" : "6 9 12 15 18 9"}"/></svg></button>`
            : ""
        }
      </div>
      <div class="od-tier-grid">${shown
        .map(
          (r) => `<div class="od-tier dm-t-${r.t}">
          <span class="od-tier-top"><span class="od-tier-name">${icon(r.t, 16)}${TIER_LABEL[r.t]}</span><span class="od-tier-pct">${Math.round((r.n / RUN_SIZE) * 100)}%</span></span>
          <span class="od-tier-range">${r.lo === r.hi ? `<b>${money(r.lo)}</b>` : `<b>${money(r.lo)}</b> <i>to</i> <b>${money(r.hi)}</b>`}</span>
        </div>`
        )
        .join("")}</div>
    </div>`;
}

function chooseLabel() {
  return `<span>Choose ${qty} box${qty > 1 ? "es" : ""}</span><span class="dm-open-price">${money(current * qty)}<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></span>`;
}

function creatorHTML(p) {
  return `<span class="od-creator">${p.mineId ? `<span class="od-you">You</span>` : `${deps.avatarHTML(p.creator, "od-avatar")}${esc(p.creator)}`}</span>`;
}

function gridHTML() {
  return state.boxes[current].items
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
    .flatMap((r) => r.deals.filter((d) => d.item).map((d) => ({ ...d, run: r.run, at: r.at, early: r.early })))
    .slice(0, 24);
  if (!deals.length) return `<li class="od-empty">No runs of this box have opened yet.</li>`;
  return deals
    .map((d) => {
      const t = tierFor(d.item.value, current);
      return `<li class="dm-pull dm-t-${t}${d.yours ? " is-yours" : ""}">
        <span class="dm-card-top">${chip(t)}<span class="dm-ago">${ago(Date.now() - d.at)}</span></span>
        <span class="dm-img"><img src="${d.item.image}" alt="" loading="lazy" draggable="false"></span>
        <span class="dm-name" title="${esc(d.item.name)}">${esc(d.item.name)}</span>
        <b class="dm-money">${money(d.item.value)}</b>
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
        <span class="od-mine-text"><span class="dm-name">${money(p)} box, run #${box.run}</span><span>${chosen(p)} of ${RUN_SIZE} chosen &middot; closes in <span data-closes="${box.closesAt}">${countdown(box.closesAt - Date.now())}</span></span></span>
        <b class="dm-money">${money(p * yoursIn(p))}</b>
      </li>`;
  });
  const got = (state.opened ?? []).slice(0, 8).map((r) =>
    r.item
      ? `<li class="od-mine-row${r.item.value >= r.price ? " is-up" : ""}">
        <span class="dm-img"><img src="${r.item.image}" alt=""></span>
        <span class="od-mine-text"><span class="dm-name">${esc(r.item.name)}</span><span>${money(r.price)} box, run #${r.run}${r.early ? " &middot; closed early" : ""}${r.refund ? ` &middot; ${money(r.refund)} back in Credits` : ""} &middot; opened ${ago(Date.now() - r.at)}</span></span>
        <b class="dm-money">${money(r.item.value)}</b>
      </li>`
      : `<li class="od-mine-row">
        <span class="od-mine-badge">$</span>
        <span class="od-mine-text"><span class="dm-name">${money(r.refund)} back in Credits</span><span>${money(r.price)} box, run #${r.run} &middot; closed early &middot; opened ${ago(Date.now() - r.at)}</span></span>
        <b class="dm-money">${money(r.refund)}</b>
      </li>`
  );
  const ready = state.ready.map(
    (r) => `<li class="od-mine-row is-ready">
        <span class="od-mine-badge">${ICON_BOX}</span>
        <span class="od-mine-text"><span class="dm-name">${money(r.price)} box, run #${r.run}</span><span><b class="od-ready">Ready to open</b>${r.early ? " &middot; closed early" : ""} &middot; in My Items</span></span>
        <button class="dm-open od-go-open" data-od-go-items>Open in My Items</button>
      </li>`
  );
  if (!open.length && !ready.length && !got.length) return "";
  return `
    <h2 class="dm-h2">Your boxes</h2>
    <p class="dm-sub">Boxes you&rsquo;re waiting on, boxes ready to open, and what came out of the ones you&rsquo;ve opened.</p>
    <ul class="od-mine">${ready.join("")}${open.join("")}${got.join("")}</ul>`;
}

// ---- Put an item in --------------------------------------------------------

function statusLine(m) {
  const box = state.boxes[m.price] ?? { run: null };
  if (m.status === "queued") return `Locked &middot; waiting for the next run of the ${money(m.price)} box`;
  if (m.status === "in-run") return `Locked &middot; in run #${m.run} of the ${money(m.price)} box${box.run === m.run ? `, ${chosen(m.price)} of ${RUN_SIZE} chosen` : ""}`;
  if (m.status === "sold") return `${esc(m.by)} won it &middot; <b>${money(m.paid)}</b> paid to you${m.full ? "" : " (run closed early: full value)"}`;
  if (m.status === "released") {
    if (m.why === "early") return "Released back to you, unlocked: its run closed early without it";
    if (m.why === "retired") return `Released back to you, unlocked: the ${money(m.price)} box is closed for now`;
    return "Taken back, unlocked";
  }
  return `It came out in your own box, so it&rsquo;s back with you, unlocked`;
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
            <span class="od-vault-row is-pay"><span>Paid if it&rsquo;s won</span><b>${money(v.value * CREATOR_MULTIPLE)}</b></span>
            ${
              ok
                ? waitlisted(v.id)
                  ? `<button class="od-put is-waiting" data-od-put="${v.id}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>On the waitlist</button>`
                  : `<button class="od-put" data-od-put="${v.id}">Put in the ${money(current)} box</button>`
                : `<span class="od-off">${elsewhere ? `Fits the <button class="od-link" data-od-box="${elsewhere}">${money(elsewhere)} box</button>` : BOX_PRICES.length > 1 ? "Outside every box&rsquo;s range" : `Outside the box&rsquo;s range`}</span>`
            }
          </li>`;
        })
        .join("")
    : `<li class="od-empty">Nothing free in your vault. Keep a pull, and it can go in a box.</li>`;
  return `
    <div class="dm-sec-head">
      <div>
        <h2 class="dm-h2">Put an item in</h2>
        <p class="dm-sub">Sell an item from your vault through the boxes. When the run it&rsquo;s in opens you&rsquo;re paid <b>${Math.round(CREATOR_MULTIPLE * 100)}% of its value</b>, against ${Math.round(CASH_OUT_RATE * 100)}% to cash out. If the run closes early and your item is used, you&rsquo;re paid its full value; if not, it&rsquo;s released back to you. While it&rsquo;s in a box it&rsquo;s locked: no listing, selling, shipping or cashing out until it&rsquo;s won or released. The ${money(current)} box takes items worth ${money(lo)} to ${money(hi)}. Spots are limited while Odds is new, so you join a waitlist first.</p>
      </div>
    </div>
    ${
      mine.length
        ? `<ul class="od-mine">${mine
            .map(
              (m) => `<li class="od-mine-row is-${m.status}">
              <span class="dm-img"><img src="${m.image}" alt=""></span>
              <span class="od-mine-text"><span class="dm-name">${esc(m.name)}</span><span>${statusLine(m)}</span></span>
              ${m.status === "queued" ? `<button class="dm-ghost od-takeback" data-od-takeback="${m.invId}">Take it back</button>` : ""}
              <b class="dm-money">${money(m.status === "sold" ? m.paid : m.value * CREATOR_MULTIPLE)}</b>
            </li>`
            )
            .join("")}</ul>`
        : ""
    }
    <ul class="od-vaults">${cards}</ul>`;
}

// ---- Choosing boxes --------------------------------------------------------

function chooseBoxes() {
  const n = Math.min(qty, left(current));
  if (!n) return;
  const cost = current * n;
  if (!deps.pay(cost)) return deps.showToast(`Not enough credit or balance for ${money(cost)}`, 2400, { log: false });
  const run = state.boxes[current].run;
  const result = choose(current, n, true);
  deps.renderWallet();
  qty = 1;
  viewer?.spin?.(900);
  if (!result) deps.showToast(`${plural(n, "box", "boxes")} chosen in run #${run}. ${left(current)} to go before it's complete`, 3000);
  refresh();
}

// ---- Ready to open (My Items) ---------------------------------------------

const ICON_BOX = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="M3.5 7 12 11.5 20.5 7"/><line x1="12" y1="11.5" x2="12" y2="21.5"/></svg>`;

/** Your boxes from completed runs, as cards for the top of My Items. */
export function readyBoxesHTML() {
  return (state?.ready ?? [])
    .map(
      (r) => `
    <div class="market-item odds-ready" data-odds-ready="${r.id}">
      <div class="market-item-media">
        <img class="odds-ready-box" alt="">
        <span class="item-ready-flag">Ready to open</span>
      </div>
      <div class="market-item-body">
        <span class="market-item-name">${money(r.price)} Odds box</span>
        <span class="item-cashout-today">Run #${r.run} ${r.early ? "closed early" : "is complete"}</span>
        <div class="market-item-divider"></div>
        <div class="item-actions"><button class="item-action-btn odds-open-btn" data-odds-open="${r.id}">Open</button></div>
      </div>
    </div>`
    )
    .join("");
}

export const readyCount = () => state?.ready?.length ?? 0;

/** Open one of your ready boxes: its item (and any Credits) become yours. */
export function openReady(id) {
  const r = state.ready.find((x) => x.id === id);
  if (!r) return;
  state.ready = state.ready.filter((x) => x.id !== id);
  if (r.item) {
    if (r.ownInvId) deps.unlockItem(r.ownInvId);
    else deps.giveItem({ name: r.item.name, price: r.item.value, image: r.item.image, category: r.item.category, rarity: SITE_RARITY[tierFor(r.item.value, r.price)] });
  }
  if (r.refund) deps.addCredits(r.refund);
  state.opened = [{ ...r, at: Date.now() }, ...(state.opened ?? [])].slice(0, 30);
  save();
  deps.renderWallet();
  deps.itemsChanged();
  showOpened(r);
  refresh();
}

function showOpened(r) {
  let wrap = document.getElementById("odOpen");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "odOpen";
    wrap.className = "dm od";
    document.body.appendChild(wrap);
    wrap.addEventListener("click", (e) => {
      if (e.target.closest("[data-od-close]") || e.target.classList.contains("dm-reveal")) closeOpened();
    });
  }
  const t = r.item && tierFor(r.item.value, r.price);
  wrap.innerHTML = `
    <div class="dm-reveal">
      <div class="dm-reveal-card" role="dialog" aria-modal="true" aria-label="What came out">
        <h3 class="dm-h2">${money(r.price)} box, run #${r.run}</h3>
        <p class="od-reveal-sub">${r.early ? `The run closed early, so your box got ${r.item ? "an item and Credits that come" : "Credits for the whole"} to its ${money(r.price)}.` : "The run was full, and the ten items were dealt out together."}</p>
        ${
          r.item
            ? `<ul class="dm-reveal-list is-one"><li class="dm-piece dm-t-${t}" style="--i:0">
            <span class="dm-card-top">${chip(t)}</span>
            <span class="dm-img"><img src="${r.item.image}" alt=""></span>
            <span class="dm-name">${esc(r.item.name)}</span>
            <b class="dm-money">${money(r.item.value)}</b>
            <span class="od-creator">${r.ownInvId ? "Your own item: back to you, unpaid" : `from ${esc(r.item.creator)}`}</span>
          </li></ul>
          <p class="dm-reveal-total">${(r.item.value / r.price).toFixed(2)}&times; what the box cost.${r.refund ? ` Plus ${money(r.refund)} in Credits.` : ""}</p>`
            : `<p class="dm-reveal-total">${money(r.refund)} back in Credits.</p>`
        }
        <p class="dm-reveal-note">${r.item ? "In My Items now: keep it, ship it, list it, cash it out, or put it in a box yourself." : "Your Credits are in your balance."}</p>
        <div class="dm-reveal-actions"><button class="dm-ghost" data-od-close>Done</button></div>
      </div>
    </div>`;
  const reveal = wrap.querySelector(".dm-reveal");
  requestAnimationFrame(() => reveal.classList.add("visible"));
}

function closeOpened() {
  const reveal = document.querySelector("#odOpen .dm-reveal");
  if (!reveal) return;
  reveal.classList.remove("visible");
  setTimeout(() => (document.getElementById("odOpen").innerHTML = ""), 220);
}

// ---- Controls --------------------------------------------------------------

function setQty(n) {
  qty = Math.max(1, Math.min(left(current), n));
  const copy = root.querySelector(".od-hero-copy");
  if (copy) copy.innerHTML = heroCopyHTML();
}

function onClick(e) {
  if (mathOpen && !e.target.closest(".od-math")) {
    mathOpen = false;
    root.querySelector(".od-math")?.classList.remove("open");
  }
  if (e.target.closest("[data-od-go-items]")) return deps.goToItems();
  const tab = e.target.closest("[data-od-box]");
  if (tab) {
    current = Number(tab.dataset.odBox);
    qty = 1;
    renderOdds();
    if (!tab.classList.contains("od-box-tab")) root.scrollIntoView({ behavior: "smooth" });
    return;
  }
  const put = e.target.closest("[data-od-put]");
  if (put) return openWaitlist(put.dataset.odPut, current);
  const back = e.target.closest("[data-od-takeback]");
  if (back) return takeBack(back.dataset.odTakeback);
  const act = e.target.closest("[data-od]")?.dataset.od;
  if (!act) return;
  if (act === "minus") setQty(qty - 1);
  else if (act === "plus") setQty(qty + 1);
  else if (act === "max") setQty(left(current));
  else if (act === "math") {
    mathOpen = !mathOpen;
    const m = root.querySelector(".od-math");
    m?.classList.toggle("open", mathOpen);
    m?.querySelector(".od-math-btn").setAttribute("aria-expanded", mathOpen);
  } else if (act === "tiers") {
    tiersOpen = !tiersOpen;
    const copy = root.querySelector(".od-hero-copy");
    if (copy) copy.innerHTML = heroCopyHTML();
  }
  else if (act === "choose") chooseBoxes();
}

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (document.querySelector("#odOpen .dm-reveal.visible")) closeOpened();
  if (document.querySelector("#odChooser .dm-reveal.visible")) closeChooser();
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
