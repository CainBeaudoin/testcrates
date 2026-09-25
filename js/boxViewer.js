import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

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

function loadModelFor(kind) {
  return kind === "printer" ? loadPrinterModel() : loadModel();
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

// Shortest signed distance from `angle` back to 0 (facing forward), so easing
// always turns the short way round rather than spinning back past a full lap.
function angleToZero(angle) {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Shared scene/camera/lighting setup so the reel snapshot and the live,
// interactive viewers are pixel-for-pixel the same shot — that's what makes
// the reel-to-slot handoff read as the same box rather than a swap. Works
// for any single loaded model (box or printer) since it only reasons about
// the model's own bounding box.
function buildRig(root) {
  const lid = root.getObjectByName(LID_NODE_NAME);

  const box = new THREE.Box3().setFromObject(root);
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
        // Snapshot always represents the closed/idle state (same as the
        // box's lid never being open in it) — the paper sheet doesn't need
        // to exist in this scene at all.
        const { scene, camera } = buildRig(root);
        applyStudioEnvironment(scene, renderer);
        camera.aspect = 1;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);

        const dataUrl = canvas.toDataURL("image/png");
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
export async function createBoxViewer(canvas, tierKey = "", kind = "box") {
  const baseModel = await loadModelFor(kind);
  const root = baseModel.clone(true);
  if (kind === "box") applyTierSkin(root, tierKey, await collageFor(tierKey));
  const { scene, camera, group, lid, bounds } = buildRig(root);

  let paper = null;
  if (kind === "printer") {
    paper = buildPaperSheet(bounds);
    paper.sheet.visible = false;
    group.add(paper.sheet);
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  configureRenderer(renderer);
  applyStudioEnvironment(scene, renderer);

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

  let paused = false;
  let facing = false; // easing back to forward-facing (0), then holding there
  let opening = false;
  let openStartTime = 0;
  let openProgress = 0; // 0 closed -> 1 open, latched once finished
  let running = true;
  let lastT = performance.now();
  const openDuration = kind === "printer" ? PRINT_DURATION_MS : OPEN_DURATION_MS;

  function easeTowardZero(dt, speedMul) {
    const current = angleToZero(group.rotation.y);
    if (current === 0) return;
    const step = Math.min(Math.abs(current), dt * FACE_SPEED * speedMul);
    group.rotation.y = current - Math.sign(current) * step;
  }

  function frame(t) {
    if (!running) return;
    const dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;

    if (opening) {
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
        group.rotation.y += dt * IDLE_SPEED;
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
    // Printer only: print this certificate on the sheet before it feeds out.
    setPaper(imageUrl) {
      if (paper && imageUrl) paper.print(imageUrl);
    },
    // Only ever called from an explicit click handler.
    open() {
      if (opening || openProgress === 1) return;
      opening = true;
      facing = false;
      openStartTime = performance.now();
      if (paper) paper.sheet.visible = true;
    },
    reset() {
      opening = false;
      facing = false;
      openProgress = 0;
      group.rotation.y = 0;
      if (lid) lid.rotation.x = 0;
      if (paper) {
        paper.sheet.visible = false;
        paper.sheet.position.y = paper.parkedY;
      }
    },
    dispose() {
      running = false;
      ro.disconnect();
      renderer.dispose();
    },
  };
}
