// Shared marketplace state: listings (yours + simulated other sellers) and
// offers/counter-offers on them. Persisted to localStorage so it's stable
// across reloads. There is no backend here — "other users" are a seeded,
// clearly-simulated cast (see FAKE_USERNAMES) with simple bot logic for
// responding to offers, not a real live marketplace.

const STORAGE_KEY = "gotcha_market_v1";

export const FAKE_USERNAMES = [
  "PixelHawk77", "MidnightCartel", "SoleSeeker", "GrailChaser22", "VaultKid",
  "UrbanNomad", "ClutchDrop", "HeatCheckHQ", "BackboardBandit", "RarePairz",
  "KicksAndCo", "NorthStarTrades", "DuneRunner", "CrateDigger", "FlipMerchant",
  "OrbitLace", "SneakerSensei", "LowKeyFlex", "ThreadCounter", "ReplayDrops",
];

let uidCounter = 0;
function uid() {
  uidCounter += 1;
  return `m${Date.now().toString(36)}${uidCounter.toString(36)}`;
}

// No size data exists in the scraped catalog, so each listing gets a
// deterministic synthetic US size (same item name always maps to the same
// size) — enough to power a real Size filter without pretending it's real
// inventory data.
export const SIZES = ["7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "13"];

function sizeForItem(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SIZES[h % SIZES.length];
}

// A share of stock doesn't have a shoe size — only assign one for
// categories that actually wear one (sneakers, the implicit default for
// items predating the category field).
function sizeFor(item) {
  return item.category === "stocks" ? null : sizeForItem(item.name);
}

function defaultState() {
  return {
    seeded: false,
    listings: [], // {id, name, rarity, image, catalogPrice, price, seller, isPlayer, itemId, ts}
    offers: [], // {id, listingId, amount, fromUsername, fromIsPlayer, toUsername, toIsPlayer, status, counterAmount, ts}
  };
}

// One-time cleanup for sessions seeded before stocks were excluded from
// the marketplace — drops any stock listings (and offers on them) already
// sitting in localStorage.
function stripStockListings(loaded) {
  const stockIds = new Set(loaded.listings.filter((l) => l.category === "stocks").map((l) => l.id));
  if (stockIds.size === 0) return loaded;
  loaded.listings = loaded.listings.filter((l) => !stockIds.has(l.id));
  loaded.offers = loaded.offers.filter((o) => !stockIds.has(o.listingId));
  return loaded;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return stripStockListings({ ...defaultState(), ...JSON.parse(raw) });
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
    // storage unavailable — marketplace just won't persist
  }
}

// ---- Seeding (simulated other-seller listings) ---------------------------
// Runs once ever. Picks a spread of real catalog items and lists them at a
// price near (but not exactly) their catalog value, under a fake username,
// so the marketplace doesn't start empty.

export function ensureSeeded(catalog) {
  if (state.seeded) return;
  // Stocks never touch the marketplace — they redeem straight to the
  // platform at exact on-chain value, not peer-to-peer like collectibles.
  const shuffled = catalog.filter((item) => item.category !== "stocks").sort(() => Math.random() - 0.5);

  // Listed: priced, Buy Now available.
  shuffled.slice(0, 20).forEach((item) => {
    const wobble = 0.85 + Math.random() * 0.35; // 85%-120% of catalog price
    const price = Math.max(1, Math.round(item.price * wobble));
    state.listings.push({
      id: uid(),
      name: item.name,
      rarity: item.rarity,
      image: item.image,
      catalogPrice: item.price,
      price,
      size: sizeFor(item),
      category: item.category,
      seller: FAKE_USERNAMES[Math.floor(Math.random() * FAKE_USERNAMES.length)],
      isPlayer: false,
      itemId: null,
      ts: Date.now() - Math.floor(Math.random() * 6 * 24 * 60 * 60 * 1000),
    });
  });

  // Unlisted: sitting in someone's vault, offer-only, no asking price —
  // the "auto-population" state from the scope (kept items become
  // browsable even before their owner sets a price).
  shuffled.slice(20, 30).forEach((item) => {
    state.listings.push({
      id: uid(),
      name: item.name,
      rarity: item.rarity,
      image: item.image,
      catalogPrice: item.price,
      price: null,
      size: sizeFor(item),
      category: item.category,
      seller: FAKE_USERNAMES[Math.floor(Math.random() * FAKE_USERNAMES.length)],
      isPlayer: false,
      itemId: null,
      ts: Date.now() - Math.floor(Math.random() * 6 * 24 * 60 * 60 * 1000),
    });
  });

  state.seeded = true;
  save();
}

export function getListings() {
  return state.listings;
}

export function getListing(id) {
  return state.listings.find((l) => l.id === id) || null;
}

// price: null => unlisted / offer-only (the auto-populated state from
// Keep). A real number => listed, Buy Now available.
export function createListing({ item, price = null, seller }) {
  const listing = {
    id: uid(),
    name: item.name,
    rarity: item.rarity,
    image: item.image,
    catalogPrice: item.price,
    price,
    size: sizeFor(item),
    category: item.category,
    seller,
    isPlayer: true,
    itemId: item.id,
    ts: Date.now(),
  };
  state.listings.push(listing);
  save();
  return listing;
}

export function updateListing(id, patch) {
  const listing = getListing(id);
  if (!listing) return null;
  Object.assign(listing, patch);
  save();
  return listing;
}

export function removeListing(id) {
  state.listings = state.listings.filter((l) => l.id !== id);
  state.offers = state.offers.filter((o) => o.listingId !== id);
  save();
}

// ---- Simulated live market value -----------------------------------------
// Same deterministic-per-day approach as the vault's currentMarketValue
// (see player.js) — every listing, not just ones the player owns, gets a
// live-looking comp value and a 30-day price-action chart. Duplicated
// rather than imported from player.js: a market listing has no owner-
// specific concepts (acquiredAt, archival clock) to reconcile with.

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

function valueOnDate(listing, date) {
  const dayKey = date.toISOString().slice(0, 10);
  const h = hashString(`${listing.id}:${dayKey}`);
  const wobble = ((h % 3000) / 3000) * 0.3 - 0.15; // -15%..+15%
  return Math.max(1, Math.round(listing.catalogPrice * (1 + wobble)));
}

export function currentListingValue(listing) {
  return valueOnDate(listing, new Date());
}

export function listingPriceHistory(listing, days = 30) {
  const now = new Date();
  const points = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    points.push({ date: date.toISOString().slice(0, 10), value: valueOnDate(listing, date) });
  }
  return points;
}

// ---- Fair Market Value badge --------------------------------------------
// Scores an asking price against the item's catalog/comp value. Band
// thresholds are placeholder V1 numbers (the scope leaves them open).

export function fmvRating(listing) {
  if (listing.price == null) return null;
  const ratio = listing.price / listing.catalogPrice;
  if (ratio <= 0.9) return { key: "good-deal", label: "Very Good", color: "#4ade80" };
  if (ratio <= 1.1) return { key: "fair", label: "Good", color: "#AFBAC4" };
  return { key: "over", label: "Not Good", color: "#f87171" };
}

// Rough brand extraction from the item name, for the marketplace brand
// filter (mirrors "brand" being a first-class filter in the scope).
export function extractBrand(name) {
  const upper = name.toUpperCase();
  if (upper.includes("AIR JORDAN") || upper.includes("JORDAN")) return "Jordan";
  if (upper.includes("YEEZY")) return "Yeezy";
  if (upper.includes("NIKE")) return "Nike";
  if (upper.includes("ADIDAS")) return "Adidas";
  if (upper.includes("NEW BALANCE")) return "New Balance";
  if (upper.includes("ASICS")) return "Asics";
  if (upper.includes("VANS")) return "Vans";
  if (upper.includes("CONVERSE")) return "Converse";
  if (upper.includes("RICK OWENS")) return "Rick Owens";
  if (upper.includes("CHROME HEARTS")) return "Chrome Hearts";
  return "Other";
}

// ---- Offers ----------------------------------------------------------

export function getOffersForListing(id) {
  return state.offers.filter((o) => o.listingId === id).sort((a, b) => b.ts - a.ts);
}

export function getMyOffers() {
  return state.offers.filter((o) => o.fromIsPlayer).sort((a, b) => b.ts - a.ts);
}

export function getIncomingOffers() {
  return state.offers.filter((o) => o.toIsPlayer && o.status === "pending").sort((a, b) => b.ts - a.ts);
}

export function makeOffer({ listingId, amount, fromUsername, fromIsPlayer, toUsername, toIsPlayer }) {
  const offer = {
    id: uid(),
    listingId,
    amount,
    fromUsername,
    fromIsPlayer,
    toUsername,
    toIsPlayer,
    status: "pending",
    counterAmount: null,
    ts: Date.now(),
  };
  state.offers.push(offer);
  save();
  return offer;
}

export function getOffer(id) {
  return state.offers.find((o) => o.id === id) || null;
}

export function updateOffer(id, patch) {
  const offer = getOffer(id);
  if (!offer) return null;
  Object.assign(offer, patch, { ts: Date.now() });
  save();
  return offer;
}

// A simple, transparent rule for how a simulated party reacts to an amount
// against an asking price — used both for bots responding to your offers
// and for bots responding to your counter-offers.
export function botDecision(amount, askingPrice) {
  const ratio = amount / askingPrice;
  if (ratio >= 0.88) return { status: "accepted" };
  if (ratio >= 0.6) {
    const counterAmount = Math.round((amount + askingPrice) / 2);
    return { status: "countered", counterAmount };
  }
  return { status: "declined" };
}

// Occasionally spawns a simulated incoming offer on one of the player's
// listings that doesn't already have a pending offer — called when the
// account/marketplace screens render, not on a timer.
export function maybeSpawnIncomingOffer(chance = 0.2) {
  const myListings = state.listings.filter((l) => l.isPlayer);
  const spawned = [];
  myListings.forEach((listing) => {
    const hasPending = state.offers.some((o) => o.listingId === listing.id && o.status === "pending" && !o.fromIsPlayer);
    if (hasPending) return;
    if (Math.random() > chance) return;
    const ratio = 0.55 + Math.random() * 0.4; // 55%-95% of asking price
    const amount = Math.max(1, Math.round(listing.price * ratio));
    spawned.push(
      makeOffer({
        listingId: listing.id,
        amount,
        fromUsername: FAKE_USERNAMES[Math.floor(Math.random() * FAKE_USERNAMES.length)],
        fromIsPlayer: false,
        toUsername: listing.seller,
        toIsPlayer: true,
      })
    );
  });
  return spawned;
}
