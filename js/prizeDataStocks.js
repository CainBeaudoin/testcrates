// The Stocks tier's pool — same mechanics as the sneaker tiers (pick,
// reveal, pity, fairness, cash out/keep), same rarity system, just a
// different kind of prize. Real, well-known tickers (individual names and
// broad-market ETFs), bucketed into the standard 5 rarity bands with the
// same weight ratio the sneaker pools use (5.0 : 3.12 : 1.88 : 1.5 : 1.0),
// spread across the tier's $15-$300 price range per band.
//
// There's no product photo for a ticker the way there is for a sneaker, so
// each "image" is a small generated SVG: a share certificate on thick,
// warm off-white card stock, printed in the ticker's ink colour.
// Procedural, like the rest of this app's graphics, rather than pulling in
// real company logos or a stock photo. Square to the frame and clean, to
// sit with the rest of the site; the paper grain is an SVG filter.

function stockCardSVG(ticker, company, hue) {
  const seed = [...ticker].reduce((n, c) => n * 31 + c.charCodeAt(0), 7) % 997;
  const ink = `hsl(${hue},42%,28%)`;
  const inkSoft = `hsl(${hue},30%,45%)`;
  const tickerSize = ticker.length > 4 ? 52 : 64;
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const font = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="600" height="600">
    <defs>
      <filter id="grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="${seed}"/>
        <feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0 0.32  0 0 0 0.09 0"/>
        <feComposite in2="SourceGraphic" operator="in"/>
      </filter>
      <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.55"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect x="30" y="24" width="240" height="258" rx="6" fill="#000" opacity="0.07"/>
    <rect x="30" y="21" width="240" height="258" rx="6" fill="#e9e4d9"/>
    <rect x="30" y="18" width="240" height="258" rx="6" fill="#f6f3ec"/>
    <rect x="30" y="18" width="240" height="258" rx="6" fill="#fff" filter="url(#grain)"/>
    <rect x="30" y="18" width="240" height="60" rx="6" fill="url(#sheen)"/>
    <rect x="44" y="32" width="212" height="230" rx="3" fill="none" stroke="${ink}" stroke-width="1.5" opacity="0.55"/>
    <g font-family="${font}" text-anchor="middle" fill="${ink}">
      <text x="150" y="70" font-size="10" font-weight="700" letter-spacing="3" opacity="0.7">SHARE CERTIFICATE</text>
      <text x="150" y="${150 + tickerSize * 0.2}" font-size="${tickerSize}" font-weight="800" letter-spacing="-1">${esc(ticker)}</text>
      <text x="150" y="194" font-size="${company.length > 20 ? 12 : 14}" font-weight="500" fill="${inkSoft}">${esc(company)}</text>
      <line x1="120" y1="222" x2="180" y2="222" stroke="${ink}" stroke-width="1" opacity="0.35"/>
      <text x="150" y="242" font-size="9" font-weight="700" letter-spacing="2" opacity="0.55">ONE SIMULATED SHARE</text>
    </g>
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
    name: `${ticker} · ${company}`,
    price,
    rarity,
    weight: WEIGHT_BY_RARITY[rarity],
    image: stockCardSVG(ticker, company, hue),
    category: "stocks",
  }))
);
