// Central audio module: master mute switch, low-level synth helpers, the
// per-rarity "hype" sound, and small UI micro-sounds. Everything here is
// procedurally synthesized (oscillators + filtered noise) — no external
// audio files, so there's nothing to license.

const MUTE_KEY = "gotcha_muted_v1";

let audioCtx = null;
let masterGain = null;
let muted = localStorage.getItem(MUTE_KEY) === "1";

function getCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

export function isMuted() {
  return muted;
}

export function setMuted(v) {
  muted = v;
  localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  if (masterGain) masterGain.gain.setTargetAtTime(v ? 0 : 1, audioCtx.currentTime, 0.05);
  if (!v) {
    stopAmbient();
    startAmbient();
  }
}

export function toggleMuted() {
  setMuted(!muted);
  return muted;
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

export function playClick() {
  const ctx = getCtx();
  if (!ctx) return;
  tone(ctx, { freq: 320, start: ctx.currentTime, duration: 0.06, type: "square", gain: 0.05 });
}

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

// ---- Ambient background hum ----------------------------------------------

let ambientNodes = null;

export function startAmbient() {
  if (muted || ambientNodes) return;
  const ctx = getCtx();
  if (!ctx) return;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const g = ctx.createGain();
  osc1.type = "sine";
  osc2.type = "sine";
  osc1.frequency.value = 55;
  osc2.frequency.value = 55.6; // slight detune for a slow beating shimmer
  g.gain.value = 0;
  osc1.connect(g);
  osc2.connect(g);
  g.connect(masterGain);
  g.gain.linearRampToValueAtTime(0.02, ctx.currentTime + 2);
  osc1.start();
  osc2.start();
  ambientNodes = { osc1, osc2, g };
}

export function stopAmbient() {
  if (!ambientNodes || !audioCtx) return;
  const { osc1, osc2, g } = ambientNodes;
  g.gain.setTargetAtTime(0, audioCtx.currentTime, 0.3);
  setTimeout(() => {
    osc1.stop();
    osc2.stop();
  }, 800);
  ambientNodes = null;
}
