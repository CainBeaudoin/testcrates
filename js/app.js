import { createBoxViewer, getBoxSnapshot } from "./boxViewer.js";
import { PRIZE_POOL as HUNDRED_POOL, RARITY_META } from "./prizeData.js";
import { PRIZE_POOL as TWO_FIFTY_POOL } from "./prizeData250.js";
import { PRIZE_POOL as THOUSAND_POOL } from "./prizeData1000.js";
import { PRIZE_POOL as STOCKS_POOL } from "./prizeDataStocks.js";
import { playRevealFX } from "./reveal.js";
import * as player from "./player.js";
import * as market from "./market.js";
import { playClick, playHover, playPop, playDing, toggleMuted, isMuted } from "./sound.js";
import { ICONS } from "./icons.js";
import { buildShareCard, downloadShareCard, shareCard } from "./exportCard.js";

// ---- Prize configuration -------------------------------------------------
// Each tier runs identical mechanics (reel, pity, reveal, wallet) — only
// the price point (and therefore the pool's price band) differs. Opening a
// crate costs its tier price, paid from whichever balance you choose.

const CATEGORIES = {
  stocks: {
    label: "$25",
    badge: "Stocks",
    price: 25,
    pool: STOCKS_POOL,
    categoryIcon: "stock",
    categoryLabel: "Stocks",
    poweredBy: "Robinhood Chain",
    boxKind: "printer", // generic printer model, not the shoe box
    cashOnly: true, // real USDC settlement, not a Credits reward balance
  },
  hundred: {
    label: "$100",
    badge: "Bronze",
    price: 100,
    pool: HUNDRED_POOL,
    categoryIcon: "sneaker", // swap per-tier if a pool ever isn't sneakers
    categoryLabel: "Sneakers",
    poweredBy: "ODTO",
  },
  twoFifty: {
    label: "$250",
    badge: "Silver",
    price: 250,
    pool: TWO_FIFTY_POOL,
    categoryIcon: "sneaker",
    categoryLabel: "Sneakers",
    poweredBy: "ODTO",
  },
  thousand: {
    label: "$1000",
    badge: "Gold",
    price: 1000,
    pool: THOUSAND_POOL,
    categoryIcon: "sneaker",
    categoryLabel: "Sneakers",
    poweredBy: "ODTO",
  },
};

const MAX_BATCH_QTY = 8;

const RARITY_RANK_ASC = ["common", "uncommon", "rare", "epic", "legendary"];
function rankOf(rarity) {
  return RARITY_RANK_ASC.indexOf(rarity);
}
const DISPLAY_RARITY_ORDER = ["legendary", "epic", "rare", "uncommon", "common"];

// Full catalog across all tiers, used to seed simulated marketplace listings.
const ALL_CATALOG = [...STOCKS_POOL, ...HUNDRED_POOL, ...TWO_FIFTY_POOL, ...THOUSAND_POOL];
// ODTO tiers only (no stocks) — used to demo-seed the Vault.
const SNEAKER_CATALOG = [...HUNDRED_POOL, ...TWO_FIFTY_POOL, ...THOUSAND_POOL];

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

// Simulated referred-users cast for the Referral tab — shows the trading
// fees each referred account has generated (not raw volume), since that's
// the number your referral share is actually a cut of and makes the small
// claimable balance make sense. baseFees is the starting amount; each
// account's fees keep accruing daily (see accruedFees) so the table looks
// like it's tracking live activity rather than a frozen demo number.
const REFERRAL_FEES_EPOCH = new Date("2026-06-01T00:00:00Z").getTime();
const FAKE_REFERRALS = [
  { username: "SoleSeeker", baseFees: 4720, dailyRate: 6.4 },
  { username: "PixelHawk77", baseFees: 2950, dailyRate: 4.1 },
  { username: "DuneRunner", baseFees: 2120, dailyRate: 2.9 },
  { username: "ThreadCounter", baseFees: 1090, dailyRate: 1.6 },
  { username: "RarePairz", baseFees: 460, dailyRate: 0.7 },
];

function accruedFees(referral) {
  const days = Math.max(0, Math.floor((Date.now() - REFERRAL_FEES_EPOCH) / 86400000));
  return Math.round(referral.baseFees + referral.dailyRate * days);
}

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

// ---- State -----------------------------------------------------------

let currentCategoryKey = null;
let pendingCategoryKey = null;
let roundCurrency = null; // "credits" | "cash"
let batchTotal = 1; // how many crates this purchase covers
let batchIndex = 1; // which one is currently playing
let batchRemaining = 0; // still to auto-chain after this one
let boxPrizes = [];
let selectedIndex = null;
let roundLocked = false;
let viewers = [null, null, null];
let reelCellWidth = 0;
let toastTimer = null;
let currentFairness = null; // {hash, nonce} for the active round's commit-reveal disclosure

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
const prizeModalMeta = document.getElementById("prizeModalMeta");
const cashOutBtn = document.getElementById("cashOutBtn");
const cashOutSub = document.getElementById("cashOutSub");
const vaultKeepBtn = document.getElementById("vaultKeepBtn");
const muteBtn = document.getElementById("muteBtn");
const recentPulls = document.getElementById("recentPulls");
const recentPullsList = document.getElementById("recentPullsList");
const payingWithBadge = document.getElementById("payingWithBadge");
const fairnessBadge = document.getElementById("fairnessBadge");
const fairnessBadgeLabel = document.getElementById("fairnessBadgeLabel");
const fairnessModal = document.getElementById("fairnessModal");
const fairnessHashValue = document.getElementById("fairnessHashValue");
const fairnessRecomputedValue = document.getElementById("fairnessRecomputedValue");
const fairnessStatus = document.getElementById("fairnessStatus");
const fairnessCloseBtn = document.getElementById("fairnessCloseBtn");
const walletCredits = document.getElementById("walletCredits");
const walletCash = document.getElementById("walletCash");
const addFundsBtn = document.getElementById("addFundsBtn");
const walletCashBtn = document.getElementById("walletCashBtn");
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
const marketSizeFilter = document.getElementById("marketSizeFilter");
const marketFmvFilter = document.getElementById("marketFmvFilter");
const marketListedOnly = document.getElementById("marketListedOnly");
const marketPriceMin = document.getElementById("marketPriceMin");
const marketPriceMax = document.getElementById("marketPriceMax");
const marketSort = document.getElementById("marketSort");
const usernameBtn = document.getElementById("usernameBtn");
const accountAvatar = document.getElementById("accountAvatar");
const referralLinkBtn = document.getElementById("referralLinkBtn");
const accountAddFundsBtn = document.getElementById("accountAddFundsBtn");
const accountWithdrawBtn = document.getElementById("accountWithdrawBtn");
const publicProfileScreen = document.getElementById("publicProfileScreen");
const profileAvatar = document.getElementById("profileAvatar");
const profileUsername = document.getElementById("profileUsername");
const profileXp = document.getElementById("profileXp");
const profileBestName = document.getElementById("profileBestName");
const profileRecentPulls = document.getElementById("profileRecentPulls");
const sideCredits = document.getElementById("sideCredits");
const sideCash = document.getElementById("sideCash");
const sideXp = document.getElementById("sideXp");
const sideVaultValue = document.getElementById("sideVaultValue");
const sidePortfolioValue = document.getElementById("sidePortfolioValue");
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
const cashedOutList = document.getElementById("cashedOutList");
const transfersList = document.getElementById("transfersList");
const clipsGrid = document.getElementById("clipsGrid");
const clipsCount = document.getElementById("clipsCount");
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
const creditsEarnedModal = document.getElementById("creditsEarnedModal");
const creditsEarnedList = document.getElementById("creditsEarnedList");
const creditsEarnedCloseBtn = document.getElementById("creditsEarnedCloseBtn");
const addFundsModal = document.getElementById("addFundsModal");
const chainFilter = document.getElementById("chainFilter");
const depositChainName = document.getElementById("depositChainName");
const depositAddress = document.getElementById("depositAddress");
const depositAddressCopyBtn = document.getElementById("depositAddressCopyBtn");
const depositAmountInput = document.getElementById("depositAmountInput");
const depositConfirmBtn = document.getElementById("depositConfirmBtn");
const cardAmountInput = document.getElementById("cardAmountInput");
const applePayBtn = document.getElementById("applePayBtn");
const cardPayBtn = document.getElementById("cardPayBtn");
const addFundsCloseBtn = document.getElementById("addFundsCloseBtn");
const withdrawModal = document.getElementById("withdrawModal");
const withdrawAmountInput = document.getElementById("withdrawAmountInput");
const withdrawMaxBtn = document.getElementById("withdrawMaxBtn");
const withdrawAvailableHint = document.getElementById("withdrawAvailableHint");
const withdrawChainFilter = document.getElementById("withdrawChainFilter");
const withdrawAddressList = document.getElementById("withdrawAddressList");
const withdrawAddressInput = document.getElementById("withdrawAddressInput");
const withdrawNicknameInput = document.getElementById("withdrawNicknameInput");
const withdrawWhitelistBtn = document.getElementById("withdrawWhitelistBtn");
const withdrawError = document.getElementById("withdrawError");
const withdrawConfirmBtn = document.getElementById("withdrawConfirmBtn");
const withdrawCloseBtn = document.getElementById("withdrawCloseBtn");
const streakStat = document.getElementById("streakStat");
const streakRing = document.getElementById("streakRing");
const streakValue = document.getElementById("streakValue");
const referralStat = document.getElementById("referralStat");
const referralRing = document.getElementById("referralRing");
const referralValue = document.getElementById("referralValue");
const listingModal = document.getElementById("listingModal");
const listingImage = document.getElementById("listingImage");
const listingName = document.getElementById("listingName");
const listingPrice = document.getElementById("listingPrice");
const listingMeta = document.getElementById("listingMeta");
const listingSeller = document.getElementById("listingSeller");
const listingActions = document.getElementById("listingActions");
const listingOfferBtn = document.getElementById("listingOfferBtn");
const listingBuyBtn = document.getElementById("listingBuyBtn");
const listingUnlistBtn = document.getElementById("listingUnlistBtn");
const listingOffersList = document.getElementById("listingOffersList");
const listingCloseBtn = document.getElementById("listingCloseBtn");
const listingMarketValue = document.getElementById("listingMarketValue");
const listingChart = document.getElementById("listingChart");
const listingPrevBtn = document.getElementById("listingPrevBtn");
const listingNextBtn = document.getElementById("listingNextBtn");
const pullDetailModal = document.getElementById("pullDetailModal");
const pullDetailRarity = document.getElementById("pullDetailRarity");
const pullDetailImage = document.getElementById("pullDetailImage");
const pullDetailName = document.getElementById("pullDetailName");
const pullDetailPrice = document.getElementById("pullDetailPrice");
const pullDetailTierBadge = document.getElementById("pullDetailTierBadge");
const pullDetailUser = document.getElementById("pullDetailUser");
const pullDetailGoBtn = document.getElementById("pullDetailGoBtn");
const pullDetailCloseBtn = document.getElementById("pullDetailCloseBtn");
const itemDetailModal = document.getElementById("itemDetailModal");
const itemDetailImage = document.getElementById("itemDetailImage");
const itemDetailName = document.getElementById("itemDetailName");
const itemDetailValue = document.getElementById("itemDetailValue");
const itemDetailMeta = document.getElementById("itemDetailMeta");
const itemDetailChart = document.getElementById("itemDetailChart");
const itemDetailBuyout = document.getElementById("itemDetailBuyout");
const itemDetailBuyoutBtn = document.getElementById("itemDetailBuyoutBtn");
const itemDetailPeerOffers = document.getElementById("itemDetailPeerOffers");
const itemDetailCloseBtn = document.getElementById("itemDetailCloseBtn");
const itemDetailShareBtn = document.getElementById("itemDetailShareBtn");
const itemDetailDownloadBtn = document.getElementById("itemDetailDownloadBtn");
const portfolioCount = document.getElementById("portfolioCount");
const portfolioGrid = document.getElementById("portfolioGrid");
const portfolioModal = document.getElementById("portfolioModal");
const portfolioDetailImage = document.getElementById("portfolioDetailImage");
const portfolioDetailName = document.getElementById("portfolioDetailName");
const portfolioDetailValue = document.getElementById("portfolioDetailValue");
const portfolioDetailChart = document.getElementById("portfolioDetailChart");
const portfolioDetailLots = document.getElementById("portfolioDetailLots");
const portfolioDetailSellBtn = document.getElementById("portfolioDetailSellBtn");
const portfolioDetailCloseBtn = document.getElementById("portfolioDetailCloseBtn");
const amountModal = document.getElementById("amountModal");
const amountModalTitle = document.getElementById("amountModalTitle");
const amountModalHint = document.getElementById("amountModalHint");
const amountInput = document.getElementById("amountInput");
const amountCancelBtn = document.getElementById("amountCancelBtn");
const amountConfirmBtn = document.getElementById("amountConfirmBtn");
const amountMaxBtn = document.getElementById("amountMaxBtn");

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

// Size + condition line shown on the reveal, Vault item detail, and
// Marketplace listing detail — so a size mismatch is obvious immediately,
// before spending an exit on something that won't fit. Stocks have
// neither. Condition is always "New" (no used/worn inventory in this
// catalog) but still stated explicitly rather than assumed.
function itemMetaText(name, category) {
  if (category === "stocks") return "";
  return `Size US ${market.sizeForItem(name)} · Condition: New`;
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
  // Stocks settle on-chain directly (see Portfolio) — no marketplace entry.
  if (prize.category === "stocks") return item;
  const listing = market.createListing({ item, price: null, seller: player.getUsername() });
  player.markListed(item.id, listing.id);
  return item;
}

function releaseOwnedItem(item) {
  if (item.listingId) market.removeListing(item.listingId);
  player.removeFromInventory(item.id);
}

// Demo convenience: the first time this browser ever loads the app, drop a
// fixed set of ODTO items in the Vault, a fixed set of stocks in the
// Portfolio, and top up Cash/Credits — so there's something to click
// through without opening crates first. This dataset is hardcoded (not
// randomized) on purpose: it's what a shared deployment link shows too,
// with no backend to carry a specific developer's own local state to
// another visitor, so every fresh session — including someone else
// opening the link — shows the exact same populated demo account.
// Goes through addOwnedItem like a real Keep, so listings/consolidation
// behave identically to the real thing. Runs once ever (see
// player.markDemoSeeded) — never re-seeds an account that's already played.
const DEMO_VAULT_ITEM_NAMES = [
  "Air Jordan 4 Nigel Sylvester Brick By Brick", // Bronze, Legendary, $587
  "Nike Air Force 1 Low White", // Bronze, Common, $103
  "Nike Air Force 1 Low Off-White Volt", // Silver, Legendary, $1,174
  "Air Jordan 1 High Off-White Chicago", // Gold, Legendary, $6,236
];
const DEMO_PORTFOLIO_ITEM_NAMES = [
  "NVDA — Nvidia Corp",
  "NVDA — Nvidia Corp", // two lots on purpose — demos Portfolio consolidation
  "AAPL — Apple Inc",
];
const DEMO_STARTING_CASH = 2000; // added on top of the base $500 starting balance
const DEMO_STARTING_CREDITS = 25;

function seedDemoInventory() {
  if (player.hasSeededDemoInventory()) return;
  const findByName = (pool, name) => pool.find((p) => p.name === name);
  DEMO_VAULT_ITEM_NAMES.forEach((name) => {
    const prize = findByName(SNEAKER_CATALOG, name);
    if (prize) addOwnedItem(prize);
  });
  DEMO_PORTFOLIO_ITEM_NAMES.forEach((name) => {
    const prize = findByName(STOCKS_POOL, name);
    if (prize) addOwnedItem(prize);
  });
  player.addCash(DEMO_STARTING_CASH);
  player.addCredits(DEMO_STARTING_CREDITS);
  player.markDemoSeeded();
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

// ---- Add Funds: simulated crypto deposit + card/Apple Pay -----------------
// Everything here is a local demo — no real chain, gateway, or card
// collection exists. Confirming just credits the Cash balance directly.

const DEMO_CHAINS = [
  { key: "solana", label: "Solana" },
  { key: "ethereum", label: "Ethereum" },
  { key: "base", label: "Base" },
  { key: "bsc", label: "BSC" },
  { key: "tron", label: "Tron" },
  { key: "robinhood", label: "Robinhood Chain" },
];

function fakeDepositAddress(chainKey) {
  const seed = `${player.getUsername()}:${chainKey}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hex = (n) => (n >>> 0).toString(16).padStart(8, "0");
  const body = hex(h) + hex(h * 2654435761) + hex(h * 40503) + hex(h * 2246822519);
  if (chainKey === "solana") return body.slice(0, 44);
  if (chainKey === "tron") return `T${body.slice(0, 33)}`;
  if (chainKey === "robinhood") return `rh${body.slice(0, 40)}`;
  return `0x${body.slice(0, 40)}`;
}

let selectedChain = "solana";

function renderChainFilter() {
  chainFilter.innerHTML = DEMO_CHAINS.map(
    (c) => `<button class="market-chip${c.key === selectedChain ? " active" : ""}" data-chain="${c.key}">${c.label}</button>`
  ).join("");
  chainFilter.querySelectorAll(".market-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      playClick();
      selectedChain = chip.dataset.chain;
      renderChainFilter();
      renderDepositAddress();
    });
  });
}

function renderDepositAddress() {
  const chain = DEMO_CHAINS.find((c) => c.key === selectedChain);
  depositChainName.textContent = chain.label;
  depositAddress.textContent = fakeDepositAddress(selectedChain);
}

function openAddFundsModal() {
  if (chainFilter.children.length === 0) renderChainFilter();
  renderDepositAddress();
  depositAmountInput.value = "";
  cardAmountInput.value = "";
  addFundsModal.classList.remove("hidden");
  requestAnimationFrame(() => addFundsModal.classList.add("visible"));
}
function closeAddFundsModal() {
  addFundsModal.classList.remove("visible");
  setTimeout(() => addFundsModal.classList.add("hidden"), 250);
}

addFundsBtn.addEventListener("click", () => {
  playClick();
  openAddFundsModal();
});
accountAddFundsBtn.addEventListener("click", () => {
  playClick();
  openAddFundsModal();
});
addFundsCloseBtn.addEventListener("click", () => {
  playClick();
  closeAddFundsModal();
});

document.querySelectorAll(".add-funds-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    playClick();
    document.querySelectorAll(".add-funds-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll(".add-funds-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.fundPanel !== tab.dataset.fundTab));
  });
});

depositAddressCopyBtn.addEventListener("click", async () => {
  playClick();
  try {
    await navigator.clipboard.writeText(depositAddress.textContent);
    showToast("Address copied", ICONS.bell);
  } catch {
    // clipboard unavailable — the address is still visible to copy by hand
  }
});

async function simulateDeposit(amount, btn) {
  if (!amount || amount <= 0) return;
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Confirming…";
  await new Promise((r) => setTimeout(r, 1100));
  player.addDemoFunds(amount);
  renderWallet({ pulse: "cash" });
  showWalletToast(amount, "cash");
  btn.disabled = false;
  btn.textContent = originalText;
  closeAddFundsModal();
}

depositConfirmBtn.addEventListener("click", () => {
  playClick();
  simulateDeposit(Math.round(Number(depositAmountInput.value)), depositConfirmBtn);
});
applePayBtn.addEventListener("click", () => {
  playClick();
  simulateDeposit(Math.round(Number(cardAmountInput.value)), applePayBtn);
});
cardPayBtn.addEventListener("click", () => {
  playClick();
  simulateDeposit(Math.round(Number(cardAmountInput.value)), cardPayBtn);
});

// ---- Withdraw: cash out to a whitelisted crypto wallet --------------------
// Mirrors Add Funds in reverse — pick a network, whitelist a payout
// address with a nickname, select it, confirm. Demo only: nothing is
// broadcast anywhere, it just debits the Cash balance.

let selectedWithdrawChain = DEMO_CHAINS[0].key;
let selectedWithdrawAddressId = null;

function renderWithdrawChainFilter() {
  withdrawChainFilter.innerHTML = DEMO_CHAINS.map(
    (c) => `<button class="market-chip${c.key === selectedWithdrawChain ? " active" : ""}" data-chain="${c.key}">${c.label}</button>`
  ).join("");
  withdrawChainFilter.querySelectorAll(".market-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      playClick();
      selectedWithdrawChain = chip.dataset.chain;
      renderWithdrawChainFilter();
    });
  });
}

function renderWithdrawAddressList() {
  const addresses = player.getWithdrawAddresses();
  withdrawAddressList.innerHTML = addresses.length
    ? addresses
        .map((a) => {
          const chain = DEMO_CHAINS.find((c) => c.key === a.chain);
          return `
            <button class="withdraw-address-item${a.id === selectedWithdrawAddressId ? " selected" : ""}" data-address="${a.id}">
              <span class="withdraw-address-info">
                <span class="withdraw-address-nickname">${a.nickname}</span>
                <span class="withdraw-address-detail">${a.address}</span>
              </span>
              <span class="withdraw-address-chain">${chain ? chain.label : a.chain}</span>
            </button>`;
        })
        .join("")
    : `<p class="withdraw-address-empty">No whitelisted wallets yet — add one below.</p>`;

  withdrawAddressList.querySelectorAll(".withdraw-address-item").forEach((el) => {
    el.addEventListener("click", () => {
      playClick();
      selectedWithdrawAddressId = el.dataset.address;
      const address = addresses.find((a) => a.id === selectedWithdrawAddressId);
      if (address) selectedWithdrawChain = address.chain;
      renderWithdrawChainFilter();
      renderWithdrawAddressList();
      withdrawConfirmBtn.disabled = false;
    });
  });
}

function openWithdrawModal() {
  const wallet = player.getWallet();
  withdrawAmountInput.value = "";
  withdrawAddressInput.value = "";
  withdrawNicknameInput.value = "";
  withdrawAvailableHint.textContent = `Available: $${wallet.cash.toLocaleString()}`;
  withdrawError.classList.add("hidden");
  selectedWithdrawAddressId = null;
  withdrawConfirmBtn.disabled = true;
  renderWithdrawChainFilter();
  renderWithdrawAddressList();
  withdrawModal.classList.remove("hidden");
  requestAnimationFrame(() => withdrawModal.classList.add("visible"));
}
function closeWithdrawModal() {
  withdrawModal.classList.remove("visible");
  setTimeout(() => withdrawModal.classList.add("hidden"), 250);
}

walletCashBtn.addEventListener("click", () => {
  playClick();
  openWithdrawModal();
});
accountWithdrawBtn.addEventListener("click", () => {
  playClick();
  openWithdrawModal();
});
withdrawCloseBtn.addEventListener("click", () => {
  playClick();
  closeWithdrawModal();
});

withdrawMaxBtn.addEventListener("click", () => {
  playClick();
  withdrawAmountInput.value = Math.floor(player.getWallet().cash);
  withdrawAmountInput.focus();
});

function showWithdrawError(text) {
  withdrawError.textContent = text;
  withdrawError.classList.remove("hidden");
}

withdrawWhitelistBtn.addEventListener("click", () => {
  playClick();
  const address = withdrawAddressInput.value.trim();
  const nickname = withdrawNicknameInput.value.trim();
  if (!address || !nickname) {
    showWithdrawError("Enter a wallet address and a nickname to whitelist it.");
    return;
  }
  withdrawError.classList.add("hidden");
  const entry = player.addWithdrawAddress({ chain: selectedWithdrawChain, address, nickname });
  selectedWithdrawAddressId = entry.id;
  withdrawAddressInput.value = "";
  withdrawNicknameInput.value = "";
  renderWithdrawAddressList();
  withdrawConfirmBtn.disabled = false;
});

withdrawConfirmBtn.addEventListener("click", () => {
  playClick();
  const amount = Math.round(Number(withdrawAmountInput.value));
  if (!amount || amount <= 0) {
    showWithdrawError("Enter an amount to withdraw.");
    return;
  }
  if (!selectedWithdrawAddressId) {
    showWithdrawError("Select (or whitelist) a wallet to withdraw to.");
    return;
  }
  if (amount > player.getWallet().cash) {
    showWithdrawError("That's more than your available Cash balance.");
    return;
  }
  const address = player.getWithdrawAddresses().find((a) => a.id === selectedWithdrawAddressId);
  if (!player.withdrawCash(amount, selectedWithdrawAddressId)) {
    showWithdrawError("Withdrawal failed — try again.");
    return;
  }
  renderWallet({ pulse: "cash" });
  showToast(`-$${amount.toLocaleString()} sent to ${address ? address.nickname : "wallet"}`, ICONS.cash);
  closeWithdrawModal();
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

  // FLIP-animate the update instead of a flat innerHTML swap: record where
  // every currently-rendered tile sits (keyed by its pull's timestamp, a
  // stable per-pull id) before touching the DOM.
  const priorLeft = new Map();
  recentPullsList.querySelectorAll(".recent-pull-item[data-pull-ts]").forEach((el) => {
    priorLeft.set(el.dataset.pullTs, el.getBoundingClientRect().left);
  });

  const itemHTML = (p) => {
    const tierKey = p.tierKey ?? "hundred";
    const badge = CATEGORIES[tierKey]?.badge ?? "Bronze";
    return `
      <div class="recent-pull-item" data-pull-ts="${p.ts}">
        <img src="${p.image}" alt="">
        <span class="recent-pull-price">$${p.price.toLocaleString()}</span>
        <span class="tier-badge tier-badge-${badge.toLowerCase()}">${badge}</span>
        <span class="recent-pull-user ${p.isPlayer ? "you" : ""}">${p.isPlayer ? "You" : p.username}</span>
      </div>`;
  };

  recentPullsList.innerHTML = feed.map(itemHTML).join("");

  recentPullsList.querySelectorAll(".recent-pull-item").forEach((el, i) => {
    el.addEventListener("click", () => openPullDetail(feed[i]));

    const wasAt = priorLeft.get(el.dataset.pullTs);
    if (wasAt == null) {
      // A genuinely new pull — it appears in place (pops in), it never
      // slides in from off to one side.
      el.style.transition = "none";
      el.style.opacity = "0";
      el.style.transform = "scale(0.82)";
      void el.offsetWidth; // force the browser to commit the styles above before...
      el.style.transition = "opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)";
      el.style.opacity = "1";
      el.style.transform = "scale(1)"; // ...transitioning to these, so it actually animates.
    } else {
      // An existing pull that just got bumped rightward by the new one
      // landing to its left — FLIP: jump it back to its old spot with no
      // transition, then transition it forward to its real (rightward)
      // position, so it visibly slides over.
      const delta = wasAt - el.getBoundingClientRect().left;
      if (delta !== 0) {
        el.style.transition = "none";
        el.style.transform = `translateX(${delta}px)`;
        void el.offsetWidth; // force-commit the jump before transitioning back, same reason as above
        el.style.transition = "transform 0.35s ease";
        el.style.transform = "";
      }
    }
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

// Expected value + odds-by-rarity for one tier's pool. Price ranges are
// derived from that pool's own spread (not fixed buckets) so a $1000-tier
// "Legendary" range reads nothing like a $100-tier one.
function computeOddsBreakdown(pool) {
  const totalWeight = pool.reduce((sum, p) => sum + p.weight, 0);
  const ev = pool.reduce((sum, p) => sum + p.price * p.weight, 0) / totalWeight;

  const byRarity = {};
  pool.forEach((p) => {
    if (!byRarity[p.rarity]) byRarity[p.rarity] = { weight: 0, min: Infinity, max: -Infinity };
    const b = byRarity[p.rarity];
    b.weight += p.weight;
    b.min = Math.min(b.min, p.price);
    b.max = Math.max(b.max, p.price);
  });

  const buckets = DISPLAY_RARITY_ORDER.slice()
    .reverse()
    .filter((r) => byRarity[r])
    .map((r) => ({
      rarity: r,
      min: byRarity[r].min,
      max: byRarity[r].max,
      pct: (byRarity[r].weight / totalWeight) * 100,
    }));

  return { ev, buckets };
}

function buildOddsPanelHTML(pool) {
  const { ev, buckets } = computeOddsBreakdown(pool);
  const bucketsHTML = buckets
    .map((b) => {
      const meta = RARITY_META[b.rarity];
      const range = b.min === b.max ? `$${b.min.toLocaleString()}` : `$${b.min.toLocaleString()}-$${b.max.toLocaleString()}`;
      const pct = b.pct >= 10 ? Math.round(b.pct) : Math.round(b.pct * 10) / 10;
      return `
        <div class="odds-bucket">
          <span class="odds-bucket-rarity" style="color:${meta.color}">${meta.label}</span>
          <span class="odds-bucket-range">${range}</span>
          <span class="odds-bucket-pct">${pct}%</span>
        </div>`;
    })
    .join("");

  return `
    <div class="odds-ev-row">
      <span>Expected Value</span>
      <span class="odds-ev-value">$${Math.round(ev).toLocaleString()} <span class="odds-ev-unit">per pull</span></span>
    </div>
    <div class="odds-live-header">Live Odds</div>
    <div class="odds-grid">${bucketsHTML}</div>
  `;
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

let categoryBoxViewers = [];
const batchQuantities = { stocks: 1, hundred: 1, twoFifty: 1, thousand: 1 };

function renderCategories() {
  categoryList.innerHTML = "";
  categoryBoxViewers.forEach((v) => v.dispose());
  categoryBoxViewers = [];

  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    const wrap = document.createElement("div");
    wrap.className = "category-wrap";

    const card = document.createElement("div");
    card.className = "category-card";
    card.innerHTML = `
      <span class="category-icon-badge" title="${cat.categoryLabel}">${ICONS[cat.categoryIcon]}</span>
      <canvas class="category-box-canvas"></canvas>
      <div class="category-tier-line">
        <span class="category-tier-name tier-name-${cat.badge.toLowerCase()}">${cat.badge}</span>
        <span class="category-tier-price">${cat.label}</span>
      </div>
      ${cat.poweredBy ? `<span class="category-powered-by">Powered by ${cat.poweredBy}</span>` : `<span class="category-powered-by-spacer"></span>`}
      ${buildPityHTML(key)}
      <div class="category-qty">
        <button class="qty-btn" data-qty-action="minus" aria-label="Fewer">−</button>
        <span class="qty-value">${batchQuantities[key]}</span>
        <button class="qty-btn" data-qty-action="plus" aria-label="More">+</button>
        <button class="qty-max-btn" data-qty-action="max">Max</button>
      </div>
      <button class="category-open-btn">Open</button>
    `;
    card.addEventListener("mouseenter", playHover);

    const qtyValueEl = card.querySelector(".qty-value");
    const maxBtn = card.querySelector('[data-qty-action="max"]');
    function refreshQty() {
      qtyValueEl.textContent = batchQuantities[key];
      maxBtn.classList.toggle("active", batchQuantities[key] === MAX_BATCH_QTY);
    }
    refreshQty();

    card.querySelector('[data-qty-action="minus"]').addEventListener("click", () => {
      playClick();
      batchQuantities[key] = Math.max(1, batchQuantities[key] - 1);
      refreshQty();
    });
    card.querySelector('[data-qty-action="plus"]').addEventListener("click", () => {
      playClick();
      batchQuantities[key] = Math.min(MAX_BATCH_QTY, batchQuantities[key] + 1);
      refreshQty();
    });
    maxBtn.addEventListener("click", () => {
      playClick();
      batchQuantities[key] = MAX_BATCH_QTY;
      refreshQty();
    });
    card.querySelector(".category-open-btn").addEventListener("click", () => {
      playClick();
      openPaymentPicker(key, batchQuantities[key]);
    });

    const prizePanel = document.createElement("div");
    prizePanel.className = "prize-dropdown";
    prizePanel.innerHTML = `
      <div class="prize-dropdown-header">
        <span>Pulls</span>
        <button class="odds-toggle-btn" aria-label="Odds breakdown" title="Odds breakdown">${ICONS.dice}</button>
      </div>
      <div class="odds-panel hidden">${buildOddsPanelHTML(cat.pool)}</div>
      <div class="prize-list">${buildPrizeListHTML(cat.pool)}</div>
    `;
    prizePanel.querySelector(".odds-toggle-btn").addEventListener("click", () => {
      playClick();
      // Toggled in lockstep across all three tiers — independent per-card
      // open/close left the row uneven height and out of alignment.
      const opening = prizePanel.querySelector(".odds-panel").classList.contains("hidden");
      categoryList.querySelectorAll(".odds-panel").forEach((p) => p.classList.toggle("hidden", !opening));
      categoryList.querySelectorAll(".odds-toggle-btn").forEach((b) => b.classList.toggle("active", opening));
    });

    wrap.appendChild(card);
    wrap.appendChild(prizePanel);
    categoryList.appendChild(wrap);

    // Decorative only — idles and spins forever, .open() is never called on it.
    createBoxViewer(card.querySelector(".category-box-canvas"), cat.badge.toLowerCase(), cat.boxKind ?? "box").then((viewer) => {
      categoryBoxViewers.push(viewer);
    });
  });

  renderRecentPulls();
  renderWallet();
}

// ---- Payment method picker ---------------------------------------------

let pendingQuantity = 1;

function openPaymentPicker(key, quantity = 1) {
  pendingCategoryKey = key;
  pendingQuantity = quantity;
  const cat = CATEGORIES[key];

  // Stocks settle in Cash only (real USDC, not a Credits reward balance) —
  // skip the picker entirely and charge Cash straight away.
  if (cat.cashOnly) {
    if (!tryPurchase("cash")) {
      showToast(`Not enough Cash for ${cat.label} — try Add Funds.`, ICONS.bell);
    }
    return;
  }

  const wallet = player.getWallet();
  const totalCost = cat.price * quantity;

  paymentTierLabel.textContent = quantity > 1 ? `${quantity}× ${cat.label}` : cat.label;
  payWithCreditsBalance.textContent = `${wallet.credits.toLocaleString()} available`;
  payWithCashBalance.textContent = `$${wallet.cash.toLocaleString()} available`;
  payWithCredits.classList.toggle("insufficient", wallet.credits < totalCost);
  payWithCash.classList.toggle("insufficient", wallet.cash < totalCost);
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
  const qty = pendingQuantity;
  const cat = CATEGORIES[key];
  const totalCost = cat.price * qty;
  const result = player.purchaseCrate(totalCost, currency);
  if (!result) {
    const label = qty > 1 ? `${qty}× ${cat.label}` : cat.label;
    paymentError.textContent = `Not enough ${currency === "cash" ? "Cash" : "Credits"} for ${label} — try Add Funds.`;
    paymentError.classList.remove("hidden");
    return false;
  }
  player.addCredits(result.rebate);
  player.logCreditEarned(result.rebate, key);
  renderWallet({ pulse: currency });
  showWalletToast(result.rebate, "credits");
  closePaymentPicker();
  batchTotal = qty;
  batchIndex = 1;
  batchRemaining = qty - 1;
  startRound(key, currency);
  return true;
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

// Matches the label to what's actually being opened — "Box" for the ODTO
// sneaker tiers, "Stock" for the Stocks tier — instead of the generic
// "Crate" for every category.
function boxNounFor(key) {
  return key === "stocks" ? "Stock" : "Box";
}

function resetSlotsUI() {
  const noun = boxNounFor(currentCategoryKey);
  slots.forEach((slot) => {
    slot.classList.remove("open", "you", "locked", "near-miss");
    slot.querySelector(".price-card").style.removeProperty("--rarity-color");
    slot.querySelector(".price-card-rarity").textContent = "";
    slot.querySelector(".price-card-image").src = "";
    slot.querySelector(".price-card-name").textContent = "";
    slot.querySelector(".price-card-price").textContent = "";
    slot.querySelector(".box-caption").textContent = `${noun} ${Number(slot.dataset.index) + 1}`;
    const tag = slot.querySelector(".near-miss-tag");
    tag.textContent = "";
    tag.classList.add("hidden");
  });
}

async function mountViewers() {
  const cat = CATEGORIES[currentCategoryKey];
  const skin = cat.badge.toLowerCase();
  const kind = cat.boxKind ?? "box";
  const canvases = slots.map((s) => s.querySelector(".box-canvas"));
  const mounted = await Promise.all(canvases.map((c) => createBoxViewer(c, skin, kind)));
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

async function computeHash(str) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fairnessPayload(prizes) {
  return prizes.map((p) => p.name).join("|");
}

// Hashes all three crates' contents the instant the round starts — before
// any pick — so revealing them later can be checked against a number that
// existed beforehand. See the fairness modal's own disclosure text for
// what this does and doesn't prove without a real backend.
async function commitFairness(prizes) {
  currentFairness = null;
  fairnessBadge.classList.add("hidden");
  if (!crypto.subtle) return; // insecure context (non-HTTPS, non-localhost) — skip quietly

  const nonce = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const hash = await computeHash(fairnessPayload(prizes) + nonce);
  currentFairness = { hash, nonce };
  fairnessBadgeLabel.textContent = "Fairness";
  fairnessBadge.classList.remove("verified");
  fairnessBadge.classList.remove("hidden");
}

async function openFairnessModal() {
  if (!currentFairness) return;
  fairnessHashValue.textContent = currentFairness.hash;

  const allRevealed = boxPrizes.every((_, i) => slots[i].classList.contains("open"));
  if (allRevealed) {
    const recomputed = await computeHash(fairnessPayload(boxPrizes) + currentFairness.nonce);
    fairnessRecomputedValue.textContent = recomputed;
    const verified = recomputed === currentFairness.hash;
    fairnessStatus.textContent = verified ? "Verified — matches the committed hash" : "Mismatch — this should never happen";
    fairnessStatus.className = `fairness-status ${verified ? "verified" : "pending"}`;
    if (verified) {
      fairnessBadgeLabel.textContent = "Verified";
      fairnessBadge.classList.add("verified");
    }
  } else {
    fairnessRecomputedValue.textContent = "—";
    fairnessStatus.textContent = "Reveal all three crates to verify";
    fairnessStatus.className = "fairness-status pending";
  }

  fairnessModal.classList.remove("hidden");
  requestAnimationFrame(() => fairnessModal.classList.add("visible"));
}
fairnessBadge.addEventListener("click", () => {
  playClick();
  openFairnessModal();
});
fairnessCloseBtn.addEventListener("click", () => {
  playClick();
  fairnessModal.classList.remove("visible");
  setTimeout(() => fairnessModal.classList.add("hidden"), 250);
});

async function startRound(key, currency) {
  currentCategoryKey = key;
  roundCurrency = currency;
  const cat = CATEGORIES[key];

  boxPrizes = [weightedPick(cat.pool), weightedPick(cat.pool), weightedPick(cat.pool)];
  boxPrizes = player.applyPity(key, boxPrizes, cat.pool);
  // Duplicate-guard runs here, for all three, rather than only on whichever
  // box gets picked — final contents have to be locked in before the
  // fairness commitment below, or the hash couldn't be trusted.
  boxPrizes = boxPrizes.map((p) => player.rerollIfDuplicate(key, p, cat.pool));
  selectedIndex = null;
  roundLocked = false;
  commitFairness(boxPrizes); // not awaited — badge appears whenever the hash resolves

  gameTierLabel.textContent = batchTotal > 1 ? `${cat.label} — ${boxNounFor(key)} ${batchIndex} of ${batchTotal}` : cat.label;
  updatePayingWithBadge();
  resetSlotsUI();
  disposeViewers();

  boxRow.classList.add("hidden");
  helperText.classList.add("hidden");
  playAgainBtn.classList.add("hidden");
  reel.classList.remove("hidden");

  showScreen(screenGame);

  const snapshotUrl = await getBoxSnapshot(cat.badge.toLowerCase(), cat.boxKind ?? "box");
  buildReel(snapshotUrl);
  await spinReel();

  reel.classList.add("hidden");
  boxRow.classList.remove("hidden");
  helperText.classList.remove("hidden");
  helperText.textContent = `Tap a ${boxNounFor(currentCategoryKey).toLowerCase()} to open it`;

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

  const finalPrize = boxPrizes[index]; // duplicate-guard already resolved at round start, see startRound

  const { streak, multiplier } = player.recordPick(finalPrize, currentCategoryKey, CATEGORIES[currentCategoryKey].price);

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
          verifyFairnessQuietly();
          if (batchRemaining > 0) {
            // Already paid for as one lump sum in tryPurchase — auto-chain
            // straight into the next crate rather than waiting on "Open Again".
            batchRemaining -= 1;
            batchIndex += 1;
            helperText.textContent = `Next crate — ${batchIndex} of ${batchTotal}…`;
            setTimeout(() => startRound(currentCategoryKey, roundCurrency), 1300);
          } else {
            helperText.classList.add("hidden");
            playAgainBtn.classList.remove("hidden");
          }
        }, 400);
      }
    }, REVEAL_STEP_MS * step);
  });
}

// Marks the badge verified as soon as all three are revealed, without
// requiring the player to open the modal first.
async function verifyFairnessQuietly() {
  if (!currentFairness) return;
  const recomputed = await computeHash(fairnessPayload(boxPrizes) + currentFairness.nonce);
  if (recomputed === currentFairness.hash) {
    fairnessBadgeLabel.textContent = "Verified";
    fairnessBadge.classList.add("verified");
  }
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
  slot.querySelector(".box-caption").textContent = isYours ? `Your ${boxNounFor(currentCategoryKey)}` : "Unpicked";
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
  const metaText = itemMetaText(prize.name, prize.category);
  prizeModalMeta.textContent = metaText;
  prizeModalMeta.classList.toggle("hidden", !metaText);

  if (multiplier !== null && multiplier !== undefined) {
    const positive = multiplier > 1;
    const arrow = positive
      ? `<svg class="multiplier-badge-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`
      : "";
    multiplierBadge.innerHTML = `${arrow}${multiplier}x crate price`;
    multiplierBadge.classList.toggle("positive", positive);
    multiplierBadge.classList.remove("hidden");
  } else {
    multiplierBadge.classList.add("hidden");
  }

  const cashOutNow = Math.round(prize.price * player.cashOutMultiplier(prize.category));
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
  const amount = Math.round(prize.price * player.cashOutMultiplier(prize.category));
  player.cashBack(amount, roundCurrency);
  player.logCashOut({ name: prize.name, rarity: prize.rarity, price: prize.price, image: prize.image, amount, currency: roundCurrency });
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
let amountMax = null;
function promptAmount(title, hint, defaultValue, { max } = {}) {
  amountModalTitle.textContent = title;
  amountModalHint.textContent = hint;
  amountInput.value = defaultValue ?? "";
  amountMax = max ?? null;
  amountInput.max = max ?? "";
  amountMaxBtn.classList.toggle("hidden", max == null);
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
  let value = Math.round(Number(amountInput.value));
  if (!value || value <= 0) return;
  if (amountMax != null) value = Math.min(value, amountMax);
  playClick();
  closeAmountModal(value);
});
amountCancelBtn.addEventListener("click", () => {
  playClick();
  closeAmountModal(null);
});
amountMaxBtn.addEventListener("click", () => {
  if (amountMax == null) return;
  playClick();
  amountInput.value = amountMax;
  amountInput.focus();
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
  // Computed live from the name rather than read off listing.size — older
  // listings seeded before that field existed would otherwise silently go
  // without a size badge, showing sizes only on ones created afterward.
  const sizeHTML = `<span class="market-item-size">US ${market.sizeForItem(listing.name)}</span>`;
  return `
    <div class="market-item" data-listing="${listing.id}">
      <div class="market-item-media">
        <img src="${listing.image}" alt="">
        ${sizeHTML}
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
let marketSizeValue = "all";
let marketFmvValue = "all";

function renderMarketplace() {
  market.ensureSeeded(ALL_CATALOG);

  if (marketBrandFilter.children.length === 0) {
    const brands = ["all", ...new Set(market.getListings().map((l) => market.extractBrand(l.name)))];
    marketBrandFilter.innerHTML = brands
      .map((b) => `<option value="${b}">${b === "all" ? "All Brands" : b}</option>`)
      .join("");
    marketBrandFilter.addEventListener("change", () => {
      playClick();
      marketBrandValue = marketBrandFilter.value;
      renderMarketGrid();
    });

    const sizes = ["all", ...market.SIZES];
    marketSizeFilter.innerHTML = sizes
      .map((s) => `<option value="${s}">${s === "all" ? "All Sizes" : `US ${s}`}</option>`)
      .join("");
    marketSizeFilter.addEventListener("change", () => {
      playClick();
      marketSizeValue = marketSizeFilter.value;
      renderMarketGrid();
    });

    // "Not Good" isn't a filter people actually want (nobody's browsing
    // for overpriced listings) — dropped entirely rather than shown as a
    // dead label.
    const fmvBands = [
      { key: "all", label: "All" },
      { key: "good-deal", label: "Very Good", color: "#4ade80" },
      { key: "fair", label: "Good", color: "#AFBAC4" },
    ];
    marketFmvFilter.innerHTML = fmvBands
      .map((b) => `<button class="market-chip${b.key === "all" ? " active" : ""}" data-fmv="${b.key}" ${b.color ? `style="--rarity-color:${b.color}"` : ""}>${b.label}</button>`)
      .join("");
    marketFmvFilter.querySelectorAll("button.market-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        playClick();
        marketFmvValue = chip.dataset.fmv;
        marketFmvFilter.querySelectorAll("button.market-chip").forEach((c) => c.classList.remove("active"));
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
  if (marketSizeValue !== "all") listings = listings.filter((l) => l.size === marketSizeValue);
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

  const marketGridIds = listings.map((l) => l.id);
  marketGrid.querySelectorAll(".market-item").forEach((el) => {
    el.addEventListener("click", () => openListingModal(el.dataset.listing, marketGridIds));
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
let listingNavIds = []; // the grid's current order, so arrows step through what was actually on screen
let listingNavIndex = -1;

// `navIds` is the full ordered list of listing ids from whichever grid was
// clicked (marketplace or My Listings) — omit it and the arrows just hide.
function openListingModal(id, navIds = null) {
  const listing = market.getListing(id);
  if (!listing) return;
  openListingId = listing.id;

  if (navIds) listingNavIds = navIds;
  listingNavIndex = listingNavIds.indexOf(id);

  const hasNav = listingNavIds.length > 1 && listingNavIndex !== -1;
  listingPrevBtn.classList.toggle("hidden", !hasNav);
  listingNextBtn.classList.toggle("hidden", !hasNav);
  listingPrevBtn.disabled = hasNav && listingNavIndex === 0;
  listingNextBtn.disabled = hasNav && listingNavIndex === listingNavIds.length - 1;

  // Rarity is deliberately not shown here — it's a tier-relative concept
  // that loses meaning once everything is pooled into one marketplace, so
  // every listing gets the same uniform card treatment.
  listingImage.src = listing.image;
  listingImage.alt = listing.name;
  listingName.textContent = listing.name;
  listingPrice.textContent = listing.price != null ? `$${listing.price.toLocaleString()}` : "Offer only";
  const listMeta = itemMetaText(listing.name, listing.category);
  listingMeta.textContent = listMeta;
  listingMeta.classList.toggle("hidden", !listMeta);
  listingSeller.innerHTML = listing.isPlayer ? "Held by <b>you</b>" : `Held by <b>${listing.seller}</b>`;

  // Simulated market data — every listing gets this, not just ones the
  // player owns, same deterministic day-by-day model the vault uses.
  listingMarketValue.textContent = `$${market.currentListingValue(listing).toLocaleString()}`;
  listingChart.innerHTML = buildPriceChartSVG(market.listingPriceHistory(listing));

  listingActions.classList.toggle("hidden", listing.isPlayer);
  listingBuyBtn.classList.toggle("hidden", listing.price == null);
  // Every owned item auto-populates the marketplace as an offer-only entry
  // (see addOwnedItem) and can't be pulled off it entirely — only a set
  // price can be removed, dropping it back to that offer-only baseline.
  listingUnlistBtn.classList.toggle("hidden", !listing.isPlayer || listing.price == null);
  listingUnlistBtn.textContent = "Remove Price (Keep Offers Open)";

  renderListingOffers(listing.id);

  listingModal.classList.remove("hidden");
  requestAnimationFrame(() => listingModal.classList.add("visible"));
}

listingPrevBtn.addEventListener("click", () => {
  if (listingNavIndex <= 0) return;
  playClick();
  openListingModal(listingNavIds[listingNavIndex - 1]);
});
listingNextBtn.addEventListener("click", () => {
  if (listingNavIndex === -1 || listingNavIndex >= listingNavIds.length - 1) return;
  playClick();
  openListingModal(listingNavIds[listingNavIndex + 1]);
});

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
  addOwnedItem({ name: listing.name, rarity: listing.rarity, price: listing.catalogPrice, image: listing.image, category: listing.category });
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
      addOwnedItem({ name: listing.name, rarity: listing.rarity, price: listing.catalogPrice, image: listing.image, category: listing.category });
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

const DEFAULT_AVATAR_URL = "assets/avatars/default.png";

// Deterministic per-username gradient + initial for the simulated cast —
// the player themself gets the real default avatar image instead (see
// renderAvatarInto).
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

function renderAvatarInto(el, username) {
  if (username === player.getUsername()) {
    el.style.background = "none";
    el.innerHTML = `<img src="${DEFAULT_AVATAR_URL}" alt="${username}">`;
  } else {
    const { background, initial } = avatarStyle(username);
    el.style.background = background;
    el.textContent = initial;
  }
}

function renderIdentity() {
  const username = player.getUsername();
  [topAvatar, accountAvatar].forEach((el) => renderAvatarInto(el, username));
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

streakStat.addEventListener("click", () => {
  playClick();
  document.querySelector('.nav-tab[data-nav="screen-account"]').click();
  document.querySelector('.account-nav-item[data-section="streaks"]')?.click();
});

referralStat.addEventListener("click", () => {
  playClick();
  document.querySelector('.nav-tab[data-nav="screen-account"]').click();
  document.querySelector('.account-nav-item[data-section="referral"]')?.click();
});

notifBtn.addEventListener("click", () => {
  playClick();
  openCreditsEarnedModal();
});

function openCreditsEarnedModal() {
  const events = player.getCreditEvents();
  creditsEarnedList.innerHTML = events.length
    ? events
        .map((e) => {
          const cat = CATEGORIES[e.tierKey];
          return `
          <div class="opening-row">
            <span class="opening-row-name">${cat ? cat.label : "Crate"} purchase</span>
            <span class="opening-row-mult credits-earned-amount">+${e.amount.toLocaleString()} cr</span>
          </div>`;
        })
        .join("")
    : `<div class="offers-empty">Open a crate to start earning cashback credits.</div>`;

  creditsEarnedModal.classList.remove("hidden");
  requestAnimationFrame(() => creditsEarnedModal.classList.add("visible"));
}
creditsEarnedCloseBtn.addEventListener("click", () => {
  playClick();
  creditsEarnedModal.classList.remove("visible");
  setTimeout(() => creditsEarnedModal.classList.add("hidden"), 250);
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

// ---- Public shareable profile ---------------------------------------------
// A read-only page at ?profile=<username>, standing in for the app shell
// entirely. For the real player it's built from real data; for anyone else
// (the same simulated cast used by the marketplace/leaderboard/recent-pulls
// feed) it's generated deterministically from their username, so the same
// link shows the same "profile" on every visit rather than reshuffling.

function seededRandom(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return function next() {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
}

function getProfileData(username) {
  if (username === player.getUsername()) {
    const history = player.getHistory();
    return {
      username,
      xp: player.getXp(),
      bestName: history.length ? [...history].sort((a, b) => b.price - a.price)[0].name : "—",
      recentPulls: history.slice(0, 8),
    };
  }

  const leader = FAKE_LEADERS.find((l) => l.username === username);
  const rand = seededRandom(username);
  const xp = leader ? leader.xp : Math.floor(500 + rand() * 20000);
  const tierKeys = Object.keys(CATEGORIES);
  const recentPulls = Array.from({ length: 8 }, () => {
    const tierKey = tierKeys[Math.floor(rand() * tierKeys.length)];
    const prize = CATEGORIES[tierKey].pool[Math.floor(rand() * CATEGORIES[tierKey].pool.length)];
    return prize;
  });
  const bestName = [...recentPulls].sort((a, b) => b.price - a.price)[0]?.name ?? "—";
  return { username, xp, bestName, recentPulls };
}

function renderPublicProfile(username) {
  const data = getProfileData(username);
  renderAvatarInto(profileAvatar, username);
  profileUsername.textContent = username;
  profileXp.textContent = data.xp.toLocaleString();
  profileBestName.textContent = data.bestName;
  profileRecentPulls.innerHTML = data.recentPulls.length
    ? data.recentPulls.map((p) => `<div class="recent-pull-item static"><img src="${p.image}" alt=""><span class="recent-pull-price">$${p.price.toLocaleString()}</span></div>`).join("")
    : `<div class="market-empty">No pulls yet.</div>`;

  document.querySelector(".shell").classList.add("hidden");
  publicProfileScreen.classList.remove("hidden");
}

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

  const earned = player.getCreditEvents().length;
  notifBadge.textContent = earned;
  notifBadge.classList.toggle("hidden", earned === 0);
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
  const sizeHTML = item.category !== "stocks" ? `<span class="market-item-size">US ${market.sizeForItem(item.name)}</span>` : "";

  return `
    <div class="market-item" data-item="${item.id}">
      <div class="market-item-media">
        <img src="${item.image}" alt="">
        ${sizeHTML}
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
          <button class="item-action-btn" data-item-action="send" data-item="${item.id}" ${archived ? "disabled" : ""}>Send</button>
        </div>
      </div>
    </div>`;
}

function buildPriceChartSVG(history) {
  const values = history.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 100;
  const h = 100;
  const stepX = w / (values.length - 1);
  const points = values.map((v, i) => `${(i * stepX).toFixed(2)},${(h - ((v - min) / range) * h).toFixed(2)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  const color = up ? "#4ade80" : "#f87171";
  return `
    <svg class="price-chart-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <polygon points="0,${h} ${points} ${w},${h}" fill="${color}" opacity="0.14"></polygon>
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"></polyline>
    </svg>`;
}

function openItemDetail(itemId) {
  const item = player.getInventoryItem(itemId);
  if (!item) return;

  itemDetailImage.src = item.image;
  itemDetailImage.alt = item.name;
  itemDetailName.textContent = item.name;
  const itemMeta = itemMetaText(item.name, item.category);
  itemDetailMeta.textContent = itemMeta;
  itemDetailMeta.classList.toggle("hidden", !itemMeta);
  const value = player.currentMarketValue(item);
  itemDetailValue.textContent = `$${value.toLocaleString()}`;
  itemDetailChart.innerHTML = buildPriceChartSVG(player.priceHistory(item));

  const buyout = player.cashOutValue(item);
  itemDetailBuyout.textContent = `$${buyout.toLocaleString()}`;
  itemDetailBuyoutBtn.dataset.item = item.id;
  itemDetailShareBtn.dataset.item = item.id;
  itemDetailDownloadBtn.dataset.item = item.id;

  const peerOffers = item.listingId ? market.getOffersForListing(item.listingId) : [];
  itemDetailPeerOffers.innerHTML = peerOffers.length
    ? peerOffers.map((o) => offerRowHTML(o)).join("")
    : `<div class="offers-empty">No offers from other users yet.</div>`;

  itemDetailModal.classList.remove("hidden");
  requestAnimationFrame(() => itemDetailModal.classList.add("visible"));
}

function closeItemDetail() {
  itemDetailModal.classList.remove("visible");
  setTimeout(() => itemDetailModal.classList.add("hidden"), 250);
}
itemDetailCloseBtn.addEventListener("click", () => {
  playClick();
  closeItemDetail();
});
// The Accept button reuses the global data-item-action delegated handler
// (see the document click listener below) — close the modal once it fires.
itemDetailBuyoutBtn.addEventListener("click", () => {
  setTimeout(closeItemDetail, 50);
});

// Share/Download compose a branded card (black frame, rounded inner
// edges, CHOSEN.WIN + logo baked into the exported pixels) from the
// item's own image — see exportCard.js.
async function withBusyLabel(btn, busyText, fn) {
  const label = btn.querySelector(".detail-media-btn-label");
  const original = label.textContent;
  btn.disabled = true;
  label.textContent = busyText;
  try {
    await fn();
  } finally {
    btn.disabled = false;
    label.textContent = original;
  }
}
itemDetailShareBtn.addEventListener("click", () => {
  const item = player.getInventoryItem(itemDetailShareBtn.dataset.item);
  if (!item) return;
  playClick();
  withBusyLabel(itemDetailShareBtn, "Preparing…", async () => {
    const blob = await buildShareCard(item);
    await shareCard(blob, item);
  });
});
itemDetailDownloadBtn.addEventListener("click", () => {
  const item = player.getInventoryItem(itemDetailDownloadBtn.dataset.item);
  if (!item) return;
  playClick();
  withBusyLabel(itemDetailDownloadBtn, "Preparing…", async () => {
    const blob = await buildShareCard(item);
    downloadShareCard(blob, item);
  });
});

// ---- Portfolio: consolidated stock holdings --------------------------
// Every stocks-tier win is its own lot in player.inventory, same as any
// other kept item — this just groups them by ticker for display. Selling
// happens here (redeem a dollar amount, no marketplace listing, no
// haircut), never through the collectibles vault flow above.

function portfolioCardHTML(holding) {
  return `
    <div class="market-item" data-ticker="${holding.ticker}">
      <div class="market-item-media">
        <img src="${holding.image}" alt="">
      </div>
      <div class="market-item-body">
        <span class="market-item-name">${holding.name}</span>
        <span class="item-cashout-today">${holding.lots.length} share${holding.lots.length === 1 ? "" : "s"} held</span>
        <div class="market-item-divider"></div>
        <div class="market-item-foot">
          <span class="market-item-price">$${holding.totalValue.toLocaleString()}</span>
        </div>
      </div>
    </div>`;
}

function renderPortfolio() {
  const portfolio = player.getPortfolio();
  portfolioCount.textContent = portfolio.length;
  portfolioGrid.innerHTML = portfolio.length
    ? portfolio.map(portfolioCardHTML).join("")
    : `<div class="market-empty">Win a stock from the Stocks tier to start your portfolio.</div>`;
  portfolioGrid.querySelectorAll(".market-item").forEach((el) => {
    el.addEventListener("click", () => openPortfolioDetail(el.dataset.ticker));
  });
}

function openPortfolioDetail(ticker) {
  const holding = player.getPortfolio().find((h) => h.ticker === ticker);
  if (!holding) return;

  portfolioDetailImage.src = holding.image;
  portfolioDetailImage.alt = holding.name;
  portfolioDetailName.textContent = holding.name;
  portfolioDetailValue.textContent = `$${holding.totalValue.toLocaleString()}`;
  portfolioDetailChart.innerHTML = buildPriceChartSVG(player.portfolioPriceHistory(ticker));

  portfolioDetailLots.innerHTML = [...holding.lots]
    .sort((a, b) => b.acquiredAt - a.acquiredAt)
    .map(
      (lot) => `
      <div class="offer-row">
        <div class="offer-row-info"><b>1 share</b><br>Won ${new Date(lot.acquiredAt).toLocaleDateString()}</div>
        <span class="offer-row-amount">$${player.currentMarketValue(lot).toLocaleString()}</span>
      </div>`
    )
    .join("");

  portfolioDetailSellBtn.dataset.ticker = ticker;
  portfolioModal.classList.remove("hidden");
  requestAnimationFrame(() => portfolioModal.classList.add("visible"));
}

function closePortfolioDetail() {
  portfolioModal.classList.remove("visible");
  setTimeout(() => portfolioModal.classList.add("hidden"), 250);
}
portfolioDetailCloseBtn.addEventListener("click", () => {
  playClick();
  closePortfolioDetail();
});
portfolioDetailSellBtn.addEventListener("click", () => {
  const ticker = portfolioDetailSellBtn.dataset.ticker;
  const holding = player.getPortfolio().find((h) => h.ticker === ticker);
  if (!holding) return;
  promptAmount("Sell Share Value", `${holding.name} — you hold $${holding.totalValue.toLocaleString()}.`, holding.totalValue, { max: holding.totalValue }).then((amount) => {
    if (!amount) return;
    playClick();
    const sold = player.sellStock(ticker, amount);
    player.addCash(sold);
    player.logCashOut({ name: holding.name, rarity: holding.lots[0].rarity, price: sold, image: holding.image, amount: sold, currency: "cash" });
    renderWallet({ pulse: "cash" });
    showWalletToast(sold, "cash");
    closePortfolioDetail();
    renderAccount();
  });
});

// Current simulated value of everything sitting in the Vault right now —
// collectibles only, stocks live in the Portfolio total instead.
function getVaultValue() {
  return player
    .getInventory()
    .filter((item) => item.category !== "stocks")
    .reduce((sum, item) => sum + player.currentMarketValue(item), 0);
}

// Current simulated value of every consolidated stock position.
function getPortfolioValue() {
  return player.getPortfolio().reduce((sum, holding) => sum + holding.totalValue, 0);
}

function renderAccount() {
  renderIdentity();
  sideCredits.textContent = player.getWallet().credits.toLocaleString();
  sideCash.textContent = `$${player.getWallet().cash.toLocaleString()}`;
  sideXp.textContent = player.getXp().toLocaleString();
  sideVaultValue.textContent = `$${getVaultValue().toLocaleString()}`;
  sidePortfolioValue.textContent = `$${getPortfolioValue().toLocaleString()}`;

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
  const myListingIds = myListings.map((l) => l.id);
  myListingsGrid.querySelectorAll(".market-item").forEach((el) => {
    el.addEventListener("click", () => openListingModal(el.dataset.listing, myListingIds));
  });

  const collectibles = player.getInventory().filter((i) => i.category !== "stocks");
  vaultCount.textContent = collectibles.length;
  inventoryGrid.innerHTML = collectibles.length
    ? collectibles.map(inventoryItemHTML).join("")
    : `<div class="market-empty">Keep, Ship or List a prize from a crate reveal to see it here.</div>`;
  inventoryGrid.querySelectorAll(".market-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".item-actions")) return;
      openItemDetail(el.dataset.item);
    });
  });

  renderPortfolio();

  const myOffers = market.getMyOffers();
  myOffersList.innerHTML = myOffers.length
    ? myOffers.map((o) => offerRowHTML(o, { showActions: o.status === "countered" ? "counter-received" : null })).join("")
    : `<div class="offers-empty">You haven't made any offers yet.</div>`;

  renderOpeningHistory();
  renderCashedOut();
  renderShipped();
  renderTransfers();
  renderLeaderboard();
  renderReferralPanel();
  renderStreaks();
  renderClips();
}

// Screen-recording was pulled (getDisplayMedia's permission prompt doesn't
// hold up in a shared demo) — Clips is a placeholder section for now,
// pre-populated with blank video states rather than left empty.
const BLANK_CLIP_COUNT = 3;
const blankClipSVG = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="15" height="14" rx="2"/><path d="M17 9l5-3v12l-5-3"/></svg>`;

function renderClips() {
  clipsCount.textContent = BLANK_CLIP_COUNT;
  clipsGrid.innerHTML = Array.from({ length: BLANK_CLIP_COUNT })
    .map(
      () => `
      <div class="clip-card clip-card-blank">
        <div class="clip-card-placeholder">${blankClipSVG}</div>
        <div class="clip-card-body">
          <span class="clip-card-name">No recording yet</span>
        </div>
      </div>`
    )
    .join("");
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

function renderCashedOut() {
  const cashedOut = player.getCashedOut();
  cashedOutList.innerHTML = cashedOut.length
    ? cashedOut
        .map(
          (o) => `
          <div class="opening-row">
            <img src="${o.image}" alt="">
            <span class="opening-row-name">${o.name}</span>
            <span class="opening-row-mult">${o.currency === "cash" ? "$" : ""}${o.amount.toLocaleString()}${o.currency === "credits" ? " cr" : ""}</span>
          </div>`
        )
        .join("")
    : `<div class="offers-empty">Nothing cashed out yet.</div>`;
}

function renderTransfers() {
  const transfers = player.getTransfers();
  transfersList.innerHTML = transfers.length
    ? transfers
        .map(
          (t) => `
          <div class="opening-row">
            <img src="${t.image}" alt="">
            <span class="opening-row-name">${t.name}</span>
            <span class="opening-row-mult">→ ${t.toUsername}</span>
          </div>`
        )
        .join("")
    : `<div class="offers-empty">Nothing sent yet.</div>`;
}

function renderShipped() {
  const shipped = player.getShipped();
  shippedList.innerHTML = shipped.length
    ? shipped
        .map((item) => {
          const sizeHTML = item.category !== "stocks" ? `<span class="market-item-size">US ${market.sizeForItem(item.name)}</span>` : "";
          return `
            <div class="market-item static">
              <div class="market-item-media">
                <img src="${item.image}" alt="">
                ${sizeHTML}
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
      <div class="leaderboard-row ${r.isPlayer ? "you" : ""}" data-username="${r.username}">
        <span class="leaderboard-rank">#${i + 1}</span>
        <span class="leaderboard-name">${r.isPlayer ? "You" : r.username}</span>
        <span class="leaderboard-xp">${r.xp.toLocaleString()} XP</span>
      </div>`
    )
    .join("");
  leaderboardList.querySelectorAll(".leaderboard-row").forEach((el) => {
    el.addEventListener("click", () => {
      location.search = `?profile=${encodeURIComponent(el.dataset.username)}`;
    });
  });
}

function renderReferralPanel() {
  const referral = player.getReferralTier();
  const nextText = referral.next
    ? `${Math.round(referral.progress * 100)}% to ${Math.round(referral.next.share * 100)}% at $${referral.next.volume.toLocaleString()}`
    : "At the ceiling";
  const claimable = player.getReferralClaimable();
  const creditsClaimAmount = Math.round(claimable * (1 + player.REFERRAL_CREDITS_BONUS));
  referralPanel.innerHTML = `
    <div class="referral-current">
      <div><span class="share">${Math.round(referral.share * 100)}%</span> current share</div>
      <div class="next">${nextText}</div>
    </div>
    <div class="referral-progress-track"><div class="referral-progress-fill" style="width:${Math.round(referral.progress * 100)}%"></div></div>

    <div class="referral-claim">
      <div class="referral-claim-info">
        <div class="referral-claim-label">Available to Claim</div>
        <div class="referral-claim-amount">${claimable.toLocaleString()}</div>
      </div>
      <div class="referral-claim-actions">
        <button id="referralClaimCashBtn" class="exit-btn" ${claimable <= 0 ? "disabled" : ""}>
          <span class="exit-btn-label">Cash Back</span>
          <span class="exit-btn-sub">$${claimable.toLocaleString()}</span>
        </button>
        <button id="referralClaimCreditsBtn" class="exit-btn exit-btn-primary" ${claimable <= 0 ? "disabled" : ""}>
          <span class="exit-btn-label">Credits <span class="referral-claim-bonus">1.1x</span></span>
          <span class="exit-btn-sub">${creditsClaimAmount.toLocaleString()} credits</span>
        </button>
      </div>
    </div>

    <div class="referral-section-label">Referred by You</div>
    <table class="referral-table">
      <thead><tr><th>Username</th><th>Fees</th></tr></thead>
      <tbody>
        ${FAKE_REFERRALS.map((r) => `<tr><td>${r.username}</td><td>$${accruedFees(r).toLocaleString()}</td></tr>`).join("")}
      </tbody>
    </table>

    <div class="referral-section-label">How Your Share Is Earned</div>
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

  document.getElementById("referralClaimCashBtn").addEventListener("click", () => {
    const amount = player.claimReferralCash();
    if (!amount) return;
    playClick();
    renderWallet({ pulse: "cash" });
    showWalletToast(amount, "cash");
    renderReferralPanel();
  });
  document.getElementById("referralClaimCreditsBtn").addEventListener("click", () => {
    const amount = player.claimReferralCredits();
    if (!amount) return;
    playClick();
    renderWallet({ pulse: "credits" });
    showWalletToast(amount, "credits");
    renderReferralPanel();
  });
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
        addOwnedItem({ name: listing.name, rarity: listing.rarity, price: listing.catalogPrice, image: listing.image, category: listing.category });
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
      player.logCashOut({ name: item.name, rarity: item.rarity, price: item.price, image: item.image, amount, currency: "cash" });
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
    } else if (action === "send") {
      const toUsername = prompt(`Send ${item.name} to which username?`);
      if (!toUsername || !toUsername.trim()) return;
      playClick();
      if (item.listingId) market.removeListing(item.listingId);
      player.transferItem(item, toUsername.trim());
      showToast(`Sent to ${toUsername.trim()}`, ICONS.bell);
      renderAccount();
    }
  }
});

// ---- Footer: quick links navigate for real; social/support are labeled
// placeholders (no real destinations exist for a demo) that surface an
// honest "coming soon" rather than a dead link with no feedback. ---------
document.querySelectorAll("[data-footer-nav]").forEach((btn) => {
  btn.addEventListener("click", () => {
    playClick();
    document.querySelector(`.nav-tab[data-nav="${btn.dataset.footerNav}"]`)?.click();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});
document.querySelectorAll("[data-footer-link]").forEach((btn) => {
  btn.addEventListener("click", () => {
    playClick();
    showToast(`${btn.dataset.footerLink} — coming soon`, ICONS.bell);
  });
});

const profileParam = new URLSearchParams(location.search).get("profile");
if (profileParam) {
  renderPublicProfile(profileParam);
} else {
  renderIdentity();
  seedSimulatedPulls();
  seedDemoInventory();
  renderCategories();
  setInterval(tickSimulatedPulls, 4000);
}
