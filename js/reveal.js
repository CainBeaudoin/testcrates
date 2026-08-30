// Rarity-tiered reveal: a short vortex/particle animation plus a synthesized
// "hype" sound, played only for the player's own crate before its prize
// content is shown. Everything here is procedural (Canvas-free CSS +
// WebAudio) so there are no external asset/licensing concerns.

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

export function fxDuration(rarity) {
  return FX_DURATION_MS[rarity] ?? 1000;
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

    const flash = document.createElement("div");
    flash.className = "reveal-flash";
    container.appendChild(flash);

    const ring = document.createElement("div");
    ring.className = "reveal-ring";
    container.appendChild(ring);
  }

  buildParticles(container, FX_PARTICLES[rarity] ?? 14, layers > 1);

  playRaritySound(rarity);

  return new Promise((resolve) => setTimeout(resolve, duration));
}

// ---- Synthesized "hype" sound per rarity --------------------------------

let audioCtx = null;
function getCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function tone(ctx, { freq, start, duration, type = "sine", gain = 0.2, freqEnd }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), start + duration);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function noiseBurst(ctx, { start, duration, gain = 0.15, filterFreq = 1500 }) {
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, start);
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(start);
}

export function playRaritySound(rarity) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime + 0.02;

  switch (rarity) {
    case "common":
      tone(ctx, { freq: 520, start: now, duration: 0.22, type: "sine", gain: 0.16 });
      break;

    case "uncommon":
      tone(ctx, { freq: 440, start: now, duration: 0.16, type: "triangle", gain: 0.14 });
      tone(ctx, { freq: 660, start: now + 0.11, duration: 0.3, type: "triangle", gain: 0.16 });
      break;

    case "rare":
      noiseBurst(ctx, { start: now, duration: 0.35, gain: 0.09, filterFreq: 1200 });
      tone(ctx, { freq: 392, start: now + 0.05, duration: 0.2, type: "sawtooth", gain: 0.1 });
      tone(ctx, { freq: 523, start: now + 0.22, duration: 0.22, type: "sawtooth", gain: 0.12 });
      tone(ctx, { freq: 784, start: now + 0.45, duration: 0.45, type: "sine", gain: 0.16 });
      break;

    case "epic":
      tone(ctx, { freq: 90, start: now, duration: 1.4, type: "sine", gain: 0.22, freqEnd: 55 });
      noiseBurst(ctx, { start: now, duration: 0.55, gain: 0.11, filterFreq: 900 });
      [349, 415, 523, 698].forEach((f, i) =>
        tone(ctx, { freq: f, start: now + 0.3 + i * 0.17, duration: 0.32, type: "triangle", gain: 0.14 })
      );
      tone(ctx, { freq: 1047, start: now + 1.1, duration: 0.6, type: "sine", gain: 0.14 });
      break;

    case "legendary":
      tone(ctx, { freq: 65, start: now, duration: 2.4, type: "sine", gain: 0.26, freqEnd: 38 });
      noiseBurst(ctx, { start: now, duration: 0.8, gain: 0.13, filterFreq: 1500 });
      [261, 329, 392, 523, 659, 784].forEach((f, i) =>
        tone(ctx, { freq: f, start: now + 0.35 + i * 0.15, duration: 0.5, type: "triangle", gain: 0.14 })
      );
      tone(ctx, { freq: 1047, start: now + 1.5, duration: 0.9, type: "sine", gain: 0.18 });
      tone(ctx, { freq: 1568, start: now + 1.75, duration: 0.7, type: "sine", gain: 0.12 });
      break;

    default:
      break;
  }
}
