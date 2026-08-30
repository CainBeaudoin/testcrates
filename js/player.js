// Player state, persisted to localStorage: wallet (Credits + Cash), pity
// counters, streak, opening history (+ pinned big multipliers), inventory
// (kept items, with the 365-day archival clock and a simulated fluctuating
// market value), shipped log, XP, lifetime volume (drives the referral
// tier), username. Pure state + pure helpers — no DOM here.
//
// Economy, matching the "Chosen" V1 scope: opening a crate costs its tier
// price, paid from whichever balance (Credits or Cash) the player chose.
// Cash Out pays back a haircut of live value, in that same currency —
// Credits are a walled currency and never convert to Cash directly.

const STORAGE_KEY = "gotcha_player_v5";
const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];

export const RARE_PITY_ROUNDS = 8;
export const EPIC_PITY_ROUNDS = 20;

export const CASHOUT_HAIRCUT = 0.8; // "75% or 80%, still open" in the scope — picked 80%
export const ARCHIVAL_DAYS = 365;
export const BIG_PULL_MULTIPLIER = 5; // pinned permanently in opening history at/above this
export const OPENING_HISTORY_ROLLING = 10; // non-pinned entries kept

// Purchase rebate ("cashback notification"): a small Credits rebate lands
// automatically on every crate purchase, scaling with tier. Rate to be set
// by a real margin engine per the scope — these are placeholder V1 numbers.
export const CASHBACK_RATES = { hundred: 0.02, twoFifty: 0.03, thousand: 0.04 };

// Referral ladder from the scope doc, denominated in lifetime crate volume.
export const REFERRAL_BASE = 0.2; // sign-up 10% + link 5% + X-verify 5%
export const REFERRAL_TIERS = [
  { volume: 250000, share: 0.25 },
  { volume: 500000, share: 0.3 },
  { volume: 1000000, share: 0.35 },
  { volume: 2000000, share: 0.4 },
];

const ADJECTIVES = ["Silent", "Crimson", "Golden", "Shadow", "Neon", "Frozen", "Rapid", "Lunar", "Iron", "Velvet"];
const NOUNS = ["Falcon", "Voyager", "Wolf", "Phantom", "Rider", "Comet", "Hunter", "Nomad", "Viper", "Ranger"];

function randomUsername() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${adj}${noun}${num}`;
}

function rank(rarity) {
  return RARITY_ORDER.indexOf(rarity);
}

let uidCounter = 0;
function uid() {
  uidCounter += 1;
  return `${Date.now().toString(36)}${uidCounter.toString(36)}`;
}

function defaultState() {
  return {
    username: randomUsername(),
    history: [], // most-recent-first, capped: {name, rarity, price, image, multiplier, ts}
    bigPulls: [], // multiplier >= BIG_PULL_MULTIPLIER, never evicted
    lastPulledByTier: {}, // { [tierKey]: name } — duplicate-pull guard
    streak: 0,
    pity: {},
    // A starting demo balance so the platform is usable immediately —
    // clearly local/simulated, not a real deposit (see addDemoFunds).
    wallet: { credits: 0, cash: 500 },
    inventory: [], // {id, name, rarity, price, image, acquiredAt, listingId}
    shipped: [], // items claimed physically: {id, name, rarity, price, image, shippedAt}
    xp: 0,
    lifetimeVolume: 0, // sum of crate prices purchased — drives referral tier
  };
}

function pityFor(tierKey) {
  if (!state.pity[tierKey]) state.pity[tierKey] = { sinceRare: 0, sinceEpic: 0 };
  return state.pity[tierKey];
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    // corrupt/blocked storage — fall back to a fresh session
  }
  return defaultState();
}

let state = load();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode etc.) — progress just won't persist
  }
}

function weightedPickFrom(pool) {
  const total = pool.reduce((sum, p) => sum + p.weight, 0);
  let roll = Math.random() * total;
  for (const prize of pool) {
    if (roll < prize.weight) return prize;
    roll -= prize.weight;
  }
  return pool[pool.length - 1];
}

// ---- Pity ------------------------------------------------------------

export function applyPity(tierKey, boxPrizes, pool) {
  const pity = pityFor(tierKey);
  const bestRank = () => Math.max(...boxPrizes.map((p) => rank(p.rarity)));

  if (pity.sinceRare >= RARE_PITY_ROUNDS && bestRank() < rank("rare")) {
    const subpool = pool.filter((p) => rank(p.rarity) >= rank("rare"));
    const idx = Math.floor(Math.random() * boxPrizes.length);
    boxPrizes[idx] = weightedPickFrom(subpool);
  }
  if (pity.sinceEpic >= EPIC_PITY_ROUNDS && bestRank() < rank("epic")) {
    const subpool = pool.filter((p) => rank(p.rarity) >= rank("epic"));
    const idx = Math.floor(Math.random() * boxPrizes.length);
    boxPrizes[idx] = weightedPickFrom(subpool);
  }

  if (bestRank() >= rank("rare")) pity.sinceRare = 0;
  else pity.sinceRare += 1;
  if (bestRank() >= rank("epic")) pity.sinceEpic = 0;
  else pity.sinceEpic += 1;

  save();
  return boxPrizes;
}

export function getPity(tierKey) {
  const pity = pityFor(tierKey);
  return {
    ...pity,
    rareRoundsLeft: Math.max(0, RARE_PITY_ROUNDS - pity.sinceRare),
    epicRoundsLeft: Math.max(0, EPIC_PITY_ROUNDS - pity.sinceEpic),
  };
}

// ---- Duplicate-pull prevention -----------------------------------------
// "The algorithm must not hand a user the same item consecutively." Applied
// only to the crate the player actually picked, per tier.

export function isDuplicateOfLast(tierKey, prize) {
  return state.lastPulledByTier[tierKey] === prize.name;
}

export function rerollIfDuplicate(tierKey, prize, pool) {
  if (!isDuplicateOfLast(tierKey, prize)) return prize;
  const alternatives = pool.filter((p) => p.name !== prize.name);
  if (alternatives.length === 0) return prize;
  return weightedPickFrom(alternatives);
}

// ---- Picks: history, streak, XP, opening log -----------------------------

export function recordPick(prize, tierKey, tierPrice) {
  const multiplier = tierPrice ? +(prize.price / tierPrice).toFixed(2) : null;
  const entry = { name: prize.name, rarity: prize.rarity, price: prize.price, image: prize.image, multiplier, tierKey, ts: Date.now() };

  state.history.unshift(entry);
  state.history = state.history.slice(0, OPENING_HISTORY_ROLLING);

  if (multiplier !== null && multiplier >= BIG_PULL_MULTIPLIER) {
    state.bigPulls.unshift(entry);
    state.bigPulls = state.bigPulls.slice(0, 100);
  }

  if (tierKey) state.lastPulledByTier[tierKey] = prize.name;

  state.streak = rank(prize.rarity) >= rank("rare") ? state.streak + 1 : 0;

  save();
  return { streak: state.streak, multiplier };
}

export function getHistory() {
  // Most-recent-first, big pulls (>=5x) folded in permanently alongside the
  // rolling window, deduped by timestamp.
  const combined = [...state.history];
  state.bigPulls.forEach((p) => {
    if (!combined.some((h) => h.ts === p.ts)) combined.push(p);
  });
  return combined.sort((a, b) => b.ts - a.ts);
}

export function getBigPulls() {
  return state.bigPulls;
}

export function getStreak() {
  return state.streak;
}

// ---- XP -------------------------------------------------------------

export function addXp(amount) {
  state.xp += amount;
  save();
  return state.xp;
}

export function getXp() {
  return state.xp;
}

// ---- Wallet: Credits + Cash (USDC) -----------------------------------
// Cash Out pays back into whichever balance funded the purchase — Credits
// stay Credits, Cash stays Cash. Both are simulated/local balances.

export function getWallet() {
  return { ...state.wallet };
}

export function cashBack(amount, currency) {
  if (currency !== "credits" && currency !== "cash") return state.wallet;
  state.wallet[currency] += amount;
  save();
  return { ...state.wallet };
}

export function addCash(amount) {
  state.wallet.cash += amount;
  save();
  return { ...state.wallet };
}

export function spendCash(amount) {
  if (state.wallet.cash < amount) return false;
  state.wallet.cash -= amount;
  save();
  return true;
}

export function addCredits(amount) {
  state.wallet.credits += amount;
  save();
  return { ...state.wallet };
}

export function spendCredits(amount) {
  if (state.wallet.credits < amount) return false;
  state.wallet.credits -= amount;
  save();
  return true;
}

export function spend(currency, amount) {
  return currency === "credits" ? spendCredits(amount) : spendCash(amount);
}

// A plain, honest local top-up — NOT a real payment/deposit. Lets the demo
// be usable without pretending to integrate real payment rails.
export function addDemoFunds(amount) {
  return addCash(amount);
}

// ---- Purchases: crate cost + cashback rebate + XP + volume ---------------

// Deducts the crate's cost and records volume/XP immediately. The cashback
// rebate is only *computed* here — app.js credits it (via addCredits)
// separately, timed to land while the reveal is on screen, per the scope.
export function purchaseCrate(tierKey, tierPrice, currency) {
  if (!spend(currency, tierPrice)) return null;
  state.lifetimeVolume += tierPrice;
  const xp = tierPrice; // 1 XP per $1 of volume
  state.xp += xp;
  const rebateRate = CASHBACK_RATES[tierKey] ?? 0.02;
  const rebate = Math.round(tierPrice * rebateRate * 100) / 100;
  save();
  return { rebate, xp };
}

export function getLifetimeVolume() {
  return state.lifetimeVolume;
}

export function getReferralTier() {
  let share = REFERRAL_BASE;
  let next = REFERRAL_TIERS[0];
  for (const tier of REFERRAL_TIERS) {
    if (state.lifetimeVolume >= tier.volume) {
      share = tier.share;
    } else {
      next = tier;
      break;
    }
  }
  const atCeiling = state.lifetimeVolume >= REFERRAL_TIERS[REFERRAL_TIERS.length - 1].volume;
  return {
    share,
    volume: state.lifetimeVolume,
    next: atCeiling ? null : next,
    progress: atCeiling ? 1 : Math.min(1, state.lifetimeVolume / next.volume),
  };
}

// ---- Identity ----------------------------------------------------------

export function getUsername() {
  return state.username;
}

export function setUsername(name) {
  const trimmed = name.trim().slice(0, 24);
  if (!trimmed) return state.username;
  state.username = trimmed;
  save();
  return state.username;
}

// ---- Inventory: items you chose to Keep -----------------------------
// Every kept item is subject to the 365-day archival clock (starts at
// acquiredAt) and has a simulated fluctuating "market value" so a running
// cash-out figure has something to move against.

export function addToInventory(prize) {
  const item = {
    id: uid(),
    name: prize.name,
    rarity: prize.rarity,
    price: prize.price,
    image: prize.image,
    acquiredAt: Date.now(),
    listingId: null,
  };
  state.inventory.unshift(item);
  save();
  return item;
}

export function getInventory() {
  return state.inventory;
}

export function getInventoryItem(id) {
  return state.inventory.find((i) => i.id === id) || null;
}

export function removeFromInventory(id) {
  state.inventory = state.inventory.filter((i) => i.id !== id);
  save();
}

export function markListed(id, listingId) {
  const item = getInventoryItem(id);
  if (item) {
    item.listingId = listingId;
    save();
  }
}

export function markUnlisted(id) {
  const item = getInventoryItem(id);
  if (item) {
    item.listingId = null;
    save();
  }
}

// ---- Archival clock -----------------------------------------------------

export function daysHeld(item) {
  return Math.floor((Date.now() - item.acquiredAt) / (24 * 60 * 60 * 1000));
}

export function isArchived(item) {
  return daysHeld(item) >= ARCHIVAL_DAYS;
}

export function daysUntilArchival(item) {
  return Math.max(0, ARCHIVAL_DAYS - daysHeld(item));
}

// ---- Simulated live market value -----------------------------------------
// Deterministic per item+day (stable within a day, drifts day to day) so
// "cash out today for $X" has something real to point at without a live
// comp feed. +/-15% of catalog price.

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

export function currentMarketValue(item) {
  const dayKey = new Date().toISOString().slice(0, 10);
  const h = hashString(`${item.id}:${dayKey}`);
  const wobble = ((h % 3000) / 3000) * 0.3 - 0.15; // -15%..+15%
  return Math.max(1, Math.round(item.price * (1 + wobble)));
}

export function cashOutValue(item) {
  return Math.round(currentMarketValue(item) * CASHOUT_HAIRCUT);
}

// ---- Shipping (claim physical item) --------------------------------------

export function shipItem(item) {
  state.shipped.unshift({
    id: item.id,
    name: item.name,
    rarity: item.rarity,
    price: item.price,
    image: item.image,
    shippedAt: Date.now(),
  });
  removeFromInventory(item.id);
}

export function getShipped() {
  return state.shipped;
}
