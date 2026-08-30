# Gotcha Machine

A crate/gacha-style prize picker. Pick a prize tier, watch a slot-machine
reel settle on three real 3D crates, then click one to open it. Your crate
opens first — its prize is revealed on a hero card with **Cash Back** /
**Keep** buttons — then the other two crates open afterward so you can see
what you could have won.

## How it works

- `js/app.js` defines the prize tiers in `CATEGORIES`. Each tier draws from
  a weighted pool of prizes (see `js/prizeData.js`).
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

- **Pity**: if 8 rounds pass with no Rare+ anywhere among the 3 crates (or
  20 rounds with no Epic+), the next round force-upgrades one crate into
  that subpool. Progress shows as a bar on the $100 tier card.
- **Credits meter**: opening the $100 tier earns 5 credits (a toast +
  "ding" confirms it, and a live readout on the game screen ticks up).
  100 credits redeems a free crate on the "Free Crate Meter" card — that
  redemption doesn't also earn credits, so it can't partially refund
  itself.
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

`js/prizeData.js` is generated from a scrape of
[odto.com/collections/footwear](https://odto.com/collections/footwear) —
real sneaker names, prices, and product photos (downloaded into
`assets/prizes/`, downscaled from the original 4K exports). AED prices were
converted to USD at a fixed approximate rate, then split into 5 rarity
tiers by price quintile:

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
