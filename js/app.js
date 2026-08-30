// ---- Prize configuration -------------------------------------------------
// Each category has a pool of possible prizes with relative weights.
// Add more categories here later (e.g. "twoFifty", "fiveHundred") and a
// matching card will appear automatically on the tier-select screen.

const CATEGORIES = {
  hundred: {
    label: "$100 Tier",
    emoji: "\u{1F4AF}",
    description: "3 crates, one pull each. Odds are set by the pool below.",
    pool: [
      { name: "$25 Store Credit", weight: 40 },
      { name: "$50 Store Credit", weight: 25 },
      { name: "$100 Cash", weight: 15 },
      { name: "$150 Bonus Prize", weight: 10 },
      { name: "Mystery Bonus Box", weight: 7 },
      { name: "$500 Jackpot", weight: 3 },
    ],
  },
};

// ---- State -----------------------------------------------------------

let currentCategoryKey = null;
let boxPrizes = [];      // predetermined prize for each of the 3 boxes, set at spin time
let selectedIndex = null;
let roundLocked = false; // true once "Open" has been clicked

// ---- DOM refs ----------------------------------------------------------

const screenCategory = document.getElementById("screen-category");
const screenGame = document.getElementById("screen-game");
const categoryList = document.getElementById("categoryList");
const gameTierLabel = document.getElementById("gameTierLabel");
const backBtn = document.getElementById("backBtn");
const spinner = document.getElementById("spinner");
const boxRow = document.getElementById("boxRow");
const boxes = Array.from(document.querySelectorAll(".box"));
const helperText = document.getElementById("helperText");
const openBtn = document.getElementById("openBtn");
const playAgainBtn = document.getElementById("playAgainBtn");

// ---- Helpers -------------------------------------------------------------

function weightedPick(pool) {
  const total = pool.reduce((sum, p) => sum + p.weight, 0);
  let roll = Math.random() * total;
  for (const prize of pool) {
    if (roll < prize.weight) return prize;
    roll -= prize.weight;
  }
  return pool[pool.length - 1];
}

function shuffledIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
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

// ---- Category screen -----------------------------------------------------

function renderCategories() {
  categoryList.innerHTML = "";
  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    const card = document.createElement("div");
    card.className = "category-card";
    card.innerHTML = `
      <div class="cat-emoji">${cat.emoji}</div>
      <h3>${cat.label}</h3>
      <p>${cat.description}</p>
    `;
    card.addEventListener("click", () => startRound(key));
    categoryList.appendChild(card);
  });
}

// ---- Game screen -----------------------------------------------------

function resetBoxesUI() {
  boxes.forEach((box) => {
    box.classList.remove("open", "selected", "locked", "you");
    box.querySelector(".prize-label").textContent = "";
    box.querySelector(".box-caption").textContent = `Crate ${Number(box.dataset.index) + 1}`;
  });
}

function startRound(key) {
  currentCategoryKey = key;
  const cat = CATEGORIES[key];

  // Predetermine each box's prize now, before the player picks anything.
  boxPrizes = [weightedPick(cat.pool), weightedPick(cat.pool), weightedPick(cat.pool)];
  selectedIndex = null;
  roundLocked = false;

  gameTierLabel.textContent = `${cat.emoji} ${cat.label}`;
  resetBoxesUI();

  openBtn.classList.add("hidden");
  playAgainBtn.classList.add("hidden");
  helperText.classList.add("hidden");
  boxRow.classList.add("hidden");
  spinner.classList.remove("hidden");

  showScreen(screenGame);

  // Spin for a bit, then reveal the three crates.
  setTimeout(() => {
    spinner.classList.add("hidden");
    boxRow.classList.remove("hidden");
    helperText.classList.remove("hidden");
    boxes.forEach((box) => box.classList.remove("locked"));
  }, 1800);
}

function onBoxClick(box) {
  if (roundLocked) return;
  const index = Number(box.dataset.index);
  selectedIndex = index;

  boxes.forEach((b) => b.classList.remove("selected"));
  box.classList.add("selected");

  helperText.textContent = "Crate picked — hit Open when you're ready";
  openBtn.classList.remove("hidden");
}

function openBox(index, opts = {}) {
  const box = boxes[index];
  const prize = boxPrizes[index];
  box.querySelector(".prize-label").textContent = prize.name;
  box.classList.add("open");
  if (opts.isYours) {
    box.classList.add("you");
    box.querySelector(".box-caption").textContent = "Your Crate";
  } else {
    box.querySelector(".box-caption").textContent = "Unpicked";
  }
}

function onOpenClick() {
  if (selectedIndex === null || roundLocked) return;
  roundLocked = true;
  openBtn.classList.add("hidden");
  boxes.forEach((b) => b.classList.add("locked"));
  helperText.textContent = "Opening your crate…";

  // Your crate opens first.
  openBox(selectedIndex, { isYours: true });

  const others = shuffledIndices(3).filter((i) => i !== selectedIndex);

  setTimeout(() => {
    helperText.textContent = "Here's what you could have won…";
    openBox(others[0]);
  }, 1100);

  setTimeout(() => {
    openBox(others[1]);
    helperText.classList.add("hidden");
    playAgainBtn.classList.remove("hidden");
  }, 2100);
}

// ---- Wire up events -----------------------------------------------------

boxes.forEach((box) => box.addEventListener("click", () => onBoxClick(box)));
openBtn.addEventListener("click", onOpenClick);
playAgainBtn.addEventListener("click", () => startRound(currentCategoryKey));
backBtn.addEventListener("click", () => showScreen(screenCategory));

renderCategories();
