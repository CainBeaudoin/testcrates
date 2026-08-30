# Gotcha Machine

A simple crate/gacha-style prize picker. Pick a prize tier, watch the machine
spin, then choose one of three crates. Your crate opens first; the other two
open afterward so you can see what you could have won.

## How it works

- `js/app.js` defines the prize tiers in `CATEGORIES`. Each tier has a pool of
  possible prizes with relative weights.
- When a round starts, all three crates are assigned a prize immediately
  (via a weighted random pick) — before the player chooses anything. Picking
  a crate never changes what's inside it.
- Clicking **Open** reveals your crate first, then the other two crates open
  one at a time.

## Adding a new prize tier

Add an entry to `CATEGORIES` in `js/app.js`:

```js
CATEGORIES.twoFifty = {
  label: "$250 Tier",
  emoji: "\u{1F48E}",
  description: "...",
  pool: [
    { name: "$50 Store Credit", weight: 40 },
    { name: "$250 Cash", weight: 10 },
    // ...
  ],
};
```

A card for it will appear automatically on the tier-select screen.

## Running locally

This is a static site with no build step. Serve the folder with any static
file server, e.g.:

```bash
python3 -m http.server 8123
```

Then open `http://localhost:8123`.
