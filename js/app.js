import { createBoxViewer } from "./boxViewer.js";

// ---- Prize configuration -------------------------------------------------
// Each category has a pool of possible prizes with relative weights.
// Add more categories here later and a matching card appears automatically
// on the tier-select screen.

const CATEGORIES = {
  hundred: {
    label: "$100 Tier",
    description: "3 crates, one pull each. Odds are set by the pool below.",
    pool: [
      { name: "$25 Store Credit", weight: 40 },
      { name: "$50 Store Credit", weight: 25 },
      { name: "$100 Cash", weight: 15 },
      { name: "$150 Bonus Prize", weight: 10 },
      { name: "Mystery Bonus", weight: 7 },
      { name: "$500 Jackpot", weight: 3 },
    ],
  },
};

// ---- Reel configuration ---------------------------------------------------

const CELL_WIDTH = 200;
const SLOT_COUNT = 3;
const TOTAL_CELLS = 18;
const REEL_DURATION_MS = 2400;
const REVEAL_STEP_MS = 950;

const BOX_ICON_SVG = `
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <path d="M6 20 L32 8 L58 20 L32 32 Z" />
  <path d="M6 20 V44 L32 56 V32 Z" />
  <path d="M58 20 V44 L32 56" />
</svg>`;

// ---- State -----------------------------------------------------------

let currentCategoryKey = null;
let boxPrizes = [];
let selectedIndex = null;
let roundLocked = false;
let viewers = [null, null, null];

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

// ---- Category screen -------------------------------------------------

function renderCategories() {
  categoryList.innerHTML = "";
  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    const card = document.createElement("div");
    card.className = "category-card";
    card.innerHTML = `
      <h3>${cat.label}</h3>
      <p>${cat.description}</p>
      <span class="cta">Tap to begin</span>
    `;
    card.addEventListener("click", () => startRound(key));
    categoryList.appendChild(card);
  });
}

// ---- Reel ------------------------------------------------------------

function buildReel() {
  reelTrack.innerHTML = "";
  reelTrack.style.transition = "none";
  reelTrack.style.transform = "translateX(0)";
  reelTrack.classList.remove("spinning");
  for (let i = 0; i < TOTAL_CELLS; i++) {
    const cell = document.createElement("div");
    cell.className = "reel-cell";
    cell.innerHTML = BOX_ICON_SVG;
    reelTrack.appendChild(cell);
  }
  // force reflow so the reset above is committed before we animate
  void reelTrack.offsetWidth;
}

function spinReel() {
  return new Promise((resolve) => {
    const finalX = -(CELL_WIDTH * (TOTAL_CELLS - SLOT_COUNT));
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
    slot.querySelector(".price-card-value").textContent = "";
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

  buildReel();
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

  const others = shuffledOthers(index, SLOT_COUNT);
  others.forEach((otherIndex, step) => {
    setTimeout(() => {
      openSlot(otherIndex, { isYours: false });
      if (step === others.length - 1) {
        helperText.classList.add("hidden");
        playAgainBtn.classList.remove("hidden");
      } else {
        helperText.textContent = "Here's what you could have won…";
      }
    }, REVEAL_STEP_MS * (step + 1));
  });
}

function openSlot(index, { isYours }) {
  const slot = slots[index];
  const prize = boxPrizes[index];
  slot.querySelector(".price-card-value").textContent = prize.name;
  slot.querySelector(".box-caption").textContent = isYours ? "Your Crate" : "Unpicked";
  slot.classList.toggle("you", isYours);
  slot.classList.add("open");
  if (viewers[index]) viewers[index].open();
}

// ---- Wire up events -----------------------------------------------------

playAgainBtn.addEventListener("click", () => startRound(currentCategoryKey));
backBtn.addEventListener("click", () => {
  disposeViewers();
  showScreen(screenCategory);
});

renderCategories();
