// Rarity-tiered reveal: a short vortex/particle animation plus a synthesized
// "hype" sound, played only for the player's own crate before its prize
// content is shown. Everything here is procedural (CSS + WebAudio, see
// sound.js) so there are no external asset/licensing concerns.

import { playRaritySound } from "./sound.js";

const FX_DURATION_MS = {
  common: 900,
  uncommon: 1300,
  rare: 1800,
  epic: 2400,
  legendary: 3000,
};

const FX_PARTICLES = {
  common: 12,
  uncommon: 18,
  rare: 26,
  epic: 38,
  legendary: 56,
};

const FX_LAYERS = {
  common: 1,
  uncommon: 1,
  rare: 2,
  epic: 2,
  legendary: 3,
};

// Climax flash/shockwave intensity — every rarity gets one (so there's a
// consistent "beat" at the end of every reveal), just scaled way down for
// commons and way up for legendaries.
const FX_CLIMAX = {
  common: 0.16,
  uncommon: 0.26,
  rare: 0.38,
  epic: 0.5,
  legendary: 0.65,
};

const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];

export function fxDuration(rarity) {
  return FX_DURATION_MS[rarity] ?? 1000;
}

export function rarityRank(rarity) {
  return RARITY_ORDER.indexOf(rarity);
}

function buildParticles(container, count, big) {
  // Scale travel distance off the viewport so the swirl reads as a
  // fullscreen, immersive effect rather than something boxed into a card.
  const vmin = Math.min(window.innerWidth, window.innerHeight);
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = "reveal-particle";
    const angle = (360 / count) * i + (Math.random() * 14 - 7);
    const dist = vmin * (0.16 + Math.random() * 0.16);
    const delay = Math.random() * 0.25;
    const size = big ? 3 + Math.random() * 5 : 2 + Math.random() * 3;
    p.style.setProperty("--angle", `${angle}deg`);
    p.style.setProperty("--dist", `${dist}px`);
    p.style.setProperty("--delay", `${delay}s`);
    p.style.width = `${size}px`;
    p.style.height = `${size}px`;
    container.appendChild(p);
  }
}

/**
 * Plays the reveal animation inside `container` (cleared first) and returns
 * a Promise that resolves once it's done, so the caller can reveal the
 * actual prize content right after.
 */
export function playRevealFX(container, rarity, color) {
  container.innerHTML = "";
  container.style.setProperty("--rarity-color", color);
  const duration = fxDuration(rarity);
  container.style.setProperty("--fx-duration", `${duration}ms`);
  container.style.setProperty("--climax", FX_CLIMAX[rarity] ?? 0.2);

  const layers = FX_LAYERS[rarity] ?? 1;
  for (let i = 0; i < layers; i++) {
    const vortex = document.createElement("div");
    vortex.className = "reveal-vortex";
    vortex.style.animationDelay = `${i * 90}ms`;
    vortex.style.animationDirection = i % 2 === 0 ? "normal" : "reverse";
    container.appendChild(vortex);
  }

  if (rarity === "epic" || rarity === "legendary") {
    const rays = document.createElement("div");
    rays.className = "reveal-rays";
    container.appendChild(rays);
  }

  // Every rarity gets a climax flash + shockwave ring at the end of its
  // reveal — just scaled by --climax so commons barely flicker and
  // legendaries hit hard.
  const flash = document.createElement("div");
  flash.className = "reveal-flash";
  container.appendChild(flash);

  const ring = document.createElement("div");
  ring.className = "reveal-ring";
  container.appendChild(ring);

  buildParticles(container, FX_PARTICLES[rarity] ?? 14, layers > 1);

  playRaritySound(rarity);

  return new Promise((resolve) => setTimeout(resolve, duration));
}
