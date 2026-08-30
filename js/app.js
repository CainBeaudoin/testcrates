import { createBoxViewer, getBoxSnapshot } from "./boxViewer.js";
import { PRIZE_POOL, RARITY_META } from "./prizeData.js";
import { playRevealFX } from "./reveal.js";
import * as player from "./player.js";
import { playClick, playHover, playPop, playDing, toggleMuted, isMuted, startAmbient } from "./sound.js";

// ---- Prize configuration -------------------------------------------------
// Each category has a pool of possible prizes with relative weights.
// Add more categories here later and a matching card appears automatically
// on the tier-select screen. Pools are scraped/generated — see prizeData.js.

const CATEGORIES = {
  creditCrate: {
    label: "Free Crate Meter",
    description: `Earn ${player.CREDIT_PER_OPEN} credits every time you open the $100 tier. ${player.CREDIT_THRESHOLD} credits = a free crate, on the house.`,
    pool: PRIZE_POOL,
    isCreditMeter: true,
  },
  hundred: {
    label: "$100 Tier",
    description: "3 crates, one pull each. Odds are set by the pool below.",
    pool: PRIZE_POOL,
  },
};

// Ascending — used for rank comparisons (near-misses, pity subpools, streaks).
const RARITY_RANK_ASC = ["common", "uncommon", "rare", "epic", "legendary"];
function rankOf(rarity) {
  return RARITY_RANK_ASC.indexOf(rarity);
}

// Descending — used only for sorting the "View Prizes" list, top prize first.
const DISPLAY_RARITY_ORDER = ["legendary", "epic", "rare", "uncommon", "common"];

const HAPTIC_PATTERNS = {
  common: [15],
  uncommon: [18, 18, 18],
  rare: [22, 26, 22, 26],
  epic: [28, 36, 28, 36, 28],
  legendary: [36, 46, 36, 46, 36, 60, 140],
};

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
let toastTimer = null;

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
const revealFxEl = prizeModal.querySelector(".reveal-fx");
const revealBannerEl = prizeModal.querySelector(".reveal-rarity-banner span");
const streakBadge = document.getElementById("streakBadge");
const cashBackBtn = document.getElementById("cashBackBtn");
const keepBtn = document.getElementById("keepBtn");
const muteBtn = document.getElementById("muteBtn");
const ambientBg = document.getElementById("ambientBg");
const bestPullStat = document.getElementById("bestPullStat");
const recentPulls = document.getElementById("recentPulls");
const recentPullsList = document.getElementById("recentPullsList");
const creditsMini = document.getElementById("creditsMini");
const creditToast = document.getElementById("creditToast");
const creditToastText = document.getElementById("creditToastText");

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

function vibrate(rarity) {
  try {
    if (navigator.vibrate) navigator.vibrate(HAPTIC_PATTERNS[rarity] ?? [15]);
  } catch {
    // unsupported — ignore
  }
}

// ---- Ambient background --------------------------------------------------

function buildAmbientParticles() {
  const count = 16;
  for (let i = 0; i < count; i++) {
    const dot = document.createElement("span");
    dot.className = "ambient-dot";
    dot.style.left = `${Math.random() * 100}%`;
    dot.style.setProperty("--size", `${2 + Math.random() * 4}px`);
    dot.style.setProperty("--o", `${0.08 + Math.random() * 0.18}`);
    dot.style.setProperty("--dur", `${18 + Math.random() * 22}s`);
    dot.style.setProperty("--delay", `${-Math.random() * 30}s`);
    dot.style.setProperty("--drift", `${Math.random() * 80 - 40}px`);
    ambientBg.appendChild(dot);
  }
}

// ---- Credits: earn toast + mini readout + meter card -----------------------

function showCreditToast(amount) {
  clearTimeout(toastTimer);
  creditToastText.textContent = `+${amount} Credits Earned`;
  creditToast.classList.remove("hidden");
  requestAnimationFrame(() => creditToast.classList.add("show"));
  playDing();
  toastTimer = setTimeout(() => {
    creditToast.classList.remove("show");
    setTimeout(() => creditToast.classList.add("hidden"), 300);
  }, 1800);
}

function updateCreditsMini() {
  const credits = player.getCredits();
  creditsMini.textContent = `\u{1F4B3} ${credits}/${player.CREDIT_THRESHOLD} Credits`;
  creditsMini.classList.remove("hidden");
  creditsMini.classList.add("pulse");
  setTimeout(() => creditsMini.classList.remove("pulse"), 400);
}

// Earning only happens on the paid $100 tier — the meter-redeemed crate
// doesn't also earn, so redeeming can't partially refund itself.
function awardCredits() {
  const total = player.addCredits(player.CREDIT_PER_OPEN);
  showCreditToast(player.CREDIT_PER_OPEN);
  updateCreditsMini();
  return total;
}

// ---- Player bar (best pull) ------------------------------------------------

function renderPlayerBar() {
  const best = player.getBestPull();
  if (best) {
    const meta = RARITY_META[best.rarity];
    bestPullStat.classList.remove("hidden");
    bestPullStat.innerHTML = `<img src="${best.image}" alt=""> Best Pull: <b style="color:${meta.color}">${best.name}</b>`;
  } else {
    bestPullStat.classList.add("hidden");
  }
}

// ---- Recent pulls (the player's own history — not a fabricated feed) ------

function renderRecentPulls() {
  const history = player.getHistory();
  if (history.length === 0) {
    recentPulls.classList.add("hidden");
    return;
  }
  recentPulls.classList.remove("hidden");
  recentPullsList.innerHTML = history
    .map((p) => {
      const meta = RARITY_META[p.rarity];
      return `
        <div class="recent-pull-item" style="--rarity-color:${meta.color}">
          <img src="${p.image}" alt="">
          <span>${meta.label}</span>
        </div>`;
    })
    .join("");
}

// ---- Category screen -------------------------------------------------

function buildPrizeListHTML(pool) {
  const sorted = [...pool].sort((a, b) => {
    const rarityDiff = DISPLAY_RARITY_ORDER.indexOf(a.rarity) - DISPLAY_RARITY_ORDER.indexOf(b.rarity);
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

function buildPityHTML() {
  const pity = player.getPity();
  const pct = Math.round(((player.RARE_PITY_ROUNDS - pity.rareRoundsLeft) / player.RARE_PITY_ROUNDS) * 100);
  return `
    <div class="pity-bar">
      <span class="pity-bar-label">${pity.rareRoundsLeft} rounds to guaranteed Rare+</span>
      <div class="pity-bar-track"><div class="pity-bar-fill" style="width:${pct}%"></div></div>
    </div>`;
}

function renderCreditMeterCard(cat) {
  const wrap = document.createElement("div");
  wrap.className = "category-wrap";

  const card = document.createElement("div");
  card.innerHTML = `
    <h3>${cat.label}</h3>
    <p>${cat.description}</p>
    <div class="credits-stat-track"><div id="creditsStatFill" class="credits-stat-fill"></div></div>
    <span id="creditsStatValue" class="cta"></span>
  `;
  wrap.appendChild(card);
  categoryList.appendChild(wrap);

  const fillEl = card.querySelector("#creditsStatFill");
  const valueEl = card.querySelector("#creditsStatValue");

  function refresh() {
    const credits = player.getCredits();
    const pct = Math.min(100, Math.round((credits / player.CREDIT_THRESHOLD) * 100));
    fillEl.style.width = `${pct}%`;
    const ready = player.canRedeemCredits();
    card.className = ready ? "category-card ready-glow" : "category-card daily-locked";
    valueEl.className = ready ? "cta ready" : "cta";
    valueEl.textContent = ready
      ? "Claim Free Crate!"
      : `${credits}/${player.CREDIT_THRESHOLD} Credits`;
  }

  card.addEventListener("click", () => {
    if (!player.canRedeemCredits()) return;
    playClick();
    player.redeemCredits();
    startRound("hundred", { fromCreditMeter: true });
  });
  card.addEventListener("mouseenter", () => {
    if (player.canRedeemCredits()) playHover();
  });

  refresh();
  return refresh;
}

function renderCategories() {
  categoryList.innerHTML = "";

  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    if (cat.isCreditMeter) {
      renderCreditMeterCard(cat);
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "category-wrap";

    const card = document.createElement("div");
    card.className = "category-card";
    card.innerHTML = `
      <h3>${cat.label}</h3>
      <p>${cat.description}</p>
      <span class="cta">Tap to begin</span>
      ${buildPityHTML()}
    `;
    card.addEventListener("click", () => {
      playClick();
      startRound(key);
    });
    card.addEventListener("mouseenter", playHover);

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

  renderPlayerBar();
  renderRecentPulls();
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
    slot.classList.remove("open", "you", "locked", "near-miss");
    slot.querySelector(".price-card").style.removeProperty("--rarity-color");
    slot.querySelector(".price-card-rarity").textContent = "";
    slot.querySelector(".price-card-image").src = "";
    slot.querySelector(".price-card-name").textContent = "";
    slot.querySelector(".price-card-price").textContent = "";
    slot.querySelector(".box-caption").textContent = `Crate ${Number(slot.dataset.index) + 1}`;
    const tag = slot.querySelector(".near-miss-tag");
    tag.textContent = "";
    tag.classList.add("hidden");
  });
}

async function mountViewers() {
  const canvases = slots.map((s) => s.querySelector(".box-canvas"));
  const mounted = await Promise.all(canvases.map((c) => createBoxViewer(c)));
  mounted.forEach((viewer, i) => {
    viewers[i] = viewer;
    const slot = slots[i];
    slot.addEventListener("mouseenter", () => {
      if (!roundLocked) {
        viewer.setPaused(true);
        playHover();
      }
    });
    slot.addEventListener("mouseleave", () => {
      if (!roundLocked) viewer.setPaused(false);
    });
    slot.addEventListener("click", () => onPick(i));
  });
}

async function startRound(key, opts = {}) {
  currentCategoryKey = key;
  const cat = CATEGORIES[key];

  // Every $100-tier crate opened earns credits toward the free-crate meter.
  // A meter-redeemed crate doesn't also earn (no partial self-refund).
  if (key === "hundred" && !opts.fromCreditMeter) awardCredits();

  boxPrizes = [weightedPick(cat.pool), weightedPick(cat.pool), weightedPick(cat.pool)];
  boxPrizes = player.applyPity(boxPrizes, cat.pool);
  selectedIndex = null;
  roundLocked = false;

  gameTierLabel.textContent = opts.fromCreditMeter ? "Free Crate" : cat.label;
  updateCreditsMini();
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
  playPop();

  slots.forEach((slot, i) => {
    slot.classList.add("locked");
    if (viewers[i]) viewers[i].setPaused(true);
  });

  const prize = boxPrizes[index];
  const { streak } = player.recordPick(prize);
  renderPlayerBar();

  helperText.textContent = "Opening your crate…";
  // Lid opens now, but the box's own price card stays hidden — it reveals
  // in lockstep with the modal, once the fullscreen FX finishes, so the
  // prize is never shown before the reveal animation has played out.
  openSlot(index, { isYours: true, revealCard: false });

  setTimeout(async () => {
    await showPrizeModal(prize, { streak });
    slots[index].classList.add("open");
  }, MODAL_DELAY_MS);
}

function revealOthers() {
  const others = shuffledOthers(selectedIndex, SLOT_COUNT);
  const yourRank = rankOf(boxPrizes[selectedIndex].rarity);
  helperText.classList.remove("hidden");
  helperText.textContent = "Here's what you could have won…";

  others.forEach((otherIndex, step) => {
    setTimeout(() => {
      const otherPrize = boxPrizes[otherIndex];
      const isNearMiss = rankOf(otherPrize.rarity) > yourRank;
      openSlot(otherIndex, { isYours: false });

      if (isNearMiss) {
        const slot = slots[otherIndex];
        slot.classList.add("near-miss");
        const tag = slot.querySelector(".near-miss-tag");
        tag.textContent = `So close — that was ${RARITY_META[otherPrize.rarity].label}!`;
        tag.style.color = RARITY_META[otherPrize.rarity].color;
        tag.classList.remove("hidden");
        playPop();
      }

      if (step === others.length - 1) {
        setTimeout(() => {
          helperText.classList.add("hidden");
          playAgainBtn.classList.remove("hidden");
        }, 400);
      }
    }, REVEAL_STEP_MS * step);
  });
}

function openSlot(index, { isYours, revealCard = true }) {
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
  if (revealCard) slot.classList.add("open");
  if (viewers[index]) viewers[index].open();
}

// ---- Won-prize modal -------------------------------------------------
// Only ever called for the crate the player picked — the "what you could
// have won" crates just use the plain openSlot() card, no reveal FX.

async function showPrizeModal(prize, { streak } = {}) {
  const meta = RARITY_META[prize.rarity];
  prizeModal.querySelector(".prize-modal-card").style.setProperty("--rarity-color", meta.color);
  revealFxEl.style.setProperty("--rarity-color", meta.color);

  const rarityEl = prizeModal.querySelector(".prize-modal-rarity");
  rarityEl.textContent = meta.label;
  rarityEl.style.color = meta.color;
  rarityEl.style.borderColor = meta.color;

  revealBannerEl.textContent = meta.label;

  const imgEl = prizeModal.querySelector(".prize-modal-image");
  imgEl.src = prize.image;
  imgEl.alt = prize.name;

  prizeModal.querySelector(".prize-modal-name").textContent = prize.name;
  prizeModal.querySelector(".prize-modal-price").textContent = formatPrice(prize);

  if (streak >= 2) {
    streakBadge.textContent = `\u{1F525} ${streak} Rare+ in a row!`;
    streakBadge.classList.remove("hidden");
  } else {
    streakBadge.classList.add("hidden");
  }

  // The whole card — image, name, price — stays hidden behind the
  // fullscreen vortex/particle reveal until it finishes, so the prize is
  // never shown before the reveal animation has played out.
  prizeModal.classList.add("revealing");
  prizeModal.classList.remove("hidden");
  requestAnimationFrame(() => prizeModal.classList.add("visible"));

  vibrate(prize.rarity);

  await playRevealFX(revealFxEl, prize.rarity, meta.color);

  prizeModal.classList.remove("revealing");
}

function hidePrizeModal() {
  prizeModal.classList.remove("visible", "revealing");
  setTimeout(() => {
    prizeModal.classList.add("hidden");
    revealFxEl.innerHTML = "";
  }, 300);
}

// ---- Wire up events -----------------------------------------------------

cashBackBtn.addEventListener("click", () => {
  playClick();
  hidePrizeModal();
  revealOthers();
});
keepBtn.addEventListener("click", () => {
  playClick();
  hidePrizeModal();
  revealOthers();
});

playAgainBtn.addEventListener("click", () => {
  playClick();
  startRound(currentCategoryKey);
});
backBtn.addEventListener("click", () => {
  playClick();
  disposeViewers();
  showScreen(screenCategory);
  renderCategories(); // refresh pity/credits/best-pull/recent-pulls
});

function refreshMuteBtn() {
  muteBtn.classList.toggle("muted", isMuted());
}
muteBtn.addEventListener("click", () => {
  toggleMuted();
  refreshMuteBtn();
});
refreshMuteBtn();

// Autoplay policies require a user gesture before any audio can start.
function onFirstGesture() {
  startAmbient();
  document.removeEventListener("pointerdown", onFirstGesture);
}
document.addEventListener("pointerdown", onFirstGesture);

buildAmbientParticles();
renderCategories();
