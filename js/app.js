import { createBoxViewer, getBoxSnapshot } from "./boxViewer.js";
import { PRIZE_POOL, RARITY_META } from "./prizeData.js";
import { playRevealFX } from "./reveal.js";

// ---- Prize configuration -------------------------------------------------
// Each category has a pool of possible prizes with relative weights.
// Add more categories here later and a matching card appears automatically
// on the tier-select screen. The $100 tier's pool is scraped/generated —
// see js/prizeData.js.

const CATEGORIES = {
  hundred: {
    label: "$100 Tier",
    description: "3 crates, one pull each. Odds are set by the pool below.",
    pool: PRIZE_POOL,
  },
};

const RARITY_ORDER = ["legendary", "epic", "rare", "uncommon", "common"];

// ---- Reel configuration ---------------------------------------------------

const SLOT_COUNT = 3;
const TOTAL_CELLS = 18;
const REEL_DURATION_MS = 2400;
const REVEAL_STEP_MS = 950;
const MODAL_DELAY_MS = 650;

// Preload the snapshot as soon as the module loads so it's ready by the
// time the player picks a tier.
const boxSnapshotPromise = getBoxSnapshot();

// ---- State -----------------------------------------------------------

let currentCategoryKey = null;
let boxPrizes = [];
let selectedIndex = null;
let roundLocked = false;
let viewers = [null, null, null];
let reelCellWidth = 0;

// ---- DOM refs -----------------------------------------------------------

const screenCategory = document.getElementById("screen-category");
const screenGame = document.getElementById("screen-game");
const categoryList = document.getElementById("categoryList");
const gameTierLabel = document.getElementById("gameTierLabel");
const backBtn = document.getElementById("backBtn");
const reel = document.getElementById("reel");
const reelTrack = document.getElementById("reelTrack");
const boxRow = document.getElementById("boxRow");
const slots = Array.from(document.querySelectorAll(".box-slot"));
const helperText = document.getElementById("helperText");
const playAgainBtn = document.getElementById("playAgainBtn");
const prizeModal = document.getElementById("prizeModal");
const prizeModalCard = prizeModal.querySelector(".prize-modal-card");
const revealFxEl = prizeModal.querySelector(".reveal-fx");
const cashBackBtn = document.getElementById("cashBackBtn");
const keepBtn = document.getElementById("keepBtn");

// ---- Helpers --------------------------------------------------------------

function weightedPick(pool) {
  const total = pool.reduce((sum, p) => sum + p.weight, 0);
  let roll = Math.random() * total;
  for (const prize of pool) {
    if (roll < prize.weight) return prize;
    roll -= prize.weight;
  }
  return pool[pool.length - 1];
}

function shuffledOthers(excludeIndex, n) {
  const arr = Array.from({ length: n }, (_, i) => i).filter((i) => i !== excludeIndex);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function showScreen(el) {
  [screenCategory, screenGame].forEach((s) => s.classList.remove("active"));
  el.classList.add("active");
}

function disposeViewers() {
  viewers.forEach((v) => v && v.dispose());
  viewers = [null, null, null];
}

function formatPrice(prize) {
  return `$${prize.price.toLocaleString()}`;
}

// ---- Category screen -------------------------------------------------

function buildPrizeListHTML(pool) {
  const sorted = [...pool].sort((a, b) => {
    const rarityDiff = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
    return rarityDiff !== 0 ? rarityDiff : b.price - a.price;
  });
  return sorted
    .map((p) => {
      const meta = RARITY_META[p.rarity];
      return `
        <div class="prize-row">
          <img src="${p.image}" alt="" loading="lazy">
          <div class="prize-row-info">
            <span class="prize-row-name">${p.name}</span>
            <span class="prize-row-rarity" style="color:${meta.color}">${meta.label}</span>
          </div>
          <span class="prize-row-price">$${p.price.toLocaleString()}</span>
        </div>`;
    })
    .join("");
}

function renderCategories() {
  categoryList.innerHTML = "";
  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    const wrap = document.createElement("div");
    wrap.className = "category-wrap";

    const card = document.createElement("div");
    card.className = "category-card";
    card.innerHTML = `
      <h3>${cat.label}</h3>
      <p>${cat.description}</p>
      <span class="cta">Tap to begin</span>
    `;
    card.addEventListener("click", () => startRound(key));

    const details = document.createElement("details");
    details.className = "prize-dropdown";
    details.innerHTML = `
      <summary>View Prizes</summary>
      <div class="prize-list">${buildPrizeListHTML(cat.pool)}</div>
    `;

    wrap.appendChild(card);
    wrap.appendChild(details);
    categoryList.appendChild(wrap);
  });
}

// ---- Reel ------------------------------------------------------------

function buildReel(snapshotUrl) {
  // Match the cell width to the reel's actual rendered width so the landing
  // cells line up exactly with the 3 slot dividers, at any viewport size.
  reelCellWidth = reel.clientWidth / SLOT_COUNT;

  reelTrack.innerHTML = "";
  reelTrack.style.transition = "none";
  reelTrack.style.transform = "translateX(0)";
  reelTrack.classList.remove("spinning");
  for (let i = 0; i < TOTAL_CELLS; i++) {
    const cell = document.createElement("div");
    cell.className = "reel-cell";
    cell.style.width = `${reelCellWidth}px`;
    const img = document.createElement("img");
    img.src = snapshotUrl;
    img.alt = "";
    cell.appendChild(img);
    reelTrack.appendChild(cell);
  }
  // force reflow so the reset above is committed before we animate
  void reelTrack.offsetWidth;
}

function spinReel() {
  return new Promise((resolve) => {
    const finalX = -(reelCellWidth * (TOTAL_CELLS - SLOT_COUNT));
    reelTrack.classList.add("spinning");
    reelTrack.style.transition = `transform ${REEL_DURATION_MS}ms cubic-bezier(0.13, 0.86, 0.15, 1)`;
    reelTrack.style.transform = `translateX(${finalX}px)`;
    setTimeout(resolve, REEL_DURATION_MS + 80);
  });
}

// ---- Game screen -------------------------------------------------

function resetSlotsUI() {
  slots.forEach((slot) => {
    slot.classList.remove("open", "you", "locked");
    slot.querySelector(".price-card").style.removeProperty("--rarity-color");
    slot.querySelector(".price-card-rarity").textContent = "";
    slot.querySelector(".price-card-image").src = "";
    slot.querySelector(".price-card-name").textContent = "";
    slot.querySelector(".price-card-price").textContent = "";
    slot.querySelector(".box-caption").textContent = `Crate ${Number(slot.dataset.index) + 1}`;
  });
}

async function mountViewers() {
  const canvases = slots.map((s) => s.querySelector(".box-canvas"));
  const mounted = await Promise.all(canvases.map((c) => createBoxViewer(c)));
  mounted.forEach((viewer, i) => {
    viewers[i] = viewer;
    const slot = slots[i];
    slot.addEventListener("mouseenter", () => {
      if (!roundLocked) viewer.setPaused(true);
    });
    slot.addEventListener("mouseleave", () => {
      if (!roundLocked) viewer.setPaused(false);
    });
    slot.addEventListener("click", () => onPick(i));
  });
}

async function startRound(key) {
  currentCategoryKey = key;
  const cat = CATEGORIES[key];

  // Predetermine each box's prize now, before the player picks anything.
  boxPrizes = [weightedPick(cat.pool), weightedPick(cat.pool), weightedPick(cat.pool)];
  selectedIndex = null;
  roundLocked = false;

  gameTierLabel.textContent = cat.label;
  resetSlotsUI();
  disposeViewers();

  boxRow.classList.add("hidden");
  helperText.classList.add("hidden");
  playAgainBtn.classList.add("hidden");
  reel.classList.remove("hidden");

  showScreen(screenGame);

  const snapshotUrl = await boxSnapshotPromise;
  buildReel(snapshotUrl);
  await spinReel();

  reel.classList.add("hidden");
  boxRow.classList.remove("hidden");
  helperText.classList.remove("hidden");
  helperText.textContent = "Tap a crate to open it";

  await mountViewers();
}

function onPick(index) {
  if (roundLocked) return;
  roundLocked = true;
  selectedIndex = index;

  slots.forEach((slot, i) => {
    slot.classList.add("locked");
    if (viewers[i]) viewers[i].setPaused(true);
  });

  helperText.textContent = "Opening your crate…";
  openSlot(index, { isYours: true });

  setTimeout(() => showPrizeModal(boxPrizes[index]), MODAL_DELAY_MS);
}

function revealOthers() {
  const others = shuffledOthers(selectedIndex, SLOT_COUNT);
  helperText.classList.remove("hidden");
  helperText.textContent = "Here's what you could have won…";

  others.forEach((otherIndex, step) => {
    setTimeout(() => {
      openSlot(otherIndex, { isYours: false });
      if (step === others.length - 1) {
        setTimeout(() => {
          helperText.classList.add("hidden");
          playAgainBtn.classList.remove("hidden");
        }, 400);
      }
    }, REVEAL_STEP_MS * step);
  });
}

function openSlot(index, { isYours }) {
  const slot = slots[index];
  const prize = boxPrizes[index];
  const meta = RARITY_META[prize.rarity];

  slot.querySelector(".price-card").style.setProperty("--rarity-color", meta.color);
  const rarityEl = slot.querySelector(".price-card-rarity");
  rarityEl.textContent = meta.label;
  rarityEl.style.color = meta.color;

  const imgEl = slot.querySelector(".price-card-image");
  imgEl.src = prize.image;
  imgEl.alt = prize.name;

  slot.querySelector(".price-card-name").textContent = prize.name;
  slot.querySelector(".price-card-price").textContent = formatPrice(prize);
  slot.querySelector(".box-caption").textContent = isYours ? "Your Crate" : "Unpicked";
  slot.classList.toggle("you", isYours);
  slot.classList.add("open");
  if (viewers[index]) viewers[index].open();
}

// ---- Won-prize modal -------------------------------------------------
// Only ever called for the crate the player picked — the "what you could
// have won" crates just use the plain openSlot() card, no reveal FX.

async function showPrizeModal(prize) {
  const meta = RARITY_META[prize.rarity];
  prizeModalCard.style.setProperty("--rarity-color", meta.color);

  const rarityEl = prizeModal.querySelector(".prize-modal-rarity");
  rarityEl.textContent = meta.label;
  rarityEl.style.color = meta.color;
  rarityEl.style.borderColor = meta.color;

  const imgEl = prizeModal.querySelector(".prize-modal-image");
  imgEl.src = prize.image;
  imgEl.alt = prize.name;

  prizeModal.querySelector(".prize-modal-name").textContent = prize.name;
  prizeModal.querySelector(".prize-modal-price").textContent = formatPrice(prize);

  // Content stays hidden behind the vortex/particle reveal until it finishes.
  prizeModalCard.classList.add("revealing");
  prizeModal.classList.remove("hidden");
  requestAnimationFrame(() => prizeModal.classList.add("visible"));

  await playRevealFX(revealFxEl, prize.rarity, meta.color);

  prizeModalCard.classList.remove("revealing");
}

function hidePrizeModal() {
  prizeModal.classList.remove("visible");
  setTimeout(() => prizeModal.classList.add("hidden"), 300);
}

// ---- Wire up events -----------------------------------------------------

cashBackBtn.addEventListener("click", () => {
  hidePrizeModal();
  revealOthers();
});
keepBtn.addEventListener("click", () => {
  hidePrizeModal();
  revealOthers();
});

playAgainBtn.addEventListener("click", () => startRound(currentCategoryKey));
backBtn.addEventListener("click", () => {
  disposeViewers();
  showScreen(screenCategory);
});

renderCategories();
