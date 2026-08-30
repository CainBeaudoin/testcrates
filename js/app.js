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
// Each tier runs identical mechanics (reel, pity, reveal, wallet) — only
// the price point (and therefore the pool's price band) differs. Opening a
// crate costs its tier price, paid from whichever balance you choose.

const CATEGORIES = {
  hundred: {
    label: "$100",
    badge: "Bronze",
    price: 100,
    pool: HUNDRED_POOL,
  },
  twoFifty: {
    label: "$250",
    badge: "Silver",
    price: 250,
    pool: TWO_FIFTY_POOL,
  },
  thousand: {
    label: "$1000",
    badge: "Gold",
    price: 1000,
    pool: THOUSAND_POOL,
  },
};

const RARITY_RANK_ASC = ["common", "uncommon", "rare", "epic", "legendary"];
function rankOf(rarity) {
  return RARITY_RANK_ASC.indexOf(rarity);
}
const DISPLAY_RARITY_ORDER = ["legendary", "epic", "rare", "uncommon", "common"];

// Full catalog across all tiers, used to seed simulated marketplace listings.
const ALL_CATALOG = [...HUNDRED_POOL, ...TWO_FIFTY_POOL, ...THOUSAND_POOL];

// Simulated leaderboard cast — static seed XP, the player's own row is
// inserted alongside these at render time. Not live multiplayer data.
const FAKE_LEADERS = [
  { username: "VaultKid", xp: 48200 },
  { username: "CrateDigger", xp: 36500 },
  { username: "GrailChaser22", xp: 29800 },
  { username: "NorthStarTrades", xp: 21100 },
  { username: "HeatCheckHQ", xp: 15600 },
  { username: "OrbitLace", xp: 9700 },
  { username: "ReplayDrops", xp: 4200 },
];

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

const boxSnapshotPromise = getBoxSnapshot();

// ---- State -----------------------------------------------------------

let currentCategoryKey = null;
let pendingCategoryKey = null;
let roundCurrency = null; // "credits" | "cash"
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
const multiplierBadge = document.getElementById("multiplierBadge");
const cashOutBtn = document.getElementById("cashOutBtn");
const cashOutSub = document.getElementById("cashOutSub");
const vaultKeepBtn = document.getElementById("vaultKeepBtn");
const muteBtn = document.getElementById("muteBtn");
const ambientBg = document.getElementById("ambientBg");
const recentPulls = document.getElementById("recentPulls");
const recentPullsList = document.getElementById("recentPullsList");
const payingWithBadge = document.getElementById("payingWithBadge");
const walletCredits = document.getElementById("walletCredits");
const walletCash = document.getElementById("walletCash");
const addFundsBtn = document.getElementById("addFundsBtn");
const creditToast = document.getElementById("creditToast");
const creditToastIcon = document.getElementById("creditToastIcon");
const creditToastText = document.getElementById("creditToastText");
const paymentModal = document.getElementById("paymentModal");
const paymentTierLabel = document.getElementById("paymentTierLabel");
const paymentError = document.getElementById("paymentError");
const payWithCredits = document.getElementById("payWithCredits");
const payWithCash = document.getElementById("payWithCash");
const payWithCreditsBalance = document.getElementById("payWithCreditsBalance");
const payWithCashBalance = document.getElementById("payWithCashBalance");
const paymentCancelBtn = document.getElementById("paymentCancelBtn");
const screenAccount = document.getElementById("screen-account");
const marketGrid = document.getElementById("marketGrid");
const marketCount = document.getElementById("marketCount");
const marketBrandFilter = document.getElementById("marketBrandFilter");
const marketFmvFilter = document.getElementById("marketFmvFilter");
const marketListedOnly = document.getElementById("marketListedOnly");
const marketPriceMin = document.getElementById("marketPriceMin");
const marketPriceMax = document.getElementById("marketPriceMax");
const marketSort = document.getElementById("marketSort");
const usernameBtn = document.getElementById("usernameBtn");
const accountAvatar = document.getElementById("accountAvatar");
const referralLinkBtn = document.getElementById("referralLinkBtn");
const sideCredits = document.getElementById("sideCredits");
const sideCash = document.getElementById("sideCash");
const sideXp = document.getElementById("sideXp");
const sideVolume = document.getElementById("sideVolume");
const accountNavItems = Array.from(document.querySelectorAll(".account-nav-item"));
const accountSections = Array.from(document.querySelectorAll(".account-section"));
const vaultCount = document.getElementById("vaultCount");
const listingsCount = document.getElementById("listingsCount");
const incomingOffersList = document.getElementById("incomingOffersList");
const myListingsGrid = document.getElementById("myListingsGrid");
const inventoryGrid = document.getElementById("inventoryGrid");
const myOffersList = document.getElementById("myOffersList");
const openingsFilter = document.getElementById("openingsFilter");
const openingsList = document.getElementById("openingsList");
const shippedList = document.getElementById("shippedList");
const leaderboardList = document.getElementById("leaderboardList");
const referralPanel = document.getElementById("referralPanel");
const streakDaysValue = document.getElementById("streakDaysValue");
const streakGoalInline = document.getElementById("streakGoalInline");
const streakRaffleBadge = document.getElementById("streakRaffleBadge");
const streakRafflePrize = document.getElementById("streakRafflePrize");
const streakMonthLabel = document.getElementById("streakMonthLabel");
const streakCalendar = document.getElementById("streakCalendar");
const topAvatar = document.getElementById("topAvatar");
const topUsername = document.getElementById("topUsername");
const avatarBtn = document.getElementById("avatarBtn");
const notifBtn = document.getElementById("notifBtn");
const notifBadge = document.getElementById("notifBadge");
const streakRing = document.getElementById("streakRing");
const streakValue = document.getElementById("streakValue");
const referralRing = document.getElementById("referralRing");
const referralValue = document.getElementById("referralValue");
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
const pullDetailModal = document.getElementById("pullDetailModal");
const pullDetailRarity = document.getElementById("pullDetailRarity");
const pullDetailImage = document.getElementById("pullDetailImage");
const pullDetailName = document.getElementById("pullDetailName");
const pullDetailPrice = document.getElementById("pullDetailPrice");
const pullDetailTierBadge = document.getElementById("pullDetailTierBadge");
const pullDetailUser = document.getElementById("pullDetailUser");
const pullDetailGoBtn = document.getElementById("pullDetailGoBtn");
const pullDetailCloseBtn = document.getElementById("pullDetailCloseBtn");
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

function fmt(n) {
  return `$${Math.round(n).toLocaleString()}`;
}

function vibrate(rarity) {
  try {
    if (navigator.vibrate) navigator.vibrate(HAPTIC_PATTERNS[rarity] ?? [15]);
  } catch {
    // unsupported — ignore
  }
}

// Every item you own (kept, or bought outright) auto-populates the
// marketplace as an unlisted, offer-only entry — the "auto-population"
// rule from the scope. Listing later just raises the price on this same
// entry (see setListingPrice), it never creates a second one.
function addOwnedItem(prize) {
  const item = player.addToInventory(prize);
  const listing = market.createListing({ item, price: null, seller: player.getUsername() });
  player.markListed(item.id, listing.id);
  return item;
}

function releaseOwnedItem(item) {
  if (item.listingId) market.removeListing(item.listingId);
  player.removeFromInventory(item.id);
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
  renderHeaderStats();
}

function showToast(text, iconSvg) {
  clearTimeout(toastTimer);
  creditToastIcon.innerHTML = iconSvg;
  creditToastText.textContent = text;
  creditToast.classList.remove("hidden");
  requestAnimationFrame(() => creditToast.classList.add("show"));
  playDing();
  toastTimer = setTimeout(() => {
    creditToast.classList.remove("show");
    setTimeout(() => creditToast.classList.add("hidden"), 300);
  }, 1800);
}

function showWalletToast(amount, currency) {
  const text = currency === "cash" ? `+$${amount.toLocaleString()} Cash Added` : `+${amount.toLocaleString()} Credits Added`;
  showToast(text, currency === "cash" ? ICONS.cash : ICONS.bell);
}

addFundsBtn.addEventListener("click", async () => {
  playClick();
  const amount = await promptAmount("Add Demo Funds", "A local top-up for testing — not a real deposit.", 500);
  if (!amount) return;
  player.addDemoFunds(amount);
  renderWallet({ pulse: "cash" });
  showWalletToast(amount, "cash");
});

function updatePayingWithBadge() {
  if (!roundCurrency) {
    payingWithBadge.classList.add("hidden");
    return;
  }
  payingWithBadge.innerHTML =
    roundCurrency === "cash" ? `${ICONS.cash} Playing with Cash` : `${ICONS.card} Playing with Credits`;
  payingWithBadge.classList.remove("hidden");
}

// A live-feed illusion of what's being pulled platform-wide, same pattern
// as the simulated marketplace sellers and leaderboard: a fixed cast of
// fake usernames pulling real catalog items. Seeded with a backlog at
// startup, then ticks forward with a fresh pull every few seconds so the
// feed feels alive, blended with the player's own real history by ts.
const SIMULATED_PULLS_CAP = 40;
let simulatedPulls = [];

function generateSimulatedPull(ts) {
  const tierKeys = Object.keys(CATEGORIES);
  const tierKey = tierKeys[Math.floor(Math.random() * tierKeys.length)];
  const cat = CATEGORIES[tierKey];
  const prize = weightedPick(cat.pool);
  return {
    name: prize.name,
    rarity: prize.rarity,
    price: prize.price,
    image: prize.image,
    tierKey,
    username: market.FAKE_USERNAMES[Math.floor(Math.random() * market.FAKE_USERNAMES.length)],
    isPlayer: false,
    ts,
  };
}

function seedSimulatedPulls() {
  const now = Date.now();
  simulatedPulls = Array.from({ length: 14 }, () => generateSimulatedPull(now - Math.floor(Math.random() * 90 * 60 * 1000)));
}

function tickSimulatedPulls() {
  simulatedPulls.unshift(generateSimulatedPull(Date.now()));
  simulatedPulls = simulatedPulls.slice(0, SIMULATED_PULLS_CAP);
  if (screenCategory.classList.contains("active")) renderRecentPulls();
}

function renderRecentPulls() {
  const mine = player.getHistory().map((p) => ({ ...p, username: player.getUsername(), isPlayer: true }));
  const feed = [...mine, ...simulatedPulls].sort((a, b) => b.ts - a.ts).slice(0, 16);

  if (feed.length === 0) {
    recentPulls.classList.add("hidden");
    return;
  }
  recentPulls.classList.remove("hidden");
  recentPullsList.innerHTML = feed
    .map((p, i) => {
      const tierKey = p.tierKey ?? "hundred";
      const badge = CATEGORIES[tierKey]?.badge ?? "Bronze";
      return `
        <div class="recent-pull-item" data-pull-index="${i}">
          <img src="${p.image}" alt="">
          <span class="recent-pull-price">$${p.price.toLocaleString()}</span>
          <span class="tier-badge tier-badge-${badge.toLowerCase()}">${badge}</span>
          <span class="recent-pull-user ${p.isPlayer ? "you" : ""}">${p.isPlayer ? "You" : p.username}</span>
        </div>`;
    })
    .join("");

  recentPullsList.querySelectorAll(".recent-pull-item").forEach((el, i) => {
    el.addEventListener("click", () => openPullDetail(feed[i]));
  });
}

function openPullDetail(pull) {
  const meta = RARITY_META[pull.rarity];
  const tierKey = pull.tierKey ?? "hundred";
  const cat = CATEGORIES[tierKey];

  pullDetailModal.querySelector(".prize-modal-card").style.setProperty("--rarity-color", meta.color);
  pullDetailRarity.textContent = meta.label;
  pullDetailRarity.style.color = meta.color;
  pullDetailRarity.style.borderColor = meta.color;
  pullDetailImage.src = pull.image;
  pullDetailImage.alt = pull.name;
  pullDetailName.textContent = pull.name;
  pullDetailPrice.textContent = `$${pull.price.toLocaleString()}`;
  pullDetailTierBadge.textContent = cat.badge;
  pullDetailTierBadge.className = `tier-badge tier-badge-${cat.badge.toLowerCase()}`;
  pullDetailUser.textContent = pull.isPlayer ? "Pulled by you" : `Pulled by ${pull.username}`;
  pullDetailUser.classList.toggle("you", !!pull.isPlayer);
  pullDetailGoBtn.textContent = `Go to ${cat.label} Crate`;
  pullDetailGoBtn.onclick = () => {
    playClick();
    closePullDetail();
    document.querySelector('.nav-tab[data-nav="screen-category"]').click();
    openPaymentPicker(tierKey);
  };

  pullDetailModal.classList.remove("hidden");
  requestAnimationFrame(() => pullDetailModal.classList.add("visible"));
}

function closePullDetail() {
  pullDetailModal.classList.remove("visible");
  setTimeout(() => pullDetailModal.classList.add("hidden"), 250);
}
pullDetailCloseBtn.addEventListener("click", () => {
  playClick();
  closePullDetail();
});

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
      <span class="tier-badge tier-badge-${cat.badge.toLowerCase()}">${cat.badge}</span>
      <h3>${cat.label}</h3>
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
  payWithCredits.classList.toggle("insufficient", wallet.credits < cat.price);
  payWithCash.classList.toggle("insufficient", wallet.cash < cat.price);
  paymentError.classList.add("hidden");

  paymentModal.classList.remove("hidden");
  requestAnimationFrame(() => paymentModal.classList.add("visible"));
}

function closePaymentPicker() {
  paymentModal.classList.remove("visible");
  setTimeout(() => paymentModal.classList.add("hidden"), 250);
}

function tryPurchase(currency) {
  const key = pendingCategoryKey;
  const cat = CATEGORIES[key];
  const result = player.purchaseCrate(cat.price, currency);
  if (!result) {
    paymentError.textContent = `Not enough ${currency === "cash" ? "Cash" : "Credits"} for the ${cat.label} — try Add Funds.`;
    paymentError.classList.remove("hidden");
    return;
  }
  player.addCredits(result.rebate);
  renderWallet({ pulse: currency });
  showWalletToast(result.rebate, "credits");
  closePaymentPicker();
  startRound(key, currency);
}
payWithCredits.addEventListener("click", () => {
  playClick();
  tryPurchase("credits");
});
payWithCash.addEventListener("click", () => {
  playClick();
  tryPurchase("cash");
});
paymentCancelBtn.addEventListener("click", () => {
  playClick();
  closePaymentPicker();
});

// ---- Reel ------------------------------------------------------------

function buildReel(snapshotUrl) {
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

  const cat = CATEGORIES[currentCategoryKey];
  // "The algorithm must not hand a user the same item consecutively" — only
  // applied to the crate the player actually picked.
  const finalPrize = player.rerollIfDuplicate(currentCategoryKey, boxPrizes[index], cat.pool);
  boxPrizes[index] = finalPrize;

  const { streak, multiplier } = player.recordPick(finalPrize, currentCategoryKey, cat.price);

  helperText.textContent = "Opening your crate…";
  openSlot(index, { isYours: true, revealCard: false });

  setTimeout(async () => {
    await showPrizeModal(finalPrize, { streak, multiplier });
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

// ---- Won-prize modal (four exits) --------------------------------------
// Only ever called for the crate the player picked.

async function showPrizeModal(prize, { streak, multiplier } = {}) {
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

  if (multiplier !== null && multiplier !== undefined) {
    multiplierBadge.textContent = `${multiplier}x crate price`;
    multiplierBadge.classList.remove("hidden");
  } else {
    multiplierBadge.classList.add("hidden");
  }

  const cashOutNow = Math.round(prize.price * player.CASHOUT_HAIRCUT);
  cashOutSub.textContent = roundCurrency === "cash" ? `${fmt(cashOutNow)} now` : `${cashOutNow.toLocaleString()} credits now`;

  if (streak >= 2) {
    streakBadge.innerHTML = `${ICONS.flame} ${streak} Rare+ in a row!`;
    streakBadge.classList.remove("hidden");
  } else {
    streakBadge.classList.add("hidden");
  }

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

// ---- Wire up the two exits ------------------------------------------------
// Ship and List only make sense once an item is sitting in the vault, so
// they live on Account's vault cards instead — the reveal only offers a
// same-currency Cash Out or Keep (which auto-populates the vault).

cashOutBtn.addEventListener("click", () => {
  const prize = boxPrizes[selectedIndex];
  if (!prize) return;
  playClick();
  const amount = Math.round(prize.price * player.CASHOUT_HAIRCUT);
  player.cashBack(amount, roundCurrency);
  renderWallet({ pulse: roundCurrency });
  showWalletToast(amount, roundCurrency);
  hidePrizeModal();
  revealOthers();
});

vaultKeepBtn.addEventListener("click", () => {
  const prize = boxPrizes[selectedIndex];
  if (!prize) return;
  playClick();
  addOwnedItem(prize);
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
  renderCategories();
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

// ---- Account sidebar sub-nav (Vault / Listings / Offers / History / …) ---

accountNavItems.forEach((item) => {
  item.addEventListener("click", () => {
    playClick();
    accountNavItems.forEach((i) => i.classList.remove("active"));
    item.classList.add("active");
    accountSections.forEach((s) => s.classList.toggle("active", s.dataset.section === item.dataset.section));
  });
});

// ---- Generic amount prompt ------------------------------------------------

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

// Rarity only mattered during the open — it's deliberately left off
// marketplace listings (see the .market-sub note on the screen itself).
function marketItemCardHTML(listing) {
  const fmv = market.fmvRating(listing);
  const priceOrOffer =
    listing.price != null
      ? `<span class="market-item-price">${ICONS.cash}${listing.price.toLocaleString()}</span>`
      : `<span class="market-item-offer-only">Offer only</span>`;
  const fmvHTML = fmv ? `<span class="market-item-fmv" style="color:${fmv.color}">${fmv.label}</span>` : "";
  return `
    <div class="market-item" data-listing="${listing.id}">
      <div class="market-item-media">
        <img src="${listing.image}" alt="">
        ${fmvHTML}
      </div>
      <div class="market-item-body">
        <span class="market-item-name">${listing.name}</span>
        <div class="market-item-divider"></div>
        <div class="market-item-foot">
          ${priceOrOffer}
          <span class="market-item-seller ${listing.isPlayer ? "you" : ""}">${listing.isPlayer ? "You" : listing.seller}</span>
        </div>
      </div>
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
// Rarity is deliberately not a browse filter here (it's tier-relative and
// loses meaning once pooled) — brand, FMV rating, listed-vs-offer-only and
// price range are, mirroring the scope's filter set.

let marketBrandValue = "all";
let marketFmvValue = "all";

function renderMarketplace() {
  market.ensureSeeded(ALL_CATALOG);

  if (marketBrandFilter.children.length === 0) {
    const brands = ["all", ...new Set(market.getListings().map((l) => market.extractBrand(l.name)))];
    marketBrandFilter.innerHTML = brands
      .map((b) => `<button class="market-chip${b === "all" ? " active" : ""}" data-brand="${b}">${b === "all" ? "All Brands" : b}</button>`)
      .join("");
    marketBrandFilter.querySelectorAll(".market-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        playClick();
        marketBrandValue = chip.dataset.brand;
        marketBrandFilter.querySelectorAll(".market-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        renderMarketGrid();
      });
    });

    const fmvBands = [
      { key: "all", label: "All" },
      { key: "good-deal", label: "Very Good", color: "#4ade80" },
      { key: "fair", label: "Good", color: "#AFBAC4" },
      { key: "over", label: "Not Good", color: "#f87171" },
    ];
    marketFmvFilter.innerHTML = fmvBands
      .map((b) => `<button class="market-chip${b.key === "all" ? " active" : ""}" data-fmv="${b.key}" ${b.color ? `style="--rarity-color:${b.color}"` : ""}>${b.label}</button>`)
      .join("");
    marketFmvFilter.querySelectorAll(".market-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        playClick();
        marketFmvValue = chip.dataset.fmv;
        marketFmvFilter.querySelectorAll(".market-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        renderMarketGrid();
      });
    });
  }

  renderMarketGrid();
}

function renderMarketGrid() {
  let listings = market.getListings();
  marketCount.textContent = listings.length;

  if (marketBrandValue !== "all") listings = listings.filter((l) => market.extractBrand(l.name) === marketBrandValue);
  if (marketFmvValue !== "all") listings = listings.filter((l) => market.fmvRating(l)?.key === marketFmvValue);
  if (marketListedOnly.checked) listings = listings.filter((l) => l.price != null);

  const min = Number(marketPriceMin.value);
  const max = Number(marketPriceMax.value);
  if (min) listings = listings.filter((l) => (l.price ?? l.catalogPrice) >= min);
  if (max) listings = listings.filter((l) => (l.price ?? l.catalogPrice) <= max);

  const sort = marketSort.value;
  listings = [...listings].sort((a, b) => {
    if (sort === "price-asc") return (a.price ?? a.catalogPrice) - (b.price ?? b.catalogPrice);
    if (sort === "price-desc") return (b.price ?? b.catalogPrice) - (a.price ?? a.catalogPrice);
    return b.ts - a.ts;
  });

  marketGrid.innerHTML = listings.length
    ? listings.map(marketItemCardHTML).join("")
    : `<div class="market-empty">No listings match these filters.</div>`;

  marketGrid.querySelectorAll(".market-item").forEach((el) => {
    el.addEventListener("click", () => openListingModal(el.dataset.listing));
  });
}
marketSort.addEventListener("change", renderMarketGrid);
marketListedOnly.addEventListener("change", () => {
  playClick();
  renderMarketGrid();
});
[marketPriceMin, marketPriceMax].forEach((el) => el.addEventListener("input", renderMarketGrid));

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
  listingPrice.textContent = listing.price != null ? `$${listing.price.toLocaleString()}` : "Offer only";
  listingSeller.innerHTML = listing.isPlayer ? "Held by <b>you</b>" : `Held by <b>${listing.seller}</b>`;

  listingActions.classList.toggle("hidden", listing.isPlayer);
  listingBuyBtn.classList.toggle("hidden", listing.price == null);
  listingUnlistBtn.classList.toggle("hidden", !listing.isPlayer);
  listingUnlistBtn.textContent = listing.price != null ? "Remove Price (Keep Offers Open)" : "Remove From Marketplace";

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
  if (!listing || listing.price == null) return;
  if (!player.spendCash(listing.price)) {
    alert("Not enough Cash for this purchase.");
    return;
  }
  playClick();
  addOwnedItem({ name: listing.name, rarity: listing.rarity, price: listing.catalogPrice, image: listing.image });
  market.removeListing(listing.id);
  renderWallet({ pulse: "cash" });
  closeListingModal();
  renderMarketGrid();
});

listingOfferBtn.addEventListener("click", async () => {
  const listing = market.getListing(openListingId);
  if (!listing) return;
  const reference = listing.price ?? listing.catalogPrice;
  const amount = await promptAmount("Make an Offer", `${listing.name} — comp value $${listing.catalogPrice.toLocaleString()}.`, Math.round(reference * 0.8));
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
  market.updateListing(listing.id, { price: null });
  closeListingModal();
  renderMarketGrid();
});

function resolveBotOnMyOffer(offerId) {
  const offer = market.getOffer(offerId);
  if (!offer) return;
  const listing = market.getListing(offer.listingId);
  if (!listing) return;
  const reference = listing.price ?? listing.catalogPrice;
  const decision = market.botDecision(offer.amount, reference);
  if (decision.status === "accepted") {
    if (player.spendCash(offer.amount)) {
      addOwnedItem({ name: listing.name, rarity: listing.rarity, price: listing.catalogPrice, image: listing.image });
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

// Deterministic per-username gradient + initial, so "avatars" are stable
// without needing an image upload flow.
function avatarStyle(username) {
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) >>> 0;
  const h1 = h % 360;
  const h2 = (h1 + 55) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${h1},70%,48%), hsl(${h2},70%,32%))`,
    initial: username.charAt(0).toUpperCase(),
  };
}

function renderIdentity() {
  const username = player.getUsername();
  const { background, initial } = avatarStyle(username);
  [topAvatar, accountAvatar].forEach((el) => {
    el.style.background = background;
    el.textContent = initial;
  });
  topUsername.textContent = username;
  usernameBtn.textContent = username;
}

usernameBtn.addEventListener("click", async () => {
  const name = prompt("Choose a username", player.getUsername());
  if (name) {
    player.setUsername(name);
    renderIdentity();
  }
});

avatarBtn.addEventListener("click", () => {
  document.querySelector('.nav-tab[data-nav="screen-account"]').click();
});

notifBtn.addEventListener("click", () => {
  document.querySelector('.nav-tab[data-nav="screen-account"]').click();
  document.querySelector('.account-nav-item[data-section="offers"]')?.click();
});

referralLinkBtn.addEventListener("click", async () => {
  const link = `${location.origin}${location.pathname}?ref=${encodeURIComponent(player.getUsername())}`;
  try {
    await navigator.clipboard.writeText(link);
  } catch {
    // clipboard API unavailable — the link is still shown in the toast
  }
  playClick();
  showToast("Referral link copied", ICONS.bell);
});

// Streak + referral-share rings and the notification badge live in the
// topbar, visible from every screen — refreshed alongside the wallet and
// whenever the account screen (offers) changes.
function renderHeaderStats() {
  const streak = player.getStreak();
  streakValue.textContent = streak;
  streakRing.style.setProperty("--pct", Math.min(100, (streak / 5) * 100));

  const referral = player.getReferralTier();
  referralValue.textContent = `${Math.round(referral.share * 100)}%`;
  referralRing.style.setProperty("--pct", Math.round(referral.progress * 100));

  const pending = market.getIncomingOffers().length;
  notifBadge.textContent = pending;
  notifBadge.classList.toggle("hidden", pending === 0);
}

// Rarity is shown only on the Boxes tab, where it's meaningful (what you
// could have won) — Account/Marketplace deliberately leave it off.
function inventoryItemHTML(item) {
  const archived = player.isArchived(item);
  const daysLeft = player.daysUntilArchival(item);
  const archivalClass = archived ? "archived" : daysLeft <= 30 ? "soon" : "";
  const archivalText = archived ? "Archived — cash out only" : `${daysLeft}d to archival`;
  const cashOutToday = player.cashOutValue(item);
  const listing = item.listingId ? market.getListing(item.listingId) : null;
  const isListed = listing && listing.price != null;

  return `
    <div class="market-item static">
      <div class="market-item-media">
        <img src="${item.image}" alt="">
      </div>
      <div class="market-item-body">
        <span class="market-item-name">${item.name}</span>
        <span class="item-archival ${archivalClass}">${archivalText}</span>
        <span class="item-cashout-today">Cash out today for $${cashOutToday.toLocaleString()}</span>
        <div class="market-item-divider"></div>
        <div class="item-actions">
          <button class="item-action-btn" data-item-action="cashout" data-item="${item.id}">Cash Out</button>
          <button class="item-action-btn" data-item-action="ship" data-item="${item.id}" ${archived ? "disabled" : ""}>Ship</button>
          <button class="item-action-btn" data-item-action="list" data-item="${item.id}" ${archived ? "disabled" : ""}>${isListed ? "Reprice" : "List"}</button>
        </div>
      </div>
    </div>`;
}

function renderAccount() {
  renderIdentity();
  sideCredits.textContent = player.getWallet().credits.toLocaleString();
  sideCash.textContent = `$${player.getWallet().cash.toLocaleString()}`;
  sideXp.textContent = player.getXp().toLocaleString();
  sideVolume.textContent = `$${player.getLifetimeVolume().toLocaleString()}`;

  market.maybeSpawnIncomingOffer();
  renderHeaderStats();

  const incoming = market.getIncomingOffers();
  incomingOffersList.innerHTML = incoming.length
    ? incoming.map((o) => offerRowHTML(o, { showActions: "incoming" })).join("")
    : `<div class="offers-empty">No incoming offers right now.</div>`;

  const myListings = market.getListings().filter((l) => l.isPlayer && l.price != null);
  listingsCount.textContent = myListings.length;
  myListingsGrid.innerHTML = myListings.length
    ? myListings.map(marketItemCardHTML).join("")
    : `<div class="market-empty">You haven't listed anything yet.</div>`;
  myListingsGrid.querySelectorAll(".market-item").forEach((el) => {
    el.addEventListener("click", () => openListingModal(el.dataset.listing));
  });

  const inventory = player.getInventory();
  vaultCount.textContent = inventory.length;
  inventoryGrid.innerHTML = inventory.length
    ? inventory.map(inventoryItemHTML).join("")
    : `<div class="market-empty">Keep, Ship or List a prize from a crate reveal to see it here.</div>`;

  const myOffers = market.getMyOffers();
  myOffersList.innerHTML = myOffers.length
    ? myOffers.map((o) => offerRowHTML(o, { showActions: o.status === "countered" ? "counter-received" : null })).join("")
    : `<div class="offers-empty">You haven't made any offers yet.</div>`;

  renderOpeningHistory();
  renderShipped();
  renderLeaderboard();
  renderReferralPanel();
  renderStreaks();
}

let openingsFilterValue = "all";
function renderOpeningHistory() {
  if (openingsFilter.children.length === 0) {
    openingsFilter.innerHTML = `
      <button class="market-chip active" data-mult="all">All</button>
      <button class="market-chip" data-mult="5">5x+</button>
      <button class="market-chip" data-mult="10">10x+</button>
    `;
    openingsFilter.querySelectorAll(".market-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        playClick();
        openingsFilterValue = chip.dataset.mult;
        openingsFilter.querySelectorAll(".market-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        renderOpeningHistory();
      });
    });
  }

  let openings = player.getHistory();
  if (openingsFilterValue !== "all") {
    const min = Number(openingsFilterValue);
    openings = openings.filter((o) => (o.multiplier ?? 0) >= min);
  }

  openingsList.innerHTML = openings.length
    ? openings
        .map((o) => {
          const pinned = (o.multiplier ?? 0) >= player.BIG_PULL_MULTIPLIER;
          return `
          <div class="opening-row ${pinned ? "pinned" : ""}">
            <img src="${o.image}" alt="">
            <span class="opening-row-name">${o.name}</span>
            <span class="opening-row-mult ${pinned ? "big" : ""}">${o.multiplier != null ? o.multiplier + "x" : "—"}</span>
            ${pinned ? `<span class="opening-row-pin" title="Pinned — 5x or more">★</span>` : ""}
          </div>`;
        })
        .join("")
    : `<div class="offers-empty">No openings yet.</div>`;
}

function renderShipped() {
  const shipped = player.getShipped();
  shippedList.innerHTML = shipped.length
    ? shipped
        .map((item) => {
          return `
            <div class="market-item static">
              <div class="market-item-media">
                <img src="${item.image}" alt="">
              </div>
              <div class="market-item-body">
                <span class="market-item-name">${item.name}</span>
                <div class="market-item-divider"></div>
                <div class="market-item-foot">
                  <span class="market-item-price">${ICONS.cash}${item.price.toLocaleString()}</span>
                </div>
              </div>
            </div>`;
        })
        .join("")
    : `<div class="market-empty">Nothing shipped yet.</div>`;
}

function renderLeaderboard() {
  const rows = [...FAKE_LEADERS, { username: player.getUsername(), xp: player.getXp(), isPlayer: true }].sort(
    (a, b) => b.xp - a.xp
  );
  leaderboardList.innerHTML = rows
    .map(
      (r, i) => `
      <div class="leaderboard-row ${r.isPlayer ? "you" : ""}">
        <span class="leaderboard-rank">#${i + 1}</span>
        <span class="leaderboard-name">${r.isPlayer ? "You" : r.username}</span>
        <span class="leaderboard-xp">${r.xp.toLocaleString()} XP</span>
      </div>`
    )
    .join("");
}

function renderReferralPanel() {
  const referral = player.getReferralTier();
  const nextText = referral.next
    ? `${Math.round(referral.progress * 100)}% to ${Math.round(referral.next.share * 100)}% at $${referral.next.volume.toLocaleString()}`
    : "At the ceiling";
  referralPanel.innerHTML = `
    <div class="referral-current">
      <div><span class="share">${Math.round(referral.share * 100)}%</span> current share</div>
      <div class="next">${nextText}</div>
    </div>
    <div class="referral-progress-track"><div class="referral-progress-fill" style="width:${Math.round(referral.progress * 100)}%"></div></div>
    <table class="referral-table">
      <thead><tr><th>Share</th><th>How it's earned</th></tr></thead>
      <tbody>
        <tr><td>10%</td><td>Sign up</td></tr>
        <tr><td>+5%</td><td>Arrive through a referral link</td></tr>
        <tr><td>+5%</td><td>Verify X account</td></tr>
        <tr><td>25%</td><td>$250,000 referred volume</td></tr>
        <tr><td>30%</td><td>$500,000 referred volume</td></tr>
        <tr><td>35%</td><td>$1,000,000 referred volume</td></tr>
        <tr><td>40%</td><td>$2,000,000 referred volume — ceiling</td></tr>
      </tbody>
    </table>
  `;
}

// Deterministic per-week pick from the grail tier, so the raffle prize is
// stable all week and only changes once the next week starts — no backend
// needed to "populate" it on a schedule.
function getWeeklyRafflePrize() {
  const weekIndex = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  let h = 0;
  const s = `raffle-${weekIndex}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return THOUSAND_POOL[h % THOUSAND_POOL.length];
}

function renderStreaks() {
  const streak = player.getDailyStreak();
  const qualified = streak >= player.RAFFLE_STREAK_DAYS;
  streakDaysValue.textContent = streak;
  streakGoalInline.textContent = player.RAFFLE_STREAK_DAYS;
  streakRaffleBadge.textContent = qualified
    ? "Entered in this week's raffle"
    : `${player.RAFFLE_STREAK_DAYS - streak} more day${player.RAFFLE_STREAK_DAYS - streak === 1 ? "" : "s"} to qualify`;
  streakRaffleBadge.className = `streak-raffle-badge ${qualified ? "qualified" : "pending"}`;

  const prize = getWeeklyRafflePrize();
  streakRafflePrize.innerHTML = `
    <img src="${prize.image}" alt="">
    <div class="streak-raffle-prize-info">
      <span class="streak-raffle-prize-name">${prize.name}</span>
      <span class="streak-raffle-prize-value">$${prize.price.toLocaleString()} value — drawn from this week's streak qualifiers</span>
    </div>
  `;

  renderStreakCalendar();
}

function renderStreakCalendar() {
  const activity = player.getDailyActivity();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const todayKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  streakMonthLabel.textContent = now.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  let html = "";
  for (let i = 0; i < firstWeekday; i++) html += `<span class="streak-tile empty"></span>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const count = activity[key] ?? 0;
    const level = count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4;
    const isToday = key === todayKey;
    html += `<span class="streak-tile level-${level} ${isToday ? "today" : ""}" title="${key}: ${count} crate${count === 1 ? "" : "s"} opened">${day}</span>`;
  }
  streakCalendar.innerHTML = html;
}

// Delegated: offer actions + inventory item actions (both lists re-render often)
document.addEventListener("click", (e) => {
  const offerBtn = e.target.closest("[data-offer-action]");
  const itemBtn = e.target.closest("[data-item-action]");

  if (offerBtn) {
    playClick();
    const action = offerBtn.dataset.offerAction;
    const offer = market.getOffer(offerBtn.dataset.offer);
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
        addOwnedItem({ name: listing.name, rarity: listing.rarity, price: listing.catalogPrice, image: listing.image });
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
    return;
  }

  if (itemBtn) {
    const action = itemBtn.dataset.itemAction;
    const item = player.getInventoryItem(itemBtn.dataset.item);
    if (!item) return;

    if (action === "cashout") {
      playClick();
      const amount = player.cashOutValue(item);
      player.addCash(amount);
      releaseOwnedItem(item);
      renderWallet({ pulse: "cash" });
      showWalletToast(amount, "cash");
      renderAccount();
    } else if (action === "ship") {
      playClick();
      if (item.listingId) market.removeListing(item.listingId);
      player.shipItem(item);
      renderAccount();
    } else if (action === "list") {
      promptAmount("List for Sale", `${item.name} — catalog value $${item.price.toLocaleString()}.`, item.price).then((price) => {
        if (!price) return;
        playClick();
        market.updateListing(item.listingId, { price });
        renderAccount();
      });
    }
  }
});

// Autoplay policies require a user gesture before any audio can start.
function onFirstGesture() {
  startAmbient();
  document.removeEventListener("pointerdown", onFirstGesture);
}
document.addEventListener("pointerdown", onFirstGesture);

buildAmbientParticles();
renderIdentity();
seedSimulatedPulls();
renderCategories();
setInterval(tickSimulatedPulls, 4000);
