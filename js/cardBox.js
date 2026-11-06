// The Chosen Card Box: the small sealed cube that can come out of a drop.
// Deliberately not the crate's model: a cube, a third of the presence, wrapped
// in tape and stuck with card backs. Built here rather than loaded, so its two
// lid flaps are just hinges. Art in assets/prizes/chosen-cards (promo/cards
// generates it).

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const ART = "assets/prizes/chosen-cards";
const WALL = 0.018;
const FLAP_OPEN = THREE.MathUtils.degToRad(205); // up, over, and drooping past the side
const OPEN_MS = 800;
const SHAKE_MS = 520;
const IDLE_SPEED = 0.5; // radians per second

let artPromise = null;
function loadArt() {
  if (!artPromise) {
    const loader = new THREE.TextureLoader();
    const load = (name) =>
      loader.loadAsync(`${ART}/${name}.webp`).then((t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        return t;
      });
    artPromise = Promise.all(["cube-side-a", "cube-side-b", "cube-top"].map(load));
  }
  return artPromise;
}

const printed = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.62, metalness: 0.05, envMapIntensity: 0.9 });

// One flap: half the lid, hinged at its outer edge. side -1 is the flap whose
// hinge is on the left. Its top shows that half of the lid art, so the tape
// running across the seam is cut in two when it opens.
function makeFlap(side, topMap, inner, edge) {
  const geo = new THREE.BoxGeometry(0.5, WALL, 1);
  const uv = geo.attributes.uv;
  // BoxGeometry's vertices run 4 per face: +x, -x, +y, ... so +y is 8-11.
  for (let i = 8; i < 12; i++) uv.setX(i, uv.getX(i) * 0.5 + (side < 0 ? 0 : 0.5));
  const mesh = new THREE.Mesh(geo, [edge, edge, printed(topMap), inner, edge, edge]);
  mesh.position.x = -side * 0.25;
  const hinge = new THREE.Group();
  hinge.position.set(side * 0.5, 0.5, 0);
  hinge.add(mesh);
  return hinge;
}

function buildCube([sideA, sideB, top]) {
  const inner = new THREE.MeshStandardMaterial({ color: 0x1b1b22, roughness: 0.9 });
  const edge = new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.8 });
  const cube = new THREE.Group();
  const wall = (map, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, WALL), [edge, edge, edge, edge, printed(map), inner]);
    m.position.set(x, 0, z);
    m.rotation.y = ry;
    cube.add(m);
  };
  wall(sideA, 0, 0.5, 0);
  wall(sideB, 0.5, 0, Math.PI / 2);
  wall(sideA, 0, -0.5, Math.PI);
  wall(sideB, -0.5, 0, -Math.PI / 2);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1, WALL, 1), inner);
  floor.position.y = -0.5;
  cube.add(floor);
  const flaps = [makeFlap(-1, top, inner, edge), makeFlap(1, top, inner, edge)];
  cube.add(...flaps);
  return { cube, flaps };
}

function buildScene(cube, renderer) {
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(2.5, 4, 3);
  const fill = new THREE.DirectionalLight(0xffffff, 0.9);
  fill.position.set(-3, 1.2, -1.5);
  const rim = new THREE.DirectionalLight(0xffffff, 1.6);
  rim.position.set(-1.5, 2.2, -3);
  scene.add(new THREE.AmbientLight(0xffffff, 1.3), key, fill, rim, cube);
  return scene;
}

function configure(renderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
}

function makeCamera() {
  // `distance` sets how small the cube sits in its frame: there's room left
  // for the flaps, and it should read as a little box, not another crate.
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  camera.position.set(0, 2.1, 4.6);
  camera.lookAt(0, 0.04, 0);
  return camera;
}

/** Spins until open() is called. Returns { open, mouthClearMs, dispose }. */
export async function createCardBoxViewer(canvas) {
  const { cube, flaps } = buildCube(await loadArt());
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  configure(renderer);
  const scene = buildScene(cube, renderer);
  const camera = makeCamera();
  cube.rotation.y = -0.6;

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  let running = true;
  let openAt = null;
  let last = performance.now();
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  function frame(t) {
    if (!running) return;
    const dt = Math.min((t - last) / 1000, 0.05);
    last = t;
    if (openAt === null) {
      cube.rotation.y += dt * IDLE_SPEED;
    } else {
      const since = t - openAt;
      // A rattle first, as if something's trying to get out, then the tape gives.
      const shake = Math.min(since / SHAKE_MS, 1);
      cube.rotation.z = shake < 1 ? Math.sin(since * 0.05) * 0.05 * (1 - shake) : 0;
      const p = easeOut(Math.min(Math.max(0, since - SHAKE_MS) / OPEN_MS, 1));
      flaps[0].rotation.z = -FLAP_OPEN * p;
      flaps[1].rotation.z = FLAP_OPEN * p;
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    open() {
      if (openAt === null) openAt = performance.now();
    },
    mouthClearMs: SHAKE_MS + OPEN_MS * 0.7,
    dispose() {
      running = false;
      ro.disconnect();
      renderer.forceContextLoss();
      renderer.dispose();
    },
  };
}

/** One closed box on a transparent canvas: promo/cards makes the item photo with it. */
export async function renderCardBoxStill(size, yaw = -0.6, distance = 1) {
  const { cube } = buildCube(await loadArt());
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  configure(renderer);
  const scene = buildScene(cube, renderer);
  const camera = makeCamera();
  camera.position.multiplyScalar(distance);
  cube.rotation.y = yaw;
  renderer.render(scene, camera);
  return canvas;
}
