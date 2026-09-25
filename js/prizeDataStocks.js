// The Stocks tier's pool — same mechanics as the sneaker tiers (pick,
// reveal, pity, fairness, cash out/keep), same rarity system, just a
// different kind of prize. Real, well-known tickers (individual names and
// broad-market ETFs), bucketed into the standard 5 rarity bands with the
// same weight ratio the sneaker pools use (5.0 : 3.12 : 1.88 : 1.5 : 1.0),
// spread across the tier's $15-$300 price range per band.
//
// There's no product photo for a ticker the way there is for a sneaker, so
// each "image" is a small generated SVG — a worn share certificate on aged
// paper, printed in the ticker's ink colour: procedural, like the rest of
// this app's graphics, rather than pulling in real company logos or a
// stock photo. The grain, stains and crease are SVG filters, seeded per
// ticker so no two sheets are quite the same.

function stockCardSVG(ticker, company, hue) {
  const seed = [...ticker].reduce((n, c) => n * 31 + c.charCodeAt(0), 7) % 997;
  const tilt = ((seed % 7) - 3) * 0.6; // a degree or two, like a sheet dropped on a table
  const ink = `hsl(${hue},45%,24%)`;
  const inkSoft = `hsl(${hue},35%,34%)`;
  const tickerSize = ticker.length > 4 ? 50 : 62;
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">
    <defs>
      <filter id="grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="${seed}"/>
        <feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 0 0.12  0 0 0 0.22 0"/>
        <feComposite in2="SourceGraphic" operator="in"/>
      </filter>
      <filter id="stain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="${seed + 11}"/>
        <feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.38  0 0 0 0 0.16  0 0 0 1.4 -0.62"/>
        <feComposite in2="SourceGraphic" operator="in"/>
      </filter>
      <radialGradient id="age" cx="50%" cy="46%" r="72%">
        <stop offset="55%" stop-color="#8a6230" stop-opacity="0"/>
        <stop offset="100%" stop-color="#8a6230" stop-opacity="0.42"/>
      </radialGradient>
      <linearGradient id="fold" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#5a3e1c" stop-opacity="0"/>
        <stop offset="0.47" stop-color="#5a3e1c" stop-opacity="0.16"/>
        <stop offset="0.5" stop-color="#fff8e6" stop-opacity="0.5"/>
        <stop offset="0.53" stop-color="#5a3e1c" stop-opacity="0.08"/>
        <stop offset="1" stop-color="#5a3e1c" stop-opacity="0"/>
      </linearGradient>
      <clipPath id="sheet"><rect x="22" y="16" width="256" height="268" rx="3"/></clipPath>
    </defs>
    <g transform="rotate(${tilt} 150 150)">
      <rect x="24" y="19" width="256" height="268" rx="3" fill="#000" opacity="0.12"/>
      <g clip-path="url(#sheet)">
        <rect x="22" y="16" width="256" height="268" fill="#ecdfc2"/>
        <rect x="22" y="16" width="256" height="268" fill="#fff" filter="url(#stain)"/>
        <rect x="22" y="16" width="256" height="268" fill="#fff" filter="url(#grain)"/>
        <rect x="22" y="16" width="256" height="268" fill="url(#age)"/>
        <rect x="${108 + (seed % 30)}" y="16" width="44" height="268" fill="url(#fold)"/>
        <rect x="36" y="30" width="228" height="240" fill="none" stroke="${ink}" stroke-width="2.5" opacity="0.8"/>
        <rect x="42" y="36" width="216" height="228" fill="none" stroke="${inkSoft}" stroke-width="1" stroke-dasharray="2 3" opacity="0.7"/>
        <g font-family="Georgia, 'Times New Roman', serif" text-anchor="middle" fill="${ink}">
          <text x="150" y="72" font-size="13" letter-spacing="3" opacity="0.85">SHARE CERTIFICATE</text>
          <line x1="96" y1="84" x2="204" y2="84" stroke="${ink}" stroke-width="1" opacity="0.6"/>
          <text x="150" y="${150 + tickerSize * 0.18}" font-size="${tickerSize}" font-weight="700" opacity="0.9">${esc(ticker)}</text>
          <text x="150" y="196" font-size="${company.length > 20 ? 12 : 14}" font-style="italic" opacity="0.85">${esc(company)}</text>
          <text x="150" y="238" font-size="10" letter-spacing="2" opacity="0.7">ONE SIMULATED SHARE</text>
        </g>
      </g>
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
    name: `${ticker} — ${company}`,
    price,
    rarity,
    weight: WEIGHT_BY_RARITY[rarity],
    image: stockCardSVG(ticker, company, hue),
    category: "stocks",
  }))
);
