// The Stocks tier's pool — same mechanics as the sneaker tiers (pick,
// reveal, pity, fairness, cash out/keep), same rarity system, just a
// different kind of prize. Real, well-known tickers (individual names and
// broad-market ETFs), bucketed into the standard 5 rarity bands with the
// same weight ratio the sneaker pools use (5.0 : 3.12 : 1.88 : 1.5 : 1.0),
// spread across the tier's $15-$300 price range per band.
//
// There's no product photo for a ticker the way there is for a sneaker, so
// each "image" is a small generated SVG card (ticker + exchange label) —
// procedural, like the rest of this app's graphics, rather than pulling in
// real company logos.

function stockCardSVG(ticker, sub, hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
    <rect width="300" height="300" rx="22" fill="hsl(${hue},38%,16%)"/>
    <rect x="2" y="2" width="296" height="296" rx="20" fill="none" stroke="hsl(${hue},45%,36%)" stroke-width="3"/>
    <text x="150" y="158" font-family="Arial, Helvetica, sans-serif" font-size="60" font-weight="800" fill="#fff" text-anchor="middle" dominant-baseline="middle">${ticker}</text>
    <text x="150" y="205" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="600" fill="hsl(${hue},55%,68%)" text-anchor="middle" letter-spacing="1">${sub}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// [ticker, company/fund name, demo price, hue]
const RAW = {
  common: [
    ["F", "Ford Motor Co", 15, 205],
    ["SNAP", "Snap Inc", 17, 250],
    ["SOFI", "SoFi Technologies", 19, 160],
    ["NIO", "NIO Inc", 21, 190],
    ["T", "AT&T Inc", 23, 210],
    ["PFE", "Pfizer Inc", 26, 195],
    ["INTC", "Intel Corp", 29, 200],
    ["PLTR", "Palantir Technologies", 33, 260],
  ],
  uncommon: [
    ["BAC", "Bank of America", 37, 205],
    ["KO", "Coca-Cola Co", 41, 0],
    ["CSCO", "Cisco Systems", 45, 200],
    ["PYPL", "PayPal Holdings", 49, 220],
    ["DIS", "Walt Disney Co", 54, 215],
    ["UBER", "Uber Technologies", 59, 145],
    ["ABNB", "Airbnb Inc", 64, 350],
    ["NKE", "Nike Inc", 68, 15],
  ],
  rare: [
    ["AMD", "Advanced Micro Devices", 74, 0],
    ["V", "Visa Inc", 80, 220],
    ["MA", "Mastercard Inc", 86, 25],
    ["JPM", "JPMorgan Chase", 92, 210],
    ["HD", "Home Depot Inc", 98, 20],
    ["COST", "Costco Wholesale", 104, 205],
    ["QQQ", "Invesco QQQ Trust", 110, 265],
    ["DIA", "SPDR Dow Jones ETF", 117, 230],
  ],
  epic: [
    ["GOOGL", "Alphabet Inc", 126, 145],
    ["AMZN", "Amazon.com Inc", 134, 35],
    ["AAPL", "Apple Inc", 143, 0],
    ["MSFT", "Microsoft Corp", 152, 200],
    ["META", "Meta Platforms", 161, 220],
    ["VOO", "Vanguard S&P 500 ETF", 172, 215],
    ["SPY", "SPDR S&P 500 ETF", 184, 210],
    ["AVGO", "Broadcom Inc", 196, 5],
  ],
  legendary: [
    ["NFLX", "Netflix Inc", 208, 355],
    ["TSLA", "Tesla Inc", 221, 0],
    ["LLY", "Eli Lilly and Co", 234, 340],
    ["ARKK", "ARK Innovation ETF", 247, 200],
    ["SMH", "VanEck Semiconductor ETF", 260, 265],
    ["COIN", "Coinbase Global", 273, 210],
    ["IWM", "iShares Russell 2000 ETF", 286, 25],
    ["NVDA", "Nvidia Corp", 300, 130],
  ],
};

const WEIGHT_BY_RARITY = { common: 5.0, uncommon: 3.12, rare: 1.88, epic: 1.5, legendary: 1.0 };

export const PRIZE_POOL = Object.entries(RAW).flatMap(([rarity, entries]) =>
  entries.map(([ticker, company, price, hue]) => ({
    name: `${ticker} — ${company}`,
    price,
    rarity,
    weight: WEIGHT_BY_RARITY[rarity],
    image: stockCardSVG(ticker, "SIMULATED SHARE", hue),
    category: "stocks",
  }))
);
