// Lulu: burn the Lulus you hold for Credits.
//
// Lulu is ODLabs' earlier collection. Holders connect the wallets their
// Lulus are in (as many as they like, since people keep them in more than
// one), pick the ones to burn, and get Credits for them: 100 for each
// Lulu, plus a 33 bonus for every three, so three are 333. A burnt Lulu is
// gone for good; the Credits land in the account at once.
//
// Only Lulus burn here. A Mercurius has to be revealed first, which keeps
// the contract to the one mechanic.
//
// Everything is a local demo: the wallets are simulated (nothing is
// connected or signed), and which Lulus they hold is drawn from the art in
// assets/lulu. What's been connected and burnt lives in its own storage key.

import * as player from "./player.js";
import { ICONS } from "./icons.js";
import { playLuluTick, playLuluIgnite, playBurnRoar, playCreditsAdded } from "./sound.js";

const STORAGE_KEY = "gotcha_lulu_v1";

export const CREDITS_PER_LULU = 100;
export const SET_SIZE = 3;
export const SET_BONUS = 33;

// The token IDs we have art for (assets/lulu/<id>.jpg).
const LULU_IDS = [
  1, 2, 3, 4, 5, 7, 9, 12, 15, 23, 31, 44, 58, 77, 88, 104, 150, 205, 241, 333, 412, 498, 561, 640, 777, 921, 1111,
  1420, 1555, 1776, 1890, 2001, 2468,
];

const WALLET_KINDS = [
  { key: "metamask", label: "MetaMask" },
  { key: "coinbase", label: "Coinbase Wallet" },
  { key: "rainbow", label: "Rainbow" },
  { key: "walletconnect", label: "WalletConnect" },
];

const luluImage = (id) => `assets/lulu/${id}.jpg`;

// Where to get one: both collections on OpenSea.
const GET_LINKS = [
  {
    name: "Lulu",
    note: "Burns for Credits",
    url: "https://opensea.io/collection/odlulu",
    image: "assets/lulu/get-lulu.jpg",
  },
  {
    name: "Mercurius",
    note: "Reveal it, then burn the Lulu",
    url: "https://opensea.io/collection/odlabslulu",
    image: "assets/lulu/mercurius.jpg",
  },
];

/** What a number of Lulus burns for. */
export function creditsFor(count) {
  const sets = Math.floor(count / SET_SIZE);
  const base = count * CREDITS_PER_LULU;
  const bonus = sets * SET_BONUS;
  return { count, sets, base, bonus, total: base + bonus };
}

// ---- State ---------------------------------------------------------------

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { wallets: [], burned: [], ...JSON.parse(raw) };
  } catch {
    // unreadable — start with nothing connected
  }
  return { wallets: [], burned: [] };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable — this visit only
  }
}

function randomAddress() {
  let hex = "";
  for (let i = 0; i < 40; i++) hex += Math.floor(Math.random() * 16).toString(16);
  return `0x${hex}`;
}

const shortAddress = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// A wallet's dot: two hues taken from its address, so each one is told
// apart at a glance without a name.
function walletDot(address) {
  const h1 = parseInt(address.slice(2, 6), 16) % 360;
  const h2 = (h1 + 70 + (parseInt(address.slice(6, 8), 16) % 120)) % 360;
  return `background: linear-gradient(135deg, hsl(${h1} 80% 60%), hsl(${h2} 75% 50%))`;
}

// Lulus nobody's wallet holds yet and that haven't been burnt.
function unclaimedIds() {
  const held = new Set(state.wallets.flatMap((w) => w.lulus));
  const burned = new Set(state.burned);
  return LULU_IDS.filter((id) => !held.has(id) && !burned.has(id));
}

function connectWallet(kind) {
  // The first wallet holds seven (two sets and one over, so the bonus has
  // something to show); later ones somewhere between two and six.
  const free = unclaimedIds().sort(() => Math.random() - 0.5);
  const n = state.wallets.length === 0 ? 7 : 2 + Math.floor(Math.random() * 5);
  const lulus = free.slice(0, n).sort((a, b) => a - b);
  const wallet = { id: `w${Date.now().toString(36)}`, kind, address: randomAddress(), lulus };
  state.wallets.push(wallet);
  save();
  return wallet;
}

function disconnectWallet(id) {
  state.wallets = state.wallets.filter((w) => w.id !== id);
  save();
}

function burn(ids) {
  const gone = new Set(ids);
  state.wallets.forEach((w) => (w.lulus = w.lulus.filter((id) => !gone.has(id))));
  state.burned.push(...ids);
  save();
}

// ---- Screen --------------------------------------------------------------

let deps = null; // { renderWallet, showToast }
let root = null;
let selected = new Set();
let walletFilter = "all";
let burning = false;
let pickedKeys = new Set(); // thumbnails already on show, so only new ones animate

/** One-time setup: where the page renders, and the app hooks it needs. */
export function initLulu(el, appDeps) {
  root = el;
  deps = appDeps;
  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  // Settle on release; "change" doesn't always follow a drag, so the
  // pointer letting go settles it too.
  root.addEventListener("change", (e) => {
    if (e.target.id === "luluRange") settleRange(e.target);
  });
  window.addEventListener("pointerup", () => {
    const r = root.querySelector("#luluRange");
    if (r && Number(r.value) !== Math.round(Number(r.value))) settleRange(r);
  });
  // Arrow keys move one Lulu at a time (a free-running bar would otherwise
  // step by a sliver).
  root.addEventListener("keydown", (e) => {
    if (e.target.id !== "luluRange" || burning) return;
    const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const r = e.target;
    r.value = Math.max(0, Math.min(Number(r.max), Math.round(Number(r.value)) + d));
    r.dispatchEvent(new Event("input", { bubbles: true }));
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".lulu-get")) closeGetMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeGetMenu();
  });
  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches('[role="button"]')) {
      e.preventDefault();
      e.target.click();
    }
  });
  window.addEventListener("pointerup", () => {
    paint = null;
    // The click that follows a press-and-sweep is already handled; one
    // that never comes (released over another tile) mustn't eat the next.
    setTimeout(() => (suppressClick = false), 0);
  });
}

// The Lulus on show, in order: every connected wallet's, or one wallet's.
function visibleLulus() {
  const wallets = walletFilter === "all" ? state.wallets : state.wallets.filter((w) => w.id === walletFilter);
  return wallets.flatMap((w) => w.lulus.map((id) => ({ id, wallet: w })));
}

function allHeldIds() {
  return state.wallets.flatMap((w) => w.lulus);
}

export function renderLulu() {
  if (!root) return;
  // Drop anything selected that's no longer held (burnt, or its wallet gone).
  const held = new Set(allHeldIds());
  selected = new Set([...selected].filter((id) => held.has(id)));
  if (walletFilter !== "all" && !state.wallets.some((w) => w.id === walletFilter)) walletFilter = "all";

  root.innerHTML = state.wallets.length ? pageHTML() : emptyHTML();
  updateSummary();
}

// Get Lulu: a menu of both collections on OpenSea. First in the wallets
// row, so getting one sits beside the wallets you'd hold it in.
function getMenuHTML() {
  const external = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/></svg>`;
  return `
      <div class="lulu-get">
        <button class="lulu-get-btn deposit-btn" data-lulu="get" aria-expanded="false" aria-haspopup="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2.5 3.5 6v13.5A2 2 0 0 0 5.5 21.5h13a2 2 0 0 0 2-2V6L18 2.5z"/><line x1="3.5" y1="6" x2="20.5" y2="6"/><path d="M15.5 10a3.5 3.5 0 0 1-7 0"/></svg>
          Get Lulu
          <svg class="lulu-get-chev" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="lulu-get-menu" role="menu">
          <span class="lulu-get-label">On OpenSea</span>
          ${GET_LINKS.map(
            (l) => `<a class="lulu-get-opt" role="menuitem" href="${l.url}" target="_blank" rel="noopener noreferrer">
              <img src="${l.image}" alt="">
              <span class="lulu-get-text"><b>${l.name}</b><small>${l.note}</small></span>
              ${external}
            </a>`
          ).join("")}
        </div>
      </div>`;
}

function headHTML() {
  return `
    <div class="lulu-head">
      <h2 class="screen-title">Lulu</h2>
      <p class="lulu-lede">Burn your Lulus for Credits. <b>${CREDITS_PER_LULU}</b> for each, <b>${creditsFor(SET_SIZE).total}</b> for every ${SET_SIZE}.</p>
    </div>`;
}

function emptyHTML() {
  const fan = [58, 1, 412].map((id) => `<img src="${luluImage(id)}" alt="">`).join("");
  return `
    ${headHTML()}
    <div class="lulu-empty">
      <div class="lulu-empty-fan" aria-hidden="true">${fan}</div>
      <h3 class="lulu-empty-title">Connect a wallet to see your Lulus</h3>
      <div class="lulu-rates">
        <div class="lulu-rate"><span class="lulu-rate-n">1 Lulu</span><b>${CREDITS_PER_LULU} Credits</b></div>
        <div class="lulu-rate is-set"><span class="lulu-rate-n">${SET_SIZE} Lulus</span><b>${creditsFor(SET_SIZE).total} Credits</b><span class="lulu-rate-bonus">+${SET_BONUS} bonus</span></div>
      </div>
      <div class="lulu-empty-actions">
        ${getMenuHTML()}
        <button class="modal-btn modal-btn-solid lulu-connect-btn" data-lulu="connect">${walletIcon()} Connect wallet</button>
      </div>
      <p class="lulu-empty-note">Lulus in more than one wallet? Connect them all.</p>
    </div>`;
}

function pageHTML() {
  const total = allHeldIds().length;
  const chips = [
    `<button class="lulu-wallet-chip ${walletFilter === "all" ? "active" : ""}" data-lulu="filter" data-wallet="all">All wallets <span class="lulu-chip-n">${total}</span></button>`,
    ...state.wallets.map(
      (w) => `
        <span class="lulu-wallet-chip ${walletFilter === w.id ? "active" : ""}" data-lulu="filter" data-wallet="${w.id}" role="button" tabindex="0" title="${w.address}">
          <i class="lulu-wallet-dot" style="${walletDot(w.address)}"></i>${shortAddress(w.address)}
          <span class="lulu-chip-n">${w.lulus.length}</span>
          <button class="lulu-chip-x" data-lulu="disconnect" data-wallet="${w.id}" aria-label="Disconnect ${shortAddress(w.address)}" title="Disconnect">×</button>
        </span>`
    ),
    `<button class="lulu-wallet-add" data-lulu="connect">+ Connect wallet</button>`,
  ].join("");

  const list = visibleLulus();
  const grid = list.length
    ? list
        .map(
          ({ id, wallet }) => `
          <button class="lulu-tile" data-lulu-id="${id}" aria-pressed="false">
            <span class="lulu-tile-media"><img src="${luluImage(id)}" alt="Lulu #${id}" draggable="false"></span>
            <span class="lulu-tile-meta">
              <span class="lulu-tile-name">Lulu #${id}</span>
              ${state.wallets.length > 1 ? `<i class="lulu-wallet-dot" style="${walletDot(wallet.address)}" title="${shortAddress(wallet.address)}"></i>` : ""}
            </span>
            <span class="lulu-tile-check" aria-hidden="true"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12.5 10 17 19 7.5"/></svg></span>
          </button>`
        )
        .join("")
    : `<p class="lulu-grid-empty">No Lulus left in ${walletFilter === "all" ? "these wallets" : "this wallet"}. Connect another wallet to burn more.</p>`;

  // Notches on the slider at every full set, where the bonus lands.
  const n = list.length;
  const ticks = n
    ? Array.from({ length: Math.floor(n / SET_SIZE) }, (_, i) => {
        const at = (i + 1) * SET_SIZE;
        return at < n ? `<i class="lulu-range-tick" style="left: ${(at / n) * 100}%"></i>` : "";
      }).join("")
    : "";

  return `
    ${headHTML()}
    <div class="lulu-layout">
      <div class="lulu-main">
        <div class="lulu-wallets">${getMenuHTML()}<i class="lulu-wallets-sep" aria-hidden="true"></i>${chips}</div>
        <div class="lulu-selectbar" ${n ? "" : "hidden"}>
          <div class="lulu-selectbar-top">
            <span class="lulu-sel-count"><b id="luluSelCount">0</b> of ${n} selected</span>
            <span class="lulu-sel-actions">
              <button class="lulu-text-btn" data-lulu="all">Select all</button>
              <button class="lulu-text-btn" data-lulu="none">Clear</button>
            </span>
          </div>
          <div class="lulu-range">
            <div class="lulu-range-track" aria-hidden="true"><i class="lulu-range-fill"></i>${ticks}</div>
            <input type="range" id="luluRange" min="0" max="${n}" step="any" value="0" aria-label="Drag to select Lulus">
          </div>
        </div>
        <div class="lulu-grid" id="luluGrid">${grid}</div>
      </div>

      <!-- Phones: the panel sits under the grid, so the running total and
           the way to it ride along at the bottom while you pick. -->
      <button class="lulu-dock" id="luluDock" data-lulu="review" hidden></button>

      <aside class="lulu-panel" id="luluPanel">
        <h3 class="lulu-panel-title">Burn for Credits</h3>
        <div class="lulu-picked" id="luluPicked"></div>
        <div class="lulu-rows">
          <div class="lulu-row">
            <span class="lulu-row-label">Per Lulu<small>${CREDITS_PER_LULU} each</small></span>
            <span class="lulu-row-calc" id="luluBaseCalc"></span>
            <b class="lulu-row-val" id="luluBase">0</b>
          </div>
          <div class="lulu-row">
            <span class="lulu-row-label">Per set of ${SET_SIZE}<small>+${SET_BONUS} bonus each</small></span>
            <span class="lulu-row-calc" id="luluBonusCalc"></span>
            <b class="lulu-row-val" id="luluBonus">0</b>
          </div>
          <div class="lulu-set-meter" id="luluSetMeter"></div>
          <div class="lulu-total">
            <span>Total</span>
            <b><span id="luluTotal">0</span> <small>Credits</small></b>
          </div>
        </div>
        <p class="lulu-warn">${ICONS.flame}<span>Burning is permanent. Your Lulus are gone forever; the Credits are yours to spend on any drop.</span></p>
        <button class="deposit-btn lulu-burn-btn" id="luluBurnBtn" data-lulu="burn" disabled>Select Lulus to burn</button>
        <p class="lulu-fine">
          <span class="lulu-tip" tabindex="0" aria-describedby="luluTipText">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><line x1="12" y1="11" x2="12" y2="16.5"/><circle cx="12" cy="7.6" r="0.6" fill="currentColor"/></svg>
            <span class="lulu-tip-text" id="luluTipText" role="tooltip">A Mercurius can&rsquo;t be burned as it is. Reveal it first; only revealed Lulus burn for Credits.</span>
          </span>
          Mercurius must be revealed before burning.
        </p>
      </aside>
    </div>`;
}

function walletIcon() {
  return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4h-12A2.5 2.5 0 0 0 3 6.5v11A2.5 2.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/><path d="M21 9.5h-5a2.5 2.5 0 0 0 0 5h5z"/><circle cx="16.5" cy="12" r=".6" fill="currentColor"/></svg>`;
}

// Everything that follows the selection: the tiles, the slider, the panel.
function updateSummary({ keepRange = false } = {}) {
  if (!root || !state.wallets.length) return;
  const list = visibleLulus();
  root.querySelectorAll(".lulu-tile").forEach((t) => {
    const on = selected.has(Number(t.dataset.luluId));
    t.classList.toggle("selected", on);
    t.setAttribute("aria-pressed", on);
  });

  const visibleSelected = list.filter((l) => selected.has(l.id)).length;
  const range = root.querySelector("#luluRange");
  if (range && !keepRange) {
    cancelAnimationFrame(glideRaf);
    clearTimeout(glideTimer);
    range.value = visibleSelected;
    range.parentElement.style.setProperty("--p", list.length ? visibleSelected / list.length : 0);
  }
  const selCount = root.querySelector("#luluSelCount");
  if (selCount) selCount.textContent = visibleSelected;

  const c = creditsFor(selected.size);
  root.querySelector("#luluBaseCalc").textContent = c.count ? `${c.count} × ${CREDITS_PER_LULU}` : "";
  root.querySelector("#luluBonusCalc").textContent = c.sets ? `${c.sets} × ${SET_BONUS}` : "";
  root.querySelector("#luluBase").textContent = c.base.toLocaleString();
  root.querySelector("#luluBonus").textContent = c.bonus ? `+${c.bonus.toLocaleString()}` : "0";
  root.querySelector("#luluTotal").textContent = c.total.toLocaleString();

  // The set in progress: three pips, filled by how far into it you are,
  // and what one or two more would add.
  const into = selected.size % SET_SIZE;
  const meter = root.querySelector("#luluSetMeter");
  const full = selected.size > 0 && into === 0;
  const pips = Array.from({ length: SET_SIZE }, (_, i) => `<i class="${full || i < into ? "on" : ""}"></i>`).join("");
  const more = SET_SIZE - into;
  const left = allHeldIds().length - selected.size;
  let line;
  if (!selected.size) line = `Every ${SET_SIZE} Lulus add <b>+${SET_BONUS}</b>`;
  else if (full) line = `${c.sets > 1 ? `${c.sets} sets` : "Set"} complete <b>+${c.bonus}</b>`;
  else if (left >= more) line = `${more} more for another <b>+${SET_BONUS}</b>`;
  else line = `Not enough left for another set`;
  meter.innerHTML = `<span class="lulu-pips">${pips}</span><span>${line}</span>`;

  // The picked Lulus, as thumbnails: every full set of three collapses
  // into a stack (the two behind just showing past the front one's edge),
  // so the sets that earn the bonus read at a glance; the ones toward the
  // next set sit loose beside them. Only what's new animates in.
  const picked = allHeldIds().filter((id) => selected.has(id));
  const groups = [];
  for (let i = 0; i < picked.length; i += SET_SIZE) groups.push(picked.slice(i, i + SET_SIZE));
  const items = groups.flatMap((g) => (g.length === SET_SIZE ? [g] : g.map((id) => [id])));
  const MAX_ITEMS = 7;
  const shown = items.slice(0, MAX_ITEMS);
  const hiddenCount = items.slice(MAX_ITEMS).reduce((n, it) => n + it.length, 0);
  const keys = new Set();
  const thumb = (id, cls = "") => `<img class="${cls}" src="${luluImage(id)}" alt="Lulu #${id}" title="Lulu #${id}" draggable="false">`;
  root.querySelector("#luluPicked").innerHTML = picked.length
    ? shown
        .map((it) => {
          const key = it.join("-");
          keys.add(key);
          const isNew = !pickedKeys.has(key) ? " is-new" : "";
          if (it.length === 1) return thumb(it[0], `lulu-picked-one${isNew}`);
          const [front, mid, back] = it;
          return `<span class="lulu-stack${isNew}" title="Set of ${SET_SIZE} · +${SET_BONUS}">${thumb(back, "s2")}${thumb(mid, "s1")}${thumb(front, "s0")}</span>`;
        })
        .join("") + (hiddenCount ? `<span class="lulu-picked-more">+${hiddenCount}</span>` : "")
    : `<span class="lulu-picked-empty">Pick Lulus on the left, or drag the bar</span>`;
  pickedKeys = keys;

  const dock = root.querySelector("#luluDock");
  dock.hidden = !c.count || burning;
  dock.innerHTML = `<span><b>${c.count}</b> selected</span><span class="lulu-dock-total">${c.total.toLocaleString()} Credits</span><span class="lulu-dock-go">Burn ${ICONS.flame}</span>`;

  const btn = root.querySelector("#luluBurnBtn");
  btn.disabled = !c.count || burning;
  btn.innerHTML = burning
    ? `${ICONS.flame} Burning…`
    : c.count
      ? `${ICONS.flame} Burn ${c.count} to receive ${c.total.toLocaleString()} Credits`
      : "Select Lulus to burn";
}

// ---- Picking ---------------------------------------------------------------

// Pressing on a tile toggles it; with a mouse, keep holding and sweep over
// other tiles to set them the same way.
let paint = null; // "on" | "off" while a mouse sweep is in progress
let suppressClick = false;

function setSelected(id, on) {
  if (on) selected.add(id);
  else selected.delete(id);
}

function onPointerDown(e) {
  const tile = e.target.closest(".lulu-tile");
  if (!tile || burning || e.pointerType !== "mouse" || e.button !== 0) return;
  const id = Number(tile.dataset.luluId);
  paint = selected.has(id) ? "off" : "on";
  setSelected(id, paint === "on");
  playLuluTick(paint === "on", selected.size);
  suppressClick = true;
  updateSummary();
  e.preventDefault();
}

document.addEventListener("pointerover", (e) => {
  if (!paint) return;
  const tile = e.target.closest?.(".lulu-tile");
  if (!tile || !root?.contains(tile)) return;
  const id = Number(tile.dataset.luluId);
  if (selected.has(id) === (paint === "on")) return;
  setSelected(id, paint === "on");
  playLuluTick(paint === "on", selected.size);
  updateSummary();
});

// The bar runs freely under your finger: no notches to push through, and
// each Lulu is picked the moment the thumb passes the middle of its share
// of the bar. Let go and the thumb settles on the count you have.
let glideRaf = 0;
let glideTimer = 0;

function onInput(e) {
  if (e.target.id !== "luluRange" || burning) return;
  cancelAnimationFrame(glideRaf);
  clearTimeout(glideTimer);
  const range = e.target;
  const v = Number(range.value);
  const n = Math.round(v);
  const before = selected.size;
  visibleLulus().forEach((l, i) => setSelected(l.id, i < n));
  range.parentElement.style.setProperty("--p", Number(range.max) ? v / Number(range.max) : 0);
  if (selected.size !== before) playLuluTick(selected.size > before, selected.size);
  updateSummary({ keepRange: true });
}

function settleRange(range) {
  const from = Number(range.value);
  const to = Math.round(from);
  const max = Number(range.max) || 1;
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / 180);
    const v = from + (to - from) * (1 - (1 - k) ** 3);
    range.value = v;
    range.parentElement.style.setProperty("--p", v / max);
    if (k < 1) glideRaf = requestAnimationFrame(step);
  };
  glideRaf = requestAnimationFrame(step);
  // Frames can be throttled (a background tab); make sure it lands.
  clearTimeout(glideTimer);
  glideTimer = setTimeout(() => {
    if (Number(range.value) === to) return;
    cancelAnimationFrame(glideRaf);
    range.value = to;
    range.parentElement.style.setProperty("--p", to / max);
  }, 240);
}

function onClick(e) {
  if (burning) return;
  const tile = e.target.closest(".lulu-tile");
  if (tile) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const id = Number(tile.dataset.luluId);
    setSelected(id, !selected.has(id));
    playLuluTick(selected.has(id), selected.size);
    updateSummary();
    return;
  }
  const act = e.target.closest("[data-lulu]");
  if (!act) return;
  switch (act.dataset.lulu) {
    case "get": {
      const wrap = act.closest(".lulu-get");
      const open = !wrap.classList.contains("open");
      wrap.classList.toggle("open", open);
      act.setAttribute("aria-expanded", open);
      break;
    }
    case "connect":
      openConnect();
      break;
    case "disconnect": {
      e.stopPropagation();
      const w = state.wallets.find((x) => x.id === act.dataset.wallet);
      disconnectWallet(act.dataset.wallet);
      renderLulu();
      if (w) deps.showToast(`Disconnected ${shortAddress(w.address)}`, ICONS.bell);
      break;
    }
    case "filter":
      walletFilter = act.dataset.wallet;
      renderLulu();
      break;
    case "all":
      visibleLulus().forEach((l) => selected.add(l.id));
      updateSummary();
      break;
    case "none":
      visibleLulus().forEach((l) => selected.delete(l.id));
      updateSummary();
      break;
    case "burn":
      startBurn();
      break;
    case "review":
      root.querySelector("#luluPanel").scrollIntoView({ behavior: "smooth", block: "end" });
      break;
  }
}

function closeGetMenu() {
  root?.querySelectorAll(".lulu-get.open").forEach((w) => {
    w.classList.remove("open");
    w.querySelector(".lulu-get-btn").setAttribute("aria-expanded", "false");
  });
}

// ---- Connecting a wallet ---------------------------------------------------

let connectModal = null;

function openConnect() {
  if (!connectModal) {
    connectModal = document.createElement("div");
    connectModal.className = "prize-modal hidden lulu-connect-modal";
    connectModal.innerHTML = `
      <div class="prize-modal-card lulu-connect-card" role="dialog" aria-modal="true" aria-labelledby="luluConnectTitle">
        <h3 class="payment-modal-title" id="luluConnectTitle">Connect a wallet</h3>
        <p class="lulu-connect-sub">Connect each wallet your Lulus are in. You can add more after.</p>
        <div class="lulu-connect-list">
          ${WALLET_KINDS.map(
            (k) => `<button class="lulu-connect-opt" data-kind="${k.key}">
              <span class="lulu-connect-icon">${walletIcon()}</span>
              <span class="lulu-connect-name">${k.label}</span>
              <span class="lulu-connect-state"></span>
            </button>`
          ).join("")}
        </div>
        <p class="lulu-connect-note">Demo: wallets are simulated. Nothing is connected or signed.</p>
        <div class="prize-modal-actions">
          <button class="modal-btn modal-btn-outline" data-close>Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(connectModal);
    connectModal.addEventListener("click", (e) => {
      if (e.target === connectModal || e.target.closest("[data-close]")) return closeConnect();
      const opt = e.target.closest(".lulu-connect-opt");
      if (!opt || connectModal.classList.contains("connecting")) return;
      connectModal.classList.add("connecting");
      opt.classList.add("is-busy");
      opt.querySelector(".lulu-connect-state").textContent = "Connecting…";
      setTimeout(() => {
        const w = connectWallet(opt.dataset.kind);
        closeConnect();
        walletFilter = "all";
        renderLulu();
        deps.showToast(
          w.lulus.length
            ? `${shortAddress(w.address)} connected · ${w.lulus.length} Lulu${w.lulus.length > 1 ? "s" : ""} found`
            : `${shortAddress(w.address)} connected · no Lulus in it`,
          walletIcon()
        );
      }, 750);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && connectModal.classList.contains("visible")) closeConnect();
    });
  }
  connectModal.classList.remove("connecting");
  connectModal.querySelectorAll(".lulu-connect-opt").forEach((o) => {
    o.classList.remove("is-busy");
    o.querySelector(".lulu-connect-state").textContent = "";
  });
  connectModal.classList.remove("hidden");
  requestAnimationFrame(() => connectModal.classList.add("visible"));
}

function closeConnect() {
  connectModal.classList.remove("visible");
  setTimeout(() => connectModal.classList.add("hidden"), 250);
}

// ---- Burning -----------------------------------------------------------------

async function startBurn() {
  const ids = allHeldIds().filter((id) => selected.has(id));
  if (!ids.length || burning) return;
  burning = true;
  root.classList.add("is-burning");
  updateSummary();

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tiles = ids.map((id) => root.querySelector(`.lulu-tile[data-lulu-id="${id}"]`)).filter(Boolean);
  const step = Math.min(150, 1500 / Math.max(1, tiles.length));
  playBurnRoar(1.3 + (tiles.length - 1) * step / 1000);
  // A whoomph per Lulu as it catches, thinned out for big burns so they
  // don't pile into noise.
  const every = Math.max(1, Math.ceil(tiles.length / 8));
  tiles.forEach((_, i) => {
    if (i % every === 0) setTimeout(playLuluIgnite, reduce ? 0 : i * step);
  });
  await Promise.all(tiles.map((t, i) => (reduce ? fadeTile(t) : pixelBurn(t, i * step))));

  const c = creditsFor(ids.length);
  burn(ids);
  player.addCredits(c.total);
  player.logCreditEarned(c.total, "lulu");
  selected = new Set();
  burning = false;
  root.classList.remove("is-burning");
  renderLulu();
  deps.renderWallet({ pulse: "credits" });
  playCreditsAdded();
  deps.showToast(`${c.total.toLocaleString()} Credits were just added to your account`, ICONS.flame, 3600, { silent: true });
}

function fadeTile(tile) {
  tile.classList.add("is-burnt");
  return new Promise((r) => setTimeout(r, 300));
}

// The Lulu burns away in pixels: its picture cut into a grid of squares
// that catch from the bottom up with a ragged edge, each flaring white-hot
// to orange to red before it goes, while sparks lift off the line.
function pixelBurn(tile, delay) {
  return new Promise((resolve) => {
    const media = tile.querySelector(".lulu-tile-media");
    const img = media.querySelector("img");
    const w = media.clientWidth;
    const h = media.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const over = Math.round(h * 0.6); // room above the picture for the sparks

    const canvas = document.createElement("canvas");
    canvas.className = "lulu-burn-canvas";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round((h + over) * dpr);
    canvas.style.height = `${h + over}px`;
    canvas.style.top = `${-over}px`;
    media.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const N = 16; // squares across
    const cell = w / N;
    const rows = Math.ceil(h / cell);
    const thr = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < N; x++) {
        const fromBottom = (rows - 1 - y) / Math.max(1, rows - 1);
        const wobble = Math.sin(x * 0.9 + y * 0.3) * 0.06;
        thr.push(fromBottom * 0.72 + wobble + Math.random() * 0.22);
      }
    }
    const lit = new Uint8Array(thr.length);
    const sparks = [];
    const DUR = 1150;
    const EMBER = 0.11;
    let start = null;

    const ember = (k) => {
      // k: 0 just caught … 1 about to go
      if (k < 0.3) return `rgba(255, 244, 196, 1)`;
      if (k < 0.65) return `rgba(255, 150, 40, ${1 - (k - 0.3) * 0.6})`;
      return `rgba(214, 48, 28, ${0.8 - (k - 0.65) * 2})`;
    };

    const frame = (now) => {
      if (start == null) start = now;
      const t = now - start - delay;
      if (t < 0) return requestAnimationFrame(frame);
      if (t >= 0 && !tile.classList.contains("is-burning")) {
        tile.classList.add("is-burning");
        img.style.visibility = "hidden";
      }
      const p = (t / DUR) * (1 + EMBER + 0.25);
      ctx.clearRect(0, 0, w, h + over);

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < N; x++) {
          const i = y * N + x;
          const d = p - thr[i];
          const px = x * cell;
          const py = over + y * cell;
          if (d < 0) {
            // Still whole: its square of the picture.
            const sw = img.naturalWidth / N;
            const sh = (img.naturalHeight * cell) / h;
            ctx.drawImage(img, x * sw, y * sh, sw, sh, px, py, cell + 0.5, cell + 0.5);
          } else if (d < EMBER) {
            const k = d / EMBER;
            ctx.fillStyle = ember(k);
            const s = cell * (1 - k * 0.45);
            ctx.fillRect(px + (cell - s) / 2, py + (cell - s) / 2, s, s);
            if (!lit[i]) {
              lit[i] = 1;
              if (Math.random() < 0.35) {
                sparks.push({
                  x: px + cell / 2,
                  y: py + cell / 2,
                  vx: (Math.random() - 0.5) * 0.05,
                  vy: -(0.05 + Math.random() * 0.09),
                  born: t,
                  life: 450 + Math.random() * 500,
                  s: 1.5 + Math.random() * 2.5,
                });
              }
            }
          }
        }
      }

      for (let j = sparks.length - 1; j >= 0; j--) {
        const s = sparks[j];
        const age = t - s.born;
        if (age > s.life) {
          sparks.splice(j, 1);
          continue;
        }
        const a = 1 - age / s.life;
        ctx.fillStyle = a > 0.5 ? `rgba(255, 210, 120, ${a})` : `rgba(255, 110, 40, ${a})`;
        ctx.fillRect(s.x + s.vx * age, s.y + s.vy * age, s.s, s.s);
      }

      if (t < DUR || sparks.length) requestAnimationFrame(frame);
      else {
        tile.classList.add("is-burnt");
        setTimeout(resolve, 220);
      }
    };
    requestAnimationFrame(frame);
  });
}
