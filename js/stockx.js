// StockX market data via KicksDB, through the /api/stockx serverless proxy
// (see api/stockx.js — the key stays server-side).
//
// Everything here is best-effort: if the key isn't configured, the request
// fails, or the shoe isn't on StockX, callers fall back to the app's own
// simulated series and label the chart as simulated. Nothing blocks on the
// network — charts render immediately from the fallback and swap in live
// data when it arrives.

const PROXY = "/api/stockx";

// The monthly quota is the scarce resource, so results are cached hard:
// in memory for the session and in localStorage across sessions. Sneaker
// comps move slowly; a day-old average is still an honest reference.
const CACHE_KEY = "stockx_cache_v1";
const TTL_MS = 12 * 60 * 60 * 1000;

let memory = null;

function cache() {
  if (memory) return memory;
  try {
    memory = JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
  } catch {
    memory = {};
  }
  return memory;
}

function cacheGet(key) {
  const hit = cache()[key];
  if (!hit) return undefined;
  if (Date.now() - hit.ts > TTL_MS) return undefined;
  return hit.value;
}

function cacheSet(key, value) {
  cache()[key] = { ts: Date.now(), value };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(memory));
  } catch {
    // Storage full or blocked — the in-memory copy still serves this session.
  }
}

// A single flight per key, so eight cards asking for the same shoe at once
// produce one request rather than eight.
const inflight = new Map();

async function get(params, cacheKey) {
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;
  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const url = `${PROXY}?${new URLSearchParams(params)}`;
  const p = fetch(url)
    .then(async (r) => {
      if (!r.ok) {
        // 503 = no key configured. Cache the miss too, so a site running
        // without a key doesn't re-request on every render.
        cacheSet(cacheKey, null);
        return null;
      }
      const json = await r.json();
      cacheSet(cacheKey, json);
      return json;
    })
    .catch(() => {
      cacheSet(cacheKey, null);
      return null;
    })
    .finally(() => inflight.delete(cacheKey));

  inflight.set(cacheKey, p);
  return p;
}

// ---- Lookup --------------------------------------------------------------

// Catalog names come from a shop scrape, so they don't match StockX titles
// exactly — strip the noise that most often breaks a match.
function searchTerm(name) {
  return name
    .replace(/\((\d{4})\)/g, "")       // "(2025)" release-year suffixes
    .replace(/\bWMNS\b/gi, "")          // StockX indexes these under the base name
    .replace(/\s+/g, " ")
    .trim();
}

// Resolves a catalog name to a StockX product, or null if there's no
// confident match. Cached by name, including the misses.
export async function findProduct(name) {
  const json = await get({ route: "search", query: searchTerm(name) }, `find:${name}`);
  const hit = json?.data?.[0];
  if (!hit) return null;
  return {
    id: hit.id,
    slug: hit.slug,
    title: hit.title,
    sku: hit.sku,
    image: hit.image,
    link: hit.link,
    minPrice: hit.min_price ?? null,
    avgPrice: hit.avg_price ?? null,
    maxPrice: hit.max_price ?? null,
  };
}

// ---- Chart series --------------------------------------------------------

// StockX daily sales -> the {date, value} shape buildPriceChartSVG expects.
// avg_amount is the average sale price that day, which is the honest
// "what did this actually trade at" line rather than an ask.
export async function priceHistory(name, days = 30) {
  const product = await findProduct(name);
  if (!product) return null;

  const json = await get({ route: "sales", id: product.id }, `sales:${product.id}`);
  const rows = json?.data;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const points = rows
    .filter((r) => r.avg_amount > 0 && new Date(r.date).getTime() >= cutoff)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((r) => ({ date: String(r.date).slice(0, 10), value: Math.round(r.avg_amount) }));

  // A couple of scattered sales make a jagged, misleading line — below this
  // the simulated series is the better chart.
  if (points.length < 5) return null;
  return { points, product };
}

// Last traded price, for the value shown beside a chart.
export async function lastSalePrice(name) {
  const history = await priceHistory(name);
  return history ? history.points[history.points.length - 1].value : null;
}
