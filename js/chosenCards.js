// The Chosen Card Box and the demo cards inside it. A box is a prize in its own
// right: it comes out of a regular drop about 1 time in 3, stays sealed for as
// long as you like, and holds one card. Art in assets/prizes/chosen-cards
// (promo/cards generates it).

const ART = "assets/prizes/chosen-cards";

// One in three of a regular crate's boxes holds a card box instead of the
// crate's own pool. High on purpose, for the demo.
export const CARD_BOX_SHARE = 1 / 3;

export const CARD_BOX = {
  name: "Chosen Card Box",
  price: 150,
  rarity: "uncommon",
  image: `${ART}/card-box.webp`,
  category: "cardbox",
};

// `odds` are out of 100, per box opened. Nearly even for the demo, so every
// card turns up, with the rarer ones still a little less likely.
export const CHOSEN_CARDS = [
  { name: "Oxygen Mode", price: 25, rarity: "common", odds: 28, image: `${ART}/oxygen-mode.webp`, category: "chosencards" },
  { name: "Kite Rider", price: 60, rarity: "uncommon", odds: 24, image: `${ART}/kite-rider.webp`, category: "chosencards" },
  { name: "The Scholar", price: 150, rarity: "rare", odds: 20, image: `${ART}/the-scholar.webp`, category: "chosencards" },
  { name: "Big Kid", price: 400, rarity: "epic", odds: 16, image: `${ART}/big-kid.webp`, category: "chosencards" },
  { name: "Evil Carlos", price: 1500, rarity: "legendary", odds: 12, image: `${ART}/evil-carlos.webp`, category: "chosencards" },
];

export const isCardBox = (item) => item?.category === "cardbox";
export const isChosenCard = (item) => item?.category === "chosencards";

export function cardBackFor(rarity) {
  return `${ART}/back-${rarity}.webp`;
}

function drawAtOdds(cards) {
  let r = Math.random() * cards.reduce((sum, c) => sum + c.odds, 0);
  for (const c of cards) {
    r -= c.odds;
    if (r < 0) return c;
  }
  return cards[0];
}

// Never the same card twice in a row, so a run of boxes shows the set.
let lastDrawn = null;
export function drawCard() {
  lastDrawn = drawAtOdds(CHOSEN_CARDS.filter((c) => c !== lastDrawn));
  return lastDrawn;
}
