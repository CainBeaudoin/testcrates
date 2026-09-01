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
import * as stockx from "./stockx.js";
import { buildShareCard, downloadShareCard, shareCard } from "./exportCard.js";
import * as liveActivity from "./liveActivity.js";

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
    poweredBy: "Robinhood Chain",
    boxKind: "printer", // generic printer model, not the shoe box
    cashOnly: true, // real USDC settlement, not a Credits reward balance
  },
  hundred: {
    label: "$100",
    badge: "Bronze",
    price: 100,
    pool: HUNDRED_POOL,
    poweredBy: "ODTO",
  },
  twoFifty: {
    label: "$250",
    badge: "Silver",
    price: 250,
    pool: TWO_FIFTY_POOL,
    poweredBy: "ODTO",
  },
  thousand: {
    label: "$1000",
    badge: "Gold",
    price: 1000,
    pool: THOUSAND_POOL,
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
// A deep enough board that ranking means something and the pagination below
// has pages to turn — the player slots in by XP wherever they land.
const FAKE_LEADERS = [
  { username: "VaultKid", xp: 48200 },
  { username: "CrateDigger", xp: 36500 },
  { username: "GrailChaser22", xp: 29800 },
  { username: "NorthStarTrades", xp: 21100 },
  { username: "HeatCheckHQ", xp: 15600 },
  { username: "OrbitLace", xp: 9700 },
  { username: "ReplayDrops", xp: 4200 },
  { username: "SoleSeeker", xp: 43100 },
  { username: "PixelHawk77", xp: 39400 },
  { username: "DuneRunner", xp: 33750 },
  { username: "MidnightCartel", xp: 31200 },
  { username: "ThreadCounter", xp: 27900 },
  { username: "BackboardBandit", xp: 26400 },
  { username: "RarePairz", xp: 24850 },
  { username: "LaceLogic", xp: 23300 },
  { username: "BoxFreshBen", xp: 22050 },
  { username: "AtriumApe", xp: 20400 },
  { username: "QuietStorm88", xp: 19250 },
  { username: "CopOrDrop", xp: 18100 },
  { username: "VelvetSole", xp: 16900 },
  { username: "NeonAtrium", xp: 14750 },
  { username: "HollowPoint", xp: 13900 },
  { username: "SuedeSociety", xp: 13100 },
  { username: "GlassCannon", xp: 12400 },
  { username: "PaperRoute", xp: 11800 },
  { username: "TripleWhite", xp: 11200 },
  { username: "OffsetOllie", xp: 10600 },
  { username: "CarbonCopy", xp: 10050 },
  { username: "SilentPartner", xp: 9200 },
  { username: "DriftKing", xp: 8700 },
  { username: "MonoChrome", xp: 8250 },
  { username: "SecondWind", xp: 7800 },
  { username: "LowTop", xp: 7350 },
  { username: "GhostRunner", xp: 6900 },
  { username: "SaltFlats", xp: 6100 },
  { username: "CobaltClub", xp: 5700 },
  { username: "EchoPark", xp: 5300 },
  { username: "TenthMan", xp: 4900 },
  { username: "PaleHorse", xp: 3800 },
  { username: "SlowBurn", xp: 3400 },
  { username: "IronLace", xp: 3000 },
  { username: "OpenBox", xp: 2600 },
  { username: "FadedGlory", xp: 2200 },
  { username: "LastCall", xp: 1800 },
  { username: "RookieYear", xp: 1400 },
  { username: "FirstPull", xp: 950 },
  { username: "WindowShopper", xp: 600 },
  { username: "DayOne", xp: 250 },
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

// A referral is "active" once they've opened a drop — fees only start
// accruing at that point, so a non-zero balance is the same signal.
function activeReferrals() {
  return FAKE_REFERRALS.filter((r) => accruedFees(r) > 0).length;
}

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
const recentPullsTitle = document.getElementById("recentPullsTitle");
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
// [data-group] excludes #accountMoreBtn — it opens the footer-info modal
// rather than switching which section(s) are showing, so it can't run
// through the generic group-switching handler below.
const accountNavItems = Array.from(document.querySelectorAll(".account-nav-item[data-group]"));
const accountSections = Array.from(document.querySelectorAll(".account-section"));
const vaultCount = document.getElementById("vaultCount");
const inventoryGrid = document.getElementById("inventoryGrid");
const activityList = document.getElementById("activityList");
const activityCount = document.getElementById("activityCount");
const clipsGrid = document.getElementById("clipsGrid");
const clipsCount = document.getElementById("clipsCount");
const leaderboardList = document.getElementById("leaderboardList");
const leaderboardPrevBtn = document.getElementById("leaderboardPrevBtn");
const leaderboardNextBtn = document.getElementById("leaderboardNextBtn");
const leaderboardPageLabel = document.getElementById("leaderboardPageLabel");
const leaderboardYouNote = document.getElementById("leaderboardYouNote");
const referralPanel = document.getElementById("referralPanel");
const rwStreakStat = document.getElementById("rwStreakStat");
const rwRankStat = document.getElementById("rwRankStat");
const rwShareStat = document.getElementById("rwShareStat");
const rwWeekDays = document.getElementById("rwWeekDays");
const rwWeekGoal = document.getElementById("rwWeekGoal");
const rwWeekNote = document.getElementById("rwWeekNote");
const rwWeekStrip = document.getElementById("rwWeekStrip");
const rwWeekFill = document.getElementById("rwWeekFill");
const rwEarnList = document.getElementById("rwEarnList");
const streakRafflePrize = document.getElementById("streakRafflePrize");
const topAvatar = document.getElementById("topAvatar");
const topUsername = document.getElementById("topUsername");
const avatarBtn = document.getElementById("avatarBtn");
const notifBtn = document.getElementById("notifBtn");
const notifBadge = document.getElementById("notifBadge");
const creditsEarnedModal = document.getElementById("creditsEarnedModal");
const creditsEarnedList = document.getElementById("creditsEarnedList");
const creditsEarnedCloseBtn = document.getElementById("creditsEarnedCloseBtn");
const creditsEarnedClearBtn = document.getElementById("creditsEarnedClearBtn");
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
const listingChartCaption = document.getElementById("listingChartCaption");
const listingMarketValueLabel = document.getElementById("listingMarketValueLabel");
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
const itemDetailChartCaption = document.getElementById("itemDetailChartCaption");
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
const portfolioDetailChartCaption = document.getElementById("portfolioDetailChartCaption");
const portfolioDetailLots = document.getElementById("portfolioDetailLots");
const portfolioDetailSellBtn = document.getElementById("portfolioDetailSellBtn");
const portfolioDetailSendBtn = document.getElementById("portfolioDetailSendBtn");
portfolioDetailSendBtn.innerHTML = ICONS.send;
const portfolioDetailCloseBtn = document.getElementById("portfolioDetailCloseBtn");
const amountModal = document.getElementById("amountModal");
const amountModalTitle = document.getElementById("amountModalTitle");
const amountModalHint = document.getElementById("amountModalHint");
const amountInput = document.getElementById("amountInput");
const amountCancelBtn = document.getElementById("amountCancelBtn");
const amountConfirmBtn = document.getElementById("amountConfirmBtn");
const amountQuickRow = document.getElementById("amountQuickRow");

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
  // Leaving Drops (or coming back to it, e.g. after an open) always lands
  // on the tier list rather than whichever tier page was last open.
  closeTierDetail();
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

// Set while a tier page is open, so the carousel under it shows that
// tier's pulls only — see openTierDetail. null = the whole feed.
let recentPullsTierKey = null;

function renderRecentPulls() {
  const mine = player.getHistory().map((p) => ({ ...p, username: player.getUsername(), isPlayer: true }));
  const all = [...mine, ...simulatedPulls];
  const scoped = recentPullsTierKey
    ? all.filter((p) => (p.tierKey ?? "hundred") === recentPullsTierKey)
    : all;
  const feed = scoped.sort((a, b) => b.ts - a.ts).slice(0, 16);

  recentPullsTitle.textContent = recentPullsTierKey
    ? `Recent ${CATEGORIES[recentPullsTierKey].badge} Pulls`
    : "Recent Pulls";

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

  return { buckets };
}

function buildOddsPanelHTML(pool) {
  const { buckets } = computeOddsBreakdown(pool);
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

// ---- Tier detail page ----------------------------------------------------
// Promotes one tier to a page of its own — its odds and full prize list
// instead of all four tiers' worth stacked down the Drops screen.

const dropDetailBackBtn = document.getElementById("dropDetailBackBtn");

function openTierDetail(wrap) {
  categoryList.querySelectorAll(".drop-detail-active").forEach((w) => w.classList.remove("drop-detail-active"));
  wrap.classList.add("drop-detail-active");
  document.body.classList.add("drop-detail-open");
  // The carousel stays put below the card, narrowed to this tier's pulls.
  recentPullsTierKey = wrap.dataset.tier;
  renderRecentPulls();
  window.scrollTo({ top: 0 });
}

function closeTierDetail() {
  document.body.classList.remove("drop-detail-open");
  categoryList.querySelectorAll(".drop-detail-active").forEach((w) => w.classList.remove("drop-detail-active"));
  if (recentPullsTierKey !== null) {
    recentPullsTierKey = null;
    renderRecentPulls();
  }
}

dropDetailBackBtn.addEventListener("click", () => {
  playClick();
  closeTierDetail();
});

function renderCategories() {
  categoryList.innerHTML = "";
  categoryBoxViewers.forEach((v) => v.dispose());
  categoryBoxViewers = [];

  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    const wrap = document.createElement("div");
    wrap.className = "category-wrap";
    wrap.dataset.tier = key;

    const paymentBadgesHTML = cat.cashOnly
      ? `<span class="category-icon-badge" title="Cash only — settles in real USDC">${ICONS.cash}</span>`
      : `<span class="category-icon-badge" title="Buy with Cash — cashback pays back in Cash">${ICONS.cash}</span>
         <span class="category-icon-badge" title="Buy with Credits — cashback pays back in Credits">${ICONS.card}</span>`;

    const card = document.createElement("div");
    card.className = "category-card";
    card.innerHTML = `
      <div class="category-payment-badges">${paymentBadgesHTML}</div>
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

    // Clicking the card body (not its buttons) promotes this tier to its
    // own page. Nothing is re-rendered — the other wraps are just hidden
    // by CSS — so the card keeps the very same spinning 3D box it was
    // already showing, and the qty/Open handlers stay live.
    card.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      openTierDetail(wrap);
    });

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
      <label for="prizeListToggleAll" class="prize-list-toggle-label">View all prizes</label>
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
  // skip the picker entirely and charge Cash straight away. tryPurchase
  // itself handles routing to Add Funds if the balance falls short.
  if (cat.cashOnly) {
    tryPurchase("cash");
    return;
  }

  const wallet = player.getWallet();
  const totalCost = cat.price * quantity;

  paymentTierLabel.textContent = quantity > 1 ? `${quantity}× ${cat.label}` : cat.label;
  payWithCreditsBalance.textContent = `${wallet.credits.toLocaleString()} available`;
  payWithCashBalance.textContent = `$${wallet.cash.toLocaleString()} available`;
  payWithCredits.classList.toggle("insufficient", wallet.credits < totalCost);
  payWithCash.classList.toggle("insufficient", wallet.cash < totalCost);

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
    // Route straight into Add Funds rather than leaving the user stuck on
    // an error — Credits can't be topped up directly, but Cash can, and
    // topping up Cash is the only way forward either way.
    closePaymentPicker();
    showToast(`Not enough ${currency === "cash" ? "Cash" : "Credits"} for ${label} — add funds to continue`, ICONS.bell);
    openAddFundsModal();
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

  // Dynamic Island: "◈ OPENING" from here until the pick resolves. A no-op
  // outside the iOS companion app (see liveActivity.js).
  liveActivity.startOpening({ crate: `${cat.badge} Crate` });

  boxPrizes = [weightedPick(cat.pool), weightedPick(cat.pool), weightedPick(cat.pool)];
  boxPrizes = player.applyPity(key, boxPrizes, cat.pool);
  // Duplicate-guard runs here, for all three, rather than only on whichever
  // box gets picked — final contents have to be locked in before the
  // fairness commitment below, or the hash couldn't be trusted.
  boxPrizes = boxPrizes.map((p) => player.rerollIfDuplicate(key, p, cat.pool));
  selectedIndex = null;
  roundLocked = false;
  commitFairness(boxPrizes); // not awaited — badge appears whenever the hash resolves

  // No price here — what the crate cost belongs on the Drops page you pick
  // it from, not over the open itself. The batch counter still earns its
  // place; a single open leaves this empty and the :empty rule collapses it.
  gameTierLabel.textContent = batchTotal > 1 ? `${boxNounFor(key)} ${batchIndex} of ${batchTotal}` : "";
  updatePayingWithBadge();
  resetSlotsUI();
  disposeViewers();

  boxRow.classList.add("hidden");
  helperText.classList.add("hidden");
  playAgainBtn.classList.add("hidden");
  // Leaving mid-pick would abandon a round whose contents are already
  // locked in (see the fairness commitment above) — only offer a way out
  // once the reveal has actually played out.
  backBtn.classList.add("hidden");
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

  // Result is known — the Live Activity switches from OPENING to the rarity.
  // Deliberately fired here rather than after the modal animation: the point
  // of the island is that it resolves while you're looking at the phone, not
  // three seconds behind the screen.
  liveActivity.reportItem({
    rarity: finalPrize.rarity,
    rarityLabel: RARITY_META[finalPrize.rarity].label,
    name: finalPrize.name,
    value: finalPrize.price,
    image: finalPrize.image,
  });

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

      // The glow pulse carries the beat on its own — the "So close — that
      // was Epic!" caption that used to sit under the card read as
      // repetitive the moment a round turned up two of them.
      if (isNearMiss) {
        slots[otherIndex].classList.add("near-miss");
        playPop();
      }

      if (step === others.length - 1) {
        setTimeout(() => {
          verifyFairnessQuietly();
          if (batchRemaining > 0) {
            // Already paid for as one lump sum in tryPurchase — auto-chain
            // straight into the next crate rather than waiting on "Try Again".
            batchRemaining -= 1;
            batchIndex += 1;
            helperText.textContent = `Next crate — ${batchIndex} of ${batchTotal}…`;
            setTimeout(() => startRound(currentCategoryKey, roundCurrency), 1300);
          } else {
            helperText.classList.add("hidden");
            playAgainBtn.classList.remove("hidden");
            backBtn.classList.remove("hidden");
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
  // The one exit that pays a balance instead of an item, so the one that
  // turns the island into "+333 ◈".
  const wallet = player.getWallet();
  liveActivity.reportCredits({
    amount,
    currency: roundCurrency,
    balance: roundCurrency === "cash" ? wallet.cash : wallet.credits,
  });
  renderWallet({ pulse: roundCurrency });
  showWalletToast(amount, roundCurrency);
  hidePrizeModal();
  revealOthers();
});

vaultKeepBtn.addEventListener("click", () => {
  const prize = boxPrizes[selectedIndex];
  if (!prize) return;
  playClick();
  const item = addOwnedItem(prize);
  // Same result, but now it has a vault id — re-sent so the island's tap
  // target lands on the item's own page instead of the reveal screen.
  liveActivity.reportItem({
    rarity: prize.rarity,
    rarityLabel: RARITY_META[prize.rarity].label,
    name: prize.name,
    value: prize.price,
    image: prize.image,
    itemId: item?.id,
  });
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
  // Done looking at this open — dismiss the island now rather than leaving it
  // to time out.
  liveActivity.end();
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

// On mobile the bottom tab bar is Drops/Market/Account only — mute moves
// into the footer's Social Media row instead (same button/click handler,
// just reparented) so it's not competing with real navigation. Desktop
// keeps it in the rail. Re-parenting (not cloning) means the listener
// above stays attached wherever the node ends up.
const railBottom = document.querySelector(".rail-bottom");
const footerSocial = document.querySelector(".app-footer-social");
const mobileNavQuery = window.matchMedia("(max-width: 640px)");
function placeMuteBtn(isMobile) {
  const target = isMobile ? footerSocial : railBottom;
  if (target && muteBtn.parentElement !== target) target.appendChild(muteBtn);
}
placeMuteBtn(mobileNavQuery.matches);
mobileNavQuery.addEventListener("change", (e) => placeMuteBtn(e.matches));

// ---- Nav tabs (Boxes / Marketplace / Account) -----------------------------

// Mobile's floating controls get out of the way while the page is moving:
// the Filters button dims, and Account's two bottom bars tuck away on the
// way down. Both come back the moment you scroll up or simply stop, so
// .scrolling-down is cleared on the same idle timer as .is-scrolling.
// Inert elsewhere — neither class is styled outside the mobile block.
let scrollFadeTimer = null;
let lastScrollY = window.scrollY;
window.addEventListener(
  "scroll",
  () => {
    const y = window.scrollY;
    // A few pixels of slack so scroll jitter doesn't flip the direction.
    if (Math.abs(y - lastScrollY) > 4) {
      document.body.classList.toggle("scrolling-down", y > lastScrollY);
      lastScrollY = y;
    }
    document.body.classList.add("is-scrolling");
    clearTimeout(scrollFadeTimer);
    scrollFadeTimer = setTimeout(() => {
      document.body.classList.remove("is-scrolling", "scrolling-down");
    }, 220);
  },
  { passive: true }
);

// The wordmark is a way home — same as clicking the Drops tab.
document.getElementById("brandHomeBtn").addEventListener("click", () => {
  document.querySelector('.nav-tab[data-nav="screen-category"]').click();
});

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
    // Two rail tabs land on the Account screen — Rewards opens straight into
    // its group, plain Account falls back to the first one.
    if (tab.dataset.nav === "screen-account") {
      showAccountGroup(tab.dataset.accountGroup || "holdings");
    }
  });
});

// ---- Account sidebar sub-nav (Profile / Holdings / Selling / Activity / Rewards) ---
// Each tab groups several of the underlying .account-section blocks —
// 11 flat categories (Vault, Portfolio, Streaks, Clips, Listings, Offers,
// History, Shipped, Leaderboard, Referral) was too many to scan at a
// glance, so they're paired up by what they're actually about. Every
// section keeps its own render function and its own <h3> sub-header
// (see index.html) — grouping only changes which combination of them is
// visible at once, nothing about how they're built.
// Selling's sections live under Activity now — listings, offers and the
// event log are all things that happened to your items, and splitting them
// across two tabs meant the same item's story was in two places.
const ACCOUNT_NAV_GROUPS = {
  profile: ["profile"],
  holdings: ["vault", "portfolio"],
  activity: ["activity"],
  rewards: ["rewards"],
  clips: ["clips"],
};

const accountToggles = Array.from(document.querySelectorAll(".account-toggle"));

// Shared by the Account sub-nav and by the rail's Rewards tab, which opens
// a group that has no sub-nav item of its own to click.
function showAccountGroup(group) {
  accountNavItems.forEach((i) => i.classList.toggle("active", i.dataset.group === group));
  const sections = ACCOUNT_NAV_GROUPS[group] ?? [];
  accountSections.forEach((s) => s.classList.toggle("active", sections.includes(s.dataset.section)));
  // The second-level toggle (My Items vs Portfolio, etc.) only makes sense
  // for whichever group is now showing.
  accountToggles.forEach((t) => t.classList.toggle("toggle-group-active", t.dataset.toggleGroup === group));
}

accountNavItems.forEach((item) => {
  item.addEventListener("click", () => {
    playClick();
    showAccountGroup(item.dataset.group);
  });
});

// ---- Account: mobile-only "More" — the footer's own content shown as an
// overlay instead of duplicating it, since on mobile the footer is never
// part of the normal page flow (see the mobile media query for
// .app-footer's fixed-overlay styling; desktop still shows it inline as
// before and never sees this button, which stays display:none there). ---
const accountMoreBtn = document.getElementById("accountMoreBtn");
const appFooter = document.querySelector(".app-footer");
const appFooterCloseBtn = document.getElementById("appFooterCloseBtn");
accountMoreBtn.addEventListener("click", () => {
  playClick();
  appFooter.classList.add("mobile-visible");
});
appFooterCloseBtn.addEventListener("click", () => {
  playClick();
  appFooter.classList.remove("mobile-visible");
});

// ---- Account: mobile-only second-level toggle within a nav group ---------
// e.g. Holdings' "My Items" vs "Portfolio" — a generic handler so it
// doesn't need per-group wiring. A target with data-toggle-key can carry
// more than one space-separated key (the shared Offers/History wrapper,
// which should stay visible for either of its own sub-options) — hidden
// unless at least one of its keys matches whatever's selected in its
// toggle group. Purely a mobile visual concern (.toggle-hidden only does
// anything inside the mobile media query), so this runs harmlessly on
// desktop too.
document.querySelectorAll(".account-toggle").forEach((toggle) => {
  const buttons = Array.from(toggle.querySelectorAll(".account-toggle-label"));
  const groupKeys = new Set(buttons.map((b) => b.dataset.toggleTarget));
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      playClick();
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const selectedKey = btn.dataset.toggleTarget;
      document.querySelectorAll("[data-toggle-key]").forEach((el) => {
        const keys = el.dataset.toggleKey.split(" ");
        if (!keys.some((k) => groupKeys.has(k))) return; // belongs to a different toggle group
        el.classList.toggle("toggle-hidden", !keys.includes(selectedKey));
      });
    });
  });
});

// ---- Account: KicksDB key for live StockX pricing -----------------------
// Saved to this browser only (see stockx.getKey). Verifying on save is worth
// the one request: it distinguishes a bad key from a working key on a plan
// whose sales history is locked, which is exactly what decides whether the
// charts can ever be live.
const apiKeyInput = document.getElementById("apiKeyInput");
const apiKeyStatus = document.getElementById("apiKeyStatus");
const apiKeySaveBtn = document.getElementById("apiKeySaveBtn");
const apiKeyClearBtn = document.getElementById("apiKeyClearBtn");

function setKeyStatus(text, state) {
  apiKeyStatus.textContent = text;
  apiKeyStatus.className = `api-key-status ${state}`;
}

function renderApiKeyState() {
  const key = stockx.getKey();
  apiKeyInput.value = key;
  if (!key) {
    setKeyStatus("Not connected — charts show simulated data.", "idle");
  } else {
    setKeyStatus(`Connected · ${key.slice(0, 10)}…`, "ok");
  }
}

apiKeySaveBtn.addEventListener("click", async () => {
  playClick();
  const key = apiKeyInput.value.trim();
  if (!key) {
    setKeyStatus("Enter a key first.", "warn");
    return;
  }
  setKeyStatus("Checking…", "idle");
  apiKeySaveBtn.disabled = true;
  const result = await stockx.verifyKey(key);
  apiKeySaveBtn.disabled = false;

  if (!result.ok) {
    const why =
      result.reason === "rejected"
        ? "Key rejected by KicksDB."
        : result.reason === "unreachable"
          ? "Couldn't reach KicksDB."
          : `KicksDB returned ${result.reason.replace("http_", "")}.`;
    setKeyStatus(why, "warn");
    return;
  }

  stockx.setKey(key);
  // Sales history is subscriber-only, so a free key still gives real prices
  // in the chart caption but can't draw the line itself. Say which.
  setKeyStatus(
    result.history
      ? "Connected — live StockX prices, and chart lines drawn from real sales."
      : "Connected — live StockX prices. Sales history needs a paid plan, so chart lines stay simulated.",
    "ok"
  );
});

apiKeyClearBtn.addEventListener("click", () => {
  playClick();
  stockx.setKey("");
  apiKeyInput.value = "";
  renderApiKeyState();
});

renderApiKeyState();

// ---- Generic amount prompt ------------------------------------------------

let amountResolver = null;
let amountMax = null;
function promptAmount(title, hint, defaultValue, { max } = {}) {
  amountModalTitle.textContent = title;
  amountModalHint.textContent = hint;
  amountInput.value = defaultValue ?? "";
  amountMax = max ?? null;
  amountInput.max = max ?? "";
  amountQuickRow.classList.toggle("hidden", max == null);
  markActiveQuick();
  amountModal.classList.remove("hidden");
  requestAnimationFrame(() => amountModal.classList.add("visible"));
  setTimeout(() => amountInput.focus(), 50);
  return new Promise((resolve) => {
    amountResolver = resolve;
  });
}
// Highlights whichever fraction the current value matches, so the row
// reflects the field rather than just setting it.
function markActiveQuick() {
  const value = Number(amountInput.value);
  amountQuickRow.querySelectorAll(".amount-quick-btn").forEach((b) => {
    const target = amountMax != null ? Math.round((amountMax * Number(b.dataset.amountPct)) / 100) : null;
    b.classList.toggle("active", target != null && target === Math.round(value));
  });
}

amountQuickRow.querySelectorAll(".amount-quick-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (amountMax == null) return;
    playClick();
    amountInput.value = Math.max(1, Math.round((amountMax * Number(btn.dataset.amountPct)) / 100));
    markActiveQuick();
  });
});
amountInput.addEventListener("input", markActiveQuick);

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
  renderChart(listingChart, listingChartCaption, market.listingPriceHistory(listing), {
    name: listing.name,
    valueEl: listingMarketValue,
    valueLabelEl: listingMarketValueLabel,
  });

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

// Rewards is a rail tab now, so these jump straight to it rather than
// opening Account and then reaching for a sub-tab that no longer exists.
const railRewardsTab = document.querySelector('.nav-tab[data-account-group="rewards"]');

// Credits are what Rewards is about, so the pill is the way in — the Cash
// pill already opens Withdraw beside it.
document.getElementById("walletCreditsBtn").addEventListener("click", () => {
  playClick();
  railRewardsTab.click();
});

streakStat.addEventListener("click", () => {
  playClick();
  railRewardsTab.click();
});

referralStat.addEventListener("click", () => {
  playClick();
  railRewardsTab.click();
  // The pill says Referral, so land on that panel rather than the group's
  // default (Streaks).
  document.querySelector('.account-toggle[data-toggle-group="rewards"] [data-toggle-target="referral"]')?.click();
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

  creditsEarnedClearBtn.classList.toggle("hidden", events.length === 0);

  // Opening the list is what marks it read — the badge counts arrivals
  // since the last look, so it clears here rather than growing forever.
  player.markCreditEventsSeen();
  renderHeaderStats();

  creditsEarnedModal.classList.remove("hidden");
  requestAnimationFrame(() => creditsEarnedModal.classList.add("visible"));
}
creditsEarnedClearBtn.addEventListener("click", () => {
  playClick();
  player.clearCreditEvents();
  openCreditsEarnedModal();
});
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

  const unseen = player.getUnseenCreditCount();
  notifBadge.textContent = unseen;
  notifBadge.classList.toggle("hidden", unseen === 0);
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

  // Someone has bid on this one. Sits opposite the size pill so the two
  // corners read as a pair; vault cards only, the marketplace grid uses a
  // different builder.
  const pendingOffers = item.listingId
    ? market.getOffersForListing(item.listingId).filter((o) => o.status === "pending" && !o.fromIsPlayer)
    : [];
  const offerHTML = pendingOffers.length
    ? `<span class="market-item-offer-flag">${pendingOffers.length > 1 ? `${pendingOffers.length} Offers` : "Offer"}</span>`
    : "";

  return `
    <div class="market-item ${pendingOffers.length ? "has-offer" : ""}" data-item="${item.id}">
      <div class="market-item-media">
        <img src="${item.image}" alt="">
        ${offerHTML}
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
          <button class="item-action-btn item-action-icon" data-item-action="send" data-item="${item.id}" ${archived ? "disabled" : ""} title="Send to another user" aria-label="Send to another user">${ICONS.send}</button>
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

// Charts paint immediately from the app's own simulated series, then swap
// to StockX's real daily sale averages if that shoe resolves on KicksDB —
// so a chart is never blank and never blocks on the network. The caption
// always names whichever source is actually on screen; it only credits
// StockX once real trades are being drawn.
const SIMULATED_CAPTION = "Simulated price action \u2014 last 30 days";

function renderChart(chartEl, captionEl, fallbackHistory, { name, valueEl, valueLabelEl } = {}) {
  chartEl.innerHTML = buildPriceChartSVG(fallbackHistory);
  if (captionEl) captionEl.textContent = SIMULATED_CAPTION;
  if (valueLabelEl) valueLabelEl.textContent = "Simulated Market Value";
  if (!name) return;

  // Tag the request so a slow response for a previously-opened item can't
  // land on whatever the user has open by the time it arrives.
  const token = (chartEl.dataset.chartToken = String(Date.now() + Math.random()));
  const current = () => chartEl.dataset.chartToken === token;

  // Real StockX pricing (free plan) captions the chart. The line itself
  // stays simulated until the sales history is reachable, and the caption
  // says so rather than implying StockX drew it.
  stockx.marketSnapshot(name).then((snap) => {
    if (!snap || !current()) return;
    const bits = [];
    if (snap.lowestAsk) bits.push(`lowest ask $${snap.lowestAsk.toLocaleString()}`);
    if (snap.avgPrice) bits.push(`avg $${snap.avgPrice.toLocaleString()}`);
    if (captionEl && !captionEl.dataset.live) {
      captionEl.textContent = `Market reference \u00b7 StockX${bits.length ? " \u2014 " + bits.join(" \u00b7 ") : ""}`;
    }
  });

  // Subscriber-only; on the free plan this resolves null and the simulated
  // line stands. When it does resolve, the chart itself becomes StockX data.
  stockx.priceHistory(name).then((live) => {
    if (!live || !current()) return;
    chartEl.innerHTML = buildPriceChartSVG(live.points);
    if (captionEl) {
      captionEl.dataset.live = "1";
      captionEl.textContent = `Market reference \u00b7 StockX \u2014 last ${live.points.length} days of sales`;
    }
    if (valueLabelEl) valueLabelEl.textContent = "StockX Last Sale";
    if (valueEl) {
      const last = live.points[live.points.length - 1].value;
      valueEl.textContent = `$${last.toLocaleString()}`;
    }
  });
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
  renderChart(itemDetailChart, itemDetailChartCaption, player.priceHistory(item), {
    // Stocks are simulated shares with no StockX comp; sneakers resolve.
    name: item.category === "stocks" ? null : item.name,
  });

  const buyout = player.cashOutValue(item);
  itemDetailBuyout.textContent = `$${buyout.toLocaleString()}`;
  itemDetailBuyoutBtn.dataset.item = item.id;
  itemDetailShareBtn.dataset.item = item.id;
  itemDetailDownloadBtn.dataset.item = item.id;

  // Actionable here, not just a read-out: an offer on something in your
  // vault is the one place you'd want to accept or counter it.
  const peerOffers = item.listingId ? market.getOffersForListing(item.listingId) : [];
  itemDetailPeerOffers.innerHTML = peerOffers.length
    ? peerOffers
        .map((o) =>
          offerRowHTML(o, {
            showActions: o.status === "pending" && !o.fromIsPlayer ? "incoming" : null,
          })
        )
        .join("")
    : `<div class="offers-empty">No offers from other users yet.</div>`;

  itemDetailModal.dataset.item = item.id;
  itemDetailModal.classList.remove("hidden");
  requestAnimationFrame(() => itemDetailModal.classList.add("visible"));
}

// Acting on an offer from inside the detail modal has to update the modal
// too — renderAccount() only rebuilds the grid behind it, which left the
// Accept/Decline buttons for an offer you'd just answered still sitting
// there.
function refreshItemDetail() {
  if (itemDetailModal.classList.contains("hidden")) return;
  const id = itemDetailModal.dataset.item;
  if (!id) return;
  // Accepting sells the item out of the vault, so there's nothing to show.
  if (!player.getInventoryItem(id)) closeItemDetail();
  else openItemDetail(id);
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
  renderChart(portfolioDetailChart, portfolioDetailChartCaption, player.portfolioPriceHistory(ticker));

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
  portfolioDetailSendBtn.dataset.ticker = ticker;
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

// A position is several lots of the same ticker, so a transfer moves the
// whole holding rather than asking which lot — the Portfolio never exposes
// individual lots as separate things you can act on.
portfolioDetailSendBtn.addEventListener("click", () => {
  const ticker = portfolioDetailSendBtn.dataset.ticker;
  const holding = player.getPortfolio().find((h) => h.ticker === ticker);
  if (!holding) return;
  const to = prompt(`Transfer your ${ticker} position to which username or wallet address?`);
  if (!to || !to.trim()) return;
  playClick();
  const recipient = to.trim();
  // Copy first: transferItem removes from inventory as it goes, so
  // iterating the live array would skip every other lot.
  [...holding.lots].forEach((lot) => player.transferItem(lot, recipient));
  showToast(`${ticker} sent to ${recipient}`, ICONS.send);
  closePortfolioDetail();
  renderAccount();
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

  renderActivity();
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

// One feed for every event on your items — opened, cashed out, shipped,
// sent, listed, and offers in both directions — ordered by when each
// happened. These used to be five separate lists, which meant a single
// item's sequence (opened -> listed -> offer -> sold) was never visible in
// one place. Every row carries a tag saying which kind of event it was.
const ACTIVITY_TAGS = {
  opened: "Opened",
  cashedout: "Cashed Out",
  shipped: "Shipped",
  sent: "Sent",
  listed: "Listed",
  "offer-in": "Offer In",
  "offer-out": "Offer Sent",
};

function activityEvents() {
  const events = [];

  player.getHistory().forEach((o) =>
    events.push({
      kind: "opened",
      ts: o.ts ?? 0,
      name: o.name,
      image: o.image,
      value: o.multiplier != null ? `${o.multiplier}x` : "\u2014",
      big: (o.multiplier ?? 0) >= player.BIG_PULL_MULTIPLIER,
    })
  );

  player.getCashedOut().forEach((o) =>
    events.push({
      kind: "cashedout",
      ts: o.ts ?? 0,
      name: o.name,
      image: o.image,
      value: `${o.currency === "cash" ? "$" : ""}${o.amount.toLocaleString()}${o.currency === "credits" ? " cr" : ""}`,
    })
  );

  player.getShipped().forEach((o) =>
    events.push({ kind: "shipped", ts: o.shippedAt ?? 0, name: o.name, image: o.image, value: "" })
  );

  player.getTransfers().forEach((t) =>
    events.push({ kind: "sent", ts: t.ts ?? 0, name: t.name, image: t.image, value: `\u2192 ${t.toUsername}` })
  );

  market
    .getListings()
    .filter((l) => l.isPlayer && l.price != null)
    .forEach((l) =>
      events.push({
        kind: "listed",
        ts: l.ts ?? 0,
        name: l.name,
        image: l.image,
        value: `$${l.price.toLocaleString()}`,
        listingId: l.id,
      })
    );

  market.getIncomingOffers().forEach((o) => {
    const listing = market.getListing(o.listingId);
    events.push({
      kind: "offer-in",
      ts: o.ts ?? 0,
      name: listing ? listing.name : "Item",
      image: listing ? listing.image : "",
      sub: `from ${o.fromUsername}`,
      value: `$${o.amount.toLocaleString()}`,
      // The delegated [data-offer-action] handler picks these up wherever
      // they render, so acting on an offer still works inside the feed.
      actions: `
        <div class="offer-actions">
          <button class="offer-btn accept" data-offer-action="accept" data-offer="${o.id}">Accept</button>
          <button class="offer-btn" data-offer-action="counter" data-offer="${o.id}">Counter</button>
          <button class="offer-btn decline" data-offer-action="decline" data-offer="${o.id}">Decline</button>
        </div>`,
    });
  });

  market.getMyOffers().forEach((o) => {
    const listing = market.getListing(o.listingId);
    events.push({
      kind: "offer-out",
      ts: o.ts ?? 0,
      name: listing ? listing.name : "Item",
      image: listing ? listing.image : "",
      sub: `to ${o.toUsername}`,
      value: `$${o.amount.toLocaleString()}`,
      actions:
        o.status === "countered"
          ? `<div class="offer-actions">
               <button class="offer-btn accept" data-offer-action="accept-counter" data-offer="${o.id}">Accept $${o.counterAmount}</button>
               <button class="offer-btn decline" data-offer-action="decline" data-offer="${o.id}">Decline</button>
             </div>`
          : `<span class="offer-status ${o.status}">${o.status}</span>`,
    });
  });

  return events.sort((a, b) => b.ts - a.ts);
}

function relativeTime(ts) {
  if (!ts) return "";
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function renderActivity() {
  const events = activityEvents();
  activityCount.textContent = events.length;
  activityList.innerHTML = events.length
    ? events
        .map(
          (e) => `
          <div class="activity-row ${e.big ? "pinned" : ""}" ${e.listingId ? `data-listing="${e.listingId}"` : ""}>
            <img src="${e.image}" alt="">
            <div class="activity-row-info">
              <span class="activity-row-name">${e.name}</span>
              <span class="activity-row-meta">
                <span class="history-tag history-tag-${e.kind}">${ACTIVITY_TAGS[e.kind]}</span>
                ${e.sub ? `<span class="activity-row-sub">${e.sub}</span>` : ""}
                <span class="activity-row-time">${relativeTime(e.ts)}</span>
              </span>
            </div>
            <span class="activity-row-value ${e.big ? "big" : ""}">${e.value}</span>
            ${e.actions || ""}
          </div>`
        )
        .join("")
    : `<div class="offers-empty">Nothing here yet \u2014 open a crate to get started.</div>`;

  activityList.querySelectorAll(".activity-row[data-listing]").forEach((row) => {
    row.addEventListener("click", (ev) => {
      if (ev.target.closest("button")) return;
      openListingModal(row.dataset.listing);
    });
  });
}


const LEADERBOARD_PAGE_SIZE = 10;
let leaderboardPage = 0;

function renderLeaderboard() {
  const rows = [...FAKE_LEADERS, { username: player.getUsername(), xp: player.getXp(), isPlayer: true }].sort(
    (a, b) => b.xp - a.xp
  );
  const pages = Math.max(1, Math.ceil(rows.length / LEADERBOARD_PAGE_SIZE));
  leaderboardPage = Math.min(Math.max(0, leaderboardPage), pages - 1);
  const start = leaderboardPage * LEADERBOARD_PAGE_SIZE;

  leaderboardList.innerHTML = rows
    .slice(start, start + LEADERBOARD_PAGE_SIZE)
    .map(
      (r, i) => `
      <div class="leaderboard-row ${r.isPlayer ? "you" : ""}" data-username="${r.username}">
        <span class="leaderboard-rank">#${start + i + 1}</span>
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

  // Your own rank is worth knowing even when it's on another page.
  const you = rows.findIndex((r) => r.isPlayer) + 1;
  leaderboardPageLabel.textContent = `${leaderboardPage + 1} / ${pages}`;
  leaderboardYouNote.textContent = `You're #${you}`;
  leaderboardPrevBtn.disabled = leaderboardPage === 0;
  leaderboardNextBtn.disabled = leaderboardPage >= pages - 1;
}

leaderboardPrevBtn.addEventListener("click", () => {
  playClick();
  leaderboardPage -= 1;
  renderLeaderboard();
});
leaderboardNextBtn.addEventListener("click", () => {
  playClick();
  leaderboardPage += 1;
  renderLeaderboard();
});

function renderReferralPanel() {
  const active = activeReferrals();
  const referral = player.getReferralTier(active);
  const claimable = player.getReferralClaimable();
  const creditsClaimAmount = Math.round(claimable * (1 + player.REFERRAL_CREDITS_BONUS));
  // Taking it in Credits is worth more than Cash — say so on the button
  // rather than leaving it to be inferred from two different totals.
  const creditsBonusLabel = `${(1 + player.REFERRAL_CREDITS_BONUS).toFixed(1)}x`;
  const nextText = referral.next
    ? `${Math.round(referral.next.share * 100)}% at ${referral.next.referrals} active referrals`
    : "Top tier reached";

  referralPanel.innerHTML = `
    <div class="referral-current">
      <div class="referral-share-block">
        <span class="share">${Math.round(referral.share * 100)}%</span>
        <span class="referral-share-label">Current share</span>
      </div>
      <span class="next">${nextText}</span>
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
        <span class="referral-claim-or" aria-hidden="true">or</span>
        <button id="referralClaimCreditsBtn" class="exit-btn exit-btn-primary deposit-btn" ${claimable <= 0 ? "disabled" : ""}>
          <span class="exit-btn-label">Credits <span class="referral-claim-bonus">${creditsBonusLabel}</span></span>
          <span class="exit-btn-sub">${creditsClaimAmount.toLocaleString()}</span>
        </button>
      </div>
    </div>

    <div class="referral-count">${active} active referral${active === 1 ? "" : "s"} <span>\u2014 counts once they open a drop</span></div>
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

// Small glyphs for the "How You Earn More" rows.
const REWARD_EARN_ICONS = {
  user: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6"/></svg>`,
  link: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.5-1.5"/></svg>`,
  clip: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="14" height="14" rx="2.5"/><path d="m16 10 6-3.5v11L16 14z"/></svg>`,
  x: `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M17.5 3h3l-6.6 7.5L21.7 21h-5.9l-4.3-5.6L6.5 21H3.4l7-8-6.6-10h6l3.9 5.2zm-1 16h1.6L8.1 4.6H6.4z"/></svg>`,
};

// Only things still worth doing: signing up and arriving through a link
// are already true of anyone reading this, so they'd be a checklist of the
// past. Both of these need a human to check the proof, so they submit and
// sit pending rather than paying out on the spot.
const EARN_TASKS = [
  // Connecting an account is an authorise-and-return flow, not something you
  // paste a URL for — only the clip needs a link, because the proof there is
  // the post itself.
  { key: "xVerify", icon: "x", label: "Verify X account", kind: "connect", action: "Connect X" },
  { key: "clipPost", icon: "clip", label: "Post a clip", kind: "link", placeholder: "Link to your post", help: "Clips" },
];

function renderEarnTasks() {
  const done = player.getEarnTasks();
  rwEarnList.innerHTML = EARN_TASKS.map((t) => {
    const task = done[t.key];
    let state;
    if (task) {
      state = `<span class="rewards-earn-state ${task.status}">${task.status === "verified" ? "Verified" : "Pending review"}</span>`;
    } else if (t.kind === "connect") {
      state = `<button type="button" class="rewards-earn-connect" data-earn-connect="${t.key}">${t.action}</button>`;
    } else {
      state = `<form class="rewards-earn-form" data-earn-task="${t.key}">
           <input type="url" class="rewards-earn-input" placeholder="${t.placeholder}" required>
           <button type="submit" class="rewards-earn-submit">Submit</button>
         </form>`;
    }
    return `
      <div class="rewards-earn-row ${task ? "submitted" : ""}">
        <span class="rewards-earn-icon">${REWARD_EARN_ICONS[t.icon]}</span>
        <span class="rewards-earn-label">${t.label}</span>
        ${t.help ? `<button type="button" class="rewards-earn-help" data-earn-help="${t.key}">${t.help}</button>` : ""}
        <span class="rewards-earn-value">+${player.EARN_TASK_CREDITS} credits</span>
        ${state}
      </div>`;
  }).join("");

  // "What's a clip?" — send them to the tab that shows theirs rather than
  // explaining it in a tooltip nobody opens.
  rwEarnList.querySelectorAll("[data-earn-help]").forEach((btn) => {
    btn.addEventListener("click", () => {
      playClick();
      document.querySelector('.nav-tab[data-nav="screen-account"]').click();
      showAccountGroup("clips");
    });
  });

  rwEarnList.querySelectorAll("[data-earn-connect]").forEach((btn) => {
    btn.addEventListener("click", () => {
      playClick();
      // No real OAuth to run here, so it records the intent and waits on the
      // same manual check the clip does.
      player.submitEarnTask(btn.dataset.earnConnect);
      showToast("X account submitted for review", ICONS.bell);
      renderEarnTasks();
    });
  });

  rwEarnList.querySelectorAll("[data-earn-task]").forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const link = form.querySelector("input").value.trim();
      if (!link) return;
      playClick();
      player.submitEarnTask(form.dataset.earnTask, link);
      showToast("Submitted for review", ICONS.bell);
      renderEarnTasks();
    });
  });
}

function renderStreaks() {
  const streak = player.getDailyStreak();
  const goal = player.RAFFLE_STREAK_DAYS;
  const share = player.getReferralTier(activeReferrals()).share;

  // Header strip: the three numbers the whole page is about.
  rwStreakStat.textContent = streak;
  rwShareStat.textContent = `${Math.round(share * 100)}%`;
  const ranked = [...FAKE_LEADERS, { username: player.getUsername(), xp: player.getXp(), isPlayer: true }].sort(
    (a, b) => b.xp - a.xp
  );
  rwRankStat.textContent = `#${ranked.findIndex((r) => r.isPlayer) + 1}`;

  // Week strip: a tick for each day you opened something, the day number
  // for the rest, so progress toward the raffle is legible at a glance.
  const activity = player.getDailyActivity();
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let done = 0;
  rwWeekStrip.innerHTML = names
    .map((name, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const hit = (activity[key] ?? 0) > 0;
      if (hit) done++;
      const future = d > today;
      return `
        <div class="rewards-day ${hit ? "hit" : ""} ${future ? "future" : ""}">
          <span class="rewards-day-name">${name}</span>
          <span class="rewards-day-box">${hit ? "\u2713" : i + 1}</span>
        </div>`;
    })
    .join("");

  rwWeekDays.textContent = done;
  rwWeekGoal.textContent = goal;
  const left = Math.max(0, goal - done);
  rwWeekNote.textContent = left === 0 ? "Qualified for this week's raffle" : `${left} more day${left === 1 ? "" : "s"} to qualify`;
  rwWeekFill.style.width = `${Math.min(100, (done / goal) * 100)}%`;

  const prize = getWeeklyRafflePrize();
  streakRafflePrize.innerHTML = `
    <img src="${prize.image}" alt="">
    <div class="streak-raffle-prize-info">
      <span class="streak-raffle-prize-name">${prize.name}</span>
      <span class="streak-raffle-prize-value">$${prize.price.toLocaleString()} value</span>
    </div>
  `;

  renderEarnTasks();

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
      refreshItemDetail();
    } else if (action === "decline") {
      market.updateOffer(offer.id, { status: "declined" });
      renderAccount();
      refreshItemDetail();
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

// ---- Deep links from the Live Activity ----------------------------------
// Tapping the Dynamic Island opens chosen://result?…, which the companion app
// turns into these params (warm, via window.Chosen.handleDeepLink) or into a
// query string on a cold launch. Both land here. Plain browsers never produce
// one, and an unrecognised param is ignored.
function routeDeepLink(params) {
  const itemId = params.get("item");
  if (itemId) {
    document.querySelector('.nav-tab[data-nav="screen-account"]:not([data-account-group])')?.click();
    showAccountGroup("holdings");
    openItemDetail(itemId);
    return true;
  }
  if (params.get("credits")) {
    // The cash-out that paid it is the top row of the activity feed.
    document.querySelector('.nav-tab[data-nav="screen-account"]:not([data-account-group])')?.click();
    showAccountGroup("activity");
    return true;
  }
  return false;
}
liveActivity.onDeepLink(routeDeepLink);

const profileParam = new URLSearchParams(location.search).get("profile");
if (profileParam) {
  renderPublicProfile(profileParam);
} else {
  renderIdentity();
  seedSimulatedPulls();
  seedDemoInventory();
  renderCategories();
  setInterval(tickSimulatedPulls, 4000);
  // Cold launch from a tapped Live Activity — the inventory has to exist
  // before the item route can open anything, so this runs last.
  routeDeepLink(new URLSearchParams(location.search));
}
