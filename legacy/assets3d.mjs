// Pure three.js voxel asset builders for the ray-brain office.
// Coordinate convention: +Y is up, the back wall is -Z, and asset fronts face +Z.

function lambert(THREE, color, options = {}) {
  return new THREE.MeshLambertMaterial({
    color,
    flatShading: true,
    ...options,
  });
}

function addBox(THREE, parent, material, size, position, name = '', rotation = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addPlane(THREE, parent, material, size, position, name = '') {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...size), material);
  mesh.position.set(...position);
  mesh.name = name;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function gridCount(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.max(1, Math.round(number)) : fallback;
}

/**
 * Build the floor and two walls around a desk grid.
 * The returned wall meshes face +Z so CanvasTextures are not mirrored.
 */
export function buildRoom(THREE, { cols, rows } = {}) {
  const columnCount = gridCount(cols, 3);
  const rowCount = gridCount(rows, 2);
  const floorW = Math.max(460, columnCount * 96 + 108);
  const floorD = Math.max(360, rowCount * 92 + 88);
  const wallH = 170;
  const backZ = -floorD / 2;
  const leftX = -floorW / 2;

  const group = new THREE.Group();
  group.name = 'room';

  const floorBase = lambert(THREE, '#dfcca6');
  const floorTones = [
    lambert(THREE, '#ecdcbd'),
    lambert(THREE, '#e8d5b2'),
    lambert(THREE, '#f0e1c5'),
  ];
  const wallMaterial = lambert(THREE, '#f1e9d7');
  const wallLowMaterial = lambert(THREE, '#e5dbc4');
  const trimMaterial = lambert(THREE, '#c9b68d');

  addBox(THREE, group, floorBase, [floorW, 4, floorD], [0, -2.12, 0], 'floor-base');

  // Short, staggered boards keep the floor visibly voxel-built without a texture.
  const plankLength = 92;
  const plankDepth = 30;
  const gap = 1;
  let plankRow = 0;
  for (let z0 = -floorD / 2; z0 < floorD / 2 - 0.01; z0 += plankDepth) {
    const depth = Math.min(plankDepth - gap, floorD / 2 - z0 - gap / 2);
    if (depth <= 0) break;
    const centerZ = z0 + gap / 2 + depth / 2;
    const offset = plankRow % 2 ? plankLength / 2 : 0;
    let plankColumn = 0;

    for (let x0 = -floorW / 2 - offset; x0 < floorW / 2; x0 += plankLength) {
      const left = Math.max(-floorW / 2, x0 + gap / 2);
      const right = Math.min(floorW / 2, x0 + plankLength - gap / 2);
      if (right - left > 2) {
        addBox(
          THREE,
          group,
          floorTones[(plankRow + plankColumn) % floorTones.length],
          [right - left, 0.24, depth],
          [(left + right) / 2, -0.12, centerZ],
          'floor-plank',
        );
      }
      plankColumn += 1;
    }
    plankRow += 1;
  }

  addBox(
    THREE,
    group,
    wallMaterial,
    [floorW + 6, wallH, 6],
    [0, wallH / 2, backZ - 3],
    'back-wall',
  );
  addBox(
    THREE,
    group,
    wallMaterial,
    [6, wallH, floorD + 6],
    [leftX - 3, wallH / 2, 0],
    'left-wall',
  );
  addBox(THREE, group, wallLowMaterial, [floorW, 9, 2], [0, 4.5, backZ + 1], 'back-wall-low');
  addBox(THREE, group, wallLowMaterial, [2, 9, floorD], [leftX + 1, 4.5, 0], 'left-wall-low');
  addBox(THREE, group, trimMaterial, [floorW, 4, 3], [0, 9, backZ + 1.5], 'back-baseboard');
  addBox(THREE, group, trimMaterial, [3, 4, floorD], [leftX + 1.5, 9, 0], 'left-baseboard');

  // Whiteboard: the exposed plane is the texture target.
  const boardX = 0;
  const boardY = 108;
  const boardZ = backZ + 2.43;
  const boardMaterial = lambert(THREE, '#fdfdfb', { side: THREE.DoubleSide });
  const boardFrameMaterial = lambert(THREE, '#cfc4a8');
  const whiteboard = addPlane(
    THREE,
    group,
    boardMaterial,
    [180, 70],
    [boardX, boardY, boardZ],
    'whiteboard',
  );
  addBox(THREE, group, boardFrameMaterial, [190, 5, 2.4], [boardX, boardY + 37.5, backZ + 1.2], 'whiteboard-frame');
  addBox(THREE, group, boardFrameMaterial, [190, 5, 2.4], [boardX, boardY - 37.5, backZ + 1.2], 'whiteboard-frame');
  addBox(THREE, group, boardFrameMaterial, [5, 80, 2.4], [boardX - 92.5, boardY, backZ + 1.2], 'whiteboard-frame');
  addBox(THREE, group, boardFrameMaterial, [5, 80, 2.4], [boardX + 92.5, boardY, backZ + 1.2], 'whiteboard-frame');
  addBox(THREE, group, boardFrameMaterial, [82, 2.5, 8], [boardX, boardY - 42, backZ + 4], 'whiteboard-tray');
  addBox(THREE, group, lambert(THREE, '#1971c2'), [15, 2, 2], [boardX - 20, boardY - 40.5, backZ + 7], 'blue-marker');
  addBox(THREE, group, lambert(THREE, '#e8590c'), [15, 2, 2], [boardX, boardY - 40.5, backZ + 7], 'orange-marker');

  // Voxel clock: a PlaneGeometry face, clipped by wall-colored corner blocks.
  const clockX = leftX + 45;
  const clockY = 116;
  const clockFrameMaterial = lambert(THREE, '#7a5c3e');
  const clockMaterial = lambert(THREE, '#fffdf4', { side: THREE.DoubleSide });
  addBox(THREE, group, clockFrameMaterial, [44, 30, 3], [clockX, clockY, backZ + 1.5], 'clock-frame');
  addBox(THREE, group, clockFrameMaterial, [30, 44, 3], [clockX, clockY, backZ + 1.5], 'clock-frame');
  const clockFace = addPlane(
    THREE,
    group,
    clockMaterial,
    [40, 40],
    [clockX, clockY, backZ + 3.04],
    'clockFace',
  );
  const cornerOffsets = [
    [-17, -17],
    [-17, 17],
    [17, -17],
    [17, 17],
  ];
  for (const [x, y] of cornerOffsets) {
    addBox(
      THREE,
      group,
      wallMaterial,
      [6.5, 6.5, 0.4],
      [clockX + x, clockY + y, backZ + 3.28],
      'clock-corner-mask',
    );
  }
  const tickMaterial = lambert(THREE, '#b3a688');
  addBox(THREE, clockFace, tickMaterial, [2, 4, 0.5], [0, 15, 0.3], 'clock-tick');
  addBox(THREE, clockFace, tickMaterial, [2, 4, 0.5], [0, -15, 0.3], 'clock-tick');
  addBox(THREE, clockFace, tickMaterial, [4, 2, 0.5], [-15, 0, 0.3], 'clock-tick');
  addBox(THREE, clockFace, tickMaterial, [4, 2, 0.5], [15, 0, 0.3], 'clock-tick');

  // Window: one tintable glass plane with a block frame and mullions in front.
  const windowX = floorW / 2 - 60;
  const windowY = 105;
  const windowMaterial = lambert(THREE, '#bfe3f7', {
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const windowFrameMaterial = lambert(THREE, '#b99a6b');
  const windowGlass = addPlane(
    THREE,
    group,
    windowMaterial,
    [90, 80],
    [windowX, windowY, backZ + 2.2],
    'windowGlass',
  );
  windowGlass.renderOrder = 1;
  addBox(THREE, group, windowFrameMaterial, [100, 6, 3], [windowX, windowY + 43, backZ + 1.5], 'window-frame');
  addBox(THREE, group, windowFrameMaterial, [100, 6, 3], [windowX, windowY - 43, backZ + 1.5], 'window-frame');
  addBox(THREE, group, windowFrameMaterial, [6, 90, 3], [windowX - 47, windowY, backZ + 1.5], 'window-frame');
  addBox(THREE, group, windowFrameMaterial, [6, 90, 3], [windowX + 47, windowY, backZ + 1.5], 'window-frame');
  addBox(THREE, group, windowFrameMaterial, [5, 80, 3.2], [windowX, windowY, backZ + 2.4], 'window-mullion');
  addBox(THREE, group, windowFrameMaterial, [90, 4, 3.2], [windowX, windowY, backZ + 2.4], 'window-mullion');
  addBox(THREE, group, windowFrameMaterial, [110, 5, 10], [windowX, windowY - 47, backZ + 4], 'window-sill');

  return { group, whiteboard, clockFace, windowGlass, floorW, floorD };
}

/** Build a 60-unit-wide workstation facing +Z. */
export function buildDesk(THREE) {
  const group = new THREE.Group();
  group.name = 'desk';

  const topMaterial = lambert(THREE, '#c9a06b');
  const legMaterial = lambert(THREE, '#a87f4f');
  const bezelMaterial = lambert(THREE, '#3d4048');
  const standMaterial = lambert(THREE, '#565b64');
  const screenMaterial = lambert(THREE, '#172126', { side: THREE.DoubleSide });
  const keyboardMaterial = lambert(THREE, '#6a6e75');
  const keyMaterial = lambert(THREE, '#afb2b7');

  addBox(THREE, group, topMaterial, [60, 4, 36], [0, 29, 0], 'desktop');
  addBox(THREE, group, legMaterial, [60, 2, 36], [0, 26, 0], 'desk-apron');
  for (const x of [-25, 25]) {
    for (const z of [-13, 13]) {
      addBox(THREE, group, legMaterial, [4, 26, 4], [x, 13, z], 'desk-leg');
    }
  }

  addBox(THREE, group, bezelMaterial, [32, 24, 3], [0, 47, -9], 'monitor-bezel');
  addBox(THREE, group, standMaterial, [5, 6, 3], [0, 34, -9], 'monitor-neck');
  addBox(THREE, group, standMaterial, [18, 2, 7], [0, 31, -7], 'monitor-foot');
  const screen = addPlane(THREE, group, screenMaterial, [26, 18], [0, 47, -7.47], 'screen');

  addBox(THREE, group, keyboardMaterial, [24, 1.3, 9], [0, 31.2, 8], 'keyboard');
  for (const z of [5.6, 8, 10.4]) {
    addBox(THREE, group, keyMaterial, [19, 0.35, 0.8], [0, 32.02, z], 'keyboard-key-row');
  }

  const papers = new THREE.Group();
  papers.name = 'papers';
  papers.position.set(20, 31.1, 6);
  const paperCream = lambert(THREE, '#fff3c9');
  const paperGold = lambert(THREE, '#ffe9a8');
  addBox(THREE, papers, paperGold, [14, 0.8, 10], [0, 0.4, 0], 'paper');
  addBox(THREE, papers, paperCream, [13, 0.8, 9], [0.7, 1.2, -0.3], 'paper', [0, 0.05, 0]);
  addBox(THREE, papers, paperGold, [14, 0.8, 10], [-0.3, 2, 0.2], 'paper', [0, -0.04, 0]);
  papers.visible = false;
  group.add(papers);

  const flag = new THREE.Group();
  flag.name = 'flag';
  const poleMaterial = lambert(THREE, '#7a5c3e');
  const flagMaterial = lambert(THREE, '#40c057');
  const flagLightMaterial = lambert(THREE, '#69db7c');
  addBox(THREE, flag, poleMaterial, [1.8, 22, 1.8], [23, 41, -5], 'flag-pole');
  const flagPivot = new THREE.Object3D();
  flagPivot.name = 'flagPivot';
  flagPivot.position.set(23.8, 51.5, -5);
  addBox(THREE, flagPivot, flagMaterial, [13, 5, 1], [6.5, -2.5, 0], 'flag-cloth-top');
  addBox(THREE, flagPivot, flagMaterial, [9, 4, 1], [4.5, -7, 0], 'flag-cloth-bottom');
  addBox(THREE, flagPivot, flagLightMaterial, [7, 1.3, 1.2], [5, -3.2, 0.1], 'flag-highlight');
  flag.add(flagPivot);
  flag.visible = false;
  group.add(flag);

  return { group, screen, papers, flag, flagPivot };
}

/** Build a seated, rear-facing character whose local forward direction is -Z. */
export function buildCharacter(THREE, colorHex) {
  const group = new THREE.Group();
  group.name = 'character';

  const hoodMaterial = lambert(THREE, colorHex ?? 0x9aa0a6);
  const skinMaterial = lambert(THREE, '#f0c8a0');
  const hairMaterial = lambert(THREE, '#4a3626');
  const pantsMaterial = lambert(THREE, '#4b5563');
  const shoeMaterial = lambert(THREE, '#343a40');
  const chairMaterial = lambert(THREE, '#8d99ae');
  const chairDarkMaterial = lambert(THREE, '#6c757d');

  // Chair first: its low back leaves the hood and head readable from +Z.
  addBox(THREE, group, chairMaterial, [30, 4, 27], [0, 12, 1], 'chair-seat');
  addBox(THREE, group, chairDarkMaterial, [30, 13, 4], [0, 18.5, 12], 'chair-back');
  for (const x of [-11, 11]) {
    for (const z of [-8, 10]) {
      addBox(THREE, group, chairDarkMaterial, [3, 10, 3], [x, 5, z], 'chair-leg');
    }
  }

  // Bent seated legs: thighs point toward the desk (-Z), shins return to the floor.
  addBox(THREE, group, pantsMaterial, [8, 6, 15], [-6, 15, -7], 'leg-left-thigh');
  addBox(THREE, group, pantsMaterial, [8, 6, 15], [6, 15, -7], 'leg-right-thigh');
  addBox(THREE, group, pantsMaterial, [7, 12, 7], [-6, 7, -13], 'leg-left-shin');
  addBox(THREE, group, pantsMaterial, [7, 12, 7], [6, 7, -13], 'leg-right-shin');
  addBox(THREE, group, shoeMaterial, [8, 3, 10], [-6, 1.5, -15], 'shoe-left');
  addBox(THREE, group, shoeMaterial, [8, 3, 10], [6, 1.5, -15], 'shoe-right');

  addBox(THREE, group, hoodMaterial, [22, 18, 12], [0, 22.5, 1], 'torso');
  addBox(THREE, group, hoodMaterial, [16, 8, 3], [0, 27, 7.5], 'hood-back');
  addBox(THREE, group, hoodMaterial, [11, 4, 3], [0, 22, 8], 'hood-point');

  // Head children are relative to the neck pivot for a natural nod/tilt.
  const head = new THREE.Object3D();
  head.name = 'head';
  head.position.set(0, 30.5, 0);
  addBox(THREE, head, skinMaterial, [13, 11, 11], [0, 5.5, 0], 'head-skin');
  addBox(THREE, head, skinMaterial, [5, 3, 5], [0, 0.5, 0], 'neck');
  addBox(THREE, head, hairMaterial, [15, 3.5, 13], [0, 10, 0], 'hair-cap');
  addBox(THREE, head, hairMaterial, [15, 8, 2.5], [0, 6.5, 6.2], 'hair-back');
  addBox(THREE, head, hairMaterial, [2.5, 8, 10], [-6.4, 5.5, 1.5], 'hair-left');
  addBox(THREE, head, hairMaterial, [2.5, 8, 10], [6.4, 5.5, 1.5], 'hair-right');
  group.add(head);

  // Each arm extends from its shoulder toward -Z; rotation.x produces a typing tap.
  const armL = new THREE.Object3D();
  armL.name = 'armL';
  armL.position.set(-10.5, 27, -1);
  addBox(THREE, armL, hoodMaterial, [5, 5, 9], [0, -1, -4], 'arm-left-sleeve');
  addBox(THREE, armL, skinMaterial, [4, 3.5, 6], [0, -2, -11], 'hand-left');
  group.add(armL);

  const armR = new THREE.Object3D();
  armR.name = 'armR';
  armR.position.set(10.5, 27, -1);
  addBox(THREE, armR, hoodMaterial, [5, 5, 9], [0, -1, -4], 'arm-right-sleeve');
  addBox(THREE, armR, skinMaterial, [4, 3.5, 6], [0, -2, -11], 'hand-right');
  group.add(armR);

  return { group, head, armL, armR };
}

/** Build a blocky three-seat lounge sofa facing +Z. */
export function buildSofa(THREE) {
  const group = new THREE.Group();
  group.name = 'sofa';

  const frameMaterial = lambert(THREE, '#8d6b4c');
  const bodyMaterial = lambert(THREE, '#b08968');
  const cushionLight = lambert(THREE, '#bc9879');
  const cushionDark = lambert(THREE, '#a78061');

  addBox(THREE, group, frameMaterial, [86, 10, 31], [0, 9, 0], 'sofa-base');
  addBox(THREE, group, bodyMaterial, [88, 26, 10], [0, 23, -12], 'sofa-back');
  addBox(THREE, group, bodyMaterial, [10, 25, 36], [-43, 17.5, 1], 'sofa-arm-left');
  addBox(THREE, group, bodyMaterial, [10, 25, 36], [43, 17.5, 1], 'sofa-arm-right');

  for (const [index, x] of [-27, 0, 27].entries()) {
    addBox(
      THREE,
      group,
      index === 1 ? cushionLight : cushionDark,
      [25, 6, 25],
      [x, 17, 2],
      `sofa-cushion-${index + 1}`,
    );
  }
  for (const x of [-35, 35]) {
    for (const z of [-9, 11]) {
      addBox(THREE, group, frameMaterial, [5, 7, 5], [x, 3.5, z], 'sofa-leg');
    }
  }

  return { group };
}

/** Build a terracotta pot with chunky leaves. */
export function buildPlant(THREE) {
  const group = new THREE.Group();
  group.name = 'plant';

  const potMaterial = lambert(THREE, '#c96f4a');
  const potDarkMaterial = lambert(THREE, '#a85a3a');
  const soilMaterial = lambert(THREE, '#5c4030');
  const stemMaterial = lambert(THREE, '#2f9e44');
  const leafMaterials = [
    lambert(THREE, '#37b24d'),
    lambert(THREE, '#40c057'),
    lambert(THREE, '#51cf66'),
  ];

  addBox(THREE, group, potDarkMaterial, [14, 2, 12], [0, 1, 0], 'plant-pot-foot');
  addBox(THREE, group, potMaterial, [15, 10, 13], [0, 7, 0], 'plant-pot');
  addBox(THREE, group, potDarkMaterial, [19, 3, 17], [0, 13, 0], 'plant-pot-rim');
  addBox(THREE, group, soilMaterial, [14, 1, 12], [0, 14.6, 0], 'plant-soil');
  addBox(THREE, group, stemMaterial, [3.5, 25, 3.5], [0, 27, 0], 'plant-stem');

  const leaves = [
    { size: [13, 6, 5], position: [-7, 24, 0], rotation: [0, 0, 0.28] },
    { size: [14, 6, 5], position: [7, 28, 1], rotation: [0, 0, -0.3] },
    { size: [12, 7, 5], position: [-5, 34, 1], rotation: [0, 0, -0.18] },
    { size: [13, 6, 5], position: [6, 38, 0], rotation: [0, 0, 0.25] },
    { size: [8, 12, 5], position: [0, 43, 0], rotation: [0, 0, -0.08] },
    { size: [10, 6, 8], position: [-1, 31, 5], rotation: [0.15, 0.2, 0] },
  ];
  leaves.forEach((leaf, index) => {
    addBox(
      THREE,
      group,
      leafMaterials[index % leafMaterials.length],
      leaf.size,
      leaf.position,
      `plant-leaf-${index + 1}`,
      leaf.rotation,
    );
  });

  return { group };
}

/** Build a 12-unit-tall voxel exclamation mark facing +Z. */
export function buildExclamation(THREE) {
  const group = new THREE.Group();
  group.name = 'exclamation';

  const redMaterial = lambert(THREE, '#e03131');
  const redLightMaterial = lambert(THREE, '#ff6b6b');
  addBox(THREE, group, redMaterial, [4, 7.5, 2.5], [0, 7.75, 0], 'exclamation-stem');
  addBox(THREE, group, redLightMaterial, [1, 5, 0.5], [-1, 8.6, 1.5], 'exclamation-highlight');
  addBox(THREE, group, redMaterial, [4, 3, 2.5], [0, 1.5, 0], 'exclamation-dot');

  return { group };
}

/**
 * Build a bright, open-front office interior viewed from the +Z entrance.
 * Width stays fixed for a portrait camera; only the room depth follows desk rows.
 */
export function buildInterior(THREE, { cols, rows } = {}) {
  void cols;

  const rowCount = gridCount(rows, 3);
  const floorW = 340;
  const floorD = rowCount * 115 + 170;
  const roomH = 170;
  const halfW = floorW / 2;
  const backZ = -floorD / 2;
  const entranceZ = floorD / 2;

  const group = new THREE.Group();
  group.name = 'interior';

  const oakBaseMaterial = lambert(THREE, '#d9cbae');
  const oakMaterials = [
    lambert(THREE, '#e8d7b4'),
    lambert(THREE, '#eddfc1'),
    lambert(THREE, '#e3cea7'),
    lambert(THREE, '#f0e4ca'),
  ];
  const wallMaterial = lambert(THREE, '#f6f0e4');
  const trimMaterial = lambert(THREE, '#d9cbae');
  const moldingMaterial = lambert(THREE, '#e7ddca');
  const darkWoodMaterial = lambert(THREE, '#7a5c3e');

  // Long, staggered oak boards create perspective lines toward the back wall.
  addBox(THREE, group, oakBaseMaterial, [floorW, 4, floorD], [0, -2.1, 0], 'interior-floor-base');
  const plankWidth = 34;
  const plankLength = 94;
  const plankGap = 0.9;
  let plankColumn = 0;
  for (let x0 = -halfW; x0 < halfW - 0.01; x0 += plankWidth) {
    const width = Math.min(plankWidth - plankGap, halfW - x0 - plankGap / 2);
    const centerX = x0 + plankGap / 2 + width / 2;
    const offset = plankColumn % 2 ? plankLength / 2 : 0;
    let plankSegment = 0;

    for (let z0 = backZ - offset; z0 < entranceZ; z0 += plankLength) {
      const far = Math.max(backZ, z0 + plankGap / 2);
      const near = Math.min(entranceZ, z0 + plankLength - plankGap / 2);
      if (near - far > 2) {
        addBox(
          THREE,
          group,
          oakMaterials[(plankColumn + plankSegment) % oakMaterials.length],
          [width, 0.22, near - far],
          [centerX, -0.11, (far + near) / 2],
          'interior-floor-plank',
        );
      }
      plankSegment += 1;
    }
    plankColumn += 1;
  }

  // Closed back and side walls; +Z intentionally remains open for the camera.
  addBox(
    THREE,
    group,
    wallMaterial,
    [floorW + 12, roomH, 6],
    [0, roomH / 2, backZ - 3],
    'interior-back-wall',
  );
  addBox(
    THREE,
    group,
    wallMaterial,
    [6, roomH, floorD + 6],
    [-halfW - 3, roomH / 2, 0],
    'interior-left-wall',
  );
  addBox(
    THREE,
    group,
    wallMaterial,
    [6, roomH, floorD + 6],
    [halfW + 3, roomH / 2, 0],
    'interior-right-wall',
  );

  addBox(THREE, group, trimMaterial, [floorW, 7, 3], [0, 3.5, backZ + 1.5], 'interior-back-baseboard');
  addBox(THREE, group, trimMaterial, [3, 7, floorD], [-halfW + 1.5, 3.5, 0], 'interior-left-baseboard');
  addBox(THREE, group, trimMaterial, [3, 7, floorD], [halfW - 1.5, 3.5, 0], 'interior-right-baseboard');
  addBox(THREE, group, moldingMaterial, [floorW, 4, 4], [0, 166, backZ + 2], 'interior-back-molding');
  addBox(THREE, group, moldingMaterial, [4, 4, floorD], [-halfW + 2, 166, 0], 'interior-left-molding');
  addBox(THREE, group, moldingMaterial, [4, 4, floorD], [halfW - 2, 166, 0], 'interior-right-molding');

  const ceilingMaterial = lambert(THREE, '#f9f5ec', { side: THREE.DoubleSide });
  const ceiling = addPlane(
    THREE,
    group,
    ceilingMaterial,
    [floorW, floorD],
    [0, roomH, 0],
    'interior-ceiling',
  );
  ceiling.rotation.x = Math.PI / 2;

  // MeshBasic panels stay visibly white; office3d supplies the real light sources.
  const ceilingLights = [];
  const lightCount = Math.min(6, Math.max(4, rowCount + 2));
  const lightFrameMaterial = lambert(THREE, '#ded6c8');
  const lightMaterial = new THREE.MeshBasicMaterial({ color: '#fffdf7' });
  const lightStartZ = backZ + 65;
  const lightEndZ = entranceZ - 65;
  for (let index = 0; index < lightCount; index += 1) {
    const ratio = lightCount === 1 ? 0.5 : index / (lightCount - 1);
    const z = lightStartZ + (lightEndZ - lightStartZ) * ratio;
    addBox(THREE, group, lightFrameMaterial, [58, 2.4, 17], [0, 168.8, z], `ceiling-light-frame-${index + 1}`);
    const light = addBox(
      THREE,
      group,
      lightMaterial,
      [50, 1.2, 11],
      [0, 167.3, z],
      `ceiling-light-${index + 1}`,
    );
    ceilingLights.push(light);
  }

  // Three large luminous windows run along the right wall.
  const glassMaterial = new THREE.MeshBasicMaterial({
    color: '#cfe8f7',
    side: THREE.DoubleSide,
  });
  const glassGlowMaterial = new THREE.MeshBasicMaterial({
    color: '#edf7fb',
    side: THREE.DoubleSide,
  });
  const windowW = 92;
  const windowH = 100;
  const windowY = 104;
  for (let index = 0; index < 3; index += 1) {
    const z = backZ + (floorD * (index + 1)) / 4;
    const glass = addPlane(
      THREE,
      group,
      glassMaterial,
      [windowW, windowH],
      [halfW - 0.2, windowY, z],
      `window-glass-${index + 1}`,
    );
    glass.rotation.y = -Math.PI / 2;

    const horizonGlow = addPlane(
      THREE,
      group,
      glassGlowMaterial,
      [windowW - 4, 24],
      [halfW - 0.35, windowY - 28, z],
      `window-sky-band-${index + 1}`,
    );
    horizonGlow.rotation.y = -Math.PI / 2;

    addBox(THREE, group, darkWoodMaterial, [3, 7, windowW + 12], [halfW - 1.5, windowY + 53.5, z], 'window-frame');
    addBox(THREE, group, darkWoodMaterial, [3, 7, windowW + 12], [halfW - 1.5, windowY - 53.5, z], 'window-frame');
    addBox(THREE, group, darkWoodMaterial, [3, windowH + 14, 7], [halfW - 1.5, windowY, z - 49.5], 'window-frame');
    addBox(THREE, group, darkWoodMaterial, [3, windowH + 14, 7], [halfW - 1.5, windowY, z + 49.5], 'window-frame');
    addBox(THREE, group, darkWoodMaterial, [3.2, windowH, 5], [halfW - 1.7, windowY, z], 'window-mullion');
    addBox(THREE, group, darkWoodMaterial, [3.2, 5, windowW], [halfW - 1.7, windowY, z], 'window-mullion');
  }

  // Framed voxel posters keep the left wall visually active.
  const posterFrameMaterial = lambert(THREE, '#9b7652');
  const posterPaperMaterial = lambert(THREE, '#fffaf1', { side: THREE.DoubleSide });
  const posterPalettes = [
    [lambert(THREE, '#d97757'), lambert(THREE, '#e9b872'), lambert(THREE, '#6f8f72')],
    [lambert(THREE, '#547aa5'), lambert(THREE, '#93b7be'), lambert(THREE, '#d2a44d')],
  ];
  const posterZs = [backZ + floorD * 0.22, backZ + floorD * 0.46];
  posterZs.forEach((z, index) => {
    const poster = addPlane(
      THREE,
      group,
      posterPaperMaterial,
      [54, 72],
      [-halfW + 0.2, 111, z],
      `poster-${index + 1}`,
    );
    poster.rotation.y = Math.PI / 2;

    addBox(THREE, group, posterFrameMaterial, [3, 5, 62], [-halfW + 1.5, 149.5, z], 'poster-frame');
    addBox(THREE, group, posterFrameMaterial, [3, 5, 62], [-halfW + 1.5, 72.5, z], 'poster-frame');
    addBox(THREE, group, posterFrameMaterial, [3, 82, 5], [-halfW + 1.5, 111, z - 29.5], 'poster-frame');
    addBox(THREE, group, posterFrameMaterial, [3, 82, 5], [-halfW + 1.5, 111, z + 29.5], 'poster-frame');

    const [main, light, accent] = posterPalettes[index];
    addBox(THREE, group, main, [0.8, 16, 34], [-halfW + 0.65, 96, z], 'poster-pixel');
    addBox(THREE, group, light, [0.8, 13, 22], [-halfW + 0.65, 111, z - 8], 'poster-pixel');
    addBox(THREE, group, accent, [0.8, 22, 13], [-halfW + 0.65, 125, z + 11], 'poster-pixel');
    addBox(THREE, group, main, [0.8, 8, 8], [-halfW + 0.65, 134, z - 15], 'poster-pixel');
  });

  // Low, open bookshelf near the entrance; book spines face into the room (+X).
  const shelfZ = entranceZ - 88;
  const shelfMaterial = lambert(THREE, '#a87f4f');
  const shelfDarkMaterial = lambert(THREE, '#79583b');
  addBox(THREE, group, shelfDarkMaterial, [4, 58, 84], [-halfW + 2, 29, shelfZ], 'bookshelf-back');
  for (const y of [1.5, 20, 38.5, 56]) {
    addBox(THREE, group, shelfMaterial, [22, 3, 84], [-halfW + 11, y, shelfZ], 'bookshelf-shelf');
  }
  addBox(THREE, group, shelfMaterial, [22, 58, 4], [-halfW + 11, 29, shelfZ - 40], 'bookshelf-side');
  addBox(THREE, group, shelfMaterial, [22, 58, 4], [-halfW + 11, 29, shelfZ + 40], 'bookshelf-side');
  const bookMaterials = [
    lambert(THREE, '#b85c4a'),
    lambert(THREE, '#547aa5'),
    lambert(THREE, '#6f8f72'),
    lambert(THREE, '#d2a44d'),
  ];
  const bookSpecs = [
    [4, 14, -31],
    [7, 16, -24],
    [5, 13, -16],
    [8, 15, -7],
    [6, 14, 4],
    [5, 16, 12],
    [8, 13, 22],
    [5, 15, 31],
  ];
  for (const shelfBaseY of [3, 21.5, 40]) {
    bookSpecs.forEach(([bookW, bookH, zOffset], index) => {
      addBox(
        THREE,
        group,
        bookMaterials[(index + Math.round(shelfBaseY)) % bookMaterials.length],
        [14, bookH, bookW],
        [-halfW + 13, shelfBaseY + bookH / 2, shelfZ + zOffset],
        'bookshelf-book',
      );
    });
  }

  // Back-wall whiteboard is the CanvasTexture target and faces the entrance (+Z).
  const boardY = 108;
  const boardMaterial = lambert(THREE, '#fffefb', { side: THREE.DoubleSide });
  const boardFrameMaterial = lambert(THREE, '#cfc4a8');
  const whiteboard = addPlane(
    THREE,
    group,
    boardMaterial,
    [210, 84],
    [0, boardY, backZ + 2.05],
    'interior-whiteboard',
  );
  addBox(THREE, group, boardFrameMaterial, [220, 5, 3], [0, boardY + 44.5, backZ + 1.5], 'interior-whiteboard-frame');
  addBox(THREE, group, boardFrameMaterial, [220, 5, 3], [0, boardY - 44.5, backZ + 1.5], 'interior-whiteboard-frame');
  addBox(THREE, group, boardFrameMaterial, [5, 94, 3], [-107.5, boardY, backZ + 1.5], 'interior-whiteboard-frame');
  addBox(THREE, group, boardFrameMaterial, [5, 94, 3], [107.5, boardY, backZ + 1.5], 'interior-whiteboard-frame');
  addBox(THREE, group, boardFrameMaterial, [92, 2.5, 8], [0, boardY - 49, backZ + 4], 'interior-whiteboard-tray');

  // The returned face is a 46-unit PlaneGeometry mesh; masks create a voxel circle.
  const clockX = -139;
  const clockY = 137;
  const clockFrameMaterial = lambert(THREE, '#6f5138');
  const clockMaterial = lambert(THREE, '#fffdf4', { side: THREE.DoubleSide });
  addBox(THREE, group, clockFrameMaterial, [52, 36, 3], [clockX, clockY, backZ + 1.5], 'interior-clock-frame');
  addBox(THREE, group, clockFrameMaterial, [36, 52, 3], [clockX, clockY, backZ + 1.5], 'interior-clock-frame');
  const clockFace = addPlane(
    THREE,
    group,
    clockMaterial,
    [46, 46],
    [clockX, clockY, backZ + 3.04],
    'interior-clock-face',
  );
  for (const [x, y] of [
    [-19.5, -19.5],
    [-19.5, 19.5],
    [19.5, -19.5],
    [19.5, 19.5],
  ]) {
    addBox(
      THREE,
      group,
      wallMaterial,
      [8, 8, 0.45],
      [clockX + x, clockY + y, backZ + 3.3],
      'interior-clock-corner-mask',
    );
  }

  // A narrow wood door fits beside the centered board without closing the entrance.
  const doorX = 142;
  const doorMaterial = lambert(THREE, '#c9a06b');
  const doorPanelMaterial = lambert(THREE, '#b78d5b');
  const knobMaterial = lambert(THREE, '#d2a44d');
  addBox(THREE, group, doorMaterial, [46, 108, 3], [doorX, 54, backZ + 1.5], 'interior-door');
  addBox(THREE, group, darkWoodMaterial, [6, 116, 5], [doorX - 26, 58, backZ + 2], 'interior-door-frame');
  addBox(THREE, group, darkWoodMaterial, [6, 116, 5], [doorX + 26, 58, backZ + 2], 'interior-door-frame');
  addBox(THREE, group, darkWoodMaterial, [58, 6, 5], [doorX, 113, backZ + 2], 'interior-door-frame');
  addBox(THREE, group, doorPanelMaterial, [32, 30, 1.2], [doorX, 81, backZ + 3.2], 'interior-door-panel');
  addBox(THREE, group, doorPanelMaterial, [32, 30, 1.2], [doorX, 34, backZ + 3.2], 'interior-door-panel');
  addBox(THREE, group, knobMaterial, [3.5, 3.5, 3.5], [doorX - 16, 56, backZ + 4], 'interior-door-knob');

  return { group, floorW, floorD, whiteboard, clockFace, ceilingLights };
}
