/**
 * 무대 — 렌더러·씬·카메라·환경맵·리사이즈·마우스 시차.
 * 카메라는 교탁 앞에 선 선생님의 눈이다: 위치는 고정, 마우스에 따라 미세하게만 움직인다.
 */
import { CAMERA } from './layout.mjs';
import { environmentTexture } from './textures.mjs';
import { clamp, damp } from './util.mjs';

const MAX_PIXEL_RATIO = 2;

export function createStage(THREE, container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.94;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x12161c);
  scene.fog = new THREE.Fog(0xd6cfbe, 11, 30);

  // 캔버스 그라데이션 → PMREM. 외부 HDR 없이 표준 재질에 부드러운 반사광을 준다.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const equirect = environmentTexture(THREE);
  scene.environment = pmrem.fromEquirectangular(equirect).texture;
  scene.environmentIntensity = 0.42;
  equirect.dispose();
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
  const home = new THREE.Vector3(...CAMERA.position);
  const target = new THREE.Vector3(...CAMERA.lookAt);
  camera.position.copy(home);
  camera.lookAt(target);

  const pointer = { x: 0, y: 0 };
  const eased = { x: 0, y: 0 };
  const lookTarget = target.clone();

  /** 세로로 긴 화면 보정량 — 0(가로) ~ 1(폰 세로). */
  let narrow = 0;

  const resize = () => {
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    // 좁은 화면에서는 화각을 넓히고 카메라를 뒤·위로 물려 교실이 잘리지 않게 한다.
    narrow = clamp((1 - camera.aspect) / 0.55, 0, 1);
    camera.fov = CAMERA.fov + narrow * 20;
    camera.updateProjectionMatrix();
  };
  resize();

  window.addEventListener('resize', resize);
  if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(container);

  window.addEventListener('pointermove', (event) => {
    pointer.x = clamp((event.clientX / window.innerWidth) * 2 - 1, -1, 1);
    pointer.y = clamp((event.clientY / window.innerHeight) * 2 - 1, -1, 1);
  });
  window.addEventListener('pointerleave', () => {
    pointer.x = 0;
    pointer.y = 0;
  });

  /** 시차 + 아주 느린 호흡 — 정지 화면이 아니라 "서 있는 사람"처럼 보이게. */
  const update = (elapsed, dt) => {
    const { parallax } = CAMERA;
    eased.x = damp(eased.x, pointer.x, parallax.lerp, dt);
    eased.y = damp(eased.y, pointer.y, parallax.lerp, dt);
    const breath = Math.sin(elapsed * 0.55) * 0.012;
    camera.position.set(
      home.x + eased.x * parallax.x,
      home.y - eased.y * parallax.y + breath + narrow * 0.14,
      home.z + Math.cos(elapsed * 0.37) * 0.01 + narrow * 0.7,
    );
    lookTarget.set(
      target.x + eased.x * parallax.look,
      target.y - eased.y * parallax.look * 0.5 - narrow * 0.34,
      target.z,
    );
    camera.lookAt(lookTarget);
  };

  const render = () => renderer.render(scene, camera);

  return { renderer, scene, camera, update, render, resize };
}
