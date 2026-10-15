// Wanted: bounties for pieces collectors are hunting, with real, funded
// offers.
//
// A bounty names the piece you want and what you'll give for it: Cash,
// up to two items from your vault, or both as alternatives ("$180 or these
// two"), in which case whoever fills it picks. The offer is escrowed the
// moment it's posted: the Cash leaves your balance and is held by Chosen,
// and the items are locked in your vault (no listing, selling, shipping or
// cashing out). Cancel before it's filled and it all comes straight back;
// a bounty that runs out does the same.
//
// Anyone holding the piece fills it straight from their vault. Both sides
// change hands in one step: their piece becomes yours and your offer
// becomes theirs, or nothing happens at all. Every piece is already in
// Chosen's vault, so there's nothing to ship, no screenshots and no
// promises, and nobody has to send first.
//
// The other collectors are simulated, as elsewhere on the site. Now and
// then one of them posts a bounty for something already in your vault,
// usually something you pulled recently, at a little over market: someone
// actually wants what you just pulled.

import { chip } from "./odds.js";

const STORAGE_KEY = "gotcha_wanted_v1";
const OPEN_TARGET = 16; // open bounties from others the board keeps
const TICK_MS = [8000, 14000];
const HOT_GAP_MS = 150 * 1000; // at most one "wants your piece" this often
const HOT_MAX = 2; // open bounties for pieces in your vault, at once
const MAX_ITEMS = 2; // items an offer can include
const PAGE = 12;
const DAY = 24 * 3600 * 1000;
const CASH_OUT_RATE = 0.8; // the site's instant cash-out, for comparison
const NOTES = [
  "Looking for this to finish my collection.",
  "Been chasing this one for months.",
  "Last piece I need for the set.",
  "Fair offer, escrowed. Fill it and it's yours.",
  "Grail hunt. Happy to go a little over.",
  "Need it before the weekend.",
  "Will pay over market for this one.",
  "Missed the drop. Making up for it here.",
];
const FILTERS = [
  { key: "all", label: "All" },
  { key: "cash", label: "Cash offers" },
  { key: "items", label: "Item offers" },
  { key: "u300", label: "Under $300", max: 300 },
  { key: "mid", label: "$300 to $1,000", min: 300, max: 1000 },
  { key: "top", label: "$1,000+", min: 1000 },
];

const money = (v) => `$${Math.round(v).toLocaleString("en-US")}`;
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const uid = () => Math.random().toString(36).slice(2, 10);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const roundOffer = (v) => Math.max(5, Math.round(v / 5) * 5);
const tierOf = (i) => (i.rarity === "legendary" ? "grail" : i.rarity || "common");
const nItems = (n) => `${n} item${n === 1 ? "" : "s"}`;
const itemsValue = (items) => (items || []).reduce((s, i) => s + i.value, 0);
function ago(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 48 * 3600) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function left(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h left`;
  if (h) return `${h}h ${m}m left`;
  return `${Math.max(1, m)}m left`;
}

const ARROW = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
const LOCK = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
const CHECK = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="5 12.5 10 17.5 19 7"/></svg>`;
const SWAP = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h14l-4-4"/><path d="M20 16H6l4 4"/></svg>`;

// ---- State ------------------------------------------------------------------
// bounties: { id, by, mine, want: { name, image, value, rarity, category },
//   cash: number | null, items: [{ name, image, value, rarity, category,
//   invId? }] | null, note, at, expiresAt, status: "open" | "filled" |
//   "cancelled" | "expired", filledBy?, took?: "cash" | "items", filledAt? }
// lastHot: when a bounty for one of your pieces was last posted.

let deps = null;
let root = null;
let state = null;
let catalog = [];
let filter = "all";
let shown = PAGE;
let timer = null;
let modal = null; // { kind: "post" | "fill", ... }

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

const slim = (i) => ({ name: i.name, image: i.image, value: i.value, rarity: i.rarity, category: i.category });

export function initWanted(el, appDeps) {
  root = el;
  deps = appDeps;
  catalog = deps.catalog
    .filter((p) => p.price >= 40 && p.image)
    .map((p) => ({ name: p.name, image: p.image, value: p.price, rarity: p.rarity, category: p.category }));
  state = load();
  if (!state?.bounties) {
    state = { bounties: [], lastHot: 0 };
    const now = Date.now();
    for (let i = 0; i < OPEN_TARGET - 2; i++) state.bounties.push(crowdBounty({ at: now - Math.random() * 2 * DAY }));
    for (let i = 0; i < 8; i++) {
      const b = crowdBounty({ at: now - (1 + Math.random() * 3) * DAY });
      fillByCrowd(b, now - Math.random() * 20 * 3600 * 1000);
      state.bounties.push(b);
    }
    for (let i = 0; i < HOT_MAX; i++) postHot({ quiet: true, at: now - Math.random() * 6 * 3600 * 1000 });
  }
  // Anything locked for a bounty this state doesn't know (an older one's)
  // is released, so nothing stays locked for good.
  const held = new Set(mineOpen().flatMap((b) => (b.items || []).map((i) => i.invId)));
  deps.escrowedIds().filter((id) => !held.has(id)).forEach((id) => deps.unlockItem(id));
  expireDue();
  prune();
  save();
  root.addEventListener("click", onClick);
  schedule();
}

const open = () => state.bounties.filter((b) => b.status === "open");
const mineOpen = () => state.bounties.filter((b) => b.mine && b.status === "open");
const isOpen = () => !!root?.isConnected && root.closest(".screen")?.classList.contains("active");

// Your vault, by name: the pieces you could fill a bounty with.
function vaultIndex() {
  const map = new Map();
  for (const v of deps.vault()) if (!map.has(v.name)) map.set(v.name, v);
  return map;
}
const matchFor = (b, idx = vaultIndex()) => (!b.mine && b.status === "open" ? idx.get(b.want.name) : null);

// ---- The crowd --------------------------------------------------------------

function crowdBounty({ want, premium, at = Date.now() } = {}) {
  want = want || pick(catalog.filter((i) => i.value <= 3000));
  const ratio = premium ?? 0.85 + Math.random() * 0.3;
  const target = want.value * ratio;
  let cash = roundOffer(target);
  let items = null;
  // About one in three offers items too, as an alternative to the Cash.
  if (Math.random() < 0.32) {
    const first = pick(catalog.filter((i) => i.name !== want.name && i.value >= target * 0.3 && i.value <= target * 0.6)) || null;
    if (first) {
      const rest = target - first.value;
      const second = catalog
        .filter((i) => i.name !== want.name && i.name !== first.name)
        .reduce((best, i) => (!best || Math.abs(i.value - rest) < Math.abs(best.value - rest) ? i : best), null);
      items = [slim(first), slim(second)];
      if (Math.random() < 0.25) cash = null; // items only
    }
  }
  return {
    id: uid(),
    by: deps.randomUsername(),
    mine: false,
    want: slim(want),
    cash,
    items,
    note: Math.random() < 0.8 ? pick(NOTES) : "",
    at,
    expiresAt: at + (2 + Math.random() * 6) * DAY,
    status: "open",
  };
}

function fillByCrowd(b, at = Date.now()) {
  b.status = "filled";
  b.filledBy = deps.randomUsername();
  b.filledAt = at;
  b.took = b.cash && b.items ? (b.cash >= itemsValue(b.items) ? "cash" : "items") : b.cash ? "cash" : "items";
}

// Someone wants a piece you hold: one you pulled lately if there is one.
function postHot({ quiet = false, at = Date.now() } = {}) {
  const wanted = new Set(open().map((b) => b.want.name));
  const vault = deps.vault().filter((v) => v.value >= 40 && !wanted.has(v.name));
  if (!vault.length) return null;
  const recent = [...vault].sort((a, b) => (b.acquiredAt || 0) - (a.acquiredAt || 0)).slice(0, 6);
  const v = pick(recent);
  const b = crowdBounty({ want: v, premium: 1.05 + Math.random() * 0.25, at });
  state.bounties.push(b);
  state.lastHot = at;
  if (!quiet) deps.showToast(`${b.by} posted a ${money(b.cash ?? itemsValue(b.items))} bounty for your ${v.name}. Fill it on Wanted`, 4200);
  return b;
}

function schedule() {
  clearTimeout(timer);
  const [a, b] = TICK_MS;
  timer = setTimeout(() => {
    if (!document.hidden) tick();
    schedule();
  }, a + Math.random() * (b - a));
}

function tick() {
  const now = Date.now();
  expireDue();
  // Your bounties: an offer at or over market goes fast; a lowball waits.
  for (const b of mineOpen()) {
    if (now - b.at < 25 * 1000) continue;
    const best = Math.max(b.cash || 0, itemsValue(b.items));
    const r = best / b.want.value;
    const p = r >= 1 ? 0.3 : r >= 0.9 ? 0.15 : r >= 0.75 ? 0.05 : 0.01;
    if (Math.random() < p) filledForYou(b);
  }
  const idx = vaultIndex();
  const others = open().filter((b) => !b.mine);
  // Someone else fills one (never one you could fill: those are yours to take).
  if (Math.random() < 0.45) {
    const pool = others.filter((b) => now - b.at > 60 * 1000 && !matchFor(b, idx));
    if (pool.length) fillByCrowd(pick(pool));
  }
  if (open().filter((b) => !b.mine).length < OPEN_TARGET) state.bounties.push(crowdBounty());
  const hot = others.filter((b) => matchFor(b, idx)).length;
  if (hot < HOT_MAX && now - (state.lastHot || 0) > HOT_GAP_MS && Math.random() < 0.35) postHot();
  prune();
  save();
  if (isOpen() && !modal) refresh();
}

function expireDue() {
  const now = Date.now();
  for (const b of open()) {
    if (b.expiresAt > now) continue;
    b.status = "expired";
    if (b.mine) {
      release(b);
      deps.showToast(`Your bounty for the ${b.want.name} ran out. Your offer is back with you`, 3200);
    }
  }
}

// Keep the board from growing for good: the latest closed ones only.
function prune() {
  const closed = state.bounties.filter((b) => b.status !== "open").sort((a, b) => (b.filledAt || b.at) - (a.filledAt || a.at));
  const keep = new Set([...closed.filter((b) => b.mine).slice(0, 20), ...closed.filter((b) => !b.mine && b.status === "filled").slice(0, 14)]);
  state.bounties = state.bounties.filter((b) => b.status === "open" || keep.has(b));
}

// ---- Escrow and the swap ------------------------------------------------------

// Your offer comes back: the Cash to your balance, the items unlocked.
function release(b) {
  if (b.cash) deps.addCash(b.cash);
  (b.items || []).forEach((i) => deps.unlockItem(i.invId));
  deps.renderWallet();
  deps.itemsChanged();
}

// Someone filled your bounty: the piece is yours; they take the option
// worth more to them, and the other comes back to you.
function filledForYou(b) {
  const took = b.cash && b.items ? (b.cash >= itemsValue(b.items) ? "cash" : "items") : b.cash ? "cash" : "items";
  deps.giveItem({ name: b.want.name, price: b.want.value, image: b.want.image, category: b.want.category, rarity: b.want.rarity });
  if (took === "cash") (b.items || []).forEach((i) => deps.unlockItem(i.invId));
  else {
    (b.items || []).forEach((i) => deps.removeItem(i.invId));
    if (b.cash) deps.addCash(b.cash);
  }
  b.status = "filled";
  b.filledBy = deps.randomUsername();
  b.filledAt = Date.now();
  b.took = took;
  deps.renderWallet();
  deps.itemsChanged();
  deps.showToast(`${b.filledBy} filled your bounty: the ${b.want.name} is in My Items, swapped for ${took === "cash" ? money(b.cash) : "your items"}`, 4200);
}

// You fill a bounty from your vault. Checked again at the moment of the
// swap, then both sides change hands together.
function fill(b, option) {
  const v = matchFor(b);
  if (!v || b.status !== "open" || (option === "cash" && !b.cash) || (option === "items" && !b.items)) {
    deps.showToast("That bounty can't be filled any more", 2200, { log: false });
    return false;
  }
  deps.removeItem(v.id);
  if (option === "cash") deps.addCash(b.cash);
  else b.items.forEach((i) => deps.giveItem({ name: i.name, price: i.value, image: i.image, category: i.category, rarity: i.rarity }));
  b.status = "filled";
  b.filledBy = deps.username();
  b.filledAt = Date.now();
  b.took = option;
  save();
  deps.renderWallet();
  deps.itemsChanged();
  deps.showToast(
    `Swapped: your ${v.name} for ${option === "cash" ? `${money(b.cash)} from ${b.by}` : `${b.by}'s ${nItems(b.items.length)}, in My Items`}`,
    3600
  );
  return v;
}

function post({ want, cash, items, note, days }) {
  if (cash && !deps.spendCash(cash)) {
    deps.showToast(`Not enough Cash to escrow ${money(cash)}`, 2200, { log: false });
    return null;
  }
  const id = uid();
  const locked = [];
  for (const it of items) {
    if (deps.lockItem(it.id, { bounty: id, want: want.name })) locked.push(it);
    else {
      locked.forEach((l) => deps.unlockItem(l.id));
      if (cash) deps.addCash(cash);
      deps.showToast(`The ${it.name} isn't in your vault any more`, 2200, { log: false });
      return null;
    }
  }
  const b = {
    id,
    by: deps.username(),
    mine: true,
    want: slim(want),
    cash: cash || null,
    items: locked.length ? locked.map((i) => ({ ...slim(i), invId: i.id })) : null,
    note,
    at: Date.now(),
    expiresAt: Date.now() + days * DAY,
    status: "open",
  };
  state.bounties.push(b);
  save();
  deps.renderWallet();
  deps.itemsChanged();
  const what = [cash ? money(cash) : "", locked.length ? `${locked.length} item${locked.length > 1 ? "s" : ""}` : ""].filter(Boolean).join(" or ");
  deps.showToast(`Bounty posted for the ${want.name}: ${what} held in escrow`, 3200);
  return b;
}

function cancel(id) {
  const b = state.bounties.find((x) => x.id === id && x.mine && x.status === "open");
  if (!b) return;
  b.status = "cancelled";
  b.filledAt = Date.now();
  release(b);
  save();
  deps.showToast(`Bounty cancelled. ${b.cash ? `${money(b.cash)} is back in your Cash` : "Your items are unlocked"}`, 2600, { log: false });
  refresh();
}

// ---- Page -------------------------------------------------------------------

export function renderWanted() {
  if (!root) return;
  root.innerHTML = `
    <div class="wn-page">
      <section class="dm-hero wn-hero">
        <div class="wn-media" id="wnFeatured">${featuredHTML()}</div>
        <div class="dm-hero-copy" id="wnCopy">${copyHTML()}</div>
      </section>
      <section class="dm-sec" id="wnHot">${hotHTML()}</section>
      <section class="dm-sec">
        <div class="dm-sec-head">
          <div>
            <h2 class="dm-h2">Open bounties</h2>
            <p class="dm-sub">What collectors are hunting right now. Every offer here is already in escrow.</p>
          </div>
          <button class="dm-ghost wn-post-small" data-wn="post">Post a bounty</button>
        </div>
        <div class="dm-filters wn-filters" id="wnFilters">${filtersHTML()}</div>
        <ul class="dm-grid wn-grid" id="wnGrid">${gridHTML()}</ul>
      </section>
      <section class="dm-sec">
        <h2 class="dm-h2">Just filled</h2>
        <p class="dm-sub">Bounties that found their piece, swapped vault to vault. Drag to see more.</p>
        <ul class="dm-strip" id="wnFilled">${filledHTML()}</ul>
      </section>
      <section class="dm-sec" id="wnMine">${mineHTML()}</section>
      <section class="dm-sec">${trustHTML()}</section>
    </div>`;
  initStripDrag();
}

function refresh() {
  if (!isOpen()) return;
  const set = (id, html) => {
    const el = root.querySelector(id);
    if (el) el.innerHTML = html;
  };
  set("#wnFeatured", featuredHTML());
  set("#wnCopy", copyHTML());
  set("#wnHot", hotHTML());
  set("#wnGrid", gridHTML());
  const strip = root.querySelector("#wnFilled");
  if (strip) {
    const keep = strip.scrollLeft;
    strip.innerHTML = filledHTML();
    strip.scrollLeft = keep;
  }
  set("#wnMine", mineHTML());
}

function copyHTML() {
  const list = open();
  const held = list.reduce((s, b) => s + Math.max(b.cash || 0, itemsValue(b.items)), 0);
  const today = state.bounties.filter((b) => b.status === "filled" && Date.now() - b.filledAt < DAY).length;
  return `
    <div class="od-hero-tags"><span class="dm-pill">${LOCK} Escrowed offers</span></div>
    <h1 class="dm-title">Bounty board</h1>
    <p class="dm-blurb">Post what you&rsquo;re hunting with a real, funded offer. Anyone who has it fills it straight from their vault, and the swap happens in one step. No screenshots, no promises, nobody sends first.</p>
    <div class="wn-stats">
      <div><b>${list.length}</b><span>open bounties</span></div>
      <div><b>${money(held)}</b><span>held in escrow</span></div>
      <div><b>${today}</b><span>filled today</span></div>
    </div>
    <button class="dm-open wn-post" data-wn="post"><span>Post a bounty</span><span class="dm-open-price">${ARROW}</span></button>
    <p class="dm-paid">Your offer is escrowed the moment you post. Cancel any time before it&rsquo;s filled and it all comes straight back.</p>`;
}

// The poster: the best bounty for a piece you hold, else the biggest one.
function featuredHTML() {
  const idx = vaultIndex();
  const list = open().filter((b) => !b.mine);
  const value = (b) => Math.max(b.cash || 0, itemsValue(b.items));
  const hot = list.filter((b) => matchFor(b, idx)).sort((a, b) => value(b) - value(a))[0];
  const b = hot || [...list].sort((a, c) => value(c) - value(a))[0];
  if (!b) return "";
  const t = tierOf(b.want);
  return `
    <article class="wn-poster dm-t-${t}${hot ? " is-match" : ""}">
      <span class="wn-poster-head">Wanted</span>
      ${hot ? `<span class="wn-poster-flag">${CHECK} In your vault</span>` : ""}
      <span class="dm-img"><img src="${b.want.image}" alt=""></span>
      <span class="wn-poster-name">${esc(b.want.name)}</span>
      <span class="wn-poster-worth">${chip(t)} Worth ${money(b.want.value)}</span>
      <div class="wn-poster-offer"><span>Offering</span>${offerHTML(b, true)}</div>
      ${b.note ? `<p class="wn-note">&ldquo;${esc(b.note)}&rdquo;</p>` : ""}
      <span class="od-creator">${deps.avatarHTML(b.by, "od-avatar")}${esc(b.by)} &middot; ${left(b.expiresAt - Date.now())}</span>
      ${hot ? `<button class="dm-open wn-poster-fill" data-wn-fill="${b.id}"><span>Fill from your vault</span><span class="dm-open-price">${ARROW}</span></button>` : ""}
    </article>`;
}

// What's offered: Cash, items, or one or the other.
function offerHTML(b, big = false) {
  const cash = b.cash ? `<b class="dm-money${big ? " wn-big" : ""}">${money(b.cash)}</b>` : "";
  const items = b.items
    ? `<span class="wn-items" title="${esc(b.items.map((i) => `${i.name} (${money(i.value)})`).join(", "))}">${b.items
        .map((i) => `<span class="wn-thumb"><img src="${i.image}" alt="" loading="lazy"></span>`)
        .join("")}<span class="wn-items-val">${nItems(b.items.length)} &middot; ${money(itemsValue(b.items))}</span></span>`
    : "";
  return `<span class="wn-offer">${cash}${cash && items ? `<span class="wn-or">or</span>` : ""}${items}</span>`;
}

function cardHTML(b, idx) {
  const t = tierOf(b.want);
  const match = matchFor(b, idx);
  const best = Math.max(b.cash || 0, itemsValue(b.items));
  const over = best / b.want.value - 1;
  return `<li class="dm-piece wn-card dm-t-${t}${match ? " is-match" : ""}">
    <span class="dm-card-top">${chip(t)}${match ? `<span class="wn-match"><span class="wn-long">In your vault</span><span class="wn-short">${CHECK}</span></span>` : b.mine ? `<span class="wn-yours">Yours</span>` : ""}</span>
    <span class="dm-img"><img src="${b.want.image}" alt="" loading="lazy"></span>
    <span class="dm-piece-text">
      <span class="dm-name" title="${esc(b.want.name)}">${esc(b.want.name)}</span>
      <span class="wn-worth">Worth ${money(b.want.value)}${Math.abs(over) >= 0.03 ? ` &middot; <em class="${over > 0 ? "is-up" : ""}">offer ${over > 0 ? "+" : "&minus;"}${Math.round(Math.abs(over) * 100)}%</em>` : ""}</span>
    </span>
    <span class="wn-offer-row"><span class="wn-escrow">${LOCK} Escrowed</span>${offerHTML(b)}</span>
    ${b.note ? `<p class="wn-note">&ldquo;${esc(b.note)}&rdquo;</p>` : ""}
    <span class="od-creator">${deps.avatarHTML(b.by, "od-avatar")}${esc(b.by)} &middot; ${left(b.expiresAt - Date.now())}</span>
    ${
      match
        ? `<button class="dm-open wn-fill" data-wn-fill="${b.id}"><span><span class="wn-long">Fill from your vault</span><span class="wn-short">Fill it</span></span><span class="dm-open-price">${ARROW}</span></button>`
        : b.mine
          ? `<button class="wn-row-btn" data-wn-cancel="${b.id}">Cancel bounty</button>`
          : `<span class="wn-none">Not in your vault</span>`
    }
  </li>`;
}

function hotHTML() {
  const idx = vaultIndex();
  const list = open().filter((b) => matchFor(b, idx));
  if (!list.length) return "";
  return `
    <h2 class="dm-h2">Wanted from your vault</h2>
    <p class="dm-sub">Collectors are after pieces you already own. Fill one and their offer is yours in the same step.</p>
    <ul class="dm-grid wn-grid">${list.map((b) => cardHTML(b, idx)).join("")}</ul>`;
}

function filtersHTML() {
  return FILTERS.map((f) => `<button class="dm-filter${filter === f.key ? " active" : ""}" data-wn-filter="${f.key}">${f.label}</button>`).join("");
}

function gridHTML() {
  const idx = vaultIndex();
  const f = FILTERS.find((x) => x.key === filter) || FILTERS[0];
  const list = open()
    .filter((b) => !matchFor(b, idx))
    .filter((b) => (f.key === "cash" ? b.cash : f.key === "items" ? b.items : true))
    .filter((b) => b.want.value >= (f.min ?? 0) && b.want.value < (f.max ?? Infinity))
    .sort((a, b) => b.at - a.at);
  if (!list.length) return `<li class="fl-empty">Nothing open here right now. Post a bounty and be the first.</li>`;
  const more = list.length > shown ? `<li class="fl-more-wrap"><button class="dm-ghost" data-wn="more">Show more (${list.length - shown})</button></li>` : "";
  return list.slice(0, shown).map((b) => cardHTML(b, idx)).join("") + more;
}

function filledHTML() {
  const list = state.bounties.filter((b) => b.status === "filled").sort((a, b) => b.filledAt - a.filledAt).slice(0, 14);
  if (!list.length) return `<li class="od-empty">Nothing filled yet.</li>`;
  return list
    .map((b) => {
      const t = tierOf(b.want);
      const you = b.mine || b.filledBy === deps.username();
      const paid = b.took === "cash" ? money(b.cash) : nItems(b.items.length);
      return `<li class="dm-pull dm-t-${t}${you ? " is-yours" : ""}">
        <span class="dm-card-top">${chip(t)}<span class="dm-ago">${ago(Date.now() - b.filledAt)}</span></span>
        <span class="dm-img"><img src="${b.want.image}" alt="" loading="lazy" draggable="false"></span>
        <span class="dm-name" title="${esc(b.want.name)}">${esc(b.want.name)}</span>
        <b class="dm-money">${paid}</b>
        <span class="od-to">${b.filledBy === deps.username() ? "You" : esc(b.filledBy)} &rarr; ${b.mine ? "you" : esc(b.by)}</span>
      </li>`;
    })
    .join("");
}

function mineHTML() {
  const list = state.bounties.filter((b) => b.mine || b.filledBy === deps.username()).sort((a, b) => (b.filledAt || b.at) - (a.filledAt || a.at));
  if (!list.length) return "";
  const rows = list.map((b) => {
    const yours = b.mine;
    const offer = [b.cash ? money(b.cash) : "", b.items ? nItems(b.items.length) : ""].filter(Boolean).join(" or ");
    let line;
    if (!yours) line = `You filled ${esc(b.by)}&rsquo;s bounty &middot; got ${b.took === "cash" ? money(b.cash) : nItems(b.items.length)} &middot; ${ago(Date.now() - b.filledAt)}`;
    else if (b.status === "open") line = `Offering ${offer} &middot; <b>${LOCK} in escrow</b> &middot; ${left(b.expiresAt - Date.now())}`;
    else if (b.status === "filled") line = `Filled by ${esc(b.filledBy)} &middot; they took ${b.took === "cash" ? money(b.cash) : "your items"} &middot; ${ago(Date.now() - b.filledAt)}`;
    else line = `${b.status === "cancelled" ? "Cancelled" : "Ran out"} &middot; your offer came back`;
    const up = (yours && b.status === "filled") || !yours;
    return `<li class="od-mine-row${up ? " is-up" : ""}">
      <span class="dm-img"><img src="${b.want.image}" alt="" loading="lazy"></span>
      <span class="od-mine-text"><span class="dm-name">${yours ? "Wanted: " : ""}${esc(b.want.name)}</span><span>${line}</span></span>
      ${yours && b.status === "open" ? `<button class="wn-row-btn" data-wn-cancel="${b.id}">Cancel</button>` : `<b class="dm-money">${money(b.want.value)}</b>`}
    </li>`;
  });
  return `
    <h2 class="dm-h2">Your bounties</h2>
    <p class="dm-sub">Bounties you&rsquo;ve posted and ones you&rsquo;ve filled. Whatever you got is in <a href="#" data-wn-go-items>My Items</a>.</p>
    <ul class="od-mine">${rows.join("")}</ul>`;
}

function trustHTML() {
  return `
    <h2 class="dm-h2">How the swap stays safe</h2>
    <p class="dm-sub">Nobody has to trust anybody. Chosen holds both sides until the swap.</p>
    <ol class="fl-steps">
      <li><b>Funded up front.</b> A bounty&rsquo;s offer is escrowed when it&rsquo;s posted: the Cash is held by Chosen, and any items are locked in the poster&rsquo;s vault. An offer you see is an offer that&rsquo;s there.</li>
      <li><b>Vault to vault.</b> Bounties are filled only from pieces already in Chosen&rsquo;s vault, authenticated when they came in. Nothing is shipped, so there&rsquo;s nothing to screenshot or promise.</li>
      <li><b>One swap, both sides.</b> The piece and the offer change owner in a single step. Either both happen or neither does, so nobody ever sends first.</li>
      <li><b>Your offer, your call.</b> Cancel before it&rsquo;s filled, or let it run out, and the Cash and items come straight back.</li>
    </ol>`;
}

// ---- Modals -----------------------------------------------------------------

function modalEl() {
  let wrap = document.getElementById("wnModal");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "wnModal";
    wrap.className = "dm od wn";
    document.body.appendChild(wrap);
    wrap.addEventListener("click", onModalClick);
    wrap.addEventListener("input", onModalInput);
  }
  return wrap;
}

function showModal(html) {
  const wrap = modalEl();
  wrap.innerHTML = `<div class="dm-reveal wn-modal"><div class="dm-reveal-card wn-sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  const reveal = wrap.querySelector(".dm-reveal");
  requestAnimationFrame(() => reveal.classList.add("visible"));
}

function closeModal() {
  const reveal = document.querySelector("#wnModal .dm-reveal");
  modal = null;
  if (!reveal) return;
  reveal.classList.remove("visible");
  setTimeout(() => {
    const w = document.getElementById("wnModal");
    if (w && !modal) w.innerHTML = "";
  }, 220);
  refresh();
}

// Fill: what you give, what you get, and why it's safe.
function openFill(id) {
  const b = state.bounties.find((x) => x.id === id);
  const v = b && matchFor(b);
  if (!v) return;
  modal = { kind: "fill", id, option: b.cash ? "cash" : "items" };
  renderFill();
}

function renderFill() {
  const b = state.bounties.find((x) => x.id === modal.id);
  const v = matchFor(b);
  if (!v) return closeModal();
  const opt = modal.option;
  const gets = opt === "cash" ? b.cash : itemsValue(b.items);
  const cashOut = Math.round(v.value * CASH_OUT_RATE);
  const option = (key, inner) =>
    `<button class="wn-opt${opt === key ? " active" : ""}" data-wn-opt="${key}" role="radio" aria-checked="${opt === key}">${inner}</button>`;
  showModal(`
    <h3 class="dm-h2">Fill this bounty</h3>
    <p class="od-reveal-sub">${esc(b.by)} wants your ${esc(v.name)}. Their offer is already in escrow, so the swap happens in one step.</p>
    <div class="wn-swap">
      <div class="wn-swap-side">
        <span class="wn-swap-label">You give</span>
        <div class="wn-swap-card">
          <span class="dm-img"><img src="${v.image}" alt=""></span>
          <span class="dm-name">${esc(v.name)}</span>
          <b class="dm-money">${money(v.value)}</b>
          <span class="wn-swap-note">From your vault</span>
        </div>
      </div>
      <span class="wn-swap-icon">${SWAP}</span>
      <div class="wn-swap-side">
        <span class="wn-swap-label">You get${b.cash && b.items ? ": pick one" : ""}</span>
        <div class="wn-opts" role="radiogroup">
          ${b.cash ? option("cash", `<b class="dm-money">${money(b.cash)}</b><span>Cash, straight to your balance</span>`) : ""}
          ${
            b.items
              ? option(
                  "items",
                  `<span class="wn-opt-items">${b.items.map((i) => `<span class="wn-thumb"><img src="${i.image}" alt=""></span>`).join("")}</span><span>${b.items.map((i) => `${esc(i.name)} (${money(i.value)})`).join(", ")}</span>`
                )
              : ""
          }
        </div>
      </div>
    </div>
    <ul class="wn-checks">
      <li>${CHECK} ${opt === "cash" ? `${money(b.cash)} held in escrow by Chosen` : `${nItems(b.items.length)} locked in ${esc(b.by)}&rsquo;s vault`} ${ago(Date.now() - b.at) === "now" ? "just now" : `for ${ago(Date.now() - b.at).replace(" ago", "")}`}</li>
      <li>${CHECK} Your ${esc(v.name)} is in your vault, authenticated</li>
      <li>${CHECK} Both sides change hands in one step, or neither does</li>
    </ul>
    <p class="wn-compare">${
      gets > cashOut
        ? `Cashing it out today would get you ${money(cashOut)}. This is <b>${money(gets - cashOut)} more</b>.`
        : `Cashing it out today would get you ${money(cashOut)}.`
    }</p>
    <div class="dm-reveal-actions">
      <button class="dm-ghost" data-wn-close>Not now</button>
      <button class="dm-open" data-wn="swap"><span>Swap now</span><span class="dm-open-price">${opt === "cash" ? money(b.cash) : nItems(b.items.length)}${ARROW}</span></button>
    </div>`);
}

function doSwap() {
  const b = state.bounties.find((x) => x.id === modal.id);
  const option = modal.option;
  const v = b && fill(b, option);
  if (!v) return closeModal();
  modal = { kind: "done" };
  showModal(`
    <span class="wn-done-mark">${CHECK}</span>
    <h3 class="dm-h2">Swapped</h3>
    <p class="od-reveal-sub">${option === "cash" ? `${money(b.cash)} is in your Cash.` : `${esc(b.items.map((i) => i.name).join(" and "))} ${b.items.length > 1 ? "are" : "is"} in My Items.`} Your ${esc(v.name)} went to ${esc(b.by)}.</p>
    <div class="dm-reveal-actions">
      <button class="dm-ghost" data-wn-close>Done</button>
      ${option === "items" ? `<button class="dm-open" data-wn-go-items><span>See My Items</span><span class="dm-open-price">${ARROW}</span></button>` : ""}
    </div>`);
}

// Post: the piece, the offer, a note, how long it runs.
function openPost() {
  modal = { kind: "post", want: null, q: "", cash: "", items: [], note: "", days: 7 };
  renderPost();
}

function wantResults() {
  const q = modal.q.trim().toLowerCase();
  const list = q ? catalog.filter((i) => i.name.toLowerCase().includes(q)) : catalog.filter((i) => i.value >= 150 && i.value <= 900);
  return list.slice(0, 6);
}

function wantHTML() {
  const w = modal.want;
  if (w)
    return `<div class="wn-picked">
      <span class="dm-img"><img src="${w.image}" alt=""></span>
      <span class="wn-picked-text"><span class="dm-name">${esc(w.name)}</span><span>Worth ${money(w.value)} on the market</span></span>
      <button class="wn-row-btn" data-wn-unpick>Change</button>
    </div>`;
  return `<input class="fl-search wn-search" id="wnQ" type="search" placeholder="Search for a piece" value="${esc(modal.q)}" autocomplete="off">
    <ul class="wn-results" id="wnResults">${resultsHTML()}</ul>`;
}

function resultsHTML() {
  const list = wantResults();
  if (!list.length) return `<li class="wn-empty">No pieces match that.</li>`;
  return list
    .map(
      (i) => `<li><button class="wn-result" data-wn-want="${esc(i.name)}">
        <span class="dm-img"><img src="${i.image}" alt="" loading="lazy"></span>
        <span class="dm-name">${esc(i.name)}</span>
        <b>${money(i.value)}</b>
      </button></li>`
    )
    .join("");
}

function vaultPickHTML() {
  const vault = deps.vault().filter((v) => v.name !== modal.want?.name).sort((a, b) => b.value - a.value);
  if (!vault.length) return `<li class="wn-empty">Nothing in your vault to offer.</li>`;
  return vault
    .map((v) => {
      const on = modal.items.includes(v.id);
      return `<li><button class="wn-vitem${on ? " active" : ""}" data-wn-item="${v.id}" aria-pressed="${on}">
        <span class="dm-img"><img src="${v.image}" alt="" loading="lazy"></span>
        <span class="dm-name">${esc(v.name)}</span>
        <b>${money(v.value)}</b>
      </button></li>`;
    })
    .join("");
}

const cashOf = () => Math.max(0, Math.floor(Number(String(modal.cash).replace(/[^0-9.]/g, "")) || 0));

function summaryHTML() {
  const cash = cashOf();
  const vault = deps.vault();
  const items = modal.items.map((id) => vault.find((v) => v.id === id)).filter(Boolean);
  const wallet = deps.wallet();
  const parts = [];
  if (cash) parts.push(`<b>${money(cash)}</b> from your Cash`);
  if (items.length) parts.push(`<b>${items.length} item${items.length > 1 ? "s" : ""}</b> (${money(itemsValue(items))}) locked in your vault`);
  let warn = "";
  if (!modal.want) warn = "Pick the piece you&rsquo;re after.";
  else if (!cash && !items.length) warn = "Add Cash, items, or both.";
  else if (cash > wallet.cash) warn = `You have ${money(wallet.cash)} in Cash.`;
  const either = cash && items.length ? " Whoever fills it picks the Cash or the items, and the other comes back to you." : "";
  return `${parts.length ? `<p>Held in escrow now: ${parts.join(" and ")}.${either}</p>` : ""}${warn ? `<p class="wn-warn">${warn}</p>` : ""}`;
}

const canPost = () => {
  const cash = cashOf();
  return !!modal.want && (cash > 0 || modal.items.length > 0) && cash <= deps.wallet().cash;
};

function renderPost() {
  const w = modal.want;
  const quick = w
    ? [
        ["Market value", w.value],
        ["+10%", w.value * 1.1],
        ["&minus;10%", w.value * 0.9],
      ]
        .map(([label, v]) => `<button class="dm-filter" data-wn-cash="${roundOffer(v)}">${label} &middot; ${money(roundOffer(v))}</button>`)
        .join("")
    : "";
  showModal(`
    <h3 class="dm-h2">Post a bounty</h3>
    <p class="od-reveal-sub">Say what you&rsquo;re after and fund the offer. It&rsquo;s held in escrow until someone fills it.</p>
    <div class="wn-step"><span>1</span>What you&rsquo;re looking for</div>
    <div id="wnWant">${wantHTML()}</div>
    <div class="wn-step"><span>2</span>Your offer</div>
    <label class="wn-cash"><span>$</span><input id="wnCash" inputmode="numeric" placeholder="0" value="${esc(modal.cash)}" aria-label="Cash offered"></label>
    <div class="dm-filters wn-quick" id="wnQuick">${quick}</div>
    <p class="wn-hint">And, or instead, up to ${MAX_ITEMS} items from your vault (${modal.items.length} picked):</p>
    <ul class="wn-vault" id="wnVault">${vaultPickHTML()}</ul>
    <div class="wn-step"><span>3</span>A note and how long it runs</div>
    <input class="fl-search wn-note-in" id="wnNote" maxlength="120" placeholder="Looking for this to finish my collection." value="${esc(modal.note)}">
    <div class="dm-filters wn-days">${[3, 7, 14].map((d) => `<button class="dm-filter${modal.days === d ? " active" : ""}" data-wn-days="${d}">${d} days</button>`).join("")}</div>
    <div class="wn-summary" id="wnSummary">${summaryHTML()}</div>
    <div class="dm-reveal-actions">
      <button class="dm-ghost" data-wn-close>Cancel</button>
      <button class="dm-open" data-wn="submit" id="wnSubmit"${canPost() ? "" : " disabled"}><span>Post and escrow</span><span class="dm-open-price">${ARROW}</span></button>
    </div>`);
}

function updatePostSummary() {
  const el = document.getElementById("wnSummary");
  if (el) el.innerHTML = summaryHTML();
  const btn = document.getElementById("wnSubmit");
  if (btn) btn.disabled = !canPost();
}

function submitPost() {
  if (!canPost()) return;
  const vault = deps.vault();
  const items = modal.items.map((id) => vault.find((v) => v.id === id)).filter(Boolean);
  const b = post({ want: modal.want, cash: cashOf(), items, note: modal.note.trim(), days: modal.days });
  if (b) closeModal();
}

// ---- Controls -----------------------------------------------------------------

function onClick(e) {
  if (e.target.closest("[data-wn-go-items]")) {
    e.preventDefault();
    return deps.goToItems();
  }
  if (e.target.closest('[data-wn="post"]')) return openPost();
  const fillBtn = e.target.closest("[data-wn-fill]");
  if (fillBtn) return openFill(fillBtn.dataset.wnFill);
  const c = e.target.closest("[data-wn-cancel]");
  if (c) return cancel(c.dataset.wnCancel);
  const f = e.target.closest("[data-wn-filter]");
  if (f) {
    filter = f.dataset.wnFilter;
    shown = PAGE;
    root.querySelector("#wnFilters").innerHTML = filtersHTML();
    root.querySelector("#wnGrid").innerHTML = gridHTML();
    return;
  }
  if (e.target.closest('[data-wn="more"]')) {
    shown += PAGE;
    root.querySelector("#wnGrid").innerHTML = gridHTML();
  }
}

function onModalClick(e) {
  if (e.target.closest("[data-wn-go-items]")) {
    closeModal();
    return deps.goToItems();
  }
  if (e.target.closest("[data-wn-close]") || e.target.classList.contains("dm-reveal")) return closeModal();
  if (!modal) return;
  if (modal.kind === "fill") {
    const o = e.target.closest("[data-wn-opt]");
    if (o) {
      modal.option = o.dataset.wnOpt;
      return renderFill();
    }
    if (e.target.closest('[data-wn="swap"]')) return doSwap();
    return;
  }
  if (modal.kind !== "post") return;
  const w = e.target.closest("[data-wn-want]");
  if (w) {
    modal.want = catalog.find((i) => i.name === w.dataset.wnWant);
    modal.items = modal.items.filter((id) => deps.vault().find((v) => v.id === id)?.name !== modal.want.name);
    if (!modal.cash) modal.cash = String(roundOffer(modal.want.value));
    return renderPost();
  }
  if (e.target.closest("[data-wn-unpick]")) {
    modal.want = null;
    return renderPost();
  }
  const q = e.target.closest("[data-wn-cash]");
  if (q) {
    modal.cash = q.dataset.wnCash;
    document.getElementById("wnCash").value = modal.cash;
    return updatePostSummary();
  }
  const it = e.target.closest("[data-wn-item]");
  if (it) {
    const id = it.dataset.wnItem;
    if (modal.items.includes(id)) modal.items = modal.items.filter((x) => x !== id);
    else if (modal.items.length < MAX_ITEMS) modal.items.push(id);
    else deps.showToast(`Up to ${MAX_ITEMS} items in one offer`, 1800, { log: false });
    document.getElementById("wnVault").innerHTML = vaultPickHTML();
    const hint = document.querySelector(".wn-hint");
    if (hint) hint.textContent = `And, or instead, up to ${MAX_ITEMS} items from your vault (${modal.items.length} picked):`;
    return updatePostSummary();
  }
  const d = e.target.closest("[data-wn-days]");
  if (d) {
    modal.days = Number(d.dataset.wnDays);
    document.querySelectorAll("[data-wn-days]").forEach((b) => b.classList.toggle("active", b === d));
    return;
  }
  if (e.target.closest('[data-wn="submit"]')) submitPost();
}

function onModalInput(e) {
  if (modal?.kind !== "post") return;
  if (e.target.id === "wnQ") {
    modal.q = e.target.value;
    document.getElementById("wnResults").innerHTML = resultsHTML();
  } else if (e.target.id === "wnCash") {
    modal.cash = e.target.value.replace(/[^0-9]/g, "");
    e.target.value = modal.cash;
    updatePostSummary();
  } else if (e.target.id === "wnNote") modal.note = e.target.value;
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.querySelector("#wnModal .dm-reveal.visible")) closeModal();
});

// Just filled: drag it sideways with the mouse (touch scrolls it).
let dragBound = false;
function initStripDrag() {
  if (dragBound) return;
  dragBound = true;
  let drag = null;
  root.addEventListener("pointerdown", (e) => {
    const strip = e.target.closest("#wnFilled");
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
