import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const MODEL_URL = "assets/models/nike_shoe_box/scene.gltf";
const LID_NODE_NAME = "Plane_Plane_002_Material_001"; // hinge pivot baked into the source animation
const LID_OPEN_DEG = -118; // extracted from the model's own open-lid animation clip
const OPEN_DURATION_MS = 700;
const IDLE_SPEED = 0.45; // rad/s
const FACE_SPEED = 7; // rad/s easing back to forward-facing (0) on hover/open

// The Stocks tier's "pack" — a generic printer, no lid to open. Same rig,
// same idle-spin, same everything except the reveal: instead of a hinge,
// a procedural sheet of "paper" feeds out of it (see buildPaperSheet).
const PRINTER_MODEL_URL = "assets/models/printer/scene.gltf";
const PRINT_DURATION_MS = 1000;

let modelPromise = null;
function loadModel() {
  if (!modelPromise) {
    modelPromise = new GLTFLoader().loadAsync(MODEL_URL).then((gltf) => gltf.scene);
  }
  return modelPromise;
}
// Kick off the (small, ~1.4MB) download as soon as this module is imported so
// it's already cached by the time a round actually needs it.
loadModel().catch(() => {});

let printerModelPromise = null;
function loadPrinterModel() {
  if (!printerModelPromise) {
    printerModelPromise = new GLTFLoader().loadAsync(PRINTER_MODEL_URL).then((gltf) => gltf.scene);
  }
  return printerModelPromise;
}
loadPrinterModel().catch(() => {});

// The CHOSEN × ODTO shipping box: kraft cardboard, four flaps, and its own
// baked clips — Idle, Charge, Open. Shared with the other Chosen build on the
// team (same file, same flaps), used on Home. Meshopt-compressed with webp
// textures, so the loader needs the decoder; the textures are its own, so it
// never takes a crate skin.
const OD_MODEL_URL = "assets/models/box-chosen-od.glb";
let odModelPromise = null;
function loadOdModel() {
  if (!odModelPromise) {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    odModelPromise = loader.loadAsync(OD_MODEL_URL).then((gltf) => {
      // Clips travel with the scene so every clone can find them.
      gltf.scene.userData.clips = gltf.animations;
      return gltf.scene;
    });
  }
  return odModelPromise;
}

function loadModelFor(kind) {
  if (kind === "printer") return loadPrinterModel();
  if (kind === "od") return loadOdModel();
  return loadModel();
}

// Per-crate finishes, keyed by crate. Replaces the model's own branded
// texture rather than multiplying a colour over it, which reads muddy.
const TIER_SKINS = {
  // Fallback finish, used until a crate registers product art (and by the
  // Stocks crate, which has no product shots of its own). High metalness +
  // low roughness for a genuine mirror-like look — needs a real environment
  // map to reflect (see applyStudioEnvironment), or a metal this shiny just
  // reads as flat black with no light source to bounce.
  sneakers: { color: 0xd4794e, metalness: 1, roughness: 0.22 },
  streetwear: { color: 0x5b8dd9, metalness: 1, roughness: 0.18 },
  collectibles: { color: 0xc9942f, metalness: 1, roughness: 0.14 },
  stocks: { color: 0x4ade80, metalness: 1, roughness: 0.18 },
};

// ---- Product collage skins ----------------------------------------------
// A crate is wrapped in the things that can come out of it: its own pool's
// product shots, tiled into one texture. app.js registers the art (it owns
// the pools; this module has no business importing prize data), and a crate
// with nothing registered falls back to the metallic finish above.

const collageArt = new Map();
const collageTextures = new Map();

/** @param {string} tierKey @param {string[]} images - product image URLs. */
export function registerTierArt(tierKey, images) {
  collageArt.set(tierKey, images);
  collageTextures.delete(tierKey); // re-bake if the pool changed
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // a missing shot just leaves its cell empty
    img.src = src;
  });
}

// Deterministic per crate, so a crate's wrap is the same every time it's
// drawn rather than reshuffling on each mount.
function seeded(seed) {
  let n = seed;
  return () => {
    n = (n * 1664525 + 1013904223) % 4294967296;
    return n / 4294967296;
  };
}

// The model's UVs were laid out for a branded shoe box, so this is painted
// as a repeating wrap rather than a registered print: a dense grid reads as
// "covered in product" from any angle, which is the point, and no cell
// lands on a seam in a way that matters.
const COLLAGE_SIZE = 1024;
const COLLAGE_COLS = 4;

// Brown kraft board: a flat base, soft blotches of darker and lighter pulp,
// the faint vertical ribs of the corrugation underneath, and fibre flecks.
// Painted, not loaded, so there's no extra asset to fetch.
function paintCardboard(ctx, size, rand) {
  ctx.fillStyle = "#86592f";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 90; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 30 + rand() * 120;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rand() < 0.5;
    g.addColorStop(0, dark ? "rgba(120, 80, 40, 0.10)" : "rgba(230, 200, 150, 0.10)");
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const rib = size / 64;
  for (let x = 0; x < size; x += rib) {
    ctx.fillStyle = "rgba(90, 55, 20, 0.05)";
    ctx.fillRect(x, 0, rib / 2, size);
  }

  for (let i = 0; i < 2600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 2 + rand() * 7;
    const a = rand() * Math.PI;
    ctx.strokeStyle = rand() < 0.6 ? "rgba(95, 60, 25, 0.22)" : "rgba(240, 215, 170, 0.25)";
    ctx.lineWidth = 0.6 + rand() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
}

async function buildCollageTexture(tierKey) {
  const images = collageArt.get(tierKey);
  if (!images || images.length === 0) return null;

  const cells = COLLAGE_COLS * COLLAGE_COLS;
  const rand = seeded(tierKey.length * 7919 + images.length);
  // Spread the picks across the whole pool instead of taking the first 16,
  // so the wrap shows the cheap and the grail side by side.
  const step = images.length / cells;
  const picks = Array.from({ length: cells }, (_, i) => images[Math.floor(i * step) % images.length]);
  const loaded = await Promise.all(picks.map(loadImage));

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = COLLAGE_SIZE;
  const ctx = canvas.getContext("2d");

  // Kraft cardboard ground, so the crate reads as a real shipping box with
  // its contents printed on it.
  paintCardboard(ctx, COLLAGE_SIZE, rand);

  const cell = COLLAGE_SIZE / COLLAGE_COLS;
  loaded.forEach((img, i) => {
    if (!img) return;
    const cx = (i % COLLAGE_COLS) * cell;
    const cy = Math.floor(i / COLLAGE_COLS) * cell;
    // Contain rather than cover: these are cut-out product shots, and
    // cropping one to fill its cell tends to cut the shoe in half.
    const scale = Math.min(cell / img.width, cell / img.height) * 1.02;
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.save();
    ctx.translate(cx + cell / 2, cy + cell / 2);
    ctx.rotate((rand() - 0.5) * 0.24); // a few degrees each way — a collage, not a contact sheet
    // Multiply, like ink printed on board: the product shots are cut out on
    // white, and multiplied white leaves the cardboard showing through
    // instead of a white rectangle round every item.
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  // Tiled about twice over each face: one pass of a 4x4 grid stretched
  // across a whole box makes each product big enough that a face can end up
  // showing one shoe and a lot of board.
  texture.repeat.set(2, 2);
  texture.anisotropy = 8;
  return texture;
}

function collageFor(tierKey) {
  if (!collageArt.has(tierKey)) return Promise.resolve(null);
  if (!collageTextures.has(tierKey)) collageTextures.set(tierKey, buildCollageTexture(tierKey));
  return collageTextures.get(tierKey);
}

// Materials are shared by reference across clone(true) instances, so this
// clones each mesh's material before tinting it — otherwise skinning one
// box would repaint every other box sharing that base model.
function applyTierSkin(root, tierKey, collage = null) {
  const skin = TIER_SKINS[tierKey];
  if (!skin && !collage) return;
  root.traverse((node) => {
    if (!node.isMesh || !node.material) return;
    const mat = node.material.clone();
    if (collage) {
      // Printed cardboard, not polished metal: matte, so the board and the
      // shots on it read at every angle instead of blowing out to white.
      mat.map = collage;
      mat.color.setHex(0xffffff);
      mat.metalness = 0;
      mat.roughness = 0.88;
      mat.envMapIntensity = 1;
      node.material = mat;
      return;
    }
    mat.map = null;
    mat.color.setHex(skin.color);
    mat.metalness = skin.metalness;
    mat.roughness = skin.roughness;
    // A metal this shiny gets almost all of its brightness from reflecting
    // its surroundings rather than being lit head-on — envMapIntensity is
    // the direct lever for "the metal actually looks bright," moreso than
    // the scene's own lights.
    mat.envMapIntensity = 3.2;
    node.material = mat;
  });
}

// A metallic material reflects its surroundings rather than being lit
// directly, so without an environment map it just looks flat and dark no
// matter how high metalness goes. RoomEnvironment is three.js's built-in
// procedural studio backdrop — built once per renderer (PMREM output is
// tied to the GL context that generated it, and each box viewer owns its
// own renderer/canvas) and cached so repeat calls on the same renderer are
// free.
function applyStudioEnvironment(scene, renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// Every box turns the same way, always: nothing ever spins back. Angles are
// kept in [0, 2π), and "facing forward" is reached by carrying on round to
// the next 0, however far that is.
const TAU = Math.PI * 2;
function wrapAngle(angle) {
  return ((angle % TAU) + TAU) % TAU;
}
// How far a box at `angle` still has to turn, going forward, to face you.
function aheadToFront(angle) {
  return (TAU - wrapAngle(angle)) % TAU;
}
// Idle boxes share one clock, so a box mounted now joins the lap the others
// are already on instead of starting face-on and jumping out of step.
function sharedIdleAngle() {
  return wrapAngle((performance.now() / 1000) * IDLE_SPEED);
}

// Shared scene/camera/lighting setup so the reel snapshot and the live,
// interactive viewers are pixel-for-pixel the same shot — that's what makes
// the reel-to-slot handoff read as the same box rather than a swap. Works
// for any single loaded model (box or printer) since it only reasons about
// the model's own bounding box.
function buildRig(root) {
  const lid = root.getObjectByName(LID_NODE_NAME);

  // Frame by the body when the model has one: the od box's flaps stand
  // straight up in its rest pose, and fitting those made the box itself
  // come out half the size of everything else on the page.
  // (World matrices first: measuring a child on its own would skip the
  // scale its parent nodes carry.)
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root.getObjectByName("CrateBody") ?? root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  // Framing has to fit the model's worst-case silhouette while it's idly
  // spinning around Y, not just its resting front-on footprint — a
  // rectangular object rotated to its diagonal projects wider than either
  // side alone, which is what was clipping the corners mid-spin.
  const horizontalDiagonal = Math.hypot(size.x, size.z);
  const scale = 1.7 / Math.max(horizontalDiagonal, size.y);

  root.scale.setScalar(scale);
  root.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

  // Normalized (post-scale, post-center) bounds — lets a caller (the paper
  // sheet, for the printer) position itself relative to the model's real
  // size instead of a guessed constant.
  const bounds = {
    minY: box.min.y * scale - center.y * scale,
    maxY: box.max.y * scale - center.y * scale,
    maxZ: box.max.z * scale - center.z * scale,
    width: size.x * scale,
  };

  const group = new THREE.Group();
  group.add(root);

  const scene = new THREE.Scene();
  scene.add(group);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0.85, 3.3);
  camera.lookAt(0, 0.05, 0);

  const ambient = new THREE.AmbientLight(0xffffff, 1.3);
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(2.5, 4, 3);
  const fill = new THREE.DirectionalLight(0xffffff, 0.9);
  fill.position.set(-3, 1.2, -1.5);
  const rim = new THREE.DirectionalLight(0xffffff, 1.6);
  rim.position.set(-1.5, 2.2, -3);
  scene.add(ambient, key, fill, rim);

  return { scene, camera, group, lid, bounds };
}

// A procedural sheet of "paper" for the printer — sized and positioned off
// the printer's own (normalized) bounds so it roughly lines up with the
// top of the model regardless of that model's exact proportions. Parked
// mostly inside the printer's silhouette (so the body occludes it) and
// slid up-and-forward on print(), rather than needing a real output-slot
// node baked into the source model.
// The sheet the Stocks printer feeds out. Shaped like the share
// certificate (see prizeDataStocks.js), plain paper until setPaper() prints
// the actual certificate for that slot onto it.
const CERT_CROP = { x: 30, y: 18, w: 240, h: 258 }; // the card within the 300x300 certificate art

function buildPaperSheet(bounds) {
  const width = Math.max(0.5, bounds.width * 0.46);
  const height = width * (CERT_CROP.h / CERT_CROP.w);

  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = Math.round(480 * (height / width));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f6f3ec";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const sheet = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92, metalness: 0, side: THREE.DoubleSide })
  );

  const parkedY = bounds.minY + (bounds.maxY - bounds.minY) * 0.72;
  const printedY = parkedY + height * 0.62;
  sheet.position.set(0, parkedY, bounds.maxZ * 0.35);
  sheet.rotation.x = -0.3;

  // Resolves once the certificate is on the sheet (or failed to load, in
  // which case the plain paper stays).
  function print(imageUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const k = img.naturalWidth / 300;
        ctx.fillStyle = "#f6f3ec";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, CERT_CROP.x * k, CERT_CROP.y * k, CERT_CROP.w * k, CERT_CROP.h * k, 0, 0, canvas.width, canvas.height);
        texture.needsUpdate = true;
        resolve();
      };
      img.onerror = () => resolve();
      img.src = imageUrl;
    });
  }

  return { sheet, parkedY, printedY, print };
}

// The box's own kraft texture is already lit for display; under the
// exposure the collage-skinned boxes need it blew out to beige. Matte board
// either way. `map`, when given, is that crate's stickered copy of the
// texture (see stickerTextureFor).
const OD_EXPOSURE = 1.05;
function settleOdMaterials(root, map = null) {
  root.traverse((node) => {
    if (!node.isMesh || !node.material) return;
    node.material = node.material.clone();
    node.material.envMapIntensity = 0.9;
    if (map) node.material.map = map;
  });
}

// ---- Grail stickers on the od box ---------------------------------------
// The kraft box keeps its own print, and each crate slaps a few of its
// grails on it as die-cut stickers: the piece cut out of its photo, a white
// border round its silhouette, a soft shadow under it. app.js hands over a
// function that resolves to cut-out image URLs (it owns the pools and the
// cutting); it's called on first draw, not at registration.
const stickerArt = new Map(); // tierKey -> () => Promise<string[]>
const stickerTextures = new Map(); // tierKey -> Promise<Texture|null>

/** @param {string} tierKey @param {() => Promise<string[]>} getImages */
export function registerTierStickers(tierKey, getImages) {
  stickerArt.set(tierKey, getImages);
  stickerTextures.delete(tierKey);
}

// Where the stickers go, in the box texture's own pixels (1024 square).
// The four walls run as one band across it (y ~448-582): the end with the
// big ODTO mark (x 0-205), a CHOSEN side (205-512), the end with the ODTO
// label (512-716), the other CHOSEN side (716-1024); the lid flaps sit
// above. The band is continuous round the box, so a sticker across a wall
// boundary wraps the corner, as a real one slapped on would. `s` is the
// sticker's longest side, `r` its tilt in degrees.
const STICKER_SPOTS = [
  { x: 212, y: 522, s: 118, r: -9 }, // wrapping the corner onto a CHOSEN side
  { x: 492, y: 548, s: 92, r: 11 }, // the other end of that side, low
  { x: 640, y: 512, s: 104, r: -6 }, // the label end
  { x: 952, y: 520, s: 118, r: 8 }, // far CHOSEN side, by its corner
  { x: 470, y: 300, s: 120, r: -12 }, // on the lid
];
const STICKER_BORDER = 7;

function stickerCanvas(img, size) {
  const k = size / Math.max(img.width, img.height);
  const w = Math.round(img.width * k);
  const h = Math.round(img.height * k);
  const pad = STICKER_BORDER + 2;
  const c = document.createElement("canvas");
  c.width = w + pad * 2;
  c.height = h + pad * 2;
  const ctx = c.getContext("2d");
  // The border: the piece's silhouette in white, stamped in a ring.
  const sil = document.createElement("canvas");
  sil.width = w;
  sil.height = h;
  const sctx = sil.getContext("2d");
  sctx.drawImage(img, 0, 0, w, h);
  sctx.globalCompositeOperation = "source-in";
  sctx.fillStyle = "#fff";
  sctx.fillRect(0, 0, w, h);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
    ctx.drawImage(sil, pad + Math.cos(a) * STICKER_BORDER, pad + Math.sin(a) * STICKER_BORDER);
  }
  ctx.drawImage(sil, pad, pad); // fill any pinholes inside the ring
  ctx.drawImage(img, pad, pad, w, h);
  return c;
}

// How well a cut-out reads as a sticker: colour and depth of tone over its
// opaque pixels. A white sneaker or a clear figure on a white border is a
// blank patch from across the room; a red jacket isn't.
function stickerPunch(img) {
  const n = 48;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, n, n);
  const px = ctx.getImageData(0, 0, n, n).data;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 200) continue;
    const hi = Math.max(px[i], px[i + 1], px[i + 2]);
    const lo = Math.min(px[i], px[i + 1], px[i + 2]);
    sum += (hi - lo) + (255 - hi) * 0.6;
    count++;
  }
  return count ? sum / count : 0;
}

const STICKERS_PER_BOX = 4;

async function buildStickerTexture(tierKey, base) {
  const urls = await stickerArt.get(tierKey)();
  const loaded = (await Promise.all(urls.map(loadImage))).filter(Boolean);
  if (!loaded.length || !base?.image) return null;
  // The punchiest few, kept in the order they came (most valuable first).
  const keep = new Set(
    loaded
      .map((img) => ({ img, punch: stickerPunch(img) }))
      .sort((a, b) => b.punch - a.punch)
      .slice(0, STICKERS_PER_BOX)
      .map(({ img }) => img)
  );
  const imgs = loaded.filter((img) => keep.has(img));

  const size = base.image.width || 1024;
  const k = size / 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(base.image, 0, 0, size, size);

  STICKER_SPOTS.forEach((spot, i) => {
    const sticker = stickerCanvas(imgs[i % imgs.length], spot.s * k);
    ctx.save();
    ctx.translate(spot.x * k, spot.y * k);
    ctx.rotate((spot.r * Math.PI) / 180);
    ctx.shadowColor = "rgba(40, 22, 8, 0.35)";
    ctx.shadowBlur = 5 * k;
    ctx.shadowOffsetY = 2 * k;
    ctx.drawImage(sticker, -sticker.width / 2, -sticker.height / 2);
    ctx.restore();
  });

  // Same sampling, orientation and colour space as the box's own texture,
  // just a new picture.
  const tex = base.clone();
  tex.source = new THREE.Source(canvas);
  tex.needsUpdate = true;
  return tex;
}

function odBaseMap(root) {
  let map = null;
  root.traverse((node) => {
    if (!map && node.isMesh && node.material?.map) map = node.material.map;
  });
  return map;
}

function stickerTextureFor(tierKey, baseModel) {
  if (!stickerArt.has(tierKey)) return Promise.resolve(null);
  if (!stickerTextures.has(tierKey)) {
    stickerTextures.set(
      tierKey,
      buildStickerTexture(tierKey, odBaseMap(baseModel)).catch(() => null)
    );
  }
  return stickerTextures.get(tierKey);
}

// The od box's outline with its Open clip played to the end, in the
// model's own space (before buildRig scales and centres it). Posed and put
// back: stopping the mixer restores every node it touched.
function measureOpenOutline(root, clips = []) {
  const clip = clips.find((c) => c.name === "Open");
  if (!clip) return null;
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  mixer.update(clip.duration);
  root.updateMatrixWorld(true);
  const outline = new THREE.Box3().setFromObject(root);
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  root.updateMatrixWorld(true);
  return outline;
}

// Shrinks the prop inside its frame until the open outline fits, keeping
// its floor where it was so it doesn't drift up the canvas. The camera sees
// about ±0.91 units across at the prop (fov 30° from ~3.4 away); 0.86 leaves
// a margin. Returns the zoom, so a caller can size its canvas up by the
// same factor and keep the box itself as big as before.
const FRAME_HALF = 0.86;
function fitForOpen(root, group, outline, bounds) {
  const s = root.scale.x;
  const cx = -root.position.x / s;
  const cy = -root.position.y / s;
  const halfWide = Math.max(cx - outline.min.x, outline.max.x - cx) * s;
  const top = (outline.max.y - cy) * s;
  const bodyH = bounds.maxY - bounds.minY;
  const zoom = Math.min(1, FRAME_HALF / halfWide, (FRAME_HALF + bodyH / 2) / (top + bodyH / 2));
  group.scale.setScalar(zoom);
  group.position.y = -(1 - zoom) * (bodyH / 2);
  return zoom;
}

function configureRenderer(renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.7;
}

const snapshotPromises = new Map(); // "kind:tierKey" -> Promise<dataURL>
/**
 * Renders one closed, front-facing box (or printer) offscreen and returns a
 * PNG data URL. Used to paint the scrolling reel with the *exact* same
 * model/angle/lighting (and, for boxes, tier skin) that the live 3D viewers
 * use, so landing on the 3 slots feels like the same prop coming to a stop
 * rather than a swap to different artwork. Cached per tier/kind.
 */
export function getBoxSnapshot(tierKey = "", kind = "box") {
  const cacheKey = `${kind}:${tierKey}`;
  if (!snapshotPromises.has(cacheKey)) {
    snapshotPromises.set(
      cacheKey,
      loadModelFor(kind).then(async (baseModel) => {
        const size = 320;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        configureRenderer(renderer);
        renderer.setSize(size, size, false);

        const root = baseModel.clone(true);
        if (kind === "box") applyTierSkin(root, tierKey, await collageFor(tierKey));
        if (kind === "od") settleOdMaterials(root, await stickerTextureFor(tierKey, baseModel));
        // Snapshot always represents the closed/idle state (same as the
        // box's lid never being open in it) — the paper sheet doesn't need
        // to exist in this scene at all.
        const { scene, camera } = buildRig(root);
        applyStudioEnvironment(scene, renderer);
        camera.aspect = 1;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);

        const dataUrl = canvas.toDataURL("image/png");
        // dispose() frees three's GPU objects but not the WebGL context —
        // that waits for garbage collection, and a browser allows ~16 live.
        // Losing it explicitly hands the slot back now.
        renderer.forceContextLoss();
        renderer.dispose();
        return dataUrl;
      })
    );
  }
  return snapshotPromises.get(cacheKey);
}

/**
 * Mounts one interactive, self-rotating prop on `canvas` — a box (optionally
 * skinned to a crate: "sneakers"/"streetwear"/"collectibles") or, for kind:"printer", the
 * Stocks tier's printer. Same idle-spin/hover/facing dynamics either way;
 * only what happens on open() differs — a box's lid hinges open, the
 * printer instead feeds a sheet of "paper" out (no lid to open). A prop
 * whose .open() is never called just idles and spins forever — that's how
 * the decorative, always-closed tier props on the category cards are
 * built, not a separate component.
 * Returns a small controller: { setPaused, open, reset, dispose }.
 */
// `headroom` (a share of the canvas width) extends the view straight up
// without moving or resizing the prop: the square framing is kept and the
// extra height is sky above it. For a box that opens where its lid would
// otherwise swing out past the top edge of a square canvas.
// `fitOpen` (od box only) frames for the box *open*, not shut: its flaps
// fold out past its own sides, and a viewer that's going to open would
// otherwise cut them off at the canvas edge. See fitForOpen.
// `syncSpin` (default on) starts the box at the shared idle angle; off, it
// starts face-on — for the round, where it takes over from a face-on still.
export async function createBoxViewer(canvas, tierKey = "", kind = "box", { headroom = 0, fitOpen = false, syncSpin = true } = {}) {
  const baseModel = await loadModelFor(kind);
  const root = baseModel.clone(true);
  if (kind === "box") applyTierSkin(root, tierKey, await collageFor(tierKey));
  if (kind === "od") settleOdMaterials(root, await stickerTextureFor(tierKey, baseModel));
  const openOutline = kind === "od" && fitOpen ? measureOpenOutline(root, baseModel.userData.clips) : null;
  const { scene, camera, group, lid, bounds } = buildRig(root);
  const zoom = openOutline ? fitForOpen(root, group, openOutline, bounds) : 1;
  if (syncSpin) group.rotation.y = sharedIdleAngle();
  // While idling, the angle is read off the shared clock plus this offset,
  // not added up frame by frame, so boxes stay in step however unevenly
  // each one draws. Re-taken whenever idling resumes, so a box picks up
  // exactly where hover or an open left it.
  let idleOffset = 0;
  let idling = false;

  // The od box animates its own flaps from baked clips rather than having
  // one hinge swung by hand: Idle loops while it waits, Open plays once and
  // holds on its last frame.
  let mixer = null;
  let clips = null;
  let openAction = null;
  if (kind === "od") {
    mixer = new THREE.AnimationMixer(root);
    const byName = (n) => (baseModel.userData.clips || []).find((c) => c.name === n);
    clips = { idle: byName("Idle"), open: byName("Open") };
    if (clips.idle) mixer.clipAction(clips.idle).play();
  }

  let paper = null;
  if (kind === "printer") {
    paper = buildPaperSheet(bounds);
    paper.sheet.visible = false;
    group.add(paper.sheet);
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  configureRenderer(renderer);
  if (kind === "od") renderer.toneMappingExposure = OD_EXPOSURE;
  applyStudioEnvironment(scene, renderer);

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    if (headroom > 0) {
      // Frame the prop as in a w x w square, then widen the window upward
      // to the canvas's full height: a view offset above the square.
      camera.aspect = 1;
      camera.setViewOffset(w, w, 0, w - h, w, h);
    } else {
      camera.aspect = w / h;
    }
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  let paused = false;
  let facing = false; // easing back to forward-facing (0), then holding there
  let spinning = null; // { start, ms, from, done } while spin() turns a full lap
  let closing = null; // { start, ms, from, done } while close() folds it shut
  let opening = false;
  let openStartTime = 0;
  let openProgress = 0; // 0 closed -> 1 open, latched once finished
  let running = true;
  let lastT = performance.now();
  const openDuration =
    kind === "printer" ? PRINT_DURATION_MS : kind === "od" && clips?.open ? clips.open.duration * 1000 : OPEN_DURATION_MS;

  // Turns on round to face you — forward, never back the short way.
  function easeTowardZero(dt, speedMul) {
    const ahead = aheadToFront(group.rotation.y);
    if (ahead === 0) return;
    const step = Math.min(ahead, dt * FACE_SPEED * speedMul);
    group.rotation.y = step === ahead ? 0 : wrapAngle(group.rotation.y + step);
  }

  function frame(t) {
    if (!running) return;
    const dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;
    const wasIdling = idling;
    idling = false; // set again below if this frame idles

    if (spinning) {
      // On round from wherever it was, at least half a lap more, easing in
      // and out, landing facing forward.
      const p = Math.min((t - spinning.start) / spinning.ms, 1);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      group.rotation.y = spinning.from + spinning.turn * e;
      if (p >= 0.5 && spinning.onHalf) {
        spinning.onHalf();
        spinning.onHalf = null;
      }
      if (p >= 1) {
        group.rotation.y = 0;
        const done = spinning.done;
        spinning = null;
        done();
      }
    } else if (opening) {
      // Always finish the turn to forward-facing while it opens, so every
      // pick plays out the same way no matter what angle it was spinning
      // at when it was chosen.
      easeTowardZero(dt, 1.6);
      const elapsed = t - openStartTime;
      const p = Math.min(elapsed / openDuration, 1);
      if (kind === "printer") {
        const eased = 1 - Math.pow(1 - p, 3);
        openProgress = eased;
        paper.sheet.position.y = paper.parkedY + (paper.printedY - paper.parkedY) * eased;
      } else if (kind === "od") {
        openProgress = p; // the clip itself carries the easing
      } else {
        openProgress = easeOutBack(p);
        if (lid) lid.rotation.x = THREE.MathUtils.degToRad(LID_OPEN_DEG) * openProgress;
      }
      if (p >= 1) {
        opening = false;
        openProgress = 1;
        group.rotation.y = 0;
      }
    } else if (openProgress === 0) {
      if (facing) {
        easeTowardZero(dt, 1);
      } else if (!paused) {
        if (!wasIdling) idleOffset = group.rotation.y - sharedIdleAngle();
        idling = true;
        group.rotation.y = wrapAngle(sharedIdleAngle() + idleOffset);
      }
    }

    if (mixer) {
      // Open runs on the clock, not on frames: its pose is a pure function
      // of time since open(), so the flaps are exactly as far open as the
      // burst timed off the same moment expects, however few frames a slow
      // or busy page manages to draw. Idle, which nothing waits on, just
      // ticks along with the frames. Closing is the same clip run backwards.
      if (closing) {
        const p = Math.min((t - closing.start) / closing.ms, 1);
        openAction.time = closing.from * (1 - p);
        mixer.update(0);
        if (p >= 1) {
          // Back to rest, and the idle loop picks up again.
          mixer.stopAllAction();
          openAction = null;
          openProgress = 0;
          if (clips.idle) mixer.clipAction(clips.idle).reset().play();
          const done = closing.done;
          closing = null;
          done();
        }
      } else if (openAction) {
        openAction.time = Math.min((t - openStartTime) / 1000, clips.open.duration);
        mixer.update(0);
      } else {
        mixer.update(dt);
      }
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    // Hovering eases the box back to facing forward and holds it there;
    // never triggers the open animation on its own.
    setPaused(v) {
      paused = v;
      facing = v;
    },
    // Turns on round, forward, at least half a lap more, ending face-on
    // and holding there. Resolves when it lands; `onHalf` runs at the
    // lap's halfway point, side-on and moving fastest, by the lap's own
    // progress rather than a timer, so a slow frame can't push it late.
    spin(ms = 1400, { onHalf = null } = {}) {
      opening = false;
      facing = true;
      paused = true;
      return new Promise((resolve) => {
        spinning?.done();
        const from = wrapAngle(group.rotation.y);
        const ahead = aheadToFront(from);
        spinning = { start: performance.now(), ms, from, turn: ahead < Math.PI ? ahead + TAU : ahead, onHalf, done: resolve };
      });
    },
    // Folds an open box shut again (the od box's Open clip in reverse; the
    // shoebox lid just drops). Resolves once it's closed; at once if it
    // already is.
    close(ms = 1000) {
      if (kind === "od" && openAction) {
        opening = false;
        openProgress = 1; // no idle spin while it folds
        return new Promise((resolve) => {
          closing?.done();
          // A box only part-way open closes in proportionally less time.
          const from = openAction.time;
          closing = { start: performance.now(), ms: Math.max(1, ms * Math.min(1, from / clips.open.duration)), from, done: resolve };
        });
      }
      opening = false;
      openProgress = 0;
      if (lid) lid.rotation.x = 0;
      return Promise.resolve();
    },
    // The od box in another crate's stickers, without a new viewer: fetch
    // it ahead with loadSkin, put it on with setSkin (instant once loaded).
    loadSkin(skinKey) {
      return kind === "od" ? stickerTextureFor(skinKey, baseModel) : Promise.resolve(null);
    },
    async setSkin(skinKey) {
      if (kind !== "od") return;
      const map = (await stickerTextureFor(skinKey, baseModel)) ?? odBaseMap(baseModel);
      root.traverse((node) => {
        if (node.isMesh && node.material) node.material.map = map;
      });
    },
    // Printer only: print this certificate on the sheet before it feeds out.
    setPaper(imageUrl) {
      if (paper && imageUrl) paper.print(imageUrl);
    },
    // Only ever called from an explicit click handler.
    open() {
      if (opening || closing || openProgress === 1) return;
      opening = true;
      facing = false;
      openStartTime = performance.now();
      if (paper) paper.sheet.visible = true;
      if (mixer && clips?.open) {
        if (clips.idle) mixer.clipAction(clips.idle).stop();
        openAction = mixer.clipAction(clips.open);
        openAction.reset();
        openAction.setLoop(THREE.LoopOnce, 1);
        openAction.clampWhenFinished = true;
        openAction.play();
      }
    },
    // How long after open() the box is open enough for something to come
    // out of it. The shoebox lid is out of the way almost at once; the od
    // box waits for its flaps to finish folding back, so nothing leaves
    // through a flap that's still closing over it.
    get mouthClearMs() {
      return kind === "od" ? openDuration * 0.92 : 250;
    },
    // How far fitOpen shrank the prop in its frame (1 = not at all).
    zoom,
    reset() {
      spinning?.done();
      spinning = null;
      closing?.done();
      closing = null;
      opening = false;
      facing = false;
      openProgress = 0;
      group.rotation.y = 0;
      if (lid) lid.rotation.x = 0;
      if (mixer) {
        mixer.stopAllAction();
        openAction = null;
        if (clips?.idle) mixer.clipAction(clips.idle).reset().play();
      }
      if (paper) {
        paper.sheet.visible = false;
        paper.sheet.position.y = paper.parkedY;
      }
    },
    dispose() {
      running = false;
      ro.disconnect();
      if (mixer) mixer.stopAllAction();
      // Without this every disposed viewer kept its context until GC. The
      // billboard alone swaps its crate every 7s, so a couple of minutes on
      // Home used up the browser's ~16 — after which three couldn't create
      // a renderer at all ("reading 'precision'") and the next 3D view on
      // any screen threw instead of drawing.
      renderer.forceContextLoss();
      renderer.dispose();
    },
  };
}
