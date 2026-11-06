// The Chosen Card Box and the demo cards inside it. A box is a prize in its own
// right: it comes out of a regular drop about 1 time in 3, stays sealed for as
// long as you like, and holds one card. Art in assets/prizes/chosen-cards
// (promo/cards generates it).

const ART = "assets/prizes/chosen-cards";

// One in three of a regular crate's boxes holds a card box instead of the
// crate's own pool. Its weight in a pool is half of everything else in it.
export const CARD_BOX_SHARE = 1 / 3;

export const CARD_BOX = {
  name: "Chosen Card Box",
  price: 150,
  rarity: "uncommon",
  image: `${ART}/card-box.webp`,
  category: "cardbox",
};

// `odds` are out of 100, per box opened; the box's price is about what a
// card from it averages.
export const CHOSEN_CARDS = [
  { name: "Oxygen Mode", price: 25, rarity: "common", odds: 40, image: `${ART}/oxygen-mode.webp`, category: "chosencards" },
  { name: "Kite Rider", price: 60, rarity: "uncommon", odds: 28, image: `${ART}/kite-rider.webp`, category: "chosencards" },
  { name: "The Scholar", price: 150, rarity: "rare", odds: 18, image: `${ART}/the-scholar.webp`, category: "chosencards" },
  { name: "Big Kid", price: 400, rarity: "epic", odds: 10, image: `${ART}/big-kid.webp`, category: "chosencards" },
  { name: "Evil Carlos", price: 1500, rarity: "legendary", odds: 4, image: `${ART}/evil-carlos.webp`, category: "chosencards" },
];

export const isCardBox = (item) => item?.category === "cardbox";
export const isChosenCard = (item) => item?.category === "chosencards";

export function cardBackFor(rarity) {
  return `${ART}/back-${rarity}.webp`;
}

export function drawCard() {
  let r = Math.random() * 100;
  for (const c of CHOSEN_CARDS) {
    r -= c.odds;
    if (r < 0) return c;
  }
  return CHOSEN_CARDS[0];
}
