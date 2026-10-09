// Crate supply. Every crate sells in numbered series of SERIES_SIZE boxes,
// and every box opens at the crate's published odds: the odds are set at
// the top level and never move, however many boxes have been opened or
// what came out of them. A box is a ticket for one draw at those odds,
// made when it's opened, so a box opened the day it's bought and one
// opened a month later play out the same way.
//
// Counts, per crate:
//   sold    boxes bought from the drop (primary sale) — at most `total`
//   opened  boxes opened, by anyone — at most `sold`
//   botHeld boxes the simulated crowd bought and is sitting on (some of
//           them listed on the market)
// Every box is in exactly one place: unsold, opened, held by the crowd, or
// held by the player (player.js keeps those as sealed-crate tokens).
//
// Lives in its own storage key: the supply is the platform's, not the
// player's, and survives a player reset.

const STORAGE_KEY = "gotcha_supply_v1";
export const SERIES_SIZE = 300;

const pools = new Map(); // crate key -> its catalog pool (prize objects with a weight)
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { crates: {}, lastTick: Date.now(), ...JSON.parse(raw) };
  } catch {
    // unreadable — start the platform fresh
  }
  return { crates: {}, lastTick: Date.now() };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable — supply resets with the page
  }
}

function crate(key) {
  return state.crates[key];
}

function startSeries(key, series) {
  state.crates[key] = { series, total: SERIES_SIZE, sold: 0, opened: 0, botHeld: 0 };
}

// A series whose last box has been opened makes way for the next one.
function maybeRollOver(key) {
  const c = crate(key);
  if (c.opened >= c.total) startSeries(key, c.series + 1);
}

// One prize at the published odds.
function drawAtOdds(key) {
  const pool = pools.get(key);
  const total = pool.reduce((sum, p) => sum + p.weight, 0);
  let r = Math.random() * total;
  for (const p of pool) {
    r -= p.weight;
    if (r < 0) return p;
  }
  return pool[pool.length - 1];
}

// ---- Setup ------------------------------------------------------------------

/**
 * Registers each crate's pool, and
 * makes sure it has a running series. A crate seen for the first time
 * starts part-way through its first series (some sold, some opened, a few
 * held) so the platform looks like it's been trading; `seedShape(key)` can
 * pin a crate's starting point ({ sold, opened } as shares of the series).
 */
export function registerCrates(categories, seedShape = () => null) {
  Object.entries(categories).forEach(([key, cat]) => pools.set(key, cat.pool));
  for (const key of pools.keys()) {
    let c = crate(key);
    if (!c) {
      startSeries(key, 1);
      const shape = seedShape(key) ?? { sold: 0.35 + Math.random() * 0.6, opened: 0.45 + Math.random() * 0.4 };
      c = crate(key);
      c.sold = Math.round(c.total * Math.min(1, shape.sold));
      c.opened = Math.round(c.sold * Math.min(1, shape.opened));
      c.botHeld = c.sold - c.opened;
    }
    // Earlier builds kept a list of what was left in each series, and a
    // mystery charge; neither exists any more.
    delete c.left;
    delete c.charge;
    delete c.ready;
  }
  delete state.reserved;
  delete state.pendingMystery;
  delete state.mysteryMix3;
  save();
}

// ---- Reading ---------------------------------------------------------------

/**
 * Everything a screen needs to say about a crate's boxes. `ev` is the
 * value of one box at the published odds.
 */
export function status(key) {
  const c = crate(key);
  const pool = pools.get(key);
  const total = pool.reduce((sum, p) => sum + p.weight, 0);
  const ev = pool.reduce((sum, p) => sum + p.price * p.weight, 0) / total;
  return {
    series: c.series,
    total: c.total,
    sold: c.sold,
    opened: c.opened,
    unsold: c.total - c.sold,
    unopened: c.total - c.opened,
    soldOut: c.sold >= c.total,
    ev,
  };
}

/** The crate's pool at its published odds. */
export function pool(key) {
  return pools.get(key);
}

/** A prize at the odds, without opening anything — for showing, not winning. */
export function peek(key) {
  return drawAtOdds(key);
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

/** One opening's three boxes, drawn at the odds; the one you pick is your prize. */
export function drawRound(key) {
  return [drawAtOdds(key), drawAtOdds(key), drawAtOdds(key)];
}

/** The round's box was picked: one more box opened. */
export function settleRound(key) {
  const c = crate(key);
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
  c.sold += 1;
  c.opened += 1;
  const prize = drawAtOdds(key);
  maybeRollOver(key);
  save();
  return prize;
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
  c.botHeld -= 1;
  c.opened += 1;
  const prize = drawAtOdds(key);
  maybeRollOver(key);
  save();
  return prize;
}

/**
 * Squares the crowd's holdings with what the player actually holds, on
 * startup. Each held box is either the player's (a sealed-crate token) or
 * the crowd's, so the crowd's count is whatever the player doesn't hold.
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
