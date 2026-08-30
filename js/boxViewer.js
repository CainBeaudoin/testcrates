import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_URL = "assets/models/nike_shoe_box/scene.gltf";
const LID_NODE_NAME = "Plane_Plane_002_Material_001"; // hinge pivot baked into the source animation
const LID_OPEN_DEG = -118; // extracted from the model's own open-lid animation clip
const OPEN_DURATION_MS = 700;
const IDLE_SPEED = 0.45; // rad/s

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

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
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

/**
 * Mounts one interactive, self-rotating box on `canvas`.
 * Returns a small controller: { setPaused, open, reset, dispose }.
 */
export async function createBoxViewer(canvas) {
  const baseModel = await loadModel();
  const root = baseModel.clone(true);
  const lid = root.getObjectByName(LID_NODE_NAME);

  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const scale = 1.7 / Math.max(size.x, size.y, size.z);

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

  const ambient = new THREE.AmbientLight(0xffffff, 0.65);
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(2.5, 4, 3);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45);
  fill.position.set(-3, 1.2, -1.5);
  const rim = new THREE.DirectionalLight(0xffffff, 0.9);
  rim.position.set(-1.5, 2.2, -3);
  scene.add(ambient, key, fill, rim);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

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
  let opening = false;
  let openStartTime = 0;
  let openProgress = 0; // 0 closed -> 1 open, latched once finished
  let running = true;
  let lastT = performance.now();

  function frame(t) {
    if (!running) return;
    const dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;

    if (!paused && openProgress === 0) {
      group.rotation.y += dt * IDLE_SPEED;
    }

    if (opening) {
      const elapsed = t - openStartTime;
      const p = Math.min(elapsed / OPEN_DURATION_MS, 1);
      openProgress = easeOutBack(p);
      if (lid) lid.rotation.x = THREE.MathUtils.degToRad(LID_OPEN_DEG) * openProgress;
      if (p >= 1) {
        opening = false;
        openProgress = 1;
      }
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    // Hovering pauses the slow idle spin; never triggers the open animation.
    setPaused(v) {
      paused = v;
    },
    // Only ever called from an explicit click handler.
    open() {
      if (opening || openProgress === 1) return;
      opening = true;
      openStartTime = performance.now();
    },
    reset() {
      opening = false;
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
