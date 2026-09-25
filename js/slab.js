// The Chosen slab — a 3D display case for whatever a crate just paid out.
//
// Self-contained: three.js and three of its addons are the only imports. Drop
// this file in, point an import map at three, and call createSlabViewer.
//
// What it gives you
//   createSlabViewer(canvas, host) -> { setItem(info), dispose() }
//       The live case. Leans toward the pointer anywhere over `host`, drifts
//       on its own when nobody's there, and relights as it turns.
//   renderSlabImage(info) -> Promise<dataURL>
//       The same case rendered once to a PNG. For cards nobody will touch —
//       a row of results, a history list, a thumbnail. Cheap: they all share
//       one renderer, which is given up a moment after the last one.
//   attachTiltRow(row) 
//       Pointer tilt + idle lean for a row of those stills.
//   LOOK, LIGHT, setLight(scope, values)
//       Every material and light value, tuned rather than guessed. LIGHT is
//       split by scope because the live case and the stills are lit for
//       different jobs.
//
// What an item looks like
//   {
//     image:       "assets/shoe.png",   // any URL the page can load
//     symbol:      null,                // set it and the window prints this
//                                       // instead of an image (tickers, codes)
//     name:        "Air Jordan 4 Undefeated",
//     size:        "US 10.5",           // or null — no size, no facts row
//     rarityLabel: "Legendary",
//     color:       "#F0C14B",           // rarity colour: bezel, header, glow
//     brand:       "ODTO",              // the wordmark top-right of the card
//   }
//
// The price is deliberately not on the card. At card scale it renders a few
// millimetres tall, and it's the number the whole reveal is about — put it
// on the page, big, underneath. See slab.css.

// The slab — what you pulled, encased.
//
// A flat product shot is a receipt: it says what you got and nothing about
// having it. This is the graded-card treatment instead — the shot on a
// printed card, a mirrored frame around it, a metallic ring in the rarity's
// colour around the item, and a light that sweeps across the whole face as
// it leans toward the pointer.
//
// Every material and light value below came out of a session with the
// interactive lab rather than being guessed at: near-black chrome frame,
// flat rather than deep, a metallic rarity ring that takes its colour from
// reflection instead of glowing, a matte print and a glossy photo, and the
// exposure pulled down. Change them together or not at all — they were tuned
// against each other.
//
// Two ways in, one object:
//   createSlabViewer  the live, tiltable case in the reveal
//   renderSlabImage   the same case rendered once to a still, for the boxes
//                     you didn't pick — three live WebGL contexts for cards
//                     nobody can touch would be three contexts wasted

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

/// Resolves to null rather than rejecting: one missing shot should leave a
/// gap, not take down the reveal it was going to appear in.
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}



const W = 2.05;   // card width
const H = 2.95;   // card height
const FONT = '"Inter", system-ui, -apple-system, sans-serif';

// The tuned look. Names match the lab's controls one for one.
const LOOK = {
  exposure: 0.74,
  frame: { color: 0x1c1c1c, roughness: 0, metalness: 0, clearcoat: 0.86, coatRough: 0, env: 3.5 },
  bezel: { roughness: 0.13, metalness: 0.6, glow: 0, coatRough: 0.04, env: 1.45 },
  card: { roughness: 0.29, clearcoat: 0.57, coatRough: 0, env: 0 },
  photo: { roughness: 0, coatRough: 0, env: 0.45 },
  body: { color: 0x000000, roughness: 0.24, metalness: 0, env: 1.9 },
  glow: { halo: 0.18, haloScale: 0.5, rim: 60 },
  build: { depth: 0, frameWidth: 52, ring: 40 },
  tilt: { x: 0.55, y: 0.8 },
};

// Light is per scope, because the two are lit for different jobs: the reveal
// is one case filling the screen and turning under the pointer, the stills
// are three small pictures that never move. The same rig can't flatter both.
export const LIGHT = {
  live: { sheen: 2.5, sheenW: 6, sheenH: 2, az: -28, el: -30, dist: 7.2,
          sweep: 0.25, key: 3.4, fill: 0, ambient: 0.4, exposure: 0.8 },
  still: { sheen: 3, sheenW: 5.3, sheenH: 3.3, az: -38, el: -30, dist: 3.6,
          sweep: 1.45, key: 2.1, fill: 1.9, ambient: 1, exposure: 0.54 },
};

// Every slab built, by scope, so a light change reaches the ones already on
// screen instead of only the next one made.
const rigs = { live: [], still: [] };

const TILT_EASE = 6; // rad/s toward the target — high enough to feel attached
const IDLE_SPEED = 0.55;
const IDLE_AMOUNT = 0.26;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/// A rounded rectangle as a Shape — the building block for every frame here.
function roundedShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/// A ring: rounded rect with a rounded rect cut out of it, extruded with a
/// bevel. This is the piece that reads as 3D — a bevelled edge has a bright
/// line running along it that moves when the slab turns, which a painted
/// border can never do.
function frameGeometry(outerW, outerH, innerW, innerH, radius, depth, bevel) {
  const shape = roundedShape(outerW, outerH, radius);
  shape.holes.push(roundedShape(innerW, innerH, Math.max(0.02, radius * 0.7)));
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 12,
  });
}

// ---------------------------------------------------------------- printing

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/// Only the printed parts of the card: header, name, facts, tagline. The
/// product photo is its own textured plane now, sunk behind its own bezel,
/// so it isn't baked into this.
function printedFace({ name, size, price, rarityLabel, color, brand, symbol }) {
  const meta = { label: rarityLabel, color };
  const CW = 1024, CH = 1472;
  const canvas = document.createElement("canvas");
  canvas.width = CW; canvas.height = CH;
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#08080a";
  ctx.fillRect(0, 0, CW, CH);

  const M = 40, inner = CW - M * 2;

  // header
  ctx.fillStyle = "#101014";
  roundRect(ctx, M, M, inner, 122, 20); ctx.fill();
  ctx.fillStyle = meta.color;
  ctx.font = `700 46px ${FONT}`; ctx.letterSpacing = "10px"; ctx.textAlign = "left";
  ctx.fillText(meta.label.toUpperCase(), M + 46, M + 61);
  ctx.letterSpacing = "0px";
  ctx.strokeStyle = "rgba(255,255,255,.2)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(CW / 2 + 60, M + 26); ctx.lineTo(CW / 2 + 60, M + 96); ctx.stroke();
  // Shrink the wordmark to fit its half of the header: a long one
  // ("Robinhood Chain") at full size ran into the rarity label.
  ctx.fillStyle = "#fff"; ctx.textAlign = "right"; ctx.letterSpacing = "2px";
  const brandRoom = CW - M - 46 - (CW / 2 + 60) - 28;
  let brandSize = 58;
  do {
    ctx.font = `800 ${brandSize}px ${FONT}`;
    brandSize -= 2;
  } while (ctx.measureText(brand).width > brandRoom && brandSize > 24);
  ctx.fillText(brand, CW - M - 46, M + 61); ctx.letterSpacing = "0px";

  // The window is square and inset from the card's sides, so the item is
  // never squashed to fit and the frame around it has room to breathe.
  const winW = 800, winH = winW;
  const winX = (CW - winW) / 2;
  const winY = M + 122 + 34;
  ctx.fillStyle = "#0c0c10";
  roundRect(ctx, winX, winY, winW, winH, 18); ctx.fill();

  // A share has nothing to photograph. The window is a recess the photo
  // plane normally fills, so for a ticker it would be an empty black square
  // — the ticker itself goes in instead, and no plane is mounted over it.
  if (symbol) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    roundRect(ctx, winX + 16, winY + 16, winW - 32, winH - 32, 12); ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    // Tickers run from one letter to five; shrink to fit rather than run
    // over the plate.
    let size = 208;
    do {
      ctx.font = `800 ${size}px ${FONT}`;
      size -= 8;
    } while (ctx.measureText(symbol).width > winW - 140 && size > 64);
    ctx.fillText(symbol, CW / 2, winY + winH / 2 - 24);
    ctx.fillStyle = color;
    ctx.font = `700 30px ${FONT}`;
    ctx.letterSpacing = "8px";
    ctx.fillText("SIMULATED SHARE", CW / 2, winY + winH / 2 + 96);
    ctx.letterSpacing = "0px";
  }

  // name + facts
  const infoY = winY + winH + 26, infoH = 300;
  // Size only. The rarity is already across the header in its own colour,
  // and the price is on the page now — printing either here would be saying
  // it twice, in the smaller of the two places.
  const cols = size ? [["SIZE", size]] : [];
  ctx.fillStyle = "#101014";
  roundRect(ctx, M, infoY, inner, infoH, 20); ctx.fill();

  ctx.fillStyle = "#fff"; ctx.font = `700 56px ${FONT}`; ctx.textAlign = "center";
  const words = name.split(" ");
  const lines = []; let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > inner - 120 && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  // With nothing under it — a collectible or a share has no size — the name
  // sits in the middle of the panel rather than at the top of an empty one.
  const nameTop = infoY + (cols.length ? 62 : 108) + (lines.length > 1 ? 0 : 20);
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, CW / 2, nameTop + i * 62));

  if (cols.length) {
    ctx.strokeStyle = "rgba(255,255,255,.14)";
    ctx.beginPath(); ctx.moveTo(M + 56, infoY + 168); ctx.lineTo(CW - M - 56, infoY + 168); ctx.stroke();
  }
  const cellW = cols.length ? (inner - 80) / cols.length : 0;
  cols.forEach(([label, value], i) => {
    const cx = M + 40 + cellW * (i + 0.5);
    ctx.fillStyle = meta.color; ctx.font = `700 27px ${FONT}`; ctx.letterSpacing = "4px";
    ctx.fillText(label, cx, infoY + 214);
    ctx.fillStyle = "#fff"; ctx.font = `700 52px ${FONT}`; ctx.letterSpacing = "0px";
    ctx.fillText(value, cx, infoY + 268);
    if (i > 0) {
      ctx.strokeStyle = "rgba(255,255,255,.16)";
      ctx.beginPath();
      ctx.moveTo(M + 40 + cellW * i, infoY + 192);
      ctx.lineTo(M + 40 + cellW * i, infoY + 288);
      ctx.stroke();
    }
  });

  // tagline
  const tagY = infoY + infoH + 22, tagH = CH - M - tagY;
  ctx.fillStyle = "#101014";
  roundRect(ctx, M, tagY, inner, tagH, 20); ctx.fill();
  ctx.fillStyle = meta.color; ctx.font = `600 27px ${FONT}`; ctx.letterSpacing = "9px";
  ctx.fillText("IT'S ALREADY CHOSEN.", CW / 2, tagY + tagH / 2); ctx.letterSpacing = "0px";

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  // Where the window landed, in world units, so the bezel and the photo sit
  // exactly on it rather than being positioned by eye — the photo was
  // covering the printed name.
  const win = {
    w: (winW / CW) * W,
    h: (winH / CH) * H,
    cy: (0.5 - (winY + winH / 2) / CH) * H,
  };
  return { tex, win };
}

/// A radial falloff, additive behind the slab. The glow used to be a plain
/// plane, which showed as a flat rectangle sticking out behind the case —
/// a gradient with nothing at its edges has no edges to notice.
function haloTexture() {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 512;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(256, 256, 40, 256, 256, 256);
  g.addColorStop(0.00, "rgba(255,255,255,1)");
  g.addColorStop(0.24, "rgba(255,255,255,0.42)");
  g.addColorStop(0.48, "rgba(255,255,255,0.10)");
  g.addColorStop(0.72, "rgba(255,255,255,0.02)");
  g.addColorStop(1.00, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- The case ------------------------------------------------------------

/// Scene, camera and the case itself, built to LOOK. Shared by the live
/// viewer and the stills so the two can't drift apart.
function buildSlab(renderer, scope = "live") {
  const light = LIGHT[scope];
  renderer.toneMappingExposure = light.exposure;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 3 / 4, 0.1, 100);
  camera.position.set(0, 0, 8.2);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const group = new THREE.Group();
  scene.add(group);

  const cardMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0,
    roughness: LOOK.card.roughness, clearcoat: LOOK.card.clearcoat,
    clearcoatRoughness: LOOK.card.coatRough, envMapIntensity: LOOK.card.env,
  });
  const card = new THREE.Mesh(new THREE.PlaneGeometry(W, H), cardMat);
  group.add(card);

  const photoMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, clearcoat: 1,
    roughness: LOOK.photo.roughness, clearcoatRoughness: LOOK.photo.coatRough,
    envMapIntensity: LOOK.photo.env,
  });
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), photoMat); // sized by fitPhoto
  group.add(photo);

  const frameMat = new THREE.MeshPhysicalMaterial({
    color: LOOK.frame.color, roughness: LOOK.frame.roughness, metalness: LOOK.frame.metalness,
    clearcoat: LOOK.frame.clearcoat, clearcoatRoughness: LOOK.frame.coatRough,
    envMapIntensity: LOOK.frame.env,
  });
  // The ring around the window takes the rarity, so the colour sits against
  // the item rather than only around the outside of everything. Metallic
  // rather than self-lit: it reflects the colour instead of emitting it.
  const bezelMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, emissive: new THREE.Color(0xffffff), emissiveIntensity: LOOK.bezel.glow,
    roughness: LOOK.bezel.roughness, metalness: LOOK.bezel.metalness, clearcoat: 1,
    clearcoatRoughness: LOOK.bezel.coatRough, envMapIntensity: LOOK.bezel.env,
  });

  const outerFrame = new THREE.Mesh(new THREE.BufferGeometry(), frameMat);
  const windowBezel = new THREE.Mesh(new THREE.BufferGeometry(), bezelMat);
  group.add(outerFrame, windowBezel);

  const body = new THREE.Mesh(
    new RoundedBoxGeometry(W + 0.3, H + 0.3, 0.3, 5, 0.1),
    new THREE.MeshPhysicalMaterial({
      color: LOOK.body.color, roughness: LOOK.body.roughness, metalness: LOOK.body.metalness,
      clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: LOOK.body.env,
    })
  );
  body.position.z = -0.16;
  group.add(body);

  const glowPlate = new THREE.Mesh(
    new THREE.PlaneGeometry((W + 0.3) * 1.75, (H + 0.3) * 1.4),
    new THREE.MeshBasicMaterial({
      map: haloTexture(), transparent: true, opacity: LOOK.glow.halo,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  glowPlate.position.z = -0.42;
  glowPlate.scale.setScalar(LOOK.glow.haloScale);
  group.add(glowPlate);

  const rimA = new THREE.PointLight(0xffffff, LOOK.glow.rim, 16, 2);
  rimA.position.set(-2.6, 1.8, -1.6);
  const rimB = new THREE.PointLight(0xffffff, LOOK.glow.rim * 0.8, 16, 2);
  rimB.position.set(2.6, -1.8, -1.4);
  scene.add(rimA, rimB);

  const key = new THREE.DirectionalLight(0xffffff, light.key);
  key.position.set(2.4, 3, 5);
  const fill = new THREE.DirectionalLight(0xffffff, light.fill);
  fill.position.set(-3, -1.5, 3);
  const ambient = new THREE.AmbientLight(0xffffff, light.ambient);
  scene.add(key, fill, ambient);

  // The shine: a real area light in front of the slab rather than a white
  // film laid over it, so the highlight lands on the laminate and the print
  // stays sharp underneath. A film was the first attempt and it veiled the
  // item to fake a reflection.
  RectAreaLightUniformsLib.init();
  const sheen = new THREE.RectAreaLight(0xffffff, light.sheen, light.sheenW, light.sheenH);
  const lightBase = new THREE.Vector3();
  scene.add(sheen);

  /// Reads the scope's current light values onto this rig. Called at build
  /// and again whenever they're changed from outside.
  function applyLight() {
    const l = LIGHT[scope];
    renderer.toneMappingExposure = l.exposure;
    sheen.intensity = l.sheen;
    sheen.width = l.sheenW;
    sheen.height = l.sheenH;
    key.intensity = l.key;
    fill.intensity = l.fill;
    ambient.intensity = l.ambient;
    const az = (l.az * Math.PI) / 180;
    const el = (l.el * Math.PI) / 180;
    lightBase.set(
      Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)
    ).multiplyScalar(l.dist);
    sheen.position.copy(lightBase);
    sheen.lookAt(0, 0, 0);
  }
  applyLight();

  let windowRect = { w: 1.6, h: 1.6, cy: 0.35 };
  let photoAspect = 1;

  /// The window is square; the shot may not be. Scale to fit inside it and
  /// leave the rest showing rather than stretching to fill — stretching is
  /// what squashed the item.
  function fitPhoto() {
    const box = Math.min(windowRect.w, windowRect.h) - 0.07;
    const w = photoAspect >= 1 ? box : box * photoAspect;
    const h = photoAspect >= 1 ? box / photoAspect : box;
    photo.scale.set(w, h, 1);
  }

  function rebuildFrames() {
    const depth = 0.05 + (LOOK.build.depth / 100) * 0.34;
    const frameW = 0.05 + (LOOK.build.frameWidth / 100) * 0.16;
    const bevel = Math.min(0.028, frameW * 0.32);

    outerFrame.geometry.dispose();
    // The hole is a hair larger than the card: with a bevel this deep, a
    // frame overlapping the print by a couple of millimetres ate the header.
    outerFrame.geometry = frameGeometry(
      W + frameW * 2, H + frameW * 2, W + 0.015, H + 0.015, 0.12, depth, bevel
    );
    outerFrame.position.z = 0.02;

    const { w: winW, h: winH, cy } = windowRect;
    const ring = frameW * (LOOK.build.ring / 100);
    windowBezel.geometry.dispose();
    windowBezel.geometry = frameGeometry(
      winW + ring * 2, winH + ring * 2, winW - 0.01, winH - 0.01, 0.07, depth * 0.5, bevel * 0.8
    );
    windowBezel.position.set(0, cy, 0.02);

    // The recess is the bezel standing proud of the photo, not the photo
    // sinking into the card — the card is a solid plane with no hole in it.
    photo.position.set(0, cy, 0.006);
    fitPhoto();
  }

  function setItem(info) {
    // Nothing is mounted over a printed ticker.
    photo.visible = !info.symbol;
    const tint = new THREE.Color(info.color);
    glowPlate.material.color.copy(tint);
    bezelMat.color.copy(tint);
    bezelMat.emissive.copy(tint);
    rimA.color.copy(tint);
    rimB.color.copy(tint);

    const face = printedFace(info);
    if (cardMat.map) cardMat.map.dispose();
    cardMat.map = face.tex;
    cardMat.needsUpdate = true;
    windowRect = face.win;
    rebuildFrames();

    if (info.symbol) return Promise.resolve();
    return loadImage(info.image).then((img) => {
      if (!img) return;
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.needsUpdate = true;
      if (photoMat.map) photoMat.map.dispose();
      photoMat.map = tex;
      photoMat.needsUpdate = true;
      photoAspect = img.width / img.height;
      fitPhoto();
    });
  }

  function aimLight(rotX, rotY) {
    const swing = LIGHT[scope].sweep;
    sheen.position.set(
      lightBase.x + rotY * 5.5 * swing,
      lightBase.y - rotX * 4.5 * swing,
      lightBase.z
    );
    sheen.lookAt(0, 0, 0);
    key.position.set(2.4 + rotY * 5 * swing, 3 - rotX * 5 * swing, 5);
  }

  rebuildFrames();
  const rig = { scene, camera, group, setItem, aimLight, applyLight, renderer };
  rigs[scope].push(rig);
  return rig;
}

/// Push new light values into a scope. The live rig repaints on its own next
/// frame; the stills have to be thrown away and drawn again, which is what
/// the returned promise is for — callers redraw what's on screen after it.
export function setLight(scope, values) {
  Object.assign(LIGHT[scope], values);
  rigs[scope].forEach((rig) => rig.applyLight());
  if (scope === "still") stillCache.clear();
}

function makeRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

// ---- Stills, for the boxes you didn't pick -------------------------------

let stillRenderer = null;
let stillSlab = null;
let stillRelease = null;
const stillCache = new Map(); // key -> Promise<dataURL>

/// Three boxes open together, so the renderer is worth keeping for a moment
/// and worth giving up straight after: a held context is one the round's own
/// crates can't have.
function releaseStillRendererSoon() {
  clearTimeout(stillRelease);
  stillRelease = setTimeout(() => {
    if (!stillRenderer) return;
    stillRenderer.forceContextLoss();
    stillRenderer.dispose();
    rigs.still = rigs.still.filter((r) => r !== stillSlab);
    stillRenderer = null;
    stillSlab = null;
  }, 1500);
}

/**
 * The same case, rendered once to a PNG. The unpicked boxes only ever sit
 * there, so they share one renderer between them.
 */
// One renderer, three cards: the renders have to queue. Run concurrently
// they share a single scene, so the last setItem wins and every card comes
// out wearing the same face.
let stillQueue = Promise.resolve();

export function renderSlabImage(info) {
  const key = `${info.name}|${info.rarityLabel}|${info.size ?? ""}`;
  if (stillCache.has(key)) return stillCache.get(key);

  const promise = stillQueue.then(async () => {
    if (!stillRenderer) {
      const canvas = document.createElement("canvas");
      canvas.width = 620;
      canvas.height = 830;
      stillRenderer = makeRenderer(canvas);
      stillRenderer.setSize(620, 830, false);
      stillSlab = buildSlab(stillRenderer, "still");
    }
    clearTimeout(stillRelease); // don't let the renderer go mid-queue
    await stillSlab.setItem(info);
    // A slight lean, so that a still of a case still reads as an object.
    stillSlab.group.rotation.set(0.04, -0.24, 0);
    stillSlab.aimLight(0.04, -0.24);
    stillRenderer.render(stillSlab.scene, stillSlab.camera);
    const url = stillRenderer.domElement.toDataURL("image/png");
    releaseStillRendererSoon();
    return url;
  });
  stillQueue = promise.catch(() => {});

  stillCache.set(key, promise);
  return promise;
}

// ---- The live one --------------------------------------------------------

/**
 * Mounts the case on `canvas` and returns a controller.
 *
 * `host` is what the pointer is tracked over — the reveal, not the canvas,
 * so the slab answers to the whole screen rather than only to the few
 * hundred pixels it occupies.
 *
 * Returns { setItem(info), dispose() }. Built once and reused for every
 * reveal after; setItem redraws the face and re-tints the metal.
 */
export function createSlabViewer(canvas, host) {
  const renderer = makeRenderer(canvas);
  const slab = buildSlab(renderer);
  const { scene, camera, group } = slab;

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  let targetX = 0;
  let targetY = 0;
  let pointing = false;
  let t = 0;
  let running = true;

  function aim(event) {
    const rect = host.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    targetY = THREE.MathUtils.clamp(nx, -1, 1) * LOOK.tilt.y;
    targetX = THREE.MathUtils.clamp(ny, -1, 1) * LOOK.tilt.x;
    pointing = true;
  }

  function release() {
    pointing = false;
  }

  host.addEventListener("pointermove", aim);
  host.addEventListener("pointerleave", release);
  host.addEventListener("pointercancel", release);

  let last = performance.now();
  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt;

    if (!pointing && !reducedMotion.matches) {
      // Nobody's touching it: a slow lean, the way a case sits on a shelf
      // catching the light rather than standing dead still.
      targetY = Math.sin(t * IDLE_SPEED) * IDLE_AMOUNT * LOOK.tilt.y;
      targetX = Math.sin(t * IDLE_SPEED * 0.72) * IDLE_AMOUNT * 0.45 * LOOK.tilt.x;
    }

    const ease = reducedMotion.matches ? 1 : Math.min(1, dt * TILT_EASE);
    group.rotation.y += (targetY - group.rotation.y) * ease;
    group.rotation.x += (targetX - group.rotation.x) * ease;
    slab.aimLight(group.rotation.x, group.rotation.y);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    setItem(info) {
      group.rotation.set(0, 0, 0);
      t = 0;
      return slab.setItem(info);
    },
    dispose() {
      running = false;
      ro.disconnect();
      host.removeEventListener("pointermove", aim);
      host.removeEventListener("pointerleave", release);
      host.removeEventListener("pointercancel", release);
      renderer.forceContextLoss();
      renderer.dispose();
    },
  };
}


// ---- Pointer tilt for a row of stills ------------------------------------
//
// A rendered case is a picture, and a picture that never moves reads as one.
// This leans each image by how near the pointer is to it, so moving across a
// row tips them in turn, and lets them drift on their own in between.
//
// perspective() rides inside the transform rather than sitting on an
// ancestor: any 2D transform above it flattens the whole subtree, and a
// rotateY with nothing to foreshorten it is just a horizontal squash. That
// bug is why this helper exists instead of three lines of CSS.

const TILT_Y = 42; // nominal; the falloff roughly halves it in practice
const TILT_X = 30;
const TILT_REACH = 1.5; // in image-widths; past this an image ignores you

/**
 * @param {Element} row   the container the pointer is tracked over
 * @param {string} selector  which images inside it lean (default: all)
 */
export function attachTiltRow(row, selector = "img") {
  if (reducedMotion.matches) return () => {};
  const images = () => Array.from(row.querySelectorAll(selector));

  function tilt(event) {
    images().forEach((img) => {
      const r = img.getBoundingClientRect();
      if (!r.width) return;
      const dx = (event.clientX - (r.left + r.width / 2)) / (r.width * TILT_REACH);
      const dy = (event.clientY - (r.top + r.height / 2)) / (r.height * TILT_REACH);
      const near = Math.max(0, 1 - Math.hypot(dx, dy));
      const clamp = (v) => Math.max(-1, Math.min(1, v));
      img.style.animation = "none";
      img.style.transition = "transform 140ms ease-out";
      img.style.transform =
        `perspective(900px) ` +
        `rotateY(${clamp(dx) * TILT_Y * near}deg) ` +
        `rotateX(${-clamp(dy) * TILT_X * near}deg) ` +
        `scale(${1 + 0.03 * near})`;
    });
  }

  // Eased back to rest first: a case snapping straight the moment the
  // pointer leaves reads as a glitch.
  function release() {
    images().forEach((img) => {
      img.style.transition = "transform 600ms cubic-bezier(0.22, 1, 0.36, 1)";
      img.style.transform = "perspective(900px) rotateY(0deg) rotateX(0deg) scale(1)";
      setTimeout(() => {
        if (img.style.transition.startsWith("transform 600ms")) {
          img.style.animation = "";
          img.style.transition = "";
          img.style.transform = "";
        }
      }, 620);
    });
  }

  row.addEventListener("pointermove", tilt);
  row.addEventListener("pointerleave", release);
  row.addEventListener("pointercancel", release);
  return () => {
    row.removeEventListener("pointermove", tilt);
    row.removeEventListener("pointerleave", release);
    row.removeEventListener("pointercancel", release);
  };
}
