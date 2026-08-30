import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const MODEL_URL = "assets/models/nike_shoe_box/scene.gltf";
const LID_NODE_NAME = "Plane_Plane_002_Material_001"; // hinge pivot baked into the source animation
const LID_OPEN_DEG = -118; // extracted from the model's own open-lid animation clip
const OPEN_DURATION_MS = 700;
const IDLE_SPEED = 0.45; // rad/s
const FACE_SPEED = 7; // rad/s easing back to forward-facing (0) on hover/open

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

// Bronze/Silver/Gold "skins" — same hex family as the tier badges elsewhere
// in the UI. Replaces the model's own branded texture with a flat metallic
// tint per tier, rather than multiplying a color over it (multiplying a
// grayscale tint like silver over the existing orange-toned texture reads
// muddy, not metallic). High metalness + low roughness for a genuine
// mirror-like/chrome look — needs a real environment map to reflect
// (see applyStudioEnvironment), or a metal this shiny just reads as flat
// black with no light source to bounce.
const TIER_SKINS = {
  bronze: { color: 0xd0895a, metalness: 1, roughness: 0.22 },
  silver: { color: 0xc7ccd6, metalness: 1, roughness: 0.1 },
  gold: { color: 0xf0c14b, metalness: 1, roughness: 0.14 },
};

// Materials are shared by reference across clone(true) instances, so this
// clones each mesh's material before tinting it — otherwise skinning one
// box would repaint every other box sharing that base model.
function applyTierSkin(root, tierKey) {
  const skin = TIER_SKINS[tierKey];
  if (!skin) return;
  root.traverse((node) => {
    if (!node.isMesh || !node.material) return;
    const mat = node.material.clone();
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

function makeShadowTexture() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, "rgba(0,0,0,0.5)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// Shared scene/camera/lighting setup so the reel snapshot and the live,
// interactive viewers are pixel-for-pixel the same shot — that's what makes
// the reel-to-slot handoff read as the same box rather than a swap.
function buildRig(root) {
  const lid = root.getObjectByName(LID_NODE_NAME);

  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  // Framing has to fit the box's worst-case silhouette while it's idly
  // spinning around Y, not just its resting front-on footprint — a
  // rectangular box rotated to its diagonal projects wider than either
  // side alone, which is what was clipping the corners mid-spin.
  const horizontalDiagonal = Math.hypot(size.x, size.z);
  const scale = 1.7 / Math.max(horizontalDiagonal, size.y);

  root.scale.setScalar(scale);
  root.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

  const group = new THREE.Group();
  group.add(root);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = box.min.y * scale - center.y * scale - 0.02;
  group.add(shadow);

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

  return { scene, camera, group, lid };
}

function configureRenderer(renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.7;
}

const snapshotPromises = new Map(); // tierKey (or "" for unskinned) -> Promise<dataURL>
/**
 * Renders one closed, front-facing box offscreen and returns a PNG data URL.
 * Used to paint the scrolling reel with the *exact* same box/angle/lighting
 * (and, now, tier skin) that the live 3D viewers use, so landing on the 3
 * slots feels like the same boxes coming to a stop rather than a swap to
 * different artwork. Cached per tier.
 */
export function getBoxSnapshot(tierKey = "") {
  if (!snapshotPromises.has(tierKey)) {
    snapshotPromises.set(
      tierKey,
      loadModel().then((baseModel) => {
        const size = 320;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        configureRenderer(renderer);
        renderer.setSize(size, size, false);

        const root = baseModel.clone(true);
        applyTierSkin(root, tierKey);
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
  return snapshotPromises.get(tierKey);
}

/**
 * Mounts one interactive, self-rotating box on `canvas`, optionally skinned
 * to a tier ("bronze"/"silver"/"gold"). A box whose `.open()` is never
 * called just idles and spins forever — that's how the decorative,
 * always-closed tier boxes on the category cards are built, not a separate
 * component.
 * Returns a small controller: { setPaused, open, reset, dispose }.
 */
export async function createBoxViewer(canvas, tierKey = "") {
  const baseModel = await loadModel();
  const root = baseModel.clone(true);
  applyTierSkin(root, tierKey);
  const { scene, camera, group, lid } = buildRig(root);

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
      // Always finish the turn to forward-facing while the lid opens, so
      // every box opens the same way no matter what angle it was spinning
      // at when it was picked.
      easeTowardZero(dt, 1.6);
      const elapsed = t - openStartTime;
      const p = Math.min(elapsed / OPEN_DURATION_MS, 1);
      openProgress = easeOutBack(p);
      if (lid) lid.rotation.x = THREE.MathUtils.degToRad(LID_OPEN_DEG) * openProgress;
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
    // Only ever called from an explicit click handler.
    open() {
      if (opening || openProgress === 1) return;
      opening = true;
      facing = false;
      openStartTime = performance.now();
    },
    reset() {
      opening = false;
      facing = false;
      openProgress = 0;
      group.rotation.y = 0;
      if (lid) lid.rotation.x = 0;
    },
    dispose() {
      running = false;
      ro.disconnect();
      renderer.dispose();
    },
  };
}
