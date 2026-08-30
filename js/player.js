// Player progression, persisted to localStorage: pity counters, win streak,
// best pull ever, recent-pull history, the two wallet balances (Credits and
// Cash/USDC), username, and inventory (kept items). Pure state + a couple
// of pure helpers — no DOM here.

const STORAGE_KEY = "gotcha_player_v4";
const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];

export const RARE_PITY_ROUNDS = 8; // rounds with no rare+ anywhere before one is forced
export const EPIC_PITY_ROUNDS = 20; // rounds with no epic+ anywhere before one is forced

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
    history: [], // most-recent-first: {name, rarity, price, image, ts}
    bestPull: null, // {name, rarity, price, image}
    streak: 0, // consecutive picks (by the player) that were rare+
    pity: {}, // { [tierKey]: { sinceRare, sinceEpic } } — each tier tracks its own
    wallet: { credits: 0, cash: 0 },
    inventory: [], // kept items: {id, name, rarity, price, image, acquiredAt, listingId}
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
// Applied once per round, to the 3 predetermined box prizes, BEFORE the
// player picks anything — so the "fixed regardless of which you click"
// guarantee still holds. If the pity counter has run out, one of the 3
// boxes (at random) gets force-upgraded into the rare+/epic+ subpool.

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

// ---- Wallet: Credits + Cash (USDC) -----------------------------------
// Each round is opened "with Credits" or "with Cash" (see app.js's payment
// picker). Choosing Cash Back on a win deposits the prize's dollar value
// into whichever balance that round was opened with. Choosing Keep leaves
// both balances untouched — you keep the physical item instead.

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
// Listing/selling one moves it into the shared marketplace (see market.js),
// which calls back into removeFromInventory / markListed / markUnlisted so
// player.js stays the single source of truth for what you actually own.

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
