// Crate supply. Every crate sells in numbered series of SERIES_SIZE boxes,
// and every box opens at the crate's published odds: the odds are set at
// the top level and never move, however many boxes have been opened or
// what came out of them. A box is a ticket for one draw at those odds,
// made when it's opened, so a box opened the day it's bought and one
// opened a month later play out the same way.
//
// On top of the odds, a crate can hold mystery items: pieces far above
// its normal range that have no odds at all. Each crate has a mystery
// charge that fills with every box opened (by anyone) — the money that has
// gone through the crate, though it's only ever shown as a share of full.
// When it fills, a mystery item is unlocked: the bar holds at 100% showing
// it, and from then on every box opened, by anyone, has a small chance at
// it (`chance`, e.g. 3%) until one hits. Then the charge starts again.
// Not "the next box gets it": that would have everyone waiting at 99% for
// someone else to fill it, then racing for the one box after.
//
// Counts, per crate:
//   sold    boxes bought from the drop (primary sale) — at most `total`
//   opened  boxes opened, by anyone — at most `sold`
//   botHeld boxes the simulated crowd bought and is sitting on (some of
//           them listed on the market)
//   charge  money opened since the last mystery release
//   ready   the unlocked mystery item's name, until a box hits it
// Every box is in exactly one place: unsold, opened, held by the crowd, or
// held by the player (player.js keeps those as sealed-crate tokens).
//
// Lives in its own storage key: the supply is the platform's, not the
// player's, and survives a player reset.

const STORAGE_KEY = "gotcha_supply_v1";
export const SERIES_SIZE = 300;

const pools = new Map(); // crate key -> its catalog pool (prize objects with a weight)
const prices = new Map(); // crate key -> drop price
const mysteries = new Map(); // crate key -> { items, target } (target in dollars opened)
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { crates: {}, pendingMystery: null, lastTick: Date.now(), ...JSON.parse(raw) };
  } catch {
    // unreadable — start the platform fresh
  }
  return { crates: {}, pendingMystery: null, lastTick: Date.now() };
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
  const prev = crate(key);
  state.crates[key] = { series, total: SERIES_SIZE, sold: 0, opened: 0, botHeld: 0, charge: prev?.charge ?? null };
}

// A series whose last box has been opened makes way for the next one. The
// mystery charge carries over: it belongs to the crate, not the series.
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
 * Registers each crate's pool, price and (optionally) mystery items, and
 * makes sure it has a running series. A crate seen for the first time
 * starts part-way through its first series (some sold, some opened, a few
 * held) so the platform looks like it's been trading; `seedShape(key)` can
 * pin a crate's starting point ({ sold, opened } as shares of the series).
 * `mystery` is { [key]: { items, target, chance } }.
 */
export function registerCrates(categories, seedShape = () => null, mystery = {}) {
  Object.entries(categories).forEach(([key, cat]) => {
    pools.set(key, cat.pool);
    prices.set(key, cat.price);
  });
  Object.entries(mystery).forEach(([key, m]) => mysteries.set(key, m));
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
    // Earlier builds kept a list of what was left in each series; the odds
    // don't move any more, so it goes.
    delete c.left;
    // A crate's charge starts somewhere along the way, so the bars aren't
    // all sitting empty on a first visit.
    if (c.charge == null) c.charge = mysteries.has(key) ? mysteries.get(key).target * (0.4 + Math.random() * 0.5) : 0;
    if (c.ready && !mysteryByName(key, c.ready)) c.ready = null;
  }
  // Once: a mix to see — the Sneakers $150 crate unlocked, every other
  // crate somewhere along its charge (earlier builds left most of them
  // unlocked at once, which said nothing).
  if (!state.mysteryMix3) {
    for (const key of mysteries.keys()) {
      const c = crate(key);
      const m = mysteries.get(key);
      if (!c) continue;
      if (key === "sneakers") {
        c.charge = m.target;
        c.ready = m.items[0].name;
      } else {
        c.ready = null;
        c.charge = m.target * (0.2 + Math.random() * 0.65);
      }
    }
    state.mysteryMix3 = true;
  }
  delete state.reserved;
  // A mystery round that never finished (the page closed before a box was
  // picked) hands the release back: the charge is full again, and the box
  // it was opening is still sealed in the player's account.
  if (state.pendingMystery) {
    const c = crate(state.pendingMystery.key);
    const m = mysteries.get(state.pendingMystery.key);
    if (c && m) {
      c.charge = m.target;
      c.ready = state.pendingMystery.name ?? m.items[0].name;
    }
    state.pendingMystery = null;
  }
  save();
}

// ---- Reading ---------------------------------------------------------------

/**
 * Everything a screen needs to say about a crate's boxes. `ev` is the
 * value of one box at the published odds (mystery items aside).
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

// ---- Mystery --------------------------------------------------------------

export function hasMystery(key) {
  return mysteries.has(key);
}

export function mysteryItems(key) {
  return mysteries.get(key)?.items ?? [];
}

function mysteryByName(key, name) {
  return mysteries.get(key)?.items.find((p) => p.name === name) ?? null;
}

/** How full the crate's mystery charge is, 0..1 — 1 only once revealed. */
export function charge(key) {
  const m = mysteries.get(key);
  if (!m) return 0;
  const c = crate(key);
  return c.ready ? 1 : Math.min(0.99, c.charge / m.target);
}

/** The unlocked mystery item, or null. */
export function readyItem(key) {
  const c = crate(key);
  return c?.ready ? mysteryByName(key, c.ready) : null;
}

/** A box's chance at the unlocked mystery item, 0..1. */
export function unlockedChance(key) {
  return mysteries.get(key)?.chance ?? 0;
}

// One box opened. With a mystery item unlocked, this box has its chance at
// it (a hit takes it, and the charge starts over); otherwise the box adds
// to the charge, and filling it unlocks the next mystery item. Returns the
// item this box gets, or null.
function chargeOne(key) {
  const m = mysteries.get(key);
  if (!m) return null;
  const c = crate(key);
  if (c.ready) {
    if (Math.random() >= m.chance) return null;
    const item = mysteryByName(key, c.ready);
    c.ready = null;
    c.charge = 0;
    return item;
  }
  c.charge += prices.get(key);
  if (c.charge >= m.target) {
    c.charge = m.target;
    c.ready = m.items[Math.floor(Math.random() * m.items.length)].name;
  }
  return null;
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
 * One opening's three boxes, drawn at the odds; the one you pick is your
 * prize. If the crate's mystery item is unlocked and this opening hits its
 * chance, it's a mystery round instead: every box holds it, so it's yours
 * whichever you pick. Returns { prizes, mystery }.
 */
export function drawRound(key) {
  const released = chargeOne(key);
  if (released) {
    state.pendingMystery = { key, name: released.name };
    save();
    const prize = { ...released, mystery: true };
    return { prizes: [prize, prize, prize], mystery: true };
  }
  save();
  return { prizes: [drawAtOdds(key), drawAtOdds(key), drawAtOdds(key)], mystery: false };
}

/** The round's box was picked: one more box opened. */
export function settleRound(key) {
  const c = crate(key);
  c.opened += 1;
  state.pendingMystery = null;
  maybeRollOver(key);
  save();
}

// ---- The crowd ---------------------------------------------------------------
// The simulated other players buy, open and hold from the same supply, so
// the counts on screen actually move. One step is one thing one of them
// does. An opening that fills the charge releases the mystery item to
// them (marked `mystery` on the returned prize).

function crowdOpen(key) {
  const released = chargeOne(key);
  return released ? { ...released, mystery: true } : drawAtOdds(key);
}

export function crowdBuyAndOpen(key) {
  const c = crate(key);
  if (c.sold >= c.total) return null;
  c.sold += 1;
  c.opened += 1;
  const prize = crowdOpen(key);
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
  const prize = crowdOpen(key);
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
