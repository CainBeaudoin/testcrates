// Vercel serverless proxy for the KicksDB StockX API.
//
// The key lives here, in the KICKSDB_API_KEY environment variable, and never
// reaches the browser. KicksDB itself sends `access-control-allow-origin: *`
// so the page *could* call it directly — but that would ship the key in the
// bundle for anyone to read and burn through the monthly quota with.
//
// Responses are cached at the edge: sneaker comps move slowly and the plan
// quota is monthly, so serving a few hours stale is the right trade.

const UPSTREAM = "https://api.kicks.dev";

// Only these paths are reachable, so the proxy can't be used as an open
// relay for the rest of the API on our key.
const ROUTES = {
  // ?query= — search products
  search: () => "/v3/stockx/products",
  // ?id= — one product, with prices
  product: (p) => `/v3/stockx/products/${encodeURIComponent(p.id)}`,
  // ?id= — daily average sale price + order count, the chart series
  sales: (p) => `/v3/stockx/products/${encodeURIComponent(p.id)}/sales/daily`,
};

export default async function handler(req, res) {
  const key = process.env.KICKSDB_API_KEY;
  if (!key) {
    // Not an error the page needs to shout about — it falls back to its own
    // simulated series and labels the chart accordingly.
    return res.status(503).json({ error: "not_configured" });
  }

  const { route, id, query, market } = req.query;
  const build = ROUTES[route];
  if (!build) return res.status(400).json({ error: "unknown_route" });

  const url = new URL(UPSTREAM + build({ id }));
  if (query) url.searchParams.set("query", query);
  if (market) url.searchParams.set("market", market);
  if (route === "search" || route === "product") {
    url.searchParams.set("display[prices]", "true");
    url.searchParams.set("display[variants]", "true");
  }

  try {
    const upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const body = await upstream.text();

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: "upstream_error",
        status: upstream.status,
        // Surfaced so a quota/plan problem is diagnosable from the console
        // rather than looking like a generic outage.
        quota: upstream.headers.get("X-Quota-Current"),
        detail: body.slice(0, 400),
      });
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).send(body);
  } catch (err) {
    return res.status(502).json({ error: "fetch_failed", detail: String(err) });
  }
}
