import * as THREE from './three.module.js';
import { connect } from '/sdk.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const loading = $('loading');
const tooltip = $('tooltip');
const toast = $('toast');
const eventList = $('event-list');

const STATUS = {
  working: { color: 0x46dda0, css: '#46dda0', label: 'WORKING · 필기 중' },
  idle: { color: 0x79a9cc, css: '#79a9cc', label: 'IDLE · 잠시 엎드림' },
  blocked: { color: 0xff4b55, css: '#ff4b55', label: 'BLOCKED · 질문 있어요!' },
  done: { color: 0xf3c34d, css: '#f3c34d', label: 'DONE · 완료' },
  unknown: { color: 0x9aa3a0, css: '#9aa3a0', label: 'UNKNOWN · 대기' },
};
const KIND_COLORS = { claude: 0xbe6e50, codex: 0x2a9b91 };
const MAX_STUDENTS = 12;
const TAU = Math.PI * 2;

const clampText = (value, length) => {
  const chars = Array.from(String(value ?? '').trim());
  return chars.length > length ? `${chars.slice(0, length - 1).join('')}…` : chars.join('');
};
const hash = (value) => Array.from(String(value)).reduce((n, c) => ((n * 31) + c.charCodeAt(0)) >>> 0, 2166136261);
const damp = (current, target, lambda, dt) => THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
} catch (error) {
  loading.textContent = 'WEBGL을 시작할 수 없습니다';
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.13;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label', '교탁 앞에서 바라보는 3D 에이전트 교실. 학생을 클릭하면 해당 pane으로 이동합니다.');
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb8c9c4);
scene.fog = new THREE.Fog(0xc8d2cc, 31, 57);

const camera = new THREE.PerspectiveCamera(51, 1, 0.1, 90);
const cameraBase = new THREE.Vector3(7.45, 4.7, -9.65);
const lookBase = new THREE.Vector3(-0.25, 2.25, 8.2);
camera.position.copy(cameraBase);
camera.lookAt(lookBase);

const mouseTarget = new THREE.Vector2();
const mouseSmooth = new THREE.Vector2();
const lookNow = new THREE.Vector3();
const clock = new THREE.Clock();

function canvasTexture(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return { canvas, context, texture };
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function makeWoodTexture() {
  const { canvas, context, texture } = canvasTexture(512, 512);
  const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, '#9b6338');
  gradient.addColorStop(.45, '#bd7c48');
  gradient.addColorStop(1, '#8a5432');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < 512; y += 64) {
    context.fillStyle = y % 128 ? 'rgba(255,228,181,.07)' : 'rgba(54,25,10,.06)';
    context.fillRect(0, y, 512, 62);
    context.strokeStyle = 'rgba(48,24,11,.28)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, y + 63);
    context.lineTo(512, y + 63);
    context.stroke();
    for (let x = -20; x < 520; x += 34) {
      const bend = Math.sin((x + y) * .055) * 8;
      context.strokeStyle = 'rgba(77,37,16,.11)';
      context.lineWidth = 1.3;
      context.beginPath();
      context.moveTo(x, y + 7);
      context.bezierCurveTo(x + bend, y + 24, x - bend, y + 42, x + 18, y + 57);
      context.stroke();
    }
  }
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.4, 6.2);
  return texture;
}

const MAT = {
  wall: new THREE.MeshStandardMaterial({ color: 0xd8d0bd, roughness: .92 }),
  wallTrim: new THREE.MeshStandardMaterial({ color: 0x766c5d, roughness: .68 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0xe9e5d9, roughness: .92 }),
  floor: new THREE.MeshStandardMaterial({ map: makeWoodTexture(), color: 0xcba174, roughness: .68 }),
  deskTop: new THREE.MeshStandardMaterial({ color: 0x9c6539, roughness: .48, metalness: .02 }),
  deskEdge: new THREE.MeshStandardMaterial({ color: 0x5b3723, roughness: .58 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x536061, roughness: .32, metalness: .72 }),
  chair: new THREE.MeshStandardMaterial({ color: 0x6f462d, roughness: .68 }),
  paper: new THREE.MeshStandardMaterial({ color: 0xf3eedf, roughness: .96 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x9bc8d6, roughness: .08, metalness: 0, transmission: .28, transparent: true, opacity: .68, depthWrite: false }),
  blackboard: new THREE.MeshStandardMaterial({ color: 0x1e5144, roughness: .86 }),
};

function mesh(geometry, material, { position, rotation, cast = false, receive = false } = {}) {
  const object = new THREE.Mesh(geometry, material);
  if (position) object.position.set(...position);
  if (rotation) object.rotation.set(...rotation);
  object.castShadow = cast;
  object.receiveShadow = receive;
  return object;
}

function box(size, material, options = {}) {
  return mesh(new THREE.BoxGeometry(...size), material, options);
}

const room = new THREE.Group();
room.name = 'Photoreal classroom shell';
scene.add(room);

function makeBoardTexture() {
  const board = canvasTexture(1024, 420);
  const ctx = board.context;
  ctx.fillStyle = '#1e5144';
  ctx.fillRect(0, 0, 1024, 420);
  const speck = (x, y) => ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1;
  for (let i = 0; i < 1300; i += 1) {
    const x = (i * 73) % 1024;
    const y = (i * 191) % 420;
    ctx.fillStyle = `rgba(235,244,221,${.012 + speck(x, y) * .02})`;
    ctx.fillRect(x, y, 2, 2);
  }
  return board;
}

const boardCanvas = makeBoardTexture();
function drawBoard(snapshot = null) {
  const { context: ctx, canvas, texture } = boardCanvas;
  ctx.fillStyle = '#1e5144';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(235,244,221,.045)';
  ctx.lineWidth = 2;
  for (let y = 22; y < canvas.height; y += 39) {
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.bezierCurveTo(280, y + 3, 730, y - 4, 1004, y + 1);
    ctx.stroke();
  }
  ctx.fillStyle = '#f2ebcf';
  ctx.font = '800 50px system-ui, sans-serif';
  ctx.fillText('AGENT HOMEROOM', 54, 78);
  ctx.fillStyle = '#a7c9bc';
  ctx.font = '700 21px ui-monospace, monospace';
  ctx.fillText('LIVE CLASS // CLICK A STUDENT TO FOCUS', 58, 115);
  ctx.strokeStyle = '#d6b75d';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(56, 137);
  ctx.lineTo(958, 137);
  ctx.stroke();
  const stats = snapshot?.stats ?? { working: 0, idle: 0, blocked: 0, done: 0 };
  const items = [
    ['WORKING', stats.working, '#68e3a9'],
    ['IDLE', stats.idle, '#9bc1dc'],
    ['BLOCKED', stats.blocked, '#ff6c73'],
    ['DONE', stats.done, '#f2c75b'],
  ];
  items.forEach(([label, count, color], index) => {
    const x = 61 + (index % 2) * 455;
    const y = 205 + Math.floor(index / 2) * 104;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y - 8, 10, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#e8eadb';
    ctx.font = '800 26px ui-monospace, monospace';
    ctx.fillText(label, x + 24, y);
    ctx.fillStyle = color;
    ctx.font = '900 56px ui-monospace, monospace';
    ctx.fillText(String(count).padStart(2, '0'), x + 280, y + 16);
  });
  texture.needsUpdate = true;
}

function buildRoom() {
  room.add(box([22.5, .24, 32.5], MAT.floor, { position: [0, -.12, 6], receive: true }));
  room.add(box([22.5, 8.8, .28], MAT.wall, { position: [0, 4.35, 22.15], receive: true }));
  room.add(box([.28, 8.8, 32.5], MAT.wall, { position: [-11.15, 4.35, 6], receive: true }));
  room.add(box([.28, 8.8, 32.5], MAT.wall, { position: [11.15, 4.35, 6], receive: true }));
  room.add(box([22.5, .24, 32.5], MAT.ceiling, { position: [0, 8.75, 6], receive: true }));
  room.add(box([22.5, .34, .32], MAT.wallTrim, { position: [0, .2, 22], receive: true }));
  room.add(box([.34, .34, 32], MAT.wallTrim, { position: [-10.96, .2, 6], receive: true }));
  room.add(box([.34, .34, 32], MAT.wallTrim, { position: [10.96, .2, 6], receive: true }));

  const boardFrame = box([.26, 4.25, 10.2], MAT.deskEdge, { position: [-10.91, 4.62, 2.2], cast: true });
  room.add(boardFrame);
  const board = mesh(
    new THREE.PlaneGeometry(9.7, 3.78),
    new THREE.MeshStandardMaterial({ map: boardCanvas.texture, roughness: .88 }),
    { position: [-10.73, 4.62, 2.2], rotation: [0, Math.PI / 2, 0], receive: true },
  );
  room.add(board);
  room.add(box([.42, .18, 10.3], MAT.deskTop, { position: [-10.65, 2.45, 2.2], cast: true }));

  const outside = new THREE.MeshBasicMaterial({ color: 0x9ed4e4 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xe5dfce, roughness: .7 });
  [-3.6, 3.2, 10, 16.7].forEach((z, index) => {
    const sky = mesh(new THREE.PlaneGeometry(4.25, 4.6), outside, { position: [11.02, 4.75, z], rotation: [0, -Math.PI / 2, 0] });
    room.add(sky);
    const glass = mesh(new THREE.PlaneGeometry(4.18, 4.5), MAT.glass, { position: [10.94, 4.75, z], rotation: [0, -Math.PI / 2, 0] });
    room.add(glass);
    room.add(box([.23, 4.95, .2], frameMat, { position: [10.84, 4.75, z - 2.25], cast: true }));
    room.add(box([.23, 4.95, .2], frameMat, { position: [10.84, 4.75, z + 2.25], cast: true }));
    room.add(box([.23, .2, 4.7], frameMat, { position: [10.84, 2.28, z], cast: true }));
    room.add(box([.23, .2, 4.7], frameMat, { position: [10.84, 7.22, z], cast: true }));
    room.add(box([.24, .13, 4.35], frameMat, { position: [10.72, 4.75, z], cast: true }));
    if (index < 3) {
      const patch = mesh(
        new THREE.PlaneGeometry(5.8, 2.4),
        new THREE.MeshBasicMaterial({ color: 0xffe7ad, transparent: true, opacity: .08, depthWrite: false, blending: THREE.AdditiveBlending }),
        { position: [5.8 - index * 2.4, .025, z + 1.5], rotation: [-Math.PI / 2, 0, -.1] },
      );
      room.add(patch);
    }
  });

  const panelMat = new THREE.MeshStandardMaterial({ color: 0xfff7df, emissive: 0xffe7b2, emissiveIntensity: 2.2, roughness: .26 });
  [-3, 5.7, 14.3].forEach((z) => {
    [-4.8, 4.8].forEach((x) => {
      room.add(box([3.8, .1, .72], panelMat, { position: [x, 8.59, z] }));
    });
  });

  const backBoardMat = new THREE.MeshStandardMaterial({ color: 0x424c47, roughness: .78 });
  room.add(box([7.3, 2.5, .18], backBoardMat, { position: [-3.1, 4.75, 21.93], cast: true }));
  const cards = [0xe6b35c, 0x86b4b0, 0xd88975, 0xd8d0b4, 0x78969c];
  cards.forEach((color, i) => {
    const card = box([.92 + (i % 2) * .25, .72, .025], new THREE.MeshStandardMaterial({ color, roughness: .95 }), {
      position: [-5.65 + i * 1.25, 5.03 + Math.sin(i * 2.1) * .38, 21.82],
    });
    card.rotation.z = (i - 2) * .035;
    room.add(card);
  });

  const clockFace = canvasTexture(256, 256);
  const c = clockFace.context;
  c.fillStyle = '#f4f0df'; c.beginPath(); c.arc(128, 128, 120, 0, TAU); c.fill();
  c.strokeStyle = '#4f5652'; c.lineWidth = 11; c.stroke();
  c.fillStyle = '#303633'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '900 25px system-ui';
  [12, 3, 6, 9].forEach((n, i) => {
    const a = i * Math.PI / 2;
    c.fillText(String(n), 128 + Math.sin(a) * 84, 128 - Math.cos(a) * 84);
  });
  const clockMesh = mesh(new THREE.CircleGeometry(.82, 40), new THREE.MeshBasicMaterial({ map: clockFace.texture }), {
    position: [7.25, 6.22, 21.95], rotation: [0, Math.PI, 0],
  });
  room.add(clockMesh);
  room.userData.clockTexture = clockFace;

  const cabinetMat = new THREE.MeshStandardMaterial({ color: 0x718079, roughness: .64, metalness: .25 });
  [-8.8, 8.9].forEach((x) => {
    const cabinet = box([2.55, 3.45, 1.15], cabinetMat, { position: [x, 1.72, 21.23], cast: true, receive: true });
    room.add(cabinet);
    for (let y = .55; y < 3.1; y += .64) room.add(box([2.18, .045, .06], MAT.metal, { position: [x, y, 20.63] }));
  });

  const podium = new THREE.Group();
  podium.add(box([3.2, .22, 1.72], MAT.deskTop, { position: [0, 2.65, 0], cast: true, receive: true }));
  podium.add(box([2.65, 2.6, .22], MAT.deskEdge, { position: [0, 1.3, .38], cast: true }));
  podium.add(box([.22, 2.6, 1.2], MAT.deskEdge, { position: [-1.23, 1.3, 0], cast: true }));
  podium.add(box([.22, 2.6, 1.2], MAT.deskEdge, { position: [1.23, 1.3, 0], cast: true }));
  podium.position.set(-7.3, 0, -6.25);
  podium.rotation.y = -.08;
  room.add(podium);
}

buildRoom();
drawBoard();

scene.add(new THREE.HemisphereLight(0xe5f2ef, 0x705943, 1.28));
const sun = new THREE.DirectionalLight(0xfff1d2, 2.75);
sun.position.set(13, 18, -5);
sun.target.position.set(-1, 0, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -16;
sun.shadow.camera.right = 16;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -12;
sun.shadow.camera.near = .5;
sun.shadow.camera.far = 48;
sun.shadow.bias = -.0006;
sun.shadow.normalBias = .025;
scene.add(sun, sun.target);
[
  [-4.7, 8.25, -2], [4.7, 8.25, -2],
  [-4.7, 8.25, 8], [4.7, 8.25, 8],
  [0, 8.25, 17],
].forEach(([x, y, z]) => scene.add(new THREE.PointLight(0xffe8c3, 14, 12, 2).translateX(x).translateY(y).translateZ(z)));

const SHARED = {
  head: new THREE.SphereGeometry(.43, 24, 18),
  eye: new THREE.SphereGeometry(.038, 12, 8),
  hand: new THREE.SphereGeometry(.14, 16, 10),
  upperArm: new THREE.CylinderGeometry(.145, .13, .78, 12),
  lowerArm: new THREE.CylinderGeometry(.115, .1, .72, 12),
  thumb: new THREE.CylinderGeometry(.052, .046, .24, 9),
  lowerLeg: new THREE.CylinderGeometry(.16, .14, .85, 12),
  shoe: new THREE.BoxGeometry(.36, .2, .55),
};

const skinMaterials = [0xf0c7a1, 0xdca77d, 0xc88d67, 0xa96e4e].map((color) => new THREE.MeshStandardMaterial({ color, roughness: .72 }));
const hairMaterials = [0x2a211c, 0x4a3023, 0x15191a, 0x6a4430].map((color) => new THREE.MeshStandardMaterial({ color, roughness: .86 }));
const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x202827, roughness: .72 });
const shoeMaterial = new THREE.MeshStandardMaterial({ color: 0x303838, roughness: .58 });

function createArm(side, shirtMaterial, skinMaterial) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * .64, 1.26, 0);
  const upper = mesh(SHARED.upperArm, shirtMaterial, { position: [0, -.39, 0], cast: true });
  shoulder.add(upper);
  const elbow = new THREE.Group();
  elbow.position.y = -.78;
  shoulder.add(elbow);
  elbow.add(mesh(SHARED.lowerArm, skinMaterial, { position: [0, -.36, 0], cast: true }));
  const hand = mesh(SHARED.hand, skinMaterial, { position: [0, -.76, -.01], cast: true });
  elbow.add(hand);
  const thumb = mesh(SHARED.thumb, skinMaterial, { position: [side * .13, -.65, -.02], rotation: [0, 0, side * -.38], cast: true });
  elbow.add(thumb);
  return { shoulder, elbow, hand, thumb };
}

function createStudent(agent, phase) {
  const seed = hash(agent.paneId);
  const skin = skinMaterials[seed % skinMaterials.length];
  const hair = hairMaterials[(seed >>> 3) % hairMaterials.length];
  const shirtColor = KIND_COLORS[agent.kind] ?? [0x526e9c, 0x7e5f93, 0x4e8062][seed % 3];
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: .68 });
  const root = new THREE.Group();
  root.position.set(0, 0, .67);

  const upper = new THREE.Group();
  upper.position.set(0, 1.46, 0);
  root.add(upper);
  const torso = mesh(new THREE.CapsuleGeometry(.54, .72, 8, 16), shirt, { position: [0, .66, 0], cast: true });
  torso.scale.z = .72;
  upper.add(torso);

  const collar = mesh(new THREE.TorusGeometry(.24, .038, 8, 24), new THREE.MeshStandardMaterial({ color: 0xe7e8dd, roughness: .75 }), {
    position: [0, 1.15, -.19], rotation: [Math.PI / 2, 0, 0],
  });
  upper.add(collar);

  const head = new THREE.Group();
  head.position.set(0, 1.73, -.015);
  upper.add(head);
  head.add(mesh(SHARED.head, skin, { cast: true }));
  const hairCap = mesh(new THREE.SphereGeometry(.445, 20, 12, 0, TAU, 0, Math.PI * .55), hair, { position: [0, .055, .015], cast: true });
  head.add(hairCap);
  if (seed % 3 === 0) {
    head.add(box([.14, .38, .12], hair, { position: [-.35, .12, -.23], rotation: [.12, 0, -.2] }));
    head.add(box([.14, .34, .12], hair, { position: [.34, .12, -.23], rotation: [.12, 0, .2] }));
  }
  [-1, 1].forEach((side) => head.add(mesh(SHARED.eye, darkMaterial, { position: [side * .15, .02, -.404] })));
  head.add(box([.16, .032, .032], new THREE.MeshStandardMaterial({ color: 0x8e4f45, roughness: .8 }), { position: [0, -.16, -.413] }));

  const left = createArm(-1, shirt, skin);
  const right = createArm(1, shirt, skin);
  upper.add(left.shoulder, right.shoulder);

  [-1, 1].forEach((side) => {
    root.add(box([.42, .4, 1.05], shirt, { position: [side * .31, 1.28, -.38], rotation: [.03, 0, 0], cast: true }));
    root.add(mesh(SHARED.lowerLeg, darkMaterial, { position: [side * .31, .71, -.86], cast: true }));
    root.add(mesh(SHARED.shoe, shoeMaterial, { position: [side * .31, .2, -1.02], rotation: [0, 0, 0], cast: true }));
  });

  const pencilMaterial = new THREE.MeshStandardMaterial({ color: 0xe8ba35, roughness: .52 });
  const pencil = mesh(new THREE.CylinderGeometry(.028, .028, .72, 8), pencilMaterial, {
    position: [.03, -.86, -.08], rotation: [0, 0, -.58],
  });
  right.elbow.add(pencil);

  return { root, upper, head, left, right, pencil, phase, status: agent.status };
}

function makeLabelSprite(agent) {
  const data = canvasTexture(640, 176);
  const material = new THREE.SpriteMaterial({ map: data.texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(4.45, 1.22, 1);
  sprite.renderOrder = 30;
  sprite.userData.canvas = data;
  updateLabelSprite(sprite, agent);
  return sprite;
}

function updateLabelSprite(sprite, agent) {
  const { context: ctx, canvas, texture } = sprite.userData.canvas;
  const status = STATUS[agent.status] ?? STATUS.unknown;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.shadowColor = 'rgba(0,0,0,.32)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  roundedRect(ctx, 14, 13, 612, 146, 25);
  ctx.fillStyle = 'rgba(18,25,24,.92)';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = `${status.css}c7`;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = status.css;
  roundedRect(ctx, 32, 33, 14, 14, 7);
  ctx.fill();
  const name = clampText(agent.name || agent.kind || 'agent', 19);
  ctx.fillStyle = '#f5f8f7';
  ctx.font = '800 29px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 60, 42);
  ctx.fillStyle = status.css;
  ctx.font = '800 18px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.fillText(agent.status.toUpperCase(), 600, 42);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#cbd4d1';
  ctx.font = '650 23px system-ui, sans-serif';
  ctx.fillText(clampText(agent.title || '작업 제목 없음', 34), 32, 90);
  ctx.fillStyle = '#7f8d89';
  ctx.font = '700 16px ui-monospace, monospace';
  ctx.fillText(clampText(agent.paneId, 38), 32, 128);
  texture.needsUpdate = true;
}

function makeIconSprite(character, color) {
  const data = canvasTexture(128, 128);
  const ctx = data.context;
  ctx.fillStyle = 'rgba(15,19,18,.86)';
  ctx.beginPath(); ctx.arc(64, 64, 55, 0, TAU); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 8; ctx.stroke();
  ctx.fillStyle = color; ctx.font = '900 82px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(character, 64, 61);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: data.texture, transparent: true, depthTest: false, depthWrite: false }));
  sprite.scale.set(1.1, 1.1, 1);
  sprite.renderOrder = 31;
  return sprite;
}

function buildDeskSlot(index) {
  const group = new THREE.Group();
  group.name = `Student desk ${index + 1}`;

  group.add(box([3.6, .18, 2.05], MAT.deskTop, { position: [0, 2.08, 0], cast: true, receive: true }));
  group.add(box([3.65, .14, .13], MAT.deskEdge, { position: [0, 1.97, -1.01], cast: true }));
  [-1, 1].forEach((x) => [-1, 1].forEach((z) => {
    group.add(box([.13, 2.02, .13], MAT.metal, { position: [x * 1.48, 1.01, z * .78], cast: true }));
  }));
  group.add(box([2.75, .07, 1.3], MAT.metal, { position: [0, .64, .03], cast: true }));

  group.add(box([1.62, .18, 1.48], MAT.chair, { position: [0, 1.18, 1.43], cast: true }));
  group.add(box([1.62, 1.35, .18], MAT.chair, { position: [0, 1.86, 2.05], rotation: [-.08, 0, 0], cast: true }));
  [-.62, .62].forEach((x) => group.add(box([.12, 1.18, .12], MAT.metal, { position: [x, .59, 1.66], cast: true })));

  const paper = box([1.12, .035, .78], MAT.paper, { position: [.24, 2.19, -.25], rotation: [0, .04, 0], receive: true });
  group.add(paper);
  for (let i = 0; i < 4; i += 1) {
    group.add(box([.72 - i * .08, .006, .014], new THREE.MeshBasicMaterial({ color: 0x9aa5a1 }), { position: [.2, 2.213, -.47 + i * .14] }));
  }

  const focusRingMaterial = new THREE.MeshBasicMaterial({ color: 0xffd76d, transparent: true, opacity: .0, depthWrite: false, blending: THREE.AdditiveBlending });
  const focusRing = mesh(new THREE.TorusGeometry(1.82, .045, 10, 72), focusRingMaterial, { position: [0, .07, .7], rotation: [Math.PI / 2, 0, 0] });
  group.add(focusRing);

  const labelAnchor = new THREE.Group();
  labelAnchor.position.set(0, 5.45, .55);
  group.add(labelAnchor);

  const hitbox = mesh(new THREE.BoxGeometry(4.25, 5.45, 3.45), new THREE.MeshBasicMaterial({ transparent: true, opacity: .001, depthWrite: false }), { position: [0, 2.72, .45] });
  hitbox.userData.slotIndex = index;
  group.add(hitbox);

  const blocked = new THREE.Group();
  const blockedMaterial = new THREE.MeshBasicMaterial({ color: STATUS.blocked.color, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending });
  const beam = mesh(new THREE.ConeGeometry(1.8, 6.4, 28, 1, true), blockedMaterial.clone(), { position: [0, 5.9, .6] });
  beam.material.opacity = .08;
  blocked.add(beam);
  const rings = [1.0, 1.5, 2.05].map((radius, i) => {
    const ring = mesh(new THREE.TorusGeometry(radius, .045 + i * .012, 10, 64), blockedMaterial.clone(), {
      position: [0, 2.5 + i * .45, .62], rotation: [Math.PI / 2, 0, 0],
    });
    blocked.add(ring);
    return ring;
  });
  const alertIcon = makeIconSprite('!', '#ff5962');
  alertIcon.position.set(1.35, 5.7, .62);
  blocked.add(alertIcon);
  const warningLight = new THREE.PointLight(STATUS.blocked.color, 0, 7, 2);
  warningLight.position.set(0, 4.4, .55);
  blocked.add(warningLight);
  blocked.visible = false;
  group.add(blocked);

  const transitionMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const transitionRing = mesh(new THREE.TorusGeometry(.82, .075, 10, 64), transitionMaterial, { position: [0, .14, .65], rotation: [Math.PI / 2, 0, 0] });
  group.add(transitionRing);
  const sparks = Array.from({ length: 8 }, (_, i) => {
    const spark = mesh(new THREE.SphereGeometry(.07, 8, 6), transitionMaterial.clone(), { position: [0, 1.5, .65] });
    spark.userData.angle = i / 8 * TAU;
    group.add(spark);
    return spark;
  });

  const col = index % 3;
  const rowIndex = Math.floor(index / 3);
  group.position.set([-6.35, 0, 6.35][col], 0, [-1.0, 5.2, 11.4, 17.25][rowIndex]);
  group.rotation.y = (hash(index) % 7 - 3) * .006;
  group.visible = false;
  scene.add(group);

  return {
    index, group, labelAnchor, hitbox, focusRing, blocked, beam, rings, alertIcon, warningLight,
    transitionRing, sparks, agent: null, student: null, label: null, status: 'unknown',
    fxStart: -10, spawnAt: -10, hovered: false,
  };
}

const slots = Array.from({ length: MAX_STUDENTS }, (_, index) => buildDeskSlot(index));
const slotByPane = new Map();
let currentSnapshot = null;
let feedSeeded = false;
let hoveredSlot = null;

function setSlotAgent(slot, agent, initial = false) {
  const replacing = slot.agent?.paneId !== agent.paneId;
  if (replacing) {
    if (slot.student) slot.group.remove(slot.student.root);
    if (slot.label) slot.labelAnchor.remove(slot.label);
    slot.student = createStudent(agent, (hash(agent.paneId) % 628) / 100);
    slot.group.add(slot.student.root);
    slot.label = makeLabelSprite(agent);
    const row = Math.floor(slot.index / 3);
    slot.label.scale.set(2.88 + row * .5, .79 + row * .14, 1);
    slot.labelAnchor.add(slot.label);
    slot.agent = agent;
    slot.status = agent.status;
    slot.group.visible = true;
    slot.group.scale.setScalar(.001);
    slot.spawnAt = performance.now() / 1000;
    if (!initial) triggerTransition(slot, agent.status);
  } else {
    slot.agent = agent;
    slot.student.status = agent.status;
    slot.status = agent.status;
    updateLabelSprite(slot.label, agent);
  }
  slot.blocked.visible = agent.status === 'blocked';
  slot.student.pencil.visible = agent.status === 'working';
  slot.student.left.thumb.visible = agent.status === 'done';
  slot.student.right.thumb.visible = agent.status === 'done';
}

function clearSlot(slot) {
  if (!slot.agent) return;
  slotByPane.delete(slot.agent.paneId);
  slot.agent = null;
  slot.group.visible = false;
  slot.blocked.visible = false;
  slot.hovered = false;
  if (hoveredSlot === slot) setHovered(null);
}

function triggerTransition(slot, status) {
  const state = STATUS[status] ?? STATUS.unknown;
  slot.fxStart = performance.now() / 1000;
  slot.transitionRing.material.color.setHex(state.color);
  slot.transitionRing.material.opacity = .9;
  slot.transitionRing.scale.setScalar(1);
  slot.sparks.forEach((spark) => {
    spark.material.color.setHex(state.color);
    spark.material.opacity = .9;
    spark.position.set(0, 1.45, .65);
  });
  slot.blocked.visible = status === 'blocked';
}

function allocateSlot(agent) {
  let slot = slotByPane.get(agent.paneId);
  if (slot) return slot;
  slot = slots.find((candidate) => !candidate.agent);
  if (!slot) return null;
  slotByPane.set(agent.paneId, slot);
  return slot;
}

function syncSnapshot(snapshot) {
  const firstSnapshot = currentSnapshot === null;
  currentSnapshot = snapshot;
  const visibleAgents = snapshot.agents.slice(0, MAX_STUDENTS);
  const active = new Set(visibleAgents.map((agent) => agent.paneId));
  slots.forEach((slot) => {
    if (slot.agent && !active.has(slot.agent.paneId)) clearSlot(slot);
  });
  visibleAgents.forEach((agent) => {
    const slot = allocateSlot(agent);
    if (slot) setSlotAgent(slot, agent, firstSnapshot);
  });

  ['working', 'idle', 'blocked', 'done'].forEach((status) => {
    $(`${status}-count`).textContent = snapshot.stats[status];
  });
  $('seq').textContent = `SEQ ${String(snapshot.seq).padStart(4, '0')}`;
  $('source-label').textContent = `${snapshot.source.toUpperCase()} · ${snapshot.connected ? 'SOURCE ONLINE' : 'LAST KNOWN'}`;
  $('live-dot').classList.toggle('up', snapshot.connected);
  document.body.classList.toggle('has-blocked', snapshot.stats.blocked > 0);
  drawBoard(snapshot);

  if (!feedSeeded) {
    feedSeeded = true;
    snapshot.recentEvents.slice(-5).forEach((event) => pushEvent(event, false));
  }
}

const POSES = {
  working: {
    bodyX: -.15, bodyY: 1.46, headX: .1, headZ: .015,
    luX: 1.13, luZ: -.18, leX: -.58, leZ: .12,
    ruX: 1.24, ruZ: .2, reX: -.68, reZ: -.1,
  },
  idle: {
    bodyX: -1.03, bodyY: 1.48, headX: .22, headZ: .08,
    luX: 1.42, luZ: -.44, leX: -.35, leZ: .18,
    ruX: 1.42, ruZ: .44, reX: -.35, reZ: -.18,
  },
  blocked: {
    bodyX: -.04, bodyY: 1.5, headX: -.05, headZ: -.05,
    luX: .45, luZ: -.22, leX: -.28, leZ: .08,
    ruX: 0, ruZ: Math.PI, reX: 0, reZ: 0,
  },
  done: {
    bodyX: -.03, bodyY: 1.5, headX: -.06, headZ: 0,
    luX: 0, luZ: -.9, leX: 0, leZ: -2.15,
    ruX: 0, ruZ: .9, reX: 0, reZ: 2.15,
  },
  unknown: {
    bodyX: -.05, bodyY: 1.46, headX: 0, headZ: .05,
    luX: .12, luZ: -.08, leX: -.1, leZ: 0,
    ruX: .12, ruZ: .08, reX: -.1, reZ: 0,
  },
};

function animateStudent(slot, elapsed, dt) {
  const student = slot.student;
  if (!student || !slot.agent) return;
  const pose = POSES[slot.status] ?? POSES.unknown;
  const phase = student.phase;
  const writing = slot.status === 'working' ? Math.sin(elapsed * 8.4 + phase) : 0;
  const wave = slot.status === 'blocked' ? Math.sin(elapsed * 7.6 + phase) : 0;
  const celebrate = slot.status === 'done' ? Math.sin(elapsed * 4.4 + phase) : 0;
  const breathe = Math.sin(elapsed * 1.35 + phase) * .012;
  const rate = slot.status === 'blocked' ? 9.5 : 7.2;

  student.upper.position.y = damp(student.upper.position.y, pose.bodyY + breathe, rate, dt);
  student.upper.rotation.x = damp(student.upper.rotation.x, pose.bodyX, rate, dt);
  student.head.rotation.x = damp(student.head.rotation.x, pose.headX + (slot.status === 'idle' ? breathe * 2 : 0), rate, dt);
  student.head.rotation.z = damp(student.head.rotation.z, pose.headZ + (slot.status === 'blocked' ? wave * .045 : 0), rate, dt);

  student.left.shoulder.rotation.x = damp(student.left.shoulder.rotation.x, pose.luX + writing * .08, rate, dt);
  student.left.shoulder.rotation.z = damp(student.left.shoulder.rotation.z, pose.luZ, rate, dt);
  student.left.elbow.rotation.x = damp(student.left.elbow.rotation.x, pose.leX - writing * .16, rate, dt);
  student.left.elbow.rotation.z = damp(student.left.elbow.rotation.z, pose.leZ + celebrate * .025, rate, dt);
  student.right.shoulder.rotation.x = damp(student.right.shoulder.rotation.x, pose.ruX + writing * .13 + wave * .24, rate, dt);
  student.right.shoulder.rotation.z = damp(student.right.shoulder.rotation.z, pose.ruZ + wave * .15, rate, dt);
  student.right.elbow.rotation.x = damp(student.right.elbow.rotation.x, pose.reX - writing * .2, rate, dt);
  student.right.elbow.rotation.z = damp(student.right.elbow.rotation.z, pose.reZ - celebrate * .025, rate, dt);

  student.pencil.visible = slot.status === 'working';
  student.left.thumb.visible = slot.status === 'done';
  student.right.thumb.visible = slot.status === 'done';
}

function animateSlot(slot, elapsed, dt) {
  if (!slot.group.visible) return;
  const age = elapsed - slot.spawnAt;
  const targetScale = 1;
  const scale = damp(slot.group.scale.x, targetScale, age < .8 ? 7 : 14, dt);
  slot.group.scale.setScalar(scale);
  animateStudent(slot, elapsed, dt);

  const focused = currentSnapshot?.focus?.paneId === slot.agent?.paneId;
  const ringTarget = focused || slot.hovered ? (focused ? .82 : .42) : 0;
  slot.focusRing.material.opacity = damp(slot.focusRing.material.opacity, ringTarget, 8, dt);
  slot.focusRing.rotation.z += dt * (focused ? .42 : .18);
  slot.focusRing.scale.setScalar(1 + Math.sin(elapsed * 2.8 + slot.index) * .025);

  if (slot.status === 'blocked') {
    const pulse = .5 + Math.sin(elapsed * 6.2 + slot.index) * .5;
    slot.warningLight.intensity = 2.8 + pulse * 8;
    slot.beam.material.opacity = .045 + pulse * .045;
    slot.beam.rotation.y += dt * .32;
    slot.rings.forEach((ring, i) => {
      ring.material.opacity = .2 + pulse * (.25 + i * .08);
      ring.scale.setScalar(1 + Math.sin(elapsed * 4.3 + i * 1.7) * .08);
      ring.rotation.z += dt * (.38 + i * .14) * (i % 2 ? -1 : 1);
    });
    slot.alertIcon.position.y = 5.72 + Math.sin(elapsed * 4.8) * .12;
  }

  const fxAge = elapsed - slot.fxStart;
  if (fxAge >= 0 && fxAge < 1.25) {
    const p = fxAge / 1.25;
    slot.transitionRing.visible = true;
    slot.transitionRing.scale.setScalar(1 + p * 3.7);
    slot.transitionRing.material.opacity = (1 - p) * .86;
    slot.sparks.forEach((spark, i) => {
      const angle = spark.userData.angle;
      const radius = p * (1.3 + (i % 3) * .22);
      spark.position.set(Math.cos(angle) * radius, 1.48 + p * (2.1 + (i % 2) * .5), .65 + Math.sin(angle) * radius);
      spark.material.opacity = (1 - p) * .85;
    });
  } else {
    slot.transitionRing.material.opacity = 0;
    slot.sparks.forEach((spark) => { spark.material.opacity = 0; });
  }
}

function updateClockFace() {
  const data = room.userData.clockTexture;
  if (!data) return;
  const ctx = data.context;
  const now = new Date();
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = '#f4f0df'; ctx.beginPath(); ctx.arc(128, 128, 120, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#4f5652'; ctx.lineWidth = 11; ctx.stroke();
  ctx.fillStyle = '#303633'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 25px system-ui';
  [12, 3, 6, 9].forEach((n, i) => {
    const a = i * Math.PI / 2;
    ctx.fillText(String(n), 128 + Math.sin(a) * 84, 128 - Math.cos(a) * 84);
  });
  const hand = (fraction, length, width, color) => {
    const a = fraction * TAU;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(128 + Math.sin(a) * length, 128 - Math.cos(a) * length); ctx.stroke();
  };
  hand(((now.getHours() % 12) + now.getMinutes() / 60) / 12, 49, 8, '#343a37');
  hand((now.getMinutes() + now.getSeconds() / 60) / 60, 75, 5, '#343a37');
  hand(now.getSeconds() / 60, 82, 2, '#d55b4e');
  ctx.fillStyle = '#343a37'; ctx.beginPath(); ctx.arc(128, 128, 7, 0, TAU); ctx.fill();
  data.texture.needsUpdate = true;
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
function pickSlot(event) {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  const hitboxes = slots.filter((slot) => slot.agent && slot.group.visible).map((slot) => slot.hitbox);
  const hit = raycaster.intersectObjects(hitboxes, false)[0];
  return hit ? slots[hit.object.userData.slotIndex] : null;
}

function setHovered(slot, event = null) {
  if (hoveredSlot === slot && (!slot || tooltip.classList.contains('show'))) {
    if (slot && event) positionTooltip(event);
    return;
  }
  if (hoveredSlot) hoveredSlot.hovered = false;
  hoveredSlot = slot;
  renderer.domElement.style.cursor = slot ? 'pointer' : 'default';
  if (!slot) {
    tooltip.classList.remove('show');
    return;
  }
  slot.hovered = true;
  tooltip.replaceChildren();
  const title = document.createElement('b');
  title.textContent = slot.agent.name || slot.agent.kind || 'agent';
  const detail = document.createElement('span');
  detail.textContent = `${(STATUS[slot.status] ?? STATUS.unknown).label}\n${slot.agent.title}\n${slot.agent.paneId} · 클릭 = pane 이동`;
  detail.style.whiteSpace = 'pre-line';
  tooltip.append(title, detail);
  tooltip.classList.add('show');
  if (event) positionTooltip(event);
}

function positionTooltip(event) {
  const pad = 12;
  const left = Math.min(event.clientX + 15, window.innerWidth - tooltip.offsetWidth - pad);
  const top = Math.min(event.clientY + 17, window.innerHeight - tooltip.offsetHeight - pad);
  tooltip.style.left = `${Math.max(pad, left)}px`;
  tooltip.style.top = `${Math.max(pad, top)}px`;
}

renderer.domElement.addEventListener('pointermove', (event) => {
  const bounds = renderer.domElement.getBoundingClientRect();
  mouseTarget.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  setHovered(pickSlot(event), event);
});
renderer.domElement.addEventListener('pointerleave', () => {
  mouseTarget.set(0, 0);
  setHovered(null);
});
renderer.domElement.addEventListener('click', async (event) => {
  const slot = pickSlot(event);
  if (!slot?.agent) return;
  const paneId = slot.agent.paneId;
  const success = await client.focusPane(paneId);
  showToast(success ? `${paneId} pane으로 이동했습니다` : `${paneId} pane 이동에 실패했습니다`);
  if (success) triggerTransition(slot, slot.status);
});
renderer.domElement.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  showToast('WebGL 연결이 잠시 중단되었습니다');
});

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1700);
}

function describeEvent(event) {
  switch (event.type) {
    case 'agent_status_changed': return `${event.name || event.kind} · ${event.from} → ${event.to}`;
    case 'agent_appeared': return `${event.name || event.kind} 학생이 교실에 들어왔습니다`;
    case 'agent_left': return `${event.name || event.kind} 학생이 교실을 나갔습니다`;
    case 'agent_title_changed': return `${event.kind} · ${event.title}`;
    case 'focus_changed': return `포커스 · ${event.focus.paneId || 'none'}`;
    case 'source_connected': return 'herdr 소스가 연결되었습니다';
    case 'source_disconnected': return 'herdr 소스 연결이 끊겼습니다';
    default: return event.type.replaceAll('_', ' ');
  }
}

function pushEvent(event, newestFirst = true) {
  const row = document.createElement('div');
  const state = event.to || event.status || '';
  row.className = `event ${state}`;
  const time = document.createElement('time');
  time.textContent = new Date(event.ts).toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dot = document.createElement('i');
  const text = document.createElement('strong');
  text.textContent = describeEvent(event);
  row.append(time, dot, text);
  if (newestFirst) eventList.prepend(row);
  else eventList.append(row);
  while (eventList.childElementCount > 5) eventList.lastElementChild.remove();
}

function resize() {
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.fov = camera.aspect < .72 ? 70 : camera.aspect < 1.1 ? 61 : 51;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize, { passive: true });
new ResizeObserver(resize).observe(stage);
resize();

const client = connect();
client.onTransport((up) => {
  $('live-dot').classList.toggle('up', up && (currentSnapshot?.connected ?? true));
  if (!up) $('source-label').textContent = 'RECONNECTING';
});
client.onUpdate(({ snapshot }) => syncSnapshot(snapshot));
client.onEvent('agent_status_changed', (event) => {
  const slot = slotByPane.get(event.paneId);
  if (!slot) return;
  slot.status = event.to;
  if (slot.student) slot.student.status = event.to;
  if (slot.agent) {
    slot.agent = { ...slot.agent, status: event.to, title: event.title };
    updateLabelSprite(slot.label, slot.agent);
  }
  triggerTransition(slot, event.to);
});
client.onEvent('*', (event) => pushEvent(event));

let lastClockSecond = -1;
function render() {
  requestAnimationFrame(render);
  const dt = Math.min(clock.getDelta(), .05);
  const elapsed = clock.elapsedTime;
  mouseSmooth.x = damp(mouseSmooth.x, mouseTarget.x, 3.6, dt);
  mouseSmooth.y = damp(mouseSmooth.y, mouseTarget.y, 3.6, dt);
  camera.position.set(
    cameraBase.x + mouseSmooth.x * .38,
    cameraBase.y + mouseSmooth.y * .17 + Math.sin(elapsed * .35) * .018,
    cameraBase.z,
  );
  lookNow.set(
    lookBase.x + mouseSmooth.x * .48,
    lookBase.y + mouseSmooth.y * .2,
    lookBase.z,
  );
  camera.lookAt(lookNow);
  slots.forEach((slot) => animateSlot(slot, elapsed, dt));

  const second = Math.floor(elapsed);
  if (second !== lastClockSecond) {
    lastClockSecond = second;
    const now = new Date();
    $('clock').textContent = now.toLocaleTimeString('ko-KR', { hour12: false });
    updateClockFace();
  }
  renderer.render(scene, camera);
}

render();
requestAnimationFrame(() => loading.classList.add('out'));
window.__CLASSROOM3D_READY__ = true;
window.__CLASSROOM3D__ = { renderer, scene, camera, slots, client };
