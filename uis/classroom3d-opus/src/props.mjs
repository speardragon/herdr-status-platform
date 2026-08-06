/**
 * 교실 비품 — 교탁(1인칭 전경), 앞·뒤 칠판, 급훈 현수막, 벽시계, 사물함, 문, 화분.
 * 뒤 칠판과 시계는 텍스처를 앱이 갱신하므로 캔버스 핸들을 함께 돌려준다.
 */
import { box, plane, setShadow, standard } from './build.mjs';
import { BOARD, PODIUM, ROOM } from './layout.mjs';
import { ROOM_COLORS } from './palette.mjs';
import { canvasTexture } from './textures.mjs';

export function createProps(THREE, scene) {
  const group = new THREE.Group();
  group.name = 'props';
  scene.add(group);

  const frameMaterial = standard(THREE, ROOM_COLORS.boardFrame, { roughness: 0.72 });
  const slateMaterial = standard(THREE, ROOM_COLORS.slate, { roughness: 0.92 });

  const board = buildRearBoard(THREE, group, frameMaterial);
  const clock = buildClock(THREE, group);
  buildFrontBoard(THREE, group, frameMaterial, slateMaterial);
  buildPodium(THREE, group);
  buildLockers(THREE, group);
  buildDoor(THREE, group);
  buildPlants(THREE, group);

  setShadow(group, { cast: true, receive: true });
  return { group, board, clock };
}

/** 뒤 칠판 — 카메라 정면. 학급 현황을 분필로 적는 캔버스. */
function buildRearBoard(THREE, group, frameMaterial) {
  const { width, height, centerY } = BOARD.rear;
  const surface = canvasTexture(THREE, 1280, 420);
  const material = standard(THREE, 0xffffff, {
    map: surface.texture,
    roughness: 0.95,
    emissive: 0x0d1f18,
    emissiveIntensity: 0.35,
  });
  const z = ROOM.backZ + 0.04;
  box(THREE, group, frameMaterial, [width + 0.16, height + 0.16, 0.06], [0, centerY, z - 0.02], 'board-frame');
  const face = plane(THREE, group, material, [width, height], [0, centerY, z + 0.02], [0, 0, 0], 'board-face');
  // 분필 받이 + 분필·지우개
  box(THREE, group, frameMaterial, [width + 0.16, 0.05, 0.14], [0, centerY - height / 2 - 0.09, z + 0.06], 'chalk-tray');
  const chalk = standard(THREE, 0xfaf6ec, { roughness: 0.85 });
  box(THREE, group, chalk, [0.09, 0.02, 0.02], [-1.1, centerY - height / 2 - 0.05, z + 0.08], 'chalk');
  box(THREE, group, chalk, [0.09, 0.02, 0.02], [-0.95, centerY - height / 2 - 0.05, z + 0.08], 'chalk');
  box(THREE, group, standard(THREE, 0x3d4a55), [0.18, 0.05, 0.08], [1.3, centerY - height / 2 - 0.05, z + 0.08], 'eraser');

  buildBanner(THREE, group, centerY + height / 2 + 0.34, z);
  return { ...surface, face };
}

/** 급훈 현수막 — 교실 정체성. 정적 텍스처. */
function buildBanner(THREE, group, y, z) {
  const { ctx, texture } = canvasTexture(THREE, 1024, 128);
  ctx.fillStyle = '#7d1f2b';
  ctx.fillRect(0, 0, 1024, 128);
  ctx.strokeStyle = 'rgba(255,225,170,0.85)';
  ctx.lineWidth = 5;
  ctx.strokeRect(12, 12, 1000, 104);
  ctx.fillStyle = '#ffe9b8';
  ctx.font = '700 62px system-ui, "Apple SD Gothic Neo", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('급훈 · 막히면 손을 들자', 512, 68);
  const material = standard(THREE, 0xffffff, { map: texture, roughness: 0.85 });
  plane(THREE, group, material, [4.3, 0.54], [0, y, z + 0.01], [0, 0, 0], 'banner');
}

/** 벽시계 — 실제 시각으로 매초 갱신된다. */
function buildClock(THREE, group) {
  const surface = canvasTexture(THREE, 256, 256);
  const material = standard(THREE, 0xffffff, { map: surface.texture, roughness: 0.5, transparent: true });
  const z = ROOM.backZ + 0.07;
  box(THREE, group, standard(THREE, 0x3b4652), [0.62, 0.62, 0.06], [-1.9, 2.82, z - 0.02], 'clock-case');
  plane(THREE, group, material, [0.54, 0.54], [-1.9, 2.82, z + 0.02], [0, 0, 0], 'clock-face');
  return surface;
}

/** 앞 칠판 — 카메라 뒤(선생님 등 뒤)의 본 칠판. 교실을 닫아주는 역할. */
function buildFrontBoard(THREE, group, frameMaterial, slateMaterial) {
  const { width, height, centerY } = BOARD.front;
  const z = ROOM.frontZ - 0.05;
  box(THREE, group, frameMaterial, [width + 0.16, height + 0.16, 0.06], [0, centerY, z + 0.02], 'front-board-frame');
  plane(THREE, group, slateMaterial, [width, height], [0, centerY, z], [0, Math.PI, 0], 'front-board');
  box(THREE, group, frameMaterial, [width + 0.16, 0.05, 0.14], [0, centerY - height / 2 - 0.09, z - 0.05], 'front-tray');
}

/** 교탁 — 화면 하단에 걸쳐 1인칭 시점을 만든다. */
function buildPodium(THREE, group) {
  const [x, , z] = PODIUM.position;
  const bodyMaterial = standard(THREE, 0xb98a5c, { roughness: 0.68 });
  const topMaterial = standard(THREE, 0xd8b183, { roughness: 0.55 });
  const podium = new THREE.Group();
  podium.position.set(x, 0, z);
  podium.rotation.y = 0.04;
  group.add(podium);

  box(THREE, podium, bodyMaterial, [PODIUM.width, PODIUM.height - 0.06, PODIUM.depth], [0, (PODIUM.height - 0.06) / 2, 0], 'podium-body');
  box(THREE, podium, topMaterial, [PODIUM.width + 0.1, 0.05, PODIUM.depth + 0.09], [0, PODIUM.height, 0], 'podium-top');
  box(THREE, podium, standard(THREE, 0x9a7048, { roughness: 0.7 }), [PODIUM.width - 0.12, 0.02, PODIUM.depth - 0.1], [0, 0.42, 0.02], 'podium-shelf');
  // 교탁 위 소품 — 출석부·분필통·주전자 컵
  box(THREE, podium, standard(THREE, 0xb03a3a, { roughness: 0.6 }), [0.3, 0.035, 0.22], [-0.36, PODIUM.height + 0.04, 0.02], 'roll-book');
  box(THREE, podium, standard(THREE, 0xf3ece0, { roughness: 0.8 }), [0.26, 0.03, 0.2], [-0.34, PODIUM.height + 0.07, 0.05], 'papers');
  box(THREE, podium, standard(THREE, 0x36434f, { roughness: 0.5, metalness: 0.3 }), [0.13, 0.1, 0.13], [0.42, PODIUM.height + 0.07, 0.0], 'chalk-box');
  box(THREE, podium, standard(THREE, 0xfaf6ec), [0.02, 0.11, 0.02], [0.4, PODIUM.height + 0.12, 0.01], 'chalk-stick');
  box(THREE, podium, standard(THREE, 0x2f6f5d, { roughness: 0.45 }), [0.09, 0.13, 0.09], [0.13, PODIUM.height + 0.09, 0.06], 'cup');
}

/** 오른쪽 벽 사물함 — 깊이를 만드는 반복 구조물. */
function buildLockers(THREE, group) {
  const bodyMaterial = standard(THREE, 0xcfd6dc, { roughness: 0.62, metalness: 0.18 });
  const doorMaterial = standard(THREE, 0xa9b6c2, { roughness: 0.55, metalness: 0.22 });
  const handleMaterial = standard(THREE, ROOM_COLORS.metal, { roughness: 0.35, metalness: 0.6 });
  const x = ROOM.halfWidth - 0.22;
  for (let bank = 0; bank < 4; bank++) {
    const z = -4.6 - bank * 1.66;
    box(THREE, group, bodyMaterial, [0.42, 1.82, 1.6], [x, 0.91, z], 'locker-bank');
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 2; col++) {
        const dz = z + (col === 0 ? -0.4 : 0.4);
        const dy = 0.42 + row * 0.6;
        box(THREE, group, doorMaterial, [0.03, 0.54, 0.72], [x - 0.22, dy, dz], 'locker-door');
        box(THREE, group, handleMaterial, [0.03, 0.04, 0.11], [x - 0.25, dy, dz + 0.26], 'locker-handle');
      }
    }
  }
}

/** 앞쪽 오른벽의 미닫이 교실 문. */
function buildDoor(THREE, group) {
  const x = ROOM.halfWidth - 0.03;
  const frame = standard(THREE, 0x8a6a44, { roughness: 0.7 });
  const panel = standard(THREE, 0xe4d8c2, { roughness: 0.75 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xdcecf5, roughness: 0.25, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
  });
  const z = -1.1;
  box(THREE, group, frame, [0.08, 2.16, 1.12], [x, 1.08, z], 'door-frame');
  plane(THREE, group, panel, [0.94, 2.0], [x - 0.06, 1.0, z], [0, -Math.PI / 2, 0], 'door-panel');
  plane(THREE, group, glass, [0.72, 0.62], [x - 0.08, 1.52, z], [0, -Math.PI / 2, 0], 'door-glass');
}

/** 창가 화분 — 전경 깊이감과 색 대비. */
function buildPlants(THREE, group) {
  const potMaterial = standard(THREE, 0xa9613f, { roughness: 0.8 });
  const leafMaterial = standard(THREE, 0x3f7a41, { roughness: 0.7, flatShading: true });
  for (const [x, z, scale] of [[-4.6, -0.55, 1.1], [-4.6, -6.6, 0.9]]) {
    const plant = new THREE.Group();
    plant.position.set(x, 0, z);
    plant.scale.setScalar(scale);
    group.add(plant);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.26, 12), potMaterial);
    pot.position.y = 0.13;
    plant.add(pot);
    for (let leaf = 0; leaf < 7; leaf++) {
      const angle = (leaf / 7) * Math.PI * 2;
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.5 + (leaf % 3) * 0.13, 5), leafMaterial);
      blade.position.set(Math.cos(angle) * 0.08, 0.46 + (leaf % 3) * 0.06, Math.sin(angle) * 0.08);
      blade.rotation.set(Math.sin(angle) * 0.3, angle, Math.cos(angle) * -0.3);
      plant.add(blade);
    }
  }
}
