// Central audio module: low-level synth helpers, the
// per-rarity "hype" sound, and small UI micro-sounds. Everything here is
// procedurally synthesized (oscillators + filtered noise) — no external
// audio files, so there's nothing to license.

// There's no sound switch any more (the live pulls chime, the only sound
// people wanted off, is gone), so a "muted" saved by an earlier build is
// cleared rather than left silencing everything with no way back.
try {
  localStorage.removeItem("gotcha_muted_v1");
} catch {
  // storage unavailable — nothing saved to clear
}

let audioCtx = null;
let masterGain = null;

function getCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
    masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);
  }
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
  osc.connect(g).connect(masterGain);
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
  src.connect(filter).connect(g).connect(masterGain);
  src.start(start);
}

export function playRaritySound(rarity) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime + 0.02;

  switch (rarity) {
    case "common":
      tone(ctx, { freq: 520, start: now, duration: 0.22, type: "sine", gain: 0.16 });
      tone(ctx, { freq: 720, start: now + 0.6, duration: 0.15, type: "sine", gain: 0.1 });
      break;

    case "uncommon":
      tone(ctx, { freq: 440, start: now, duration: 0.16, type: "triangle", gain: 0.14 });
      tone(ctx, { freq: 660, start: now + 0.11, duration: 0.3, type: "triangle", gain: 0.16 });
      tone(ctx, { freq: 880, start: now + 0.9, duration: 0.2, type: "sine", gain: 0.1 });
      break;

    case "rare":
      noiseBurst(ctx, { start: now, duration: 0.35, gain: 0.09, filterFreq: 1200 });
      tone(ctx, { freq: 392, start: now + 0.05, duration: 0.2, type: "sawtooth", gain: 0.1 });
      tone(ctx, { freq: 523, start: now + 0.22, duration: 0.22, type: "sawtooth", gain: 0.12 });
      tone(ctx, { freq: 784, start: now + 0.45, duration: 0.45, type: "sine", gain: 0.16 });
      tone(ctx, { freq: 988, start: now + 1.2, duration: 0.3, type: "sine", gain: 0.12 });
      break;

    case "epic":
      tone(ctx, { freq: 90, start: now, duration: 1.4, type: "sine", gain: 0.22, freqEnd: 55 });
      noiseBurst(ctx, { start: now, duration: 0.55, gain: 0.11, filterFreq: 900 });
      [349, 415, 523, 698].forEach((f, i) =>
        tone(ctx, { freq: f, start: now + 0.3 + i * 0.17, duration: 0.32, type: "triangle", gain: 0.14 })
      );
      tone(ctx, { freq: 1047, start: now + 1.1, duration: 0.6, type: "sine", gain: 0.14 });
      tone(ctx, { freq: 1319, start: now + 1.9, duration: 0.4, type: "sine", gain: 0.12 });
      break;

    case "legendary":
      tone(ctx, { freq: 65, start: now, duration: 2.4, type: "sine", gain: 0.26, freqEnd: 38 });
      noiseBurst(ctx, { start: now, duration: 0.8, gain: 0.13, filterFreq: 1500 });
      [261, 329, 392, 523, 659, 784].forEach((f, i) =>
        tone(ctx, { freq: f, start: now + 0.35 + i * 0.15, duration: 0.5, type: "triangle", gain: 0.14 })
      );
      tone(ctx, { freq: 1047, start: now + 1.5, duration: 0.9, type: "sine", gain: 0.18 });
      tone(ctx, { freq: 1568, start: now + 1.75, duration: 0.7, type: "sine", gain: 0.12 });
      tone(ctx, { freq: 2093, start: now + 2.5, duration: 0.6, type: "sine", gain: 0.14 });
      break;

    default:
      break;
  }
}

// Deliberately a no-op — a click tone on every single button (nav,
// filters, toggles, modals, ...) turned out to be overwhelming across the
// whole app. Sound is reserved for the crate-opening/reveal moments
// (playPop, playRaritySound) and notifications (playDing). Kept as a
// real export rather than deleted so the ~70 existing playClick() call
// sites throughout app.js don't need to change.
export function playClick() {}

export function playHover() {
  const ctx = getCtx();
  if (!ctx) return;
  tone(ctx, { freq: 900, start: ctx.currentTime, duration: 0.05, type: "sine", gain: 0.025 });
}

export function playDing() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime + 0.01;
  tone(ctx, { freq: 880, start: now, duration: 0.14, type: "sine", gain: 0.14 });
  tone(ctx, { freq: 1318, start: now + 0.08, duration: 0.28, type: "sine", gain: 0.16 });
}

export function playPop() {
  const ctx = getCtx();
  if (!ctx) return;
  tone(ctx, { freq: 260, start: ctx.currentTime, duration: 0.1, type: "sine", gain: 0.08, freqEnd: 460 });
}

// ---- Lulu burn ---------------------------------------------------------------
// The burn page's own sounds: a soft tick as Lulus are picked, a whoomph
// and crackle as each one catches, a low roar under the whole burn, and a
// run of bright coin notes when the Credits land.

let noiseBuf = null;
function noiseBuffer(ctx) {
  if (!noiseBuf) {
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

// Filtered noise with its own gain envelope: [[time, level], ...] from `start`.
function noise(ctx, { start, duration, type = "lowpass", freq = 1000, freqTo, q = 0.7, env }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, start);
  if (freqTo) freqTo.forEach(([t, v]) => f.frequency.exponentialRampToValueAtTime(v, start + t));
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  env.forEach(([t, v]) => g.gain.exponentialRampToValueAtTime(Math.max(v, 0.0001), start + t));
  src.connect(f).connect(g).connect(masterGain);
  src.start(start, Math.random());
  src.stop(start + duration + 0.05);
}

/** A Lulu picked (or dropped). Rises through each set of three; the third
 *  of a set rings brighter, since that's where the bonus lands. */
export function playLuluTick(up, count) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime + 0.005;
  if (!up) {
    tone(ctx, { freq: 620, start: now, duration: 0.07, type: "triangle", gain: 0.06, freqEnd: 480 });
    return;
  }
  const step = ((count - 1) % 3) + 1;
  const freq = [784, 988, 1175][step - 1];
  tone(ctx, { freq, start: now, duration: 0.08, type: "triangle", gain: 0.08 });
  if (step === 3) {
    tone(ctx, { freq: 1568, start: now + 0.05, duration: 0.3, type: "sine", gain: 0.09 });
    tone(ctx, { freq: 2349, start: now + 0.1, duration: 0.25, type: "sine", gain: 0.04 });
  }
}

// Fire, the way small speakers carry it: the energy sits between a few
// hundred hertz and a few kilohertz (a laptop or phone plays almost
// nothing under ~200Hz), and the crackle does most of the work.
function crackle(ctx, from, to, { density = 1, level = 1 } = {}) {
  let at = from;
  while (at < to) {
    const len = 0.004 + Math.random() * 0.018;
    noise(ctx, {
      start: at,
      duration: len,
      type: "bandpass",
      freq: 1400 + Math.random() * 4200,
      q: 1.4,
      env: [[0.0015, (0.12 + Math.random() * 0.3) * level], [len, 0.0001]],
    });
    at += (0.018 + Math.random() * 0.07) / density;
  }
}

/** One Lulu catching: a bright fwoosh, a body to it, and a burst of crackle. */
export function playLuluIgnite() {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime + 0.01;
  noise(ctx, {
    start: t,
    duration: 1.0,
    type: "bandpass",
    freq: 450,
    q: 0.8,
    freqTo: [[0.22, 3200], [1.0, 800]],
    env: [[0.05, 0.5], [0.3, 0.24], [1.0, 0.0001]],
  });
  tone(ctx, { freq: 300, start: t, duration: 0.42, type: "triangle", gain: 0.2, freqEnd: 95 });
  crackle(ctx, t + 0.06, t + 0.9, { density: 1.6, level: 1 });
}

/** The fire under the whole burn: a crackling roar that swells and settles. */
export function playBurnRoar(seconds) {
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime + 0.01;
  const end = seconds + 0.6;
  noise(ctx, {
    start: t,
    duration: end,
    type: "bandpass",
    freq: 500,
    q: 0.6,
    freqTo: [[seconds * 0.45, 1500], [end, 600]],
    env: [[0.2, 0.2], [seconds * 0.75, 0.16], [end, 0.0001]],
  });
  crackle(ctx, t + 0.1, t + seconds + 0.3, { density: 1, level: 0.75 });
  // The last of it: a high sizzle as the embers go out.
  noise(ctx, {
    start: t + seconds - 0.2,
    duration: 0.9,
    type: "highpass",
    freq: 3500,
    env: [[0.1, 0.07], [0.9, 0.0001]],
  });
}

/** The Credits landing: a quick climb of coin-bright notes. */
export function playCreditsAdded() {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime + 0.01;
  [1046.5, 1318.5, 1568, 2093, 2637].forEach((f, i) => {
    const at = now + i * 0.07;
    tone(ctx, { freq: f, start: at, duration: 0.55, type: "sine", gain: 0.15 });
    tone(ctx, { freq: f * 2.76, start: at, duration: 0.12, type: "sine", gain: 0.03 });
  });
  tone(ctx, { freq: 2093, start: now + 0.4, duration: 1.0, type: "triangle", gain: 0.07 });
  tone(ctx, { freq: 3136, start: now + 0.48, duration: 0.8, type: "sine", gain: 0.04 });
}
