/**
 * 교실 껍데기 — 바닥·천장·벽·창문·창밖 배경·빛 기둥·천장 형광등.
 * 가구/칠판/교탁은 props.mjs가 담당한다.
 */
import { box, plane, setShadow, standard } from './build.mjs';
import { CEILING_LAMPS, ROOM, WINDOW } from './layout.mjs';
import { ROOM_COLORS } from './palette.mjs';
import { floorTexture, outsideTexture, shaftTexture, wallTexture } from './textures.mjs';

const DADO_Y = 1.05; // 하부 몰딩(걸레받이~허리 높이) 경계

export function createRoom(THREE, scene) {
  const group = new THREE.Group();
  group.name = 'room';
  scene.add(group);

  const depth = ROOM.frontZ - ROOM.backZ;
  const centerZ = (ROOM.frontZ + ROOM.backZ) / 2;
  const width = ROOM.halfWidth * 2;

  const floorMaterial = standard(THREE, ROOM_COLORS.floor, { map: floorTexture(THREE), roughness: 0.66 });
  const floor = plane(THREE, group, floorMaterial, [width, depth], [0, 0, centerZ], [-Math.PI / 2, 0, 0], 'floor');
  floor.receiveShadow = true;

  const ceilingMaterial = standard(THREE, ROOM_COLORS.ceiling, { roughness: 0.92 });
  plane(THREE, group, ceilingMaterial, [width, depth], [0, ROOM.height, centerZ], [Math.PI / 2, 0, 0], 'ceiling');

  const wallMaterial = standard(THREE, ROOM_COLORS.wallUpper, { map: wallTexture(THREE), roughness: 0.9 });
  const dadoMaterial = standard(THREE, ROOM_COLORS.wallLower, { roughness: 0.72 });

  // 뒷벽 / 앞벽
  plane(THREE, group, wallMaterial, [width, ROOM.height], [0, ROOM.height / 2, ROOM.backZ], [0, 0, 0], 'wall-back');
  plane(THREE, group, dadoMaterial, [width, DADO_Y], [0, DADO_Y / 2, ROOM.backZ + 0.01], [0, 0, 0], 'dado-back');
  plane(THREE, group, wallMaterial, [width, ROOM.height], [0, ROOM.height / 2, ROOM.frontZ], [0, Math.PI, 0], 'wall-front');

  // 오른쪽 벽(문·사물함 쪽) — 통짜
  plane(
    THREE, group, wallMaterial, [depth, ROOM.height],
    [ROOM.halfWidth, ROOM.height / 2, centerZ], [0, -Math.PI / 2, 0], 'wall-right',
  );
  plane(
    THREE, group, dadoMaterial, [depth, DADO_Y],
    [ROOM.halfWidth - 0.01, DADO_Y / 2, centerZ], [0, -Math.PI / 2, 0], 'dado-right',
  );

  buildWindowWall(THREE, group, { depth, centerZ, wallMaterial, dadoMaterial });
  buildOutside(THREE, group, centerZ);
  const shafts = buildLightShafts(THREE, group);
  const lamps = buildCeilingLamps(THREE, group);

  setShadow(group, { receive: true });
  floor.receiveShadow = true;

  return { group, shafts, lamps };
}

/** 왼쪽 벽 — 창 3개를 남기고 벽면을 조각으로 채운다. */
function buildWindowWall(THREE, group, { depth, centerZ, wallMaterial, dadoMaterial }) {
  const x = -ROOM.halfWidth;
  const frameMaterial = standard(THREE, 0xf2f4f6, { roughness: 0.55 });
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xeaf4ff,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.18,
    transmission: 0.55,
    side: THREE.DoubleSide,
  });

  // 창 위/아래 띠
  plane(
    THREE, group, wallMaterial, [depth, ROOM.height - WINDOW.topY],
    [x, (ROOM.height + WINDOW.topY) / 2, centerZ], [0, Math.PI / 2, 0], 'wall-left-top',
  );
  plane(
    THREE, group, dadoMaterial, [depth, WINDOW.bottomY],
    [x, WINDOW.bottomY / 2, centerZ], [0, Math.PI / 2, 0], 'wall-left-bottom',
  );

  // 창 사이 기둥
  const edges = [ROOM.frontZ, ...WINDOW.centersZ.flatMap((z) => [z + WINDOW.width / 2, z - WINDOW.width / 2]), ROOM.backZ]
    .sort((a, b) => b - a);
  for (let i = 0; i < edges.length - 1; i += 2) {
    const from = edges[i];
    const to = edges[i + 1];
    const span = Math.abs(from - to);
    if (span < 0.02) continue;
    plane(
      THREE, group, wallMaterial, [span, WINDOW.topY - WINDOW.bottomY],
      [x, (WINDOW.topY + WINDOW.bottomY) / 2, (from + to) / 2], [0, Math.PI / 2, 0], 'wall-left-pier',
    );
  }

  for (const z of WINDOW.centersZ) {
    const height = WINDOW.topY - WINDOW.bottomY;
    const centerY = (WINDOW.topY + WINDOW.bottomY) / 2;
    plane(THREE, group, glassMaterial, [WINDOW.width - 0.1, height - 0.08], [x + 0.04, centerY, z], [0, Math.PI / 2, 0], 'glass');
    // 창틀 — 상하 가로대 + 중앙 세로대
    box(THREE, group, frameMaterial, [0.1, 0.09, WINDOW.width], [x + 0.06, WINDOW.bottomY, z], 'sill');
    box(THREE, group, frameMaterial, [0.09, 0.07, WINDOW.width], [x + 0.05, WINDOW.topY, z], 'window-head');
    box(THREE, group, frameMaterial, [0.08, height, 0.07], [x + 0.05, centerY, z], 'window-mullion');
    box(THREE, group, frameMaterial, [0.08, height, 0.06], [x + 0.05, centerY, z - WINDOW.width / 2], 'window-jamb');
    box(THREE, group, frameMaterial, [0.08, height, 0.06], [x + 0.05, centerY, z + WINDOW.width / 2], 'window-jamb');
    box(THREE, group, frameMaterial, [0.26, 0.06, WINDOW.width], [x + 0.2, WINDOW.bottomY - 0.02, z], 'window-shelf');
  }
}

/** 창밖 — 벽 밖에 세운 큰 배경판. 원근이 생겨 창이 "구멍"처럼 보인다. */
function buildOutside(THREE, group, centerZ) {
  const material = new THREE.MeshBasicMaterial({ map: outsideTexture(THREE), toneMapped: false });
  plane(THREE, group, material, [26, 12], [-ROOM.halfWidth - 3.4, 4.4, centerZ], [0, Math.PI / 2, 0], 'outside');
}

/**
 * 창 → 바닥으로 비스듬히 떨어지는 빛 기둥.
 * 카메라를 향한 가법 합성 판(빌보드 트릭)이라 비용이 거의 없다.
 */
function buildLightShafts(THREE, group) {
  const material = new THREE.MeshBasicMaterial({
    map: shaftTexture(THREE),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    opacity: 0.16,
    toneMapped: false,
  });
  return WINDOW.centersZ.map((z) => {
    const shaft = plane(
      THREE, group, material, [1.5, 4.4],
      [-3.35, 1.35, z + 0.25], [0, 0, -0.58], 'light-shaft',
    );
    shaft.renderOrder = 2;
    return shaft;
  });
}

/** 천장 형광등 — emissive 박스 + 갓. */
function buildCeilingLamps(THREE, group) {
  const housing = standard(THREE, 0xdfe4e8, { roughness: 0.5, metalness: 0.2 });
  const tube = standard(THREE, 0xffffff, { emissive: 0xfff6e2, emissiveIntensity: 2.4, roughness: 0.4 });
  return CEILING_LAMPS.map((z) => {
    box(THREE, group, housing, [1.5, 0.09, 0.34], [0, ROOM.height - 0.05, z], 'lamp-housing');
    const left = box(THREE, group, tube, [1.34, 0.06, 0.1], [0, ROOM.height - 0.12, z - 0.08], 'lamp-tube');
    const right = box(THREE, group, tube, [1.34, 0.06, 0.1], [0, ROOM.height - 0.12, z + 0.08], 'lamp-tube');
    return [left, right];
  }).flat();
}
