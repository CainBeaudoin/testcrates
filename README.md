# Gotcha Machine

A crate/gacha-style prize picker. Pick a prize tier, watch a slot-machine
reel settle on three real 3D crates, then click one to open it. Your crate
opens first; the other two open afterward so you can see what you could
have won.

## How it works

- `js/app.js` defines the prize tiers in `CATEGORIES`. Each tier has a pool
  of possible prizes with relative weights.
- When a round starts, all three crates are assigned a prize immediately
  (via a weighted random pick) — before the player picks anything. Clicking
  a crate never changes what's inside it.
- `js/boxViewer.js` renders each crate as an interactive 3D model
  (`assets/models/nike_shoe_box/`) using three.js. Each crate spins slowly
  on its own; hovering pauses the spin. The lid-opening animation only ever
  runs from an explicit click — never automatically.
- Clicking a crate opens it first, revealing a price card. The other two
  open one at a time afterward.

## Adding a new prize tier

Add an entry to `CATEGORIES` in `js/app.js`:

```js
CATEGORIES.twoFifty = {
  label: "$250 Tier",
  description: "...",
  pool: [
    { name: "$50 Store Credit", weight: 40 },
    { name: "$250 Cash", weight: 10 },
    // ...
  ],
};
```

A card for it appears automatically on the tier-select screen. The `name`
on each pool entry is what shows on the price card when a crate opens —
swap these for real dollar amounts whenever you're ready.

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
folder with any static file server, e.g.:

```bash
python3 -m http.server 8123
```

Then open `http://localhost:8123`.
