// Crate supply. Every crate runs in numbered series of SERIES_SIZE boxes,
// each series with a fixed prize list of the same size. A box is a ticket
// for whatever is left, not a prize: nothing is decided when it's bought,
// and when it's opened the prize is drawn from the series' remaining list.
// So a box opened the day it's bought and one opened a month later play
// out the same way, and the odds shown anywhere are just what's left over
// how many boxes are left to open.
//
// Counts, per crate:
//   sold    boxes bought from the drop (primary sale) — at most `total`
//   opened  boxes opened, by anyone — at most `sold`
//   botHeld boxes the simulated crowd bought and is sitting on (some of
//           them listed on the market)
// Every box is in exactly one place: unsold, opened, held by the crowd, or
// held by the player (player.js keeps those as sealed-crate tokens). And
// the prize list always has exactly one prize left per unopened box.
//
// Lives in its own storage key: the supply is the platform's, not the
// player's, and survives a player reset.

const STORAGE_KEY = "gotcha_supply_v1";
export const SERIES_SIZE = 300;
const RARITY_ORDER = ["legendary", "epic", "rare", "uncommon", "common"];

const pools = new Map(); // crate key -> its catalog pool (prize objects with a weight)
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { crates: {}, reserved: null, lastTick: Date.now(), ...JSON.parse(raw) };
  } catch {
    // unreadable — start the platform fresh
  }
  return { crates: {}, reserved: null, lastTick: Date.now() };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable — supply resets with the page
  }
}

// ---- Series ---------------------------------------------------------------

// A series' prize list: each catalog item gets copies in proportion to its
// weight, so the series as a whole has exactly the crate's published odds.
// Rounded by largest remainder so the copies add up to SERIES_SIZE exactly.
function buildManifest(pool) {
  const totalWeight = pool.reduce((sum, p) => sum + p.weight, 0);
  const exact = pool.map((p) => (SERIES_SIZE * p.weight) / totalWeight);
  const counts = exact.map(Math.floor);
  let short = SERIES_SIZE - counts.reduce((a, b) => a + b, 0);
  exact
    .map((x, i) => [x - Math.floor(x), i])
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => {
      if (short > 0) {
        counts[i] += 1;
        short -= 1;
      }
    });
  const left = {};
  pool.forEach((p, i) => {
    if (counts[i] > 0) left[p.name] = counts[i];
  });
  return left;
}

function startSeries(key, series) {
  state.crates[key] = { series, total: SERIES_SIZE, sold: 0, opened: 0, botHeld: 0, left: buildManifest(pools.get(key)) };
}

function crate(key) {
  return state.crates[key];
}

function unitsLeft(c) {
  return Object.values(c.left).reduce((a, b) => a + b, 0);
}

function prizeByName(key, name) {
  return pools.get(key).find((p) => p.name === name) ?? null;
}

// One prize out of the remaining list, every remaining copy equally likely.
function drawName(c) {
  const n = unitsLeft(c);
  if (n === 0) return null;
  let r = Math.floor(Math.random() * n);
  for (const [name, count] of Object.entries(c.left)) {
    if (r < count) {
      c.left[name] -= 1;
      if (c.left[name] === 0) delete c.left[name];
      return name;
    }
    r -= count;
  }
  return null;
}

function returnName(c, name) {
  c.left[name] = (c.left[name] ?? 0) + 1;
}

// A series whose last box has been opened makes way for the next one.
function maybeRollOver(key) {
  const c = crate(key);
  if (c.opened >= c.total) startSeries(key, c.series + 1);
}

// ---- Setup ------------------------------------------------------------------

/**
 * Registers each crate's catalog pool and makes sure it has a running
 * series. A crate seen for the first time starts part-way through its
 * first series (some sold, some opened, a few held), so the platform looks
 * like it's been trading rather than freshly opened; `seedShape(key)` can
 * pin a crate's starting point ({ sold, opened } as shares of the series).
 */
export function registerCrates(categories, seedShape = () => null) {
  Object.entries(categories).forEach(([key, cat]) => pools.set(key, cat.pool));
  let changed = false;
  for (const key of pools.keys()) {
    const c = crate(key);
    // A pool that changed shape since this series was built (items renamed
    // or removed) would leave names in the list nothing can resolve: start
    // that crate over rather than draw ghosts.
    if (c && Object.keys(c.left).every((name) => prizeByName(key, name))) continue;
    startSeries(key, c ? c.series + 1 : 1);
    const shape = seedShape(key) ?? { sold: 0.35 + Math.random() * 0.6, opened: 0.45 + Math.random() * 0.4 };
    const s = crate(key);
    s.sold = Math.round(s.total * Math.min(1, shape.sold));
    s.opened = Math.round(s.sold * Math.min(1, shape.opened));
    for (let i = 0; i < s.opened; i++) drawName(s);
    s.botHeld = s.sold - s.opened;
    changed = true;
  }
  // A round that never finished (the page was closed or reloaded before a
  // box was picked) gives its three draws back: the box it was opening is
  // still sealed in the player's account.
  if (state.reserved) {
    const c = crate(state.reserved.key);
    if (c) state.reserved.names.forEach((name) => returnName(c, name));
    state.reserved = null;
    changed = true;
  }
  if (changed) save();
}

// ---- Reading ---------------------------------------------------------------

/**
 * Everything a screen needs to say about a crate's supply right now.
 * `ev` is the expected value of one box: the average value of what's left.
 */
export function status(key) {
  const c = crate(key);
  const units = unitsLeft(c);
  const byRarity = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0]));
  let value = 0;
  for (const [name, count] of Object.entries(c.left)) {
    const p = prizeByName(key, name);
    if (!p) continue;
    byRarity[p.rarity] += count;
    value += p.price * count;
  }
  return {
    series: c.series,
    total: c.total,
    sold: c.sold,
    opened: c.opened,
    unsold: c.total - c.sold,
    unopened: c.total - c.opened,
    soldOut: c.sold >= c.total,
    units,
    byRarity,
    grailsLeft: byRarity.legendary,
    ev: units ? value / units : 0,
  };
}

/**
 * The crate's catalog with how many of each are left, for the "what's
 * left" view: every item, gone ones included (with left: 0), and `weight`
 * set to what's left so the odds helpers read the live odds.
 */
export function livePool(key) {
  const c = crate(key);
  return pools.get(key).map((p) => ({ ...p, left: c.left[p.name] ?? 0, weight: c.left[p.name] ?? 0 }));
}

/**
 * How many copies of each prize a full series of this crate holds — the
 * list every series starts from (the same for every series: it comes
 * from the published odds). Copies gone = this minus what's left.
 */
export function seriesCopies(key) {
  return buildManifest(pools.get(key));
}

// ---- The player's boxes -------------------------------------------------------

export function canBuy(key, qty = 1) {
  const c = crate(key);
  return c.total - c.sold >= qty;
}

/** Primary sale: `qty` boxes off the drop. */
export function buy(key, qty = 1) {
  if (!canBuy(key, qty)) return false;
  crate(key).sold += qty;
  save();
  return true;
}

/**
 * Draws the three prizes for one opening: the box you pick keeps its
 * prize, and the other two go back to the list when the round settles.
 * They're held out of the list until then, so nothing else can draw the
 * same copy while they're on screen. With fewer than three copies left,
 * the extra boxes repeat what was drawn (they're only ever shown, never
 * won).
 */
export function drawRound(key) {
  const c = crate(key);
  const names = [];
  for (let i = 0; i < 3; i++) {
    const name = drawName(c);
    if (name) names.push(name);
  }
  if (!names.length) return null;
  state.reserved = { key, names: [...names] };
  save();
  while (names.length < 3) names.push(names[names.length - 1]);
  return names.map((name) => prizeByName(key, name));
}

/** The round's box was picked: that prize is gone, the rest go back. */
export function settleRound(key, pickedIndex) {
  const c = crate(key);
  const reserved = state.reserved?.key === key ? state.reserved.names : [];
  reserved.forEach((name, i) => {
    if (i !== pickedIndex) returnName(c, name);
  });
  state.reserved = null;
  c.opened += 1;
  maybeRollOver(key);
  save();
}

// ---- The crowd ---------------------------------------------------------------
// The simulated other players buy, open and hold from the same supply, so
// the counts on screen actually move. One step is one thing one of them
// does.

export function crowdBuyAndOpen(key) {
  const c = crate(key);
  if (c.sold >= c.total) return null;
  const name = drawName(c);
  if (!name) return null;
  c.sold += 1;
  c.opened += 1;
  maybeRollOver(key);
  save();
  return prizeByName(key, name);
}

export function crowdBuyAndHold(key) {
  const c = crate(key);
  if (c.sold >= c.total) return false;
  c.sold += 1;
  c.botHeld += 1;
  save();
  return true;
}

export function crowdOpenHeld(key) {
  const c = crate(key);
  if (c.botHeld <= 0) return null;
  const name = drawName(c);
  if (!name) return null;
  c.botHeld -= 1;
  c.opened += 1;
  maybeRollOver(key);
  save();
  return prizeByName(key, name);
}

/** A prize from what's left, without taking it — for showing, not winning. */
export function peek(key) {
  const c = crate(key);
  const n = unitsLeft(c);
  if (!n) return null;
  let r = Math.floor(Math.random() * n);
  for (const [name, count] of Object.entries(c.left)) {
    if (r < count) return prizeByName(key, name);
    r -= count;
  }
  return null;
}

/**
 * Squares the crowd's holdings with what the player actually holds, on
 * startup. Each held box is either the player's (a sealed-crate token) or
 * the crowd's, so the crowd's count is whatever the player doesn't hold.
 * Covers the two ways they drift apart: player data cleared while the
 * supply wasn't (orphaned boxes would stay "unopened" forever and the
 * series could never finish), or the supply cleared while the player kept
 * tokens (they need sold boxes behind them).
 */
export function reconcile(key, playerHeld) {
  const c = crate(key);
  if (playerHeld > c.sold - c.opened) c.sold = Math.min(c.total, c.opened + playerHeld);
  c.botHeld = Math.max(0, c.sold - c.opened - playerHeld);
  save();
}

export function botHeld(key) {
  return crate(key).botHeld;
}

/** A sealed box changing hands on the market, crowd to player or back. */
export function crowdSoldToPlayer(key) {
  const c = crate(key);
  c.botHeld = Math.max(0, c.botHeld - 1);
  save();
}
export function playerSoldToCrowd(key) {
  crate(key).botHeld += 1;
  save();
}

// ---- Time away ----------------------------------------------------------------

/** How many crowd steps have "happened" since the page last ran, capped. */
export function stepsSinceLastVisit(msPerStep, cap) {
  const elapsed = Date.now() - (state.lastTick ?? Date.now());
  return Math.max(0, Math.min(cap, Math.floor(elapsed / msPerStep)));
}

export function markTick() {
  state.lastTick = Date.now();
  save();
}
