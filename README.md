# Gotcha Machine

A crate/gacha-style prize picker. Pick a prize tier and how you're paying
for it, watch a slot-machine reel settle on three real 3D crates, then
click one to open it. Your crate opens first — its prize is revealed on a
hero card with **Cash Back** / **Keep** buttons — then the other two
crates open afterward so you can see what you could have won.

## Wallet: Credits + Cash (USDC)

A balance bar at the top of every screen tracks two simulated balances —
**Credits** and **Cash (USDC)** — both play-money, `localStorage`-only,
not connected to any real payment or crypto system.

Before each round you pick which one you're "opening with" (a small modal,
see `openPaymentPicker` in `js/app.js`). That choice only decides where a
win pays out:

- **Cash Back** deposits the prize's dollar value into whichever balance
  you opened with — Credits stay Credits, Cash stays Cash. A toast + "ding"
  confirms the deposit and the header balance pulses.
- **Keep** leaves both balances untouched — you keep the (virtual) item
  instead, tracked in Best Pull / Recent Pulls.

There's no cost to open a crate — the payment choice is purely about which
balance a win lands in, so credits simply accumulate from playing rather
than needing a separate "free crate" meter.

## Prize tiers

Three tiers — **$100**, **$250**, **$1000** — run identical mechanics,
just against progressively pricier pools scraped from the same source (see
Prize catalog below), so a $1000-tier Legendary is a real step up from a
$100-tier Legendary. Add more in `CATEGORIES` in `js/app.js`.

## How it works

- `js/app.js` defines the prize tiers in `CATEGORIES`. Each tier draws from
  a weighted pool of prizes (see `js/prizeData.js`, `prizeData250.js`,
  `prizeData1000.js`).
- When a round starts, all three crates are assigned a prize immediately
  (via a weighted random pick) — before the player picks anything. Clicking
  a crate never changes what's inside it, and nothing about a prize is
  shown until that crate's lid opens.
- `js/boxViewer.js` renders each crate as an interactive 3D model
  (`assets/models/nike_shoe_box/`) using three.js. Idle crates spin slowly;
  hovering eases a crate back to facing forward. Clicking always finishes
  that turn before the lid opens, so every crate opens facing the camera
  the same way, regardless of what angle it was spinning at.
- Opening your crate pops an image price card out of the lid, then shows
  the same prize full-size in a center modal — but the actual item stays
  hidden behind a rarity-tiered reveal animation first (`js/reveal.js`: a
  vortex/particle CSS effect plus a synthesized WebAudio "hype" sound,
  ~1-3s depending on rarity) before the image, name, price, and **Cash
  Back** / **Keep** buttons fade in. This reveal only ever plays for the
  crate you picked — the other two crates open with the plain price card,
  no FX.
- Either choice dismisses the modal and reveals the other two crates in
  sequence, then an **Open Again** button starts a fresh round.

## Engagement systems (`js/player.js`)

Progress persists to `localStorage` (per-browser, not a real account):

- **Pity**: tracked separately per tier. If 8 rounds pass with no Rare+
  anywhere among that tier's 3 crates (or 20 rounds with no Epic+), the
  next round in that tier force-upgrades one crate into that subpool.
  Progress shows as a bar on each tier card.
- **Streak**: consecutive picks that land Rare+ show a "🔥 N Rare+ in a
  row!" badge in the reveal modal.
- **Near-miss**: if a crate you *didn't* pick outranks the one you did,
  it gets a pulse + "So close — that was X!" tag. This only ever reflects
  a real outcome — it never changes odds or which crate looks pickable
  beforehand.
- **Best pull** and **recent pulls** are surfaced on the tier-select
  screen — both are the player's own real history, not a fabricated
  "someone just won X" feed.

Sound (`js/sound.js`) is entirely procedural WebAudio (oscillators +
filtered noise) — no external audio files. A mute toggle (top-right) turns
off both the ambient hum and every UI/reveal sound.

## Prize catalog

`js/prizeData.js` / `prizeData250.js` / `prizeData1000.js` are each
generated from a scrape of
[odto.com/collections/footwear](https://odto.com/collections/footwear) —
real sneaker names, prices, and product photos (downloaded into
`assets/prizes/`, downscaled from the original 4K exports). AED prices
were converted to USD at a fixed approximate rate. Each tier draws from a
*different price band* of the same catalog (scraped via
`?sort_by=price-descending` across several pages), then splits its own
band into 5 rarity tiers by price quintile — so "Legendary" always means
"the priciest fifth of this tier's pool," not a fixed dollar figure:

| Tier   | Common      | Legendary        |
| ------ | ----------- | ----------------- |
| $100   | ~$74-161    | ~$404-734          |
| $250   | ~$154-367   | ~$881-1,614        |
| $1000  | ~$550-587   | ~$3,302-11,005     |

| Rarity    | Color                          |
| --------- | ------------------------------- |
| Common    | light gray                      |
| Uncommon  | green                            |
| Rare      | blue                             |
| Epic      | purple                           |
| Legendary | gold                             |

Each item's `weight` is its rarity tier's total draw weight split evenly
across the items in that tier (commons draw far more often than
legendaries). To refresh the pool with different stock, re-scrape the
collection page and regenerate `prizeData.js` (product name, price, image
URL, then bucket by price quintile).

## Adding a new prize tier

Add an entry to `CATEGORIES` in `js/app.js` with its own `pool` (an array
of `{ name, price, rarity, weight, image }` objects — see `prizeData.js`
for the shape). A card for it appears automatically on the tier-select
screen, including its own "View Prizes" dropdown.

## 3D asset

`assets/models/nike_shoe_box/` is the "Nike Shoe Box" model by
[samplemem](https://sketchfab.com/samplemem), licensed
[CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). Textures were
downscaled from the original 4K Sketchfab export to keep the page light.
The model ships with its own baked lid-hinge rotation, which is what
`boxViewer.js` drives on click.

## Running locally

This is a static site with no build step (three.js loads from a CDN via an
import map in `index.html`, so you'll need network access). Serve the
folder with any static file server — `.devserver.py` is included and sends
`Cache-Control: no-store` (handy since browsers can otherwise cache the JS
modules and hide your changes):

```bash
python3 .devserver.py
```

Then open `http://localhost:8123`.
