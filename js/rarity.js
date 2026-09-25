// The five rarity bands, shared by every pool and by everything that draws
// one. Lived in prizeData.js until the pools were split by product category
// (sneakers / streetwear / collectibles) and there was no longer one pool
// file that the others could reasonably import it from.

export const RARITY_META = {
  "common": {
    "label": "Common",
    "color": "#B9B9BE"
  },
  "uncommon": {
    "label": "Uncommon",
    "color": "#4ADE80"
  },
  "rare": {
    "label": "Rare",
    "color": "#4FA3F7"
  },
  "epic": {
    "label": "Epic",
    "color": "#B678F2"
  },
  "legendary": {
    "label": "Legendary",
    "color": "#F2B84B"
  }
};
