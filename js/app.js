import { createBoxViewer, getBoxSnapshot } from "./boxViewer.js";
import { PRIZE_POOL as HUNDRED_POOL, RARITY_META } from "./prizeData.js";
import { PRIZE_POOL as TWO_FIFTY_POOL } from "./prizeData250.js";
import { PRIZE_POOL as THOUSAND_POOL } from "./prizeData1000.js";
import { playRevealFX } from "./reveal.js";
import * as player from "./player.js";
import * as market from "./market.js";
import { playClick, playHover, playPop, playDing, toggleMuted, isMuted, startAmbient } from "./sound.js";
import { ICONS } from "./icons.js";

// ---- Prize configuration -------------------------------------------------
// Each category has a pool of possible prizes with relative weights. All
// three tiers run the exact same mechanics (reel, pity, reveal, wallet) —
// only the price point (and therefore the pool's price band) differs. Pools
// are scraped/generated — see js/prizeData*.js.

const CATEGORIES = {
  hundred: {
    label: "$100 Tier",
    description: "3 crates, one pull each. Odds are set by the pool below.",
    pool: HUNDRED_POOL,
  },
  twoFifty: {
    label: "$250 Tier",
    description: "Same odds, a step up in stock — 3 crates, one pull each.",
    pool: TWO_FIFTY_POOL,
  },
  thousand: {
    label: "$1000 Tier",
    description: "The grail tier. 3 crates, one pull each.",
    pool: THOUSAND_POOL,
  },
};

// Ascending — used for rank comparisons (near-misses, pity subpools, streaks).
const RARITY_RANK_ASC = ["common", "uncommon", "rare", "epic", "legendary"];
function rankOf(rarity) {
  return RARITY_RANK_ASC.indexOf(rarity);
}

// Descending — used only for sorting the "View Prizes" list, top prize first.
const DISPLAY_RARITY_ORDER = ["legendary", "epic", "rare", "uncommon", "common"];

// Full catalog across all tiers, used to seed simulated marketplace listings.
const ALL_CATALOG = [...HUNDRED_POOL, ...TWO_FIFTY_POOL, ...THOUSAND_POOL];

const HAPTIC_PATTERNS = {
  common: [15],
  uncommon: [18, 18, 18],
  rare: [22, 26, 22, 26],
  epic: [28, 36, 28, 36, 28],
  legendary: [36, 46, 36, 46, 36, 60, 140],
};

// ---- Reel configuration ---------------------------------------------------

const SLOT_COUNT = 3;
const TOTAL_CELLS = 18;
const REEL_DURATION_MS = 2400;
const REVEAL_STEP_MS = 950;
const MODAL_DELAY_MS = 650;

// Preload the snapshot as soon as the module loads so it's ready by the
// time the player picks a tier.
const boxSnapshotPromise = getBoxSnapshot();

// ---- State -----------------------------------------------------------

let currentCategoryKey = null;
let pendingCategoryKey = null; // tier the payment picker is currently showing for
let roundCurrency = null; // "credits" | "cash" — chosen before the current round
let boxPrizes = [];
let selectedIndex = null;
let roundLocked = false;
let viewers = [null, null, null];
let reelCellWidth = 0;
let toastTimer = null;

// ---- DOM refs -----------------------------------------------------------

const screenCategory = document.getElementById("screen-category");
const screenGame = document.getElementById("screen-game");
const categoryList = document.getElementById("categoryList");
const gameTierLabel = document.getElementById("gameTierLabel");
const backBtn = document.getElementById("backBtn");
const reel = document.getElementById("reel");
const reelTrack = document.getElementById("reelTrack");
const boxRow = document.getElementById("boxRow");
const slots = Array.from(document.querySelectorAll(".box-slot"));
const helperText = document.getElementById("helperText");
const playAgainBtn = document.getElementById("playAgainBtn");
const prizeModal = document.getElementById("prizeModal");
const revealFxEl = prizeModal.querySelector(".reveal-fx");
const revealBannerEl = prizeModal.querySelector(".reveal-rarity-banner span");
const streakBadge = document.getElementById("streakBadge");
const cashBackBtn = document.getElementById("cashBackBtn");
const keepBtn = document.getElementById("keepBtn");
const muteBtn = document.getElementById("muteBtn");
const ambientBg = document.getElementById("ambientBg");
const bestPullStat = document.getElementById("bestPullStat");
const recentPulls = document.getElementById("recentPulls");
const recentPullsList = document.getElementById("recentPullsList");
const payingWithBadge = document.getElementById("payingWithBadge");
const walletCredits = document.getElementById("walletCredits");
const walletCash = document.getElementById("walletCash");
const creditToast = document.getElementById("creditToast");
const creditToastIcon = document.getElementById("creditToastIcon");
const creditToastText = document.getElementById("creditToastText");
const paymentModal = document.getElementById("paymentModal");
const paymentTierLabel = document.getElementById("paymentTierLabel");
const payWithCredits = document.getElementById("payWithCredits");
const payWithCash = document.getElementById("payWithCash");
const payWithCreditsBalance = document.getElementById("payWithCreditsBalance");
const payWithCashBalance = document.getElementById("payWithCashBalance");
const paymentCancelBtn = document.getElementById("paymentCancelBtn");
const screenMarketplace = document.getElementById("screen-marketplace");
const screenAccount = document.getElementById("screen-account");
const marketGrid = document.getElementById("marketGrid");
const marketRarityFilter = document.getElementById("marketRarityFilter");
const marketSort = document.getElementById("marketSort");
const usernameBtn = document.getElementById("usernameBtn");
const incomingOffersList = document.getElementById("incomingOffersList");
const myListingsGrid = document.getElementById("myListingsGrid");
const inventoryGrid = document.getElementById("inventoryGrid");
const myOffersList = document.getElementById("myOffersList");
const listingModal = document.getElementById("listingModal");
const listingRarity = document.getElementById("listingRarity");
const listingImage = document.getElementById("listingImage");
const listingName = document.getElementById("listingName");
const listingPrice = document.getElementById("listingPrice");
const listingSeller = document.getElementById("listingSeller");
const listingActions = document.getElementById("listingActions");
const listingOfferBtn = document.getElementById("listingOfferBtn");
const listingBuyBtn = document.getElementById("listingBuyBtn");
const listingUnlistBtn = document.getElementById("listingUnlistBtn");
const listingOffersList = document.getElementById("listingOffersList");
const listingCloseBtn = document.getElementById("listingCloseBtn");
const amountModal = document.getElementById("amountModal");
const amountModalTitle = document.getElementById("amountModalTitle");
const amountModalHint = document.getElementById("amountModalHint");
const amountInput = document.getElementById("amountInput");
const amountCancelBtn = document.getElementById("amountCancelBtn");
const amountConfirmBtn = document.getElementById("amountConfirmBtn");

// ---- Helpers --------------------------------------------------------------

function weightedPick(pool) {
  const total = pool.reduce((sum, p) => sum + p.weight, 0);
  let roll = Math.random() * total;
  for (const prize of pool) {
    if (roll < prize.weight) return prize;
    roll -= prize.weight;
  }
  return pool[pool.length - 1];
}

function shuffledOthers(excludeIndex, n) {
  const arr = Array.from({ length: n }, (_, i) => i).filter((i) => i !== excludeIndex);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const allScreens = Array.from(document.querySelectorAll(".screen"));
function showScreen(el) {
  allScreens.forEach((s) => s.classList.remove("active"));
  el.classList.add("active");
}

function disposeViewers() {
  viewers.forEach((v) => v && v.dispose());
  viewers = [null, null, null];
}

function formatPrice(prize) {
  return `$${prize.price.toLocaleString()}`;
}

function vibrate(rarity) {
  try {
    if (navigator.vibrate) navigator.vibrate(HAPTIC_PATTERNS[rarity] ?? [15]);
  } catch {
    // unsupported — ignore
  }
}

// ---- Ambient background --------------------------------------------------

function buildAmbientParticles() {
  const count = 16;
  for (let i = 0; i < count; i++) {
    const dot = document.createElement("span");
    dot.className = "ambient-dot";
    dot.style.left = `${Math.random() * 100}%`;
    dot.style.setProperty("--size", `${2 + Math.random() * 4}px`);
    dot.style.setProperty("--o", `${0.08 + Math.random() * 0.18}`);
    dot.style.setProperty("--dur", `${18 + Math.random() * 22}s`);
    dot.style.setProperty("--delay", `${-Math.random() * 30}s`);
    dot.style.setProperty("--drift", `${Math.random() * 80 - 40}px`);
    ambientBg.appendChild(dot);
  }
}

// ---- Wallet: Credits + Cash (USDC) balances --------------------------

function renderWallet({ pulse } = {}) {
  const wallet = player.getWallet();
  walletCredits.textContent = wallet.credits.toLocaleString();
  walletCash.textContent = `$${wallet.cash.toLocaleString()}`;
  if (pulse) {
    const el = pulse === "cash" ? walletCash : walletCredits;
    el.classList.add("pulse");
    setTimeout(() => el.classList.remove("pulse"), 500);
  }
}

function showWalletToast(amount, currency) {
  clearTimeout(toastTimer);
  creditToastIcon.innerHTML = currency === "cash" ? ICONS.cash : ICONS.bell;
  creditToastText.textContent =
    currency === "cash" ? `+$${amount.toLocaleString()} Cash Added` : `+${amount.toLocaleString()} Credits Added`;
  creditToast.classList.remove("hidden");
  requestAnimationFrame(() => creditToast.classList.add("show"));
  playDing();
  toastTimer = setTimeout(() => {
    creditToast.classList.remove("show");
    setTimeout(() => creditToast.classList.add("hidden"), 300);
  }, 1800);
}

function updatePayingWithBadge() {
  if (!roundCurrency) {
    payingWithBadge.classList.add("hidden");
    return;
  }
  payingWithBadge.innerHTML =
    roundCurrency === "cash" ? `${ICONS.cash} Playing with Cash` : `${ICONS.card} Playing with Credits`;
  payingWithBadge.classList.remove("hidden");
}

// ---- Player bar (best pull) ------------------------------------------------

function renderPlayerBar() {
  const best = player.getBestPull();
  if (best) {
    const meta = RARITY_META[best.rarity];
    bestPullStat.classList.remove("hidden");
    bestPullStat.innerHTML = `<img src="${best.image}" alt=""> Best Pull: <b style="color:${meta.color}">${best.name}</b>`;
  } else {
    bestPullStat.classList.add("hidden");
  }
}

// ---- Recent pulls (the player's own history — not a fabricated feed) ------

function renderRecentPulls() {
  const history = player.getHistory();
  if (history.length === 0) {
    recentPulls.classList.add("hidden");
    return;
  }
  recentPulls.classList.remove("hidden");
  recentPullsList.innerHTML = history
    .map((p) => {
      const meta = RARITY_META[p.rarity];
      return `
        <div class="recent-pull-item" style="--rarity-color:${meta.color}">
          <img src="${p.image}" alt="">
          <span>${meta.label}</span>
        </div>`;
    })
    .join("");
}

// ---- Category screen -------------------------------------------------

function buildPrizeListHTML(pool) {
  const sorted = [...pool].sort((a, b) => {
    const rarityDiff = DISPLAY_RARITY_ORDER.indexOf(a.rarity) - DISPLAY_RARITY_ORDER.indexOf(b.rarity);
    return rarityDiff !== 0 ? rarityDiff : b.price - a.price;
  });
  return sorted
    .map((p) => {
      const meta = RARITY_META[p.rarity];
      return `
        <div class="prize-row">
          <img src="${p.image}" alt="" loading="lazy">
          <div class="prize-row-info">
            <span class="prize-row-name">${p.name}</span>
            <span class="prize-row-rarity" style="color:${meta.color}">${meta.label}</span>
          </div>
          <span class="prize-row-price">$${p.price.toLocaleString()}</span>
        </div>`;
    })
    .join("");
}

function buildPityHTML(tierKey) {
  const pity = player.getPity(tierKey);
  const pct = Math.round(((player.RARE_PITY_ROUNDS - pity.rareRoundsLeft) / player.RARE_PITY_ROUNDS) * 100);
  return `
    <div class="pity-bar">
      <span class="pity-bar-label">${pity.rareRoundsLeft} rounds to guaranteed Rare+</span>
      <div class="pity-bar-track"><div class="pity-bar-fill" style="width:${pct}%"></div></div>
    </div>`;
}

function renderCategories() {
  categoryList.innerHTML = "";

  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    const wrap = document.createElement("div");
    wrap.className = "category-wrap";

    const card = document.createElement("div");
    card.className = "category-card";
    card.innerHTML = `
      <h3>${cat.label}</h3>
      <p>${cat.description}</p>
      <span class="cta">Tap to begin</span>
      ${buildPityHTML(key)}
    `;
    card.addEventListener("click", () => {
      playClick();
      openPaymentPicker(key);
    });
    card.addEventListener("mouseenter", playHover);

    const prizePanel = document.createElement("div");
    prizePanel.className = "prize-dropdown";
    prizePanel.innerHTML = `
      <div class="prize-dropdown-header">Prizes</div>
      <div class="prize-list">${buildPrizeListHTML(cat.pool)}</div>
    `;

    wrap.appendChild(card);
    wrap.appendChild(prizePanel);
    categoryList.appendChild(wrap);
  });

  renderPlayerBar();
  renderRecentPulls();
  renderWallet();
}

// ---- Payment method picker ---------------------------------------------

function openPaymentPicker(key) {
  pendingCategoryKey = key;
  const cat = CATEGORIES[key];
  const wallet = player.getWallet();

  paymentTierLabel.textContent = cat.label;
  payWithCreditsBalance.textContent = `${wallet.credits.toLocaleString()} available`;
  payWithCashBalance.textContent = `$${wallet.cash.toLocaleString()} available`;

  paymentModal.classList.remove("hidden");
  requestAnimationFrame(() => paymentModal.classList.add("visible"));
}

function closePaymentPicker() {
  paymentModal.classList.remove("visible");
  setTimeout(() => paymentModal.classList.add("hidden"), 250);
}

payWithCredits.addEventListener("click", () => {
  playClick();
  const key = pendingCategoryKey;
  closePaymentPicker();
  startRound(key, "credits");
});
payWithCash.addEventListener("click", () => {
  playClick();
  const key = pendingCategoryKey;
  closePaymentPicker();
  startRound(key, "cash");
});
paymentCancelBtn.addEventListener("click", () => {
  playClick();
  closePaymentPicker();
});

// ---- Reel ------------------------------------------------------------

function buildReel(snapshotUrl) {
  // Match the cell width to the reel's actual rendered width so the landing
  // cells line up exactly with the 3 slot dividers, at any viewport size.
  reelCellWidth = reel.clientWidth / SLOT_COUNT;

  reelTrack.innerHTML = "";
  reelTrack.style.transition = "none";
  reelTrack.style.transform = "translateX(0)";
  reelTrack.classList.remove("spinning");
  for (let i = 0; i < TOTAL_CELLS; i++) {
    const cell = document.createElement("div");
    cell.className = "reel-cell";
    cell.style.width = `${reelCellWidth}px`;
    const img = document.createElement("img");
    img.src = snapshotUrl;
    img.alt = "";
    cell.appendChild(img);
    reelTrack.appendChild(cell);
  }
  // force reflow so the reset above is committed before we animate
  void reelTrack.offsetWidth;
}

function spinReel() {
  return new Promise((resolve) => {
    const finalX = -(reelCellWidth * (TOTAL_CELLS - SLOT_COUNT));
    reelTrack.classList.add("spinning");
    reelTrack.style.transition = `transform ${REEL_DURATION_MS}ms cubic-bezier(0.13, 0.86, 0.15, 1)`;
    reelTrack.style.transform = `translateX(${finalX}px)`;
    setTimeout(resolve, REEL_DURATION_MS + 80);
  });
}

// ---- Game screen -------------------------------------------------

function resetSlotsUI() {
  slots.forEach((slot) => {
    slot.classList.remove("open", "you", "locked", "near-miss");
    slot.querySelector(".price-card").style.removeProperty("--rarity-color");
    slot.querySelector(".price-card-rarity").textContent = "";
    slot.querySelector(".price-card-image").src = "";
    slot.querySelector(".price-card-name").textContent = "";
    slot.querySelector(".price-card-price").textContent = "";
    slot.querySelector(".box-caption").textContent = `Crate ${Number(slot.dataset.index) + 1}`;
    const tag = slot.querySelector(".near-miss-tag");
    tag.textContent = "";
    tag.classList.add("hidden");
  });
}

async function mountViewers() {
  const canvases = slots.map((s) => s.querySelector(".box-canvas"));
  const mounted = await Promise.all(canvases.map((c) => createBoxViewer(c)));
  mounted.forEach((viewer, i) => {
    viewers[i] = viewer;
    const slot = slots[i];
    slot.addEventListener("mouseenter", () => {
      if (!roundLocked) {
        viewer.setPaused(true);
        playHover();
      }
    });
    slot.addEventListener("mouseleave", () => {
      if (!roundLocked) viewer.setPaused(false);
    });
    slot.addEventListener("click", () => onPick(i));
  });
}

async function startRound(key, currency) {
  currentCategoryKey = key;
  roundCurrency = currency;
  const cat = CATEGORIES[key];

  boxPrizes = [weightedPick(cat.pool), weightedPick(cat.pool), weightedPick(cat.pool)];
  boxPrizes = player.applyPity(key, boxPrizes, cat.pool);
  selectedIndex = null;
  roundLocked = false;

  gameTierLabel.textContent = cat.label;
  updatePayingWithBadge();
  resetSlotsUI();
  disposeViewers();

  boxRow.classList.add("hidden");
  helperText.classList.add("hidden");
  playAgainBtn.classList.add("hidden");
  reel.classList.remove("hidden");

  showScreen(screenGame);

  const snapshotUrl = await boxSnapshotPromise;
  buildReel(snapshotUrl);
  await spinReel();

  reel.classList.add("hidden");
  boxRow.classList.remove("hidden");
  helperText.classList.remove("hidden");
  helperText.textContent = "Tap a crate to open it";

  await mountViewers();
}

function onPick(index) {
  if (roundLocked) return;
  roundLocked = true;
  selectedIndex = index;
  playPop();

  slots.forEach((slot, i) => {
    slot.classList.add("locked");
    if (viewers[i]) viewers[i].setPaused(true);
  });

  const prize = boxPrizes[index];
  const { streak } = player.recordPick(prize);
  renderPlayerBar();

  helperText.textContent = "Opening your crate…";
  // Lid opens now, but the box's own price card stays hidden — it reveals
  // in lockstep with the modal, once the fullscreen FX finishes, so the
  // prize is never shown before the reveal animation has played out.
  openSlot(index, { isYours: true, revealCard: false });

  setTimeout(async () => {
    await showPrizeModal(prize, { streak });
    slots[index].classList.add("open");
  }, MODAL_DELAY_MS);
}

function revealOthers() {
  const others = shuffledOthers(selectedIndex, SLOT_COUNT);
  const yourRank = rankOf(boxPrizes[selectedIndex].rarity);
  helperText.classList.remove("hidden");
  helperText.textContent = "Here's what you could have won…";

  others.forEach((otherIndex, step) => {
    setTimeout(() => {
      const otherPrize = boxPrizes[otherIndex];
      const isNearMiss = rankOf(otherPrize.rarity) > yourRank;
      openSlot(otherIndex, { isYours: false });

      if (isNearMiss) {
        const slot = slots[otherIndex];
        slot.classList.add("near-miss");
        const tag = slot.querySelector(".near-miss-tag");
        tag.textContent = `So close — that was ${RARITY_META[otherPrize.rarity].label}!`;
        tag.style.color = RARITY_META[otherPrize.rarity].color;
        tag.classList.remove("hidden");
        playPop();
      }

      if (step === others.length - 1) {
        setTimeout(() => {
          helperText.classList.add("hidden");
          playAgainBtn.classList.remove("hidden");
        }, 400);
      }
    }, REVEAL_STEP_MS * step);
  });
}

function openSlot(index, { isYours, revealCard = true }) {
  const slot = slots[index];
  const prize = boxPrizes[index];
  const meta = RARITY_META[prize.rarity];

  slot.querySelector(".price-card").style.setProperty("--rarity-color", meta.color);
  const rarityEl = slot.querySelector(".price-card-rarity");
  rarityEl.textContent = meta.label;
  rarityEl.style.color = meta.color;

  const imgEl = slot.querySelector(".price-card-image");
  imgEl.src = prize.image;
  imgEl.alt = prize.name;

  slot.querySelector(".price-card-name").textContent = prize.name;
  slot.querySelector(".price-card-price").textContent = formatPrice(prize);
  slot.querySelector(".box-caption").textContent = isYours ? "Your Crate" : "Unpicked";
  slot.classList.toggle("you", isYours);
  if (revealCard) slot.classList.add("open");
  if (viewers[index]) viewers[index].open();
}

// ---- Won-prize modal -------------------------------------------------
// Only ever called for the crate the player picked — the "what you could
// have won" crates just use the plain openSlot() card, no reveal FX.

async function showPrizeModal(prize, { streak } = {}) {
  const meta = RARITY_META[prize.rarity];
  prizeModal.querySelector(".prize-modal-card").style.setProperty("--rarity-color", meta.color);
  revealFxEl.style.setProperty("--rarity-color", meta.color);

  const rarityEl = prizeModal.querySelector(".prize-modal-rarity");
  rarityEl.textContent = meta.label;
  rarityEl.style.color = meta.color;
  rarityEl.style.borderColor = meta.color;

  revealBannerEl.textContent = meta.label;

  const imgEl = prizeModal.querySelector(".prize-modal-image");
  imgEl.src = prize.image;
  imgEl.alt = prize.name;

  prizeModal.querySelector(".prize-modal-name").textContent = prize.name;
  prizeModal.querySelector(".prize-modal-price").textContent = formatPrice(prize);

  cashBackBtn.textContent = roundCurrency === "cash" ? "Cash Back ($)" : "Cash Back (Credits)";

  if (streak >= 2) {
    streakBadge.innerHTML = `${ICONS.flame} ${streak} Rare+ in a row!`;
    streakBadge.classList.remove("hidden");
  } else {
    streakBadge.classList.add("hidden");
  }

  // The whole card — image, name, price — stays hidden behind the
  // fullscreen vortex/particle reveal until it finishes, so the prize is
  // never shown before the reveal animation has played out.
  prizeModal.classList.add("revealing");
  prizeModal.classList.remove("hidden");
  requestAnimationFrame(() => prizeModal.classList.add("visible"));

  vibrate(prize.rarity);

  await playRevealFX(revealFxEl, prize.rarity, meta.color);

  prizeModal.classList.remove("revealing");
}

function hidePrizeModal() {
  prizeModal.classList.remove("visible", "revealing");
  setTimeout(() => {
    prizeModal.classList.add("hidden");
    revealFxEl.innerHTML = "";
  }, 300);
}

// ---- Wire up events -----------------------------------------------------

cashBackBtn.addEventListener("click", () => {
  const prize = boxPrizes[selectedIndex];
  if (!prize) return;
  playClick();
  player.cashBack(prize.price, roundCurrency);
  renderWallet({ pulse: roundCurrency });
  showWalletToast(prize.price, roundCurrency);
  hidePrizeModal();
  revealOthers();
});
keepBtn.addEventListener("click", () => {
  const prize = boxPrizes[selectedIndex];
  if (!prize) return;
  playClick();
  player.addToInventory(prize);
  hidePrizeModal();
  revealOthers();
});

playAgainBtn.addEventListener("click", () => {
  playClick();
  openPaymentPicker(currentCategoryKey);
});
backBtn.addEventListener("click", () => {
  playClick();
  disposeViewers();
  showScreen(screenCategory);
  renderCategories(); // refresh pity/wallet/best-pull/recent-pulls
});

function refreshMuteBtn() {
  muteBtn.classList.toggle("muted", isMuted());
}
muteBtn.addEventListener("click", () => {
  toggleMuted();
  refreshMuteBtn();
});
refreshMuteBtn();

// ---- Nav tabs (Boxes / Marketplace / Account) -----------------------------

const navTabs = Array.from(document.querySelectorAll(".nav-tab"));
navTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    playClick();
    navTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = document.getElementById(tab.dataset.nav);
    showScreen(target);
    if (tab.dataset.nav === "screen-marketplace") renderMarketplace();
    if (tab.dataset.nav === "screen-account") renderAccount();
    if (tab.dataset.nav === "screen-category") renderCategories();
  });
});

// ---- Generic amount prompt (list price / offer / counter-offer) ----------

let amountResolver = null;
function promptAmount(title, hint, defaultValue) {
  amountModalTitle.textContent = title;
  amountModalHint.textContent = hint;
  amountInput.value = defaultValue ?? "";
  amountModal.classList.remove("hidden");
  requestAnimationFrame(() => amountModal.classList.add("visible"));
  setTimeout(() => amountInput.focus(), 50);
  return new Promise((resolve) => {
    amountResolver = resolve;
  });
}
function closeAmountModal(result) {
  amountModal.classList.remove("visible");
  setTimeout(() => amountModal.classList.add("hidden"), 250);
  if (amountResolver) {
    amountResolver(result);
    amountResolver = null;
  }
}
amountConfirmBtn.addEventListener("click", () => {
  const value = Math.round(Number(amountInput.value));
  if (!value || value <= 0) return;
  playClick();
  closeAmountModal(value);
});
amountCancelBtn.addEventListener("click", () => {
  playClick();
  closeAmountModal(null);
});
amountInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") amountConfirmBtn.click();
});

// ---- Shared: rendering a market item card ---------------------------------

function marketItemCardHTML(listing) {
  const meta = RARITY_META[listing.rarity];
  return `
    <div class="market-item" data-listing="${listing.id}" style="--rarity-color:${meta.color}">
      <img src="${listing.image}" alt="">
      <span class="market-item-rarity" style="color:${meta.color}">${meta.label}</span>
      <span class="market-item-name">${listing.name}</span>
      <span class="market-item-price">$${listing.price.toLocaleString()}</span>
      <span class="market-item-seller ${listing.isPlayer ? "you" : ""}">${listing.isPlayer ? "You" : listing.seller}</span>
    </div>`;
}

function offerRowHTML(offer, { showActions } = {}) {
  const listing = market.getListing(offer.listingId);
  const otherParty = offer.fromIsPlayer ? offer.toUsername : offer.fromUsername;
  const verb = offer.fromIsPlayer ? "to" : "from";
  let actions = "";
  if (showActions === "incoming") {
    actions = `
      <div class="offer-actions">
        <button class="offer-btn accept" data-offer-action="accept" data-offer="${offer.id}">Accept</button>
        <button class="offer-btn" data-offer-action="counter" data-offer="${offer.id}">Counter</button>
        <button class="offer-btn decline" data-offer-action="decline" data-offer="${offer.id}">Decline</button>
      </div>`;
  } else if (showActions === "counter-received") {
    actions = `
      <div class="offer-actions">
        <button class="offer-btn accept" data-offer-action="accept-counter" data-offer="${offer.id}">Accept $${offer.counterAmount}</button>
        <button class="offer-btn decline" data-offer-action="decline" data-offer="${offer.id}">Decline</button>
      </div>`;
  } else {
    actions = `<span class="offer-status ${offer.status}">${offer.status}</span>`;
  }
  return `
    <div class="offer-row">
      <img src="${listing ? listing.image : ""}" alt="">
      <div class="offer-row-info">
        <b>${listing ? listing.name : "Item"}</b><br>
        Offer ${verb} <b>${otherParty}</b>
      </div>
      <span class="offer-row-amount">$${offer.amount.toLocaleString()}</span>
      ${actions}
    </div>`;
}

// ---- Marketplace screen ---------------------------------------------------

let marketRarityValue = "all";

function renderMarketplace() {
  market.ensureSeeded(ALL_CATALOG);

  if (marketRarityFilter.children.length === 0) {
    const chips = ["all", ...DISPLAY_RARITY_ORDER.slice().reverse()];
    marketRarityFilter.innerHTML = chips
      .map((r) => `<button class="market-chip${r === "all" ? " active" : ""}" data-rarity="${r}">${r === "all" ? "All" : RARITY_META[r].label}</button>`)
      .join("");
    marketRarityFilter.querySelectorAll(".market-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        playClick();
        marketRarityValue = chip.dataset.rarity;
        marketRarityFilter.querySelectorAll(".market-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        if (marketRarityValue !== "all") {
          chip.style.color = "#000";
          chip.style.background = RARITY_META[marketRarityValue].color;
        }
        marketRarityFilter.querySelectorAll(".market-chip").forEach((c) => {
          if (c !== chip) {
            c.style.color = "";
            c.style.background = "";
          }
        });
        renderMarketGrid();
      });
    });
  }

  renderMarketGrid();
}

function renderMarketGrid() {
  let listings = market.getListings();
  if (marketRarityValue !== "all") listings = listings.filter((l) => l.rarity === marketRarityValue);

  const sort = marketSort.value;
  listings = [...listings].sort((a, b) => {
    if (sort === "price-asc") return a.price - b.price;
    if (sort === "price-desc") return b.price - a.price;
    return b.ts - a.ts;
  });

  marketGrid.innerHTML = listings.length
    ? listings.map(marketItemCardHTML).join("")
    : `<div class="market-empty">No listings yet.</div>`;

  marketGrid.querySelectorAll(".market-item").forEach((el) => {
    el.addEventListener("click", () => openListingModal(el.dataset.listing));
  });
}
marketSort.addEventListener("change", renderMarketGrid);

// ---- Listing detail modal --------------------------------------------

let openListingId = null;

function openListingModal(id) {
  const listing = market.getListing(id);
  if (!listing) return;
  openListingId = listing.id;
  const meta = RARITY_META[listing.rarity];

  listingModal.querySelector(".prize-modal-card").style.setProperty("--rarity-color", meta.color);
  listingRarity.textContent = meta.label;
  listingRarity.style.color = meta.color;
  listingRarity.style.borderColor = meta.color;
  listingImage.src = listing.image;
  listingImage.alt = listing.name;
  listingName.textContent = listing.name;
  listingPrice.textContent = `$${listing.price.toLocaleString()}`;
  listingSeller.innerHTML = listing.isPlayer ? "Listed by <b>you</b>" : `Listed by <b>${listing.seller}</b>`;

  listingActions.classList.toggle("hidden", listing.isPlayer);
  listingUnlistBtn.classList.toggle("hidden", !listing.isPlayer);

  renderListingOffers(listing.id);

  listingModal.classList.remove("hidden");
  requestAnimationFrame(() => listingModal.classList.add("visible"));
}

function renderListingOffers(listingId) {
  const offers = market.getOffersForListing(listingId);
  listingOffersList.innerHTML = offers.length
    ? offers.map((o) => offerRowHTML(o)).join("")
    : `<div class="offers-empty">No offers yet.</div>`;
}

function closeListingModal() {
  listingModal.classList.remove("visible");
  setTimeout(() => listingModal.classList.add("hidden"), 250);
  openListingId = null;
}
listingCloseBtn.addEventListener("click", () => {
  playClick();
  closeListingModal();
});

listingBuyBtn.addEventListener("click", () => {
  const listing = market.getListing(openListingId);
  if (!listing) return;
  if (!player.spendCash(listing.price)) {
    alert("Not enough Cash for this purchase.");
    return;
  }
  playClick();
  player.addToInventory({ name: listing.name, rarity: listing.rarity, price: listing.catalogPrice, image: listing.image });
  market.removeListing(listing.id);
  renderWallet({ pulse: "cash" });
  closeListingModal();
  renderMarketGrid();
});

listingOfferBtn.addEventListener("click", async () => {
  const listing = market.getListing(openListingId);
  if (!listing) return;
  const amount = await promptAmount("Make an Offer", `${listing.name} is listed at $${listing.price.toLocaleString()}.`, Math.round(listing.price * 0.8));
  if (!amount) return;

  const offer = market.makeOffer({
    listingId: listing.id,
    amount,
    fromUsername: player.getUsername(),
    fromIsPlayer: true,
    toUsername: listing.seller,
    toIsPlayer: false,
  });
  renderListingOffers(listing.id);

  setTimeout(() => resolveBotOnMyOffer(offer.id), 1100);
});

listingUnlistBtn.addEventListener("click", () => {
  const listing = market.getListing(openListingId);
  if (!listing) return;
  playClick();
  if (listing.itemId) player.markUnlisted(listing.itemId);
  market.removeListing(listing.id);
  closeListingModal();
  renderMarketGrid();
});

// A player's offer on a bot's listing resolves via the same transparent
// rule the bot uses for offers on the player's own listings.
function resolveBotOnMyOffer(offerId) {
  const offer = market.getOffer(offerId);
  if (!offer) return;
  const listing = market.getListing(offer.listingId);
  if (!listing) return;
  const decision = market.botDecision(offer.amount, listing.price);
  if (decision.status === "accepted") {
    if (player.spendCash(offer.amount)) {
      player.addToInventory({ name: listing.name, rarity: listing.rarity, price: listing.catalogPrice, image: listing.image });
      market.removeListing(listing.id);
      market.updateOffer(offerId, { status: "accepted" });
      renderWallet({ pulse: "cash" });
    } else {
      market.updateOffer(offerId, { status: "declined" });
    }
  } else {
    market.updateOffer(offerId, decision);
  }
  if (openListingId === offer.listingId) renderListingOffers(offer.listingId);
  renderMarketGrid();
  if (screenAccount.classList.contains("active")) renderAccount();
}

// ---- Account screen ---------------------------------------------------

usernameBtn.addEventListener("click", async () => {
  const name = prompt("Choose a username", player.getUsername());
  if (name) {
    player.setUsername(name);
    usernameBtn.textContent = player.getUsername();
  }
});

function renderAccount() {
  usernameBtn.textContent = player.getUsername();

  market.maybeSpawnIncomingOffer();

  const incoming = market.getIncomingOffers();
  incomingOffersList.innerHTML = incoming.length
    ? incoming.map((o) => offerRowHTML(o, { showActions: "incoming" })).join("")
    : `<div class="offers-empty">No incoming offers right now.</div>`;

  const myListings = market.getListings().filter((l) => l.isPlayer);
  myListingsGrid.innerHTML = myListings.length
    ? myListings.map(marketItemCardHTML).join("")
    : `<div class="market-empty">You haven't listed anything yet.</div>`;
  myListingsGrid.querySelectorAll(".market-item").forEach((el) => {
    el.addEventListener("click", () => openListingModal(el.dataset.listing));
  });

  const inventory = player.getInventory().filter((i) => !i.listingId);
  inventoryGrid.innerHTML = inventory.length
    ? inventory
        .map((item) => {
          const meta = RARITY_META[item.rarity];
          return `
            <div class="market-item" style="--rarity-color:${meta.color}">
              <img src="${item.image}" alt="">
              <span class="market-item-rarity" style="color:${meta.color}">${meta.label}</span>
              <span class="market-item-name">${item.name}</span>
              <span class="market-item-price">$${item.price.toLocaleString()}</span>
              <button class="market-item-list-btn" data-item="${item.id}">List for Sale</button>
            </div>`;
        })
        .join("")
    : `<div class="market-empty">Keep a prize from a crate reveal to see it here.</div>`;
  inventoryGrid.querySelectorAll(".market-item-list-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const item = player.getInventoryItem(btn.dataset.item);
      if (!item) return;
      const price = await promptAmount("List for Sale", `${item.name} — catalog value $${item.price.toLocaleString()}.`, item.price);
      if (!price) return;
      const listing = market.createListing({ item, price, seller: player.getUsername() });
      player.markListed(item.id, listing.id);
      renderAccount();
    });
  });

  const myOffers = market.getMyOffers();
  myOffersList.innerHTML = myOffers.length
    ? myOffers.map((o) => offerRowHTML(o, { showActions: o.status === "countered" ? "counter-received" : null })).join("")
    : `<div class="offers-empty">You haven't made any offers yet.</div>`;
}

// Delegated handling for offer action buttons (incoming offers + countered
// offers I sent) since both lists re-render often.
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-offer-action]");
  if (!btn) return;
  playClick();
  const action = btn.dataset.offerAction;
  const offer = market.getOffer(btn.dataset.offer);
  if (!offer) return;
  const listing = market.getListing(offer.listingId);

  if (action === "accept") {
    if (listing) {
      player.addCash(offer.amount);
      if (listing.itemId) player.removeFromInventory(listing.itemId);
      market.removeListing(listing.id);
    }
    market.updateOffer(offer.id, { status: "accepted" });
    renderWallet({ pulse: "cash" });
    renderAccount();
  } else if (action === "decline") {
    market.updateOffer(offer.id, { status: "declined" });
    renderAccount();
  } else if (action === "accept-counter") {
    if (player.spendCash(offer.counterAmount) && listing) {
      player.addToInventory({ name: listing.name, rarity: listing.rarity, price: listing.catalogPrice, image: listing.image });
      market.removeListing(listing.id);
      market.updateOffer(offer.id, { status: "accepted" });
      renderWallet({ pulse: "cash" });
    }
    renderAccount();
  } else if (action === "counter") {
    promptAmount("Counter Offer", `${offer.fromUsername} offered $${offer.amount.toLocaleString()}.`, offer.amount).then((amount) => {
      if (!amount || !listing) return;
      market.updateOffer(offer.id, { status: "countered", counterAmount: amount });
      renderAccount();
      // The bot who sent the original offer decides on your counter.
      setTimeout(() => {
        const decision = amount <= offer.amount * 1.25 ? "accepted" : "declined";
        if (decision === "accepted") {
          player.addCash(amount);
          if (listing.itemId) player.removeFromInventory(listing.itemId);
          market.removeListing(listing.id);
        }
        market.updateOffer(offer.id, { status: decision });
        renderWallet({ pulse: "cash" });
        renderAccount();
      }, 1300);
    });
  }
});

// Autoplay policies require a user gesture before any audio can start.
function onFirstGesture() {
  startAmbient();
  document.removeEventListener("pointerdown", onFirstGesture);
}
document.addEventListener("pointerdown", onFirstGesture);

buildAmbientParticles();
renderCategories();
