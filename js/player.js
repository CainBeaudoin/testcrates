// Player progression, persisted to localStorage: pity counters, win streak,
// best pull ever, recent-pull history, and the credits meter. Pure state +
// a couple of pure helpers — no DOM here.

const STORAGE_KEY = "gotcha_player_v2";
const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];

export const RARE_PITY_ROUNDS = 8; // rounds with no rare+ anywhere before one is forced
export const EPIC_PITY_ROUNDS = 20; // rounds with no epic+ anywhere before one is forced

export const CREDIT_PER_OPEN = 5; // earned every time the $100 tier is opened
export const CREDIT_THRESHOLD = 100; // credits needed to redeem a free crate

function rank(rarity) {
  return RARITY_ORDER.indexOf(rarity);
}

function defaultState() {
  return {
    history: [], // most-recent-first: {name, rarity, price, image, ts}
    bestPull: null, // {name, rarity, price, image}
    streak: 0, // consecutive picks (by the player) that were rare+
    pity: { sinceRare: 0, sinceEpic: 0 },
    credits: 0,
  };
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
// Applied once per round, to the 3 predetermined box prizes, BEFORE the
// player picks anything — so the "fixed regardless of which you click"
// guarantee still holds. If the pity counter has run out, one of the 3
// boxes (at random) gets force-upgraded into the rare+/epic+ subpool.

export function applyPity(boxPrizes, pool) {
  const bestRank = () => Math.max(...boxPrizes.map((p) => rank(p.rarity)));

  if (state.pity.sinceRare >= RARE_PITY_ROUNDS && bestRank() < rank("rare")) {
    const subpool = pool.filter((p) => rank(p.rarity) >= rank("rare"));
    const idx = Math.floor(Math.random() * boxPrizes.length);
    boxPrizes[idx] = weightedPickFrom(subpool);
  }
  if (state.pity.sinceEpic >= EPIC_PITY_ROUNDS && bestRank() < rank("epic")) {
    const subpool = pool.filter((p) => rank(p.rarity) >= rank("epic"));
    const idx = Math.floor(Math.random() * boxPrizes.length);
    boxPrizes[idx] = weightedPickFrom(subpool);
  }

  if (bestRank() >= rank("rare")) state.pity.sinceRare = 0;
  else state.pity.sinceRare += 1;
  if (bestRank() >= rank("epic")) state.pity.sinceEpic = 0;
  else state.pity.sinceEpic += 1;

  save();
  return boxPrizes;
}

export function getPity() {
  return {
    ...state.pity,
    rareRoundsLeft: Math.max(0, RARE_PITY_ROUNDS - state.pity.sinceRare),
    epicRoundsLeft: Math.max(0, EPIC_PITY_ROUNDS - state.pity.sinceEpic),
  };
}

// ---- Picks: history, streak, best pull ------------------------------------

export function recordPick(prize) {
  state.history.unshift({
    name: prize.name,
    rarity: prize.rarity,
    price: prize.price,
    image: prize.image,
    ts: Date.now(),
  });
  state.history = state.history.slice(0, 12);

  state.streak = rank(prize.rarity) >= rank("rare") ? state.streak + 1 : 0;

  if (!state.bestPull || rank(prize.rarity) > rank(state.bestPull.rarity)) {
    state.bestPull = { name: prize.name, rarity: prize.rarity, price: prize.price, image: prize.image };
  }

  save();
  return { streak: state.streak };
}

export function getHistory() {
  return state.history;
}

export function getBestPull() {
  return state.bestPull;
}

export function getStreak() {
  return state.streak;
}

// ---- Credits meter -------------------------------------------------------
// Earned every time the $100 tier is opened (not on a meter-redeemed free
// crate, so redeeming doesn't partially refund itself).

export function getCredits() {
  return state.credits;
}

export function addCredits(amount = CREDIT_PER_OPEN) {
  state.credits += amount;
  save();
  return state.credits;
}

export function canRedeemCredits() {
  return state.credits >= CREDIT_THRESHOLD;
}

export function redeemCredits() {
  if (state.credits < CREDIT_THRESHOLD) return false;
  state.credits -= CREDIT_THRESHOLD;
  save();
  return true;
}
