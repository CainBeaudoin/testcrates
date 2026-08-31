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

// Purchase rebate ("cashback notification"): a Credits rebate lands
// automatically on every crate purchase — 5 credits per $100 spent, flat
// across all tiers ($100 → 5, $250 → 12.5, $1000 → 50).
export const CASHBACK_RATE = 0.05;

// Daily play streak: opening at least one crate (any tier — Bronze/$100
// already is the minimum) on RAFFLE_STREAK_DAYS consecutive calendar days
// enters that week's raffle.
export const RAFFLE_STREAK_DAYS = 7;

// Referral ladder from the scope doc, denominated in lifetime crate volume.
export const REFERRAL_BASE = 0.2; // sign-up 10% + link 5% + X-verify 5%
export const REFERRAL_TIERS = [
  { volume: 250000, share: 0.25 },
  { volume: 500000, share: 0.3 },
  { volume: 1000000, share: 0.35 },
  { volume: 2000000, share: 0.4 },
];

const DEFAULT_USERNAME = "ODCain";

function rank(rarity) {
  return RARITY_ORDER.indexOf(rarity);
}

// Local calendar date (not UTC) so a day boundary lines up with the
// player's own midnight, not an arbitrary timezone.
function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

let uidCounter = 0;
function uid() {
  uidCounter += 1;
  return `${Date.now().toString(36)}${uidCounter.toString(36)}`;
}

function defaultState() {
  return {
    username: DEFAULT_USERNAME,
    history: [], // most-recent-first, capped: {name, rarity, price, image, multiplier, ts}
    bigPulls: [], // multiplier >= BIG_PULL_MULTIPLIER, never evicted
    lastPulledByTier: {}, // { [tierKey]: name } — duplicate-pull guard
    streak: 0,
    dailyActivity: {}, // { "YYYY-MM-DD": crates opened that day } — powers the streak calendar
    pity: {},
    // A starting demo balance so the platform is usable immediately —
    // clearly local/simulated, not a real deposit (see addDemoFunds).
    wallet: { credits: 0, cash: 500 },
    inventory: [], // {id, name, rarity, price, image, acquiredAt, listingId}
    shipped: [], // items claimed physically: {id, name, rarity, price, image, shippedAt}
    cashedOut: [], // liquidated items: {id, name, rarity, price, image, amount, currency, ts}
    transfers: [], // items sent to another account: {id, name, rarity, price, image, toUsername, ts}
    creditEvents: [], // cashback rebate notifications: {amount, tierKey, ts}
    creditEventsSeenTs: 0, // newest ts the user has actually opened the list on — see getUnseenCreditCount
    xp: 0,
    lifetimeVolume: 0, // sum of crate prices purchased — drives referral tier
    demoSeeded: false, // Vault/Portfolio pre-populated once per fresh session — see app.js seedDemoInventory
    referralClaimable: 2269, // demo starting balance from referred volume — see claimReferralCash/claimReferralCredits
    withdrawAddresses: [], // whitelisted payout wallets: {id, chain, address, nickname} — see addWithdrawAddress
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

  const today = dateKey(new Date());
  state.dailyActivity[today] = (state.dailyActivity[today] ?? 0) + 1;

  save();
  return { streak: state.streak, multiplier };
}

export function getDailyActivity() {
  return { ...state.dailyActivity };
}

// Consecutive calendar days (ending today or yesterday — today doesn't
// break an in-progress streak before it's played) with at least one crate
// opened. Computed from the activity log rather than a separate counter,
// so it can't drift out of sync with it.
export function getDailyStreak() {
  const activeDays = Object.keys(state.dailyActivity)
    .filter((d) => state.dailyActivity[d] > 0)
    .sort()
    .reverse();
  if (activeDays.length === 0) return 0;

  const cursor = new Date();
  const todayKey = dateKey(cursor);
  if (activeDays[0] !== todayKey) {
    cursor.setDate(cursor.getDate() - 1);
    if (activeDays[0] !== dateKey(cursor)) return 0; // most recent activity was 2+ days ago — broken
  }

  let streak = 0;
  for (const d of activeDays) {
    if (dateKey(cursor) !== d) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
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

// ---- Withdrawal (crypto payout) ------------------------------------------
// A locally-saved whitelist of payout wallets — mirrors the deposit flow's
// "pick a chain, get an address" shape but in reverse. Nothing is actually
// broadcast to a chain; withdrawing just debits Cash the same way spending
// on a crate does.

export function getWithdrawAddresses() {
  return state.withdrawAddresses;
}

export function addWithdrawAddress({ chain, address, nickname }) {
  const entry = { id: uid(), chain, address, nickname };
  state.withdrawAddresses.push(entry);
  save();
  return entry;
}

export function withdrawCash(amount, addressId) {
  if (!state.withdrawAddresses.some((a) => a.id === addressId)) return false;
  return spendCash(amount);
}

// ---- Purchases: crate cost + cashback rebate + XP + volume ---------------

// Deducts the crate's cost and records volume/XP immediately. The cashback
// rebate is only *computed* here — app.js credits it (via addCredits)
// separately, timed to land while the reveal is on screen, per the scope.
export function purchaseCrate(tierPrice, currency) {
  if (!spend(currency, tierPrice)) return null;
  state.lifetimeVolume += tierPrice;
  const xp = tierPrice; // 1 XP per $1 of volume
  state.xp += xp;
  const rebate = Math.round(tierPrice * CASHBACK_RATE * 100) / 100;
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

// ---- Referral claimable earnings -----------------------------------------
// A demo starting balance (see referralClaimable in defaultState) standing
// in for accrued referral-share earnings — there's no backend tallying
// real referred-volume payouts, so claiming just lands it in a balance
// once and zeroes it out. Claiming as Credits instead of Cash pays a 10%
// bonus — a small nudge toward Credits, same idea as purchase cashback.

export const REFERRAL_CREDITS_BONUS = 0.1;

export function getReferralClaimable() {
  return state.referralClaimable;
}

export function claimReferralCash() {
  const amount = state.referralClaimable;
  if (amount <= 0) return 0;
  state.wallet.cash += amount;
  state.referralClaimable = 0;
  save();
  return amount;
}

export function claimReferralCredits() {
  const base = state.referralClaimable;
  if (base <= 0) return 0;
  const amount = Math.round(base * (1 + REFERRAL_CREDITS_BONUS));
  state.wallet.credits += amount;
  state.referralClaimable = 0;
  save();
  return amount;
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

// ---- Demo seeding (Vault/Portfolio pre-populated once) -------------------

export function hasSeededDemoInventory() {
  return state.demoSeeded;
}

export function markDemoSeeded() {
  state.demoSeeded = true;
  save();
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
    category: prize.category, // undefined for sneakers (the implicit default) — see market.js sizeFor
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

function valueOnDate(item, date) {
  const dayKey = date.toISOString().slice(0, 10);
  const h = hashString(`${item.id}:${dayKey}`);
  const wobble = ((h % 3000) / 3000) * 0.3 - 0.15; // -15%..+15%
  return Math.max(1, Math.round(item.price * (1 + wobble)));
}

// Past the archival clock, the price freezes at exactly what it was on
// day 365 — recomputed from that fixed date rather than today's, so no
// extra state needs to be stored to "remember" the frozen number.
function marketValueAsOfDate(item) {
  return isArchived(item) ? new Date(item.acquiredAt + ARCHIVAL_DAYS * 24 * 60 * 60 * 1000) : new Date();
}

export function currentMarketValue(item) {
  return valueOnDate(item, marketValueAsOfDate(item));
}

// A simulated daily price series ending on the same date currentMarketValue
// resolves to (today, or the archival freeze date) — so the chart's last
// point always matches the number shown everywhere else for this item.
export function priceHistory(item, days = 30) {
  const asOf = marketValueAsOfDate(item);
  const points = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(asOf.getTime() - i * 24 * 60 * 60 * 1000);
    points.push({ date: date.toISOString().slice(0, 10), value: valueOnDate(item, date) });
  }
  return points;
}

// Stocks redeem at exact live value — there's no buy/sell spread on a
// simulated on-chain share the way there is on a physical collectible, so
// only the collectibles haircut applies here.
export function cashOutMultiplier(category) {
  return category === "stocks" ? 1 : CASHOUT_HAIRCUT;
}

export function cashOutValue(item) {
  return Math.round(currentMarketValue(item) * cashOutMultiplier(item.category));
}

// ---- Portfolio: consolidated stock holdings ------------------------------
// Each stocks-category inventory item is one "lot" (one crate win) — same
// shape as any other kept item, just tagged category:"stocks". The vault
// groups lots by ticker into one consolidated position (like a brokerage
// holding built from several fills) while still exposing the individual
// lots, and lets you redeem a dollar amount instead of a whole lot.

function tickerOf(item) {
  return item.name.split(" — ")[0];
}

export function getPortfolio() {
  const byTicker = new Map();
  state.inventory
    .filter((i) => i.category === "stocks")
    .forEach((lot) => {
      const ticker = tickerOf(lot);
      if (!byTicker.has(ticker)) byTicker.set(ticker, { ticker, name: lot.name, image: lot.image, lots: [] });
      byTicker.get(ticker).lots.push(lot);
    });
  return [...byTicker.values()]
    .map((holding) => ({ ...holding, totalValue: holding.lots.reduce((sum, lot) => sum + currentMarketValue(lot), 0) }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

// A consolidated position's chart is the sum of its lots' simulated daily
// values — reuses the same per-lot valueOnDate the individual chart does,
// so the position's last point always matches its displayed total.
export function portfolioPriceHistory(ticker, days = 30) {
  const lots = state.inventory.filter((i) => i.category === "stocks" && tickerOf(i) === ticker);
  const now = new Date();
  const points = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    points.push({ date: date.toISOString().slice(0, 10), value: lots.reduce((sum, lot) => sum + valueOnDate(lot, date), 0) });
  }
  return points;
}

// Redeems up to `amount` of a ticker's consolidated position at exact
// current value, oldest lot first — partially reducing a lot's own base
// price rather than requiring a whole lot to be sold at once. Returns the
// amount actually redeemed (capped at what's held).
export function sellStock(ticker, amount) {
  const lots = state.inventory
    .filter((i) => i.category === "stocks" && tickerOf(i) === ticker)
    .sort((a, b) => a.acquiredAt - b.acquiredAt);
  let remaining = amount;
  let sold = 0;
  for (const lot of lots) {
    if (remaining <= 0) break;
    const value = currentMarketValue(lot);
    const take = Math.min(remaining, value);
    if (take >= value) {
      removeFromInventory(lot.id);
    } else {
      lot.price = Math.max(1, Math.round(lot.price * (1 - take / value)));
    }
    sold += take;
    remaining -= take;
  }
  save();
  return sold;
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

// ---- Cashed out (liquidated) history --------------------------------------

export function logCashOut({ name, rarity, price, image, amount, currency }) {
  state.cashedOut.unshift({ id: uid(), name, rarity, price, image, amount, currency, ts: Date.now() });
  state.cashedOut = state.cashedOut.slice(0, 50);
  save();
}

export function getCashedOut() {
  return state.cashedOut;
}

// ---- Transfers (send an item to another account) --------------------------

export function transferItem(item, toUsername) {
  state.transfers.unshift({
    id: item.id,
    name: item.name,
    rarity: item.rarity,
    price: item.price,
    image: item.image,
    toUsername,
    ts: Date.now(),
  });
  state.transfers = state.transfers.slice(0, 50);
  removeFromInventory(item.id);
}

export function getTransfers() {
  return state.transfers;
}

// ---- Credit-earned notifications -------------------------------------

export function logCreditEarned(amount, tierKey) {
  state.creditEvents.unshift({ amount, tierKey, ts: Date.now() });
  state.creditEvents = state.creditEvents.slice(0, 50);
  save();
}

export function getCreditEvents() {
  return state.creditEvents;
}

// The badge counts what's arrived since the list was last opened, not the
// whole history — otherwise it never clears and stops meaning anything.
export function getUnseenCreditCount() {
  return state.creditEvents.filter((e) => e.ts > state.creditEventsSeenTs).length;
}

export function markCreditEventsSeen() {
  state.creditEventsSeenTs = state.creditEvents.length ? state.creditEvents[0].ts : Date.now();
  save();
}

export function clearCreditEvents() {
  state.creditEvents = [];
  state.creditEventsSeenTs = Date.now();
  save();
}
