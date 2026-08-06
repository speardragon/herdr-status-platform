import * as THREE from './three.module.js';
import { connect } from '/sdk.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const tooltip = $('tooltip');
const toast = $('toast');
const feedList = $('feed-list');

const STATUS = {
  working: { label: '필기 중', color: 0x57d58a, css: '#57d58a' },
  idle: { label: '엎드림', color: 0x8eacc0, css: '#8eacc0' },
  blocked: { label: '질문 있음', color: 0xff5f68, css: '#ff5f68' },
  done: { label: '완료', color: 0xffd36a, css: '#ffd36a' },
  unknown: { label: '확인 중', color: 0xa98adb, css: '#a98adb' },
};

const normalizeStatus = (status) => STATUS[status] ? status : 'unknown';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const short = (value, length = 23) => {
  const text = String(value ?? '').trim() || '작업 제목을 기다리는 중';
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};
const approach = (from, to, rate, dt) => from + (to - from) * (1 - Math.exp(-rate * dt));
const hash = (value) => [...String(value ?? '')].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 17);

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function canvasTexture(width, height, painter) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  painter(ctx, canvas);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, ctx, texture };
}

function createFloorTexture() {
  const surface = canvasTexture(768, 768, (ctx, canvas) => {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#c99a68');
    gradient.addColorStop(.48, '#b47d4e');
    gradient.addColorStop(1, '#8e5f3d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 54) {
      ctx.fillStyle = 'rgba(66, 37, 20, .32)';
      ctx.fillRect(0, y, canvas.width, 2);
      for (let x = ((y / 54) % 2) * -130; x < canvas.width; x += 260) {
        ctx.fillStyle = 'rgba(66, 37, 20, .22)';
        ctx.fillRect(x, y, 2, 54);
      }
      for (let streak = 0; streak < 16; streak += 1) {
        const seed = Math.sin((y + streak * 83) * 12.9898) * 43758.5453;
        const start = (seed - Math.floor(seed)) * canvas.width;
        ctx.fillStyle = streak % 3 === 0 ? 'rgba(255, 224, 176, .12)' : 'rgba(79, 42, 22, .11)';
        ctx.fillRect(start, y + 9 + (streak % 4) * 10, 42 + (streak % 5) * 37, 1.4);
      }
    }
  });
  surface.texture.wrapS = THREE.RepeatWrapping;
  surface.texture.wrapT = THREE.RepeatWrapping;
  surface.texture.repeat.set(4.8, 6.8);
  surface.texture.anisotropy = 8;
  return surface.texture;
}

function createAlertTexture() {
  return canvasTexture(160, 160, (ctx, canvas) => {
    const r = canvas.width / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const glow = ctx.createRadialGradient(r, r, 8, r, r, 72);
    glow.addColorStop(0, 'rgba(255,255,255,.98)');
    glow.addColorStop(.28, 'rgba(255,230,200,.98)');
    glow.addColorStop(.3, 'rgba(255,95,104,.97)');
    glow.addColorStop(1, 'rgba(255,95,104,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(r, r, 72, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7f1f29';
    ctx.font = '900 96px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', r, r + 5);
  }).texture;
}

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.16;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fb3c0);
scene.fog = new THREE.Fog(0x8fb3c0, 32, 68);

const camera = new THREE.PerspectiveCamera(54, 1, .1, 100);
const cameraBase = new THREE.Vector3(0, 6.65, -15.2);
const cameraTargetBase = new THREE.Vector3(0, 3.55, 5.3);
const cameraTarget = cameraTargetBase.clone();
camera.position.copy(cameraBase);
camera.lookAt(cameraTarget);

function resize() {
  const width = Math.max(stage.clientWidth, 1);
  const height = Math.max(stage.clientHeight, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
resize();

const floorTexture = createFloorTexture();
const material = {
  floor: new THREE.MeshStandardMaterial({ map: floorTexture, roughness: .72, metalness: .02 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xe6ddcf, roughness: .88 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x766555, roughness: .62 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0xf5eee2, roughness: .9, side: THREE.DoubleSide }),
  windowFrame: new THREE.MeshStandardMaterial({ color: 0x5a6570, roughness: .45, metalness: .42 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xaee6fa, roughness: .16, metalness: .03, transparent: true, opacity: .44, transmission: .08, side: THREE.DoubleSide }),
  sky: new THREE.MeshBasicMaterial({ color: 0xbfe9f7, side: THREE.DoubleSide }),
  wood: new THREE.MeshStandardMaterial({ color: 0x74482d, roughness: .58 }),
  woodLight: new THREE.MeshStandardMaterial({ color: 0xb7794e, roughness: .52 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x3c4950, roughness: .35, metalness: .7 }),
  paper: new THREE.MeshStandardMaterial({ color: 0xfffbeb, roughness: .94 }),
  chair: new THREE.MeshStandardMaterial({ color: 0x4d6970, roughness: .56 }),
  plant: new THREE.MeshStandardMaterial({ color: 0x3f7c55, roughness: .72 }),
};

function box(parent, width, height, depth, meshMaterial, x = 0, y = 0, z = 0, shadows = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), meshMaterial);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, radiusTop, radiusBottom, height, meshMaterial, x = 0, y = 0, z = 0, shadows = true) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 12), meshMaterial);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makePlant(x, z, scale = 1) {
  const plant = new THREE.Group();
  plant.position.set(x, 0, z);
  cylinder(plant, .62, .76, 1.04, material.woodLight, 0, .52, 0);
  for (let index = 0; index < 8; index += 1) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(.62, 12, 10), material.plant);
    const angle = (Math.PI * 2 * index) / 8;
    leaf.position.set(Math.cos(angle) * .43, 1.55 + (index % 2) * .22, Math.sin(angle) * .43);
    leaf.scale.set(.55, 1.3, .72);
    leaf.rotation.z = Math.cos(angle) * .5;
    leaf.castShadow = true;
    plant.add(leaf);
  }
  plant.scale.setScalar(scale);
  scene.add(plant);
}

const blackboard = canvasTexture(1024, 420, () => {});

function drawBlackboard(snapshot) {
  const { ctx, canvas, texture } = blackboard;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const grain = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grain.addColorStop(0, '#143f35');
  grain.addColorStop(.55, '#1d5848');
  grain.addColorStop(1, '#10372f');
  ctx.fillStyle = grain;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(235,255,239,.07)';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 35) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 18, canvas.height); ctx.stroke();
  }
  ctx.fillStyle = '#eaf4d9';
  ctx.font = '700 47px Georgia, serif';
  ctx.fillText('LIVE CLASSROOM', 48, 76);
  ctx.fillStyle = '#b8d6b8';
  ctx.font = '600 25px system-ui, sans-serif';
  ctx.fillText('TEACHER DASHBOARD · REAL-TIME AGENT ATTENDANCE', 50, 116);
  ctx.strokeStyle = 'rgba(230,255,229,.52)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(48, 140); ctx.lineTo(canvas.width - 48, 140); ctx.stroke();

  const stats = snapshot?.stats ?? { working: 0, idle: 0, blocked: 0, done: 0 };
  const columns = [
    ['WORK', stats.working, '#70e39c'],
    ['REST', stats.idle, '#b6d1e2'],
    ['HELP', stats.blocked, '#ff9ca2'],
    ['DONE', stats.done, '#ffe18b'],
  ];
  columns.forEach(([label, amount, color], index) => {
    const x = 48 + index * 220;
    ctx.fillStyle = color;
    ctx.font = '700 24px ui-monospace, monospace';
    ctx.fillText(label, x, 190);
    ctx.font = '800 66px Georgia, serif';
    ctx.fillText(String(amount), x, 260);
  });

  const attention = snapshot?.agents?.filter((agent) => agent.status === 'blocked').slice(0, 2) ?? [];
  ctx.fillStyle = attention.length ? '#ffd3bd' : '#c2ddca';
  ctx.font = '600 25px system-ui, sans-serif';
  const notice = attention.length
    ? `QUESTION: ${attention.map((agent) => short(agent.title, 22)).join('  ·  ')}`
    : 'TODAY: Every student is visible from the teacher desk.';
  ctx.fillText(short(notice, 70), 48, 348);
  texture.needsUpdate = true;
}

function buildClassroom() {
  const room = new THREE.Group();
  scene.add(room);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 40), material.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  room.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(28, 40), material.ceiling);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 12;
  ceiling.receiveShadow = true;
  room.add(ceiling);

  box(room, 28, 12, .38, material.wall, 0, 6, 20);
  box(room, 28, 12, .38, material.wall, 0, 6, -19);
  box(room, .38, 12, 39, material.wall, -13.8, 6, .5);
  box(room, .38, 3.1, 39, material.wall, 13.8, 1.55, .5);
  box(room, .38, 2.05, 39, material.wall, 13.8, 10.98, .5);

  const windowCenters = [-15.2, -9.1, -3, 3.1, 9.2, 15.3];
  for (const z of [-18.2, -12.15, -6.05, .05, 6.15, 12.25, 18.35]) {
    box(room, .46, 6.1, .32, material.wall, 13.8, 6.1, z);
  }
  for (const z of windowCenters) {
    box(room, .06, 6.0, 5.55, material.sky, 14.03, 6.2, z, false);
    box(room, .08, 5.9, 5.42, material.glass, 13.57, 6.2, z, false);
    box(room, .16, 6.16, .12, material.windowFrame, 13.46, 6.2, z - 2.75);
    box(room, .16, 6.16, .12, material.windowFrame, 13.46, 6.2, z + 2.75);
    box(room, .16, .14, 5.58, material.windowFrame, 13.46, 6.2, z);
  }

  const board = new THREE.Mesh(new THREE.PlaneGeometry(12.2, 4.65), new THREE.MeshStandardMaterial({ map: blackboard.texture, roughness: .84 }));
  board.position.set(0, 7.2, 19.74);
  board.rotation.y = Math.PI;
  board.receiveShadow = true;
  room.add(board);
  box(room, 12.9, .35, .38, material.wood, 0, 9.63, 19.75);
  box(room, 12.9, .35, .38, material.wood, 0, 4.77, 19.75);
  box(room, .35, 5.15, .38, material.wood, -6.28, 7.2, 19.75);
  box(room, .35, 5.15, .38, material.wood, 6.28, 7.2, 19.75);
  box(room, 12.8, .14, .75, material.woodLight, 0, 4.58, 19.45);

  const sideBoard = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 3.2), new THREE.MeshStandardMaterial({ color: 0x17493d, roughness: .85 }));
  sideBoard.position.set(-13.55, 7.15, -5.8);
  sideBoard.rotation.y = Math.PI / 2;
  room.add(sideBoard);
  box(room, .26, 3.65, 7.2, material.wood, -13.6, 7.15, -5.8);

  const door = new THREE.Group();
  door.position.set(-13.5, 0, 14.8);
  box(door, .18, 7.8, 3.8, material.wood, 0, 3.9, 0);
  box(door, .08, 1.0, .16, material.woodLight, -.16, 3.9, 1.22);
  room.add(door);

  for (const z of [-10, 0, 10]) {
    box(room, 4.5, .15, 1.1, new THREE.MeshStandardMaterial({ color: 0xfff5d9, emissive: 0xffe9b0, emissiveIntensity: .6, roughness: .5 }), 0, 11.72, z, false);
    const light = new THREE.PointLight(0xfff3d7, 28, 19, 2);
    light.position.set(0, 10.9, z);
    room.add(light);
  }

  makePlant(-11.7, 16.4, 1.08);
  makePlant(11.65, 16.9, .86);
  makePlant(-11.8, -14.6, .72);

  return room;
}

buildClassroom();

const hemisphere = new THREE.HemisphereLight(0xe9f7ff, 0x705643, 1.62);
scene.add(hemisphere);

const sun = new THREE.DirectionalLight(0xfff5dd, 3.35);
sun.position.set(21, 18, -8);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
sun.shadow.camera.left = -22;
sun.shadow.camera.right = 22;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -22;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 55;
sun.shadow.bias = -.00035;
sun.target.position.set(0, 0, 4);
scene.add(sun, sun.target);

const alertTarget = new THREE.Object3D();
const alertSpot = new THREE.SpotLight(0xff4352, 0, 24, .54, .5, 1.2);
alertSpot.position.set(0, 9.5, 0);
alertSpot.target = alertTarget;
scene.add(alertSpot, alertTarget);

function makeDesk(index, x, z) {
  const desk = new THREE.Group();
  desk.position.set(x, 0, z);
  desk.rotation.y = ((index % 3) - 1) * .018;
  scene.add(desk);

  box(desk, 5.32, .25, 2.38, material.woodLight, 0, 2.32, 0);
  box(desk, 5.48, .16, 2.54, material.wood, 0, 2.11, 0);
  for (const legX of [-2.25, 2.25]) {
    for (const legZ of [-.85, .85]) cylinder(desk, .11, .15, 2.05, material.metal, legX, 1.05, legZ);
  }
  box(desk, 4.75, .92, .12, material.wood, 0, 1.54, -.98);
  box(desk, .72, .28, .52, material.paper, -.72, 2.48, -.18, false);
  const pen = cylinder(desk, .035, .035, .76, new THREE.MeshStandardMaterial({ color: 0x2f6fa1, roughness: .36, metalness: .15 }), .25, 2.5, -.12, false);
  pen.rotation.z = Math.PI / 2.8;
  const cup = cylinder(desk, .16, .21, .33, new THREE.MeshStandardMaterial({ color: 0xe1eced, roughness: .3 }), 1.72, 2.52, -.58, false);

  box(desk, 2.15, .18, 1.62, material.chair, 0, 1.28, 2.05);
  box(desk, 2.15, 1.56, .18, material.chair, 0, 2.05, 2.78);
  for (const legX of [-.86, .86]) {
    cylinder(desk, .09, .12, 1.22, material.metal, legX, .62, 2.18);
    cylinder(desk, .09, .12, 1.22, material.metal, legX, .62, 2.69);
  }
  return desk;
}

function makeArm(side, skinMaterial) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * .76, 3.14, .05);
  const upper = cylinder(shoulder, .16, .18, .9, skinMaterial, 0, -.45, 0);
  const elbow = new THREE.Group();
  elbow.position.y = -.89;
  shoulder.add(elbow);
  cylinder(elbow, .14, .16, .78, skinMaterial, 0, -.39, 0);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(.2, 12, 10), skinMaterial);
  hand.position.y = -.82;
  hand.castShadow = true;
  elbow.add(hand);
  const thumb = cylinder(hand, .07, .08, .29, skinMaterial, side * .12, .13, -.02);
  thumb.rotation.z = side * -.8;
  thumb.visible = false;
  return { shoulder, elbow, upper, hand, thumb };
}

function createLabelSprite() {
  const label = canvasTexture(640, 154, () => {});
  label.texture.minFilter = THREE.LinearFilter;
  label.texture.generateMipmaps = false;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: label.texture, transparent: true, depthTest: false, depthWrite: false }));
  sprite.scale.set(4.7, 1.13, 1);
  sprite.renderOrder = 10;
  return { ...label, sprite };
}

const alertTexture = createAlertTexture();

class Student {
  constructor(desk, index) {
    this.index = index;
    this.phase = index * 1.716;
    this.group = new THREE.Group();
    this.group.position.set(0, 0, 1.38);
    this.group.visible = false;
    desk.add(this.group);

    this.status = 'idle';
    this.agent = null;
    this.hovered = false;
    this.selected = false;
    this.focused = false;
    this.transitionStarted = -99;
    this.lastLabelKey = '';

    const skinPalette = [0xf1c7a7, 0xd89d76, 0xb87552, 0x8e5940];
    const hairPalette = [0x2f241f, 0x402c23, 0x78523b, 0x1e2932];
    const h = hash(index + 39);
    this.skin = new THREE.MeshStandardMaterial({ color: skinPalette[h % skinPalette.length], roughness: .72 });
    this.shirt = new THREE.MeshStandardMaterial({ color: 0x6ac5b0, roughness: .66 });
    this.hair = new THREE.MeshStandardMaterial({ color: hairPalette[(h >>> 2) % hairPalette.length], roughness: .92 });

    this.bodyRig = new THREE.Group();
    this.group.add(this.bodyRig);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.72, 1.32, 6, 12), this.shirt);
    torso.position.y = 2.62;
    torso.castShadow = true;
    torso.receiveShadow = true;
    this.bodyRig.add(torso);
    cylinder(this.bodyRig, .18, .18, .32, this.skin, 0, 3.72, 0);
    this.head = new THREE.Group();
    this.head.position.y = 4.28;
    this.bodyRig.add(this.head);
    const face = new THREE.Mesh(new THREE.SphereGeometry(.66, 18, 14), this.skin);
    face.castShadow = true;
    this.head.add(face);
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(.69, 18, 12), this.hair);
    hairCap.scale.set(1.02, .46, 1.03);
    hairCap.position.y = .42;
    hairCap.castShadow = true;
    this.head.add(hairCap);
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x18252b, roughness: .42 });
    for (const eyeX of [-.23, .23]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(.065, 8, 8), eyeMaterial);
      eye.position.set(eyeX, .04, -.62);
      this.head.add(eye);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(.13, .018, 6, 14, Math.PI), eyeMaterial);
    smile.rotation.x = Math.PI;
    smile.position.set(0, -.2, -.62);
    this.head.add(smile);

    for (const legX of [-.3, .3]) {
      box(this.group, .3, 1.2, .32, new THREE.MeshStandardMaterial({ color: 0x2f3d56, roughness: .7 }), legX, 1.08, .7);
      box(this.group, .36, .18, .62, new THREE.MeshStandardMaterial({ color: 0x1e252c, roughness: .58 }), legX, .48, .93);
    }
    this.leftArm = makeArm(-1, this.skin);
    this.rightArm = makeArm(1, this.skin);
    this.bodyRig.add(this.leftArm.shoulder, this.rightArm.shoulder);

    this.alertMaterial = new THREE.MeshBasicMaterial({ color: STATUS.blocked.color, transparent: true, opacity: .62, depthWrite: false });
    this.alertRing = new THREE.Mesh(new THREE.TorusGeometry(1.72, .085, 8, 38), this.alertMaterial);
    this.alertRing.rotation.x = Math.PI / 2;
    this.alertRing.position.y = .17;
    this.alertRing.visible = false;
    this.group.add(this.alertRing);

    this.doneMaterial = new THREE.MeshBasicMaterial({ color: STATUS.done.color, transparent: true, opacity: .68, depthWrite: false });
    this.doneRing = new THREE.Mesh(new THREE.TorusGeometry(1.48, .06, 8, 32), this.doneMaterial);
    this.doneRing.rotation.x = Math.PI / 2;
    this.doneRing.position.y = .18;
    this.doneRing.visible = false;
    this.group.add(this.doneRing);

    this.focusMaterial = new THREE.MeshBasicMaterial({ color: 0xf0fff5, transparent: true, opacity: .8, depthWrite: false });
    this.focusRing = new THREE.Mesh(new THREE.TorusGeometry(1.92, .045, 8, 32), this.focusMaterial);
    this.focusRing.rotation.x = Math.PI / 2;
    this.focusRing.position.y = .15;
    this.focusRing.visible = false;
    this.group.add(this.focusRing);

    this.burstMaterial = new THREE.MeshBasicMaterial({ color: STATUS.working.color, transparent: true, opacity: 0, depthWrite: false });
    this.burstRing = new THREE.Mesh(new THREE.TorusGeometry(1.22, .1, 8, 36), this.burstMaterial);
    this.burstRing.rotation.x = Math.PI / 2;
    this.burstRing.position.y = .24;
    this.burstRing.visible = false;
    this.group.add(this.burstRing);

    const alertSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: alertTexture, transparent: true, depthTest: false, depthWrite: false }));
    alertSprite.scale.set(1.2, 1.2, 1);
    alertSprite.position.set(0, 6.92, 0);
    alertSprite.renderOrder = 11;
    alertSprite.visible = false;
    this.blockedBadge = alertSprite;
    this.group.add(alertSprite);

    this.label = createLabelSprite();
    this.label.sprite.position.set(0, 5.78, 0);
    this.group.add(this.label.sprite);

    const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    hitMaterial.colorWrite = false;
    this.hitTarget = new THREE.Mesh(new THREE.BoxGeometry(3.85, 5.8, 3.55), hitMaterial);
    this.hitTarget.position.set(0, 3.1, 0);
    this.hitTarget.userData.student = this;
    this.group.add(this.hitTarget);
  }

  setVisible(visible) {
    this.group.visible = visible;
    if (!visible) {
      this.agent = null;
      this.hovered = false;
      this.selected = false;
      this.focused = false;
    }
  }

  paintLabel() {
    if (!this.agent) return;
    const state = STATUS[this.status];
    const key = `${this.agent.paneId}|${this.agent.name}|${this.agent.kind}|${this.agent.title}|${this.status}`;
    if (key === this.lastLabelKey) return;
    this.lastLabelKey = key;
    const { ctx, canvas, texture } = this.label;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    roundedRect(ctx, 7, 7, canvas.width - 14, canvas.height - 14, 31);
    ctx.fillStyle = 'rgba(11, 25, 29, .91)';
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = state.css;
    ctx.stroke();
    ctx.fillStyle = state.css;
    ctx.beginPath();
    ctx.arc(45, 47, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f5fffa';
    ctx.font = '800 31px system-ui, sans-serif';
    ctx.fillText(short(this.agent.name ?? this.agent.kind, 18), 72, 58);
    ctx.fillStyle = '#bed3ca';
    ctx.font = '600 26px system-ui, sans-serif';
    ctx.fillText(short(this.agent.title, 34), 31, 112);
    ctx.textAlign = 'right';
    ctx.fillStyle = state.css;
    ctx.font = '800 21px ui-monospace, monospace';
    ctx.fillText(state.label, canvas.width - 30, 57);
    ctx.textAlign = 'left';
    texture.needsUpdate = true;
  }

  updateAgent(agent) {
    const previousStatus = this.status;
    this.agent = agent;
    this.status = normalizeStatus(agent.status);
    this.group.visible = true;
    const kindColor = agent.kind === 'claude' ? 0xf09b67 : agent.kind === 'codex' ? 0x52cfc0 : 0x92a8ed;
    this.shirt.color.setHex(kindColor);
    this.focused = Boolean(agent.focused);
    this.leftArm.thumb.visible = this.status === 'done';
    this.rightArm.thumb.visible = this.status === 'done';
    this.alertRing.visible = this.status === 'blocked';
    this.doneRing.visible = this.status === 'done';
    this.blockedBadge.visible = this.status === 'blocked';
    this.updateFocusRing();
    this.paintLabel();
    return previousStatus;
  }

  triggerTransition(to) {
    this.status = normalizeStatus(to);
    this.leftArm.thumb.visible = this.status === 'done';
    this.rightArm.thumb.visible = this.status === 'done';
    this.alertRing.visible = this.status === 'blocked';
    this.doneRing.visible = this.status === 'done';
    this.blockedBadge.visible = this.status === 'blocked';
    this.burstMaterial.color.setHex(STATUS[this.status].color);
    this.transitionStarted = performance.now() / 1000;
    if (this.agent) this.paintLabel();
  }

  updateFocusRing() {
    const active = this.hovered || this.selected || this.focused;
    this.focusRing.visible = active && this.group.visible;
    if (this.hovered) this.focusMaterial.color.setHex(0xf0fff5);
    else if (this.selected) this.focusMaterial.color.setHex(0xffe28b);
    else this.focusMaterial.color.setHex(0xa5e8ca);
  }

  setHovered(hovered) {
    if (this.hovered === hovered) return;
    this.hovered = hovered;
    this.updateFocusRing();
  }

  setSelected(selected) {
    this.selected = selected;
    this.updateFocusRing();
  }

  animate(time, dt) {
    if (!this.group.visible) return;
    const status = this.status;
    const workingMotion = Math.sin(time * 9 + this.phase) * .19;
    const breathing = Math.sin(time * 1.55 + this.phase) * .018;
    let bodyX = 0;
    let headTilt = Math.sin(time * 1.1 + this.phase) * .025;
    let leftX = .22;
    let rightX = .22;
    let leftZ = .08;
    let rightZ = -.08;
    let leftElbow = .08;
    let rightElbow = .08;

    if (status === 'working') {
      leftX = .82 + workingMotion;
      rightX = .82 - workingMotion;
      leftElbow = .63 - workingMotion * .45;
      rightElbow = .63 + workingMotion * .45;
      headTilt = Math.sin(time * 2.1 + this.phase) * .045;
    } else if (status === 'idle') {
      bodyX = -.77;
      leftX = .14;
      rightX = .14;
      leftZ = .13;
      rightZ = -.13;
      leftElbow = .18;
      rightElbow = .18;
      headTilt = .08 + Math.sin(time * 1.25 + this.phase) * .05;
    } else if (status === 'blocked') {
      const wave = Math.sin(time * 8 + this.phase) * .26;
      leftX = .48;
      leftZ = -.18;
      leftElbow = .42;
      rightX = .04;
      rightZ = Math.PI - .1 + wave;
      rightElbow = .1;
      headTilt = Math.sin(time * 5 + this.phase) * .06;
    } else if (status === 'done') {
      leftX = .02;
      rightX = .02;
      leftZ = -Math.PI + .55;
      rightZ = Math.PI - .55;
      leftElbow = .05;
      rightElbow = .05;
      headTilt = Math.sin(time * 2.4 + this.phase) * .075;
    } else {
      bodyX = -.16;
      headTilt = Math.sin(time * 1.1 + this.phase) * .04;
    }

    const rate = 9;
    this.bodyRig.rotation.x = approach(this.bodyRig.rotation.x, bodyX, rate, dt);
    this.head.rotation.z = approach(this.head.rotation.z, headTilt, rate, dt);
    this.leftArm.shoulder.rotation.x = approach(this.leftArm.shoulder.rotation.x, leftX, rate, dt);
    this.rightArm.shoulder.rotation.x = approach(this.rightArm.shoulder.rotation.x, rightX, rate, dt);
    this.leftArm.shoulder.rotation.z = approach(this.leftArm.shoulder.rotation.z, leftZ, rate, dt);
    this.rightArm.shoulder.rotation.z = approach(this.rightArm.shoulder.rotation.z, rightZ, rate, dt);
    this.leftArm.elbow.rotation.x = approach(this.leftArm.elbow.rotation.x, leftElbow, rate, dt);
    this.rightArm.elbow.rotation.x = approach(this.rightArm.elbow.rotation.x, rightElbow, rate, dt);
    this.group.position.y = breathing;

    if (status === 'blocked') {
      const pulse = 1 + Math.sin(time * 8 + this.phase) * .12;
      this.alertRing.scale.setScalar(pulse);
      this.alertMaterial.opacity = .45 + (pulse - .88) * 1.4;
      this.blockedBadge.position.y = 6.94 + Math.sin(time * 5) * .16;
    }
    if (status === 'done') {
      const pulse = 1 + Math.sin(time * 4 + this.phase) * .08;
      this.doneRing.scale.setScalar(pulse);
      this.doneMaterial.opacity = .48 + Math.sin(time * 4 + this.phase) * .16;
    }

    const age = time - this.transitionStarted;
    if (age >= 0 && age < 1.45) {
      const progress = age / 1.45;
      this.burstRing.visible = true;
      this.burstRing.scale.setScalar(.45 + progress * 2.75);
      this.burstRing.position.y = .24 + progress * .58;
      this.burstMaterial.opacity = (1 - progress) * .82;
    } else {
      this.burstRing.visible = false;
    }
  }
}

const SEAT_POSITIONS = [
  [-8.25, -5.8], [0, -5.8], [8.25, -5.8],
  [-8.25, .05], [0, .05], [8.25, .05],
  [-8.25, 5.9], [0, 5.9], [8.25, 5.9],
  [-8.25, 11.75], [0, 11.75], [8.25, 11.75],
];

const slots = SEAT_POSITIONS.map(([x, z], index) => {
  const desk = makeDesk(index, x, z);
  return { desk, student: new Student(desk, index), paneId: null };
});
const studentsByPane = new Map();

const teacherDesk = new THREE.Group();
teacherDesk.position.set(0, 0, -13.65);
box(teacherDesk, 8.6, .28, 2.2, material.woodLight, 0, 2.35, 0);
box(teacherDesk, 8.85, .18, 2.36, material.wood, 0, 2.13, 0);
for (const x of [-3.7, 3.7]) {
  cylinder(teacherDesk, .13, .16, 2.1, material.metal, x, 1.05, -.7);
  cylinder(teacherDesk, .13, .16, 2.1, material.metal, x, 1.05, .7);
}
box(teacherDesk, 2.2, .12, 1.45, material.paper, -1.1, 2.53, -.1, false);
const teacherLamp = new THREE.PointLight(0xffe8ba, 5, 6, 2);
teacherLamp.position.set(2.55, 4.35, -.15);
teacherDesk.add(teacherLamp);
scene.add(teacherDesk);

let selectedStudent = null;
let hoveredStudent = null;
let latestSnapshot = null;
let feedSeeded = false;
let toastTimer = null;
const renderedEventSeqs = new Set();

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function setSelected(student) {
  if (selectedStudent === student) return;
  if (selectedStudent) selectedStudent.setSelected(false);
  selectedStudent = student;
  if (selectedStudent) selectedStudent.setSelected(true);
}

function eventDescription(event) {
  switch (event.type) {
    case 'agent_status_changed': return `${short(event.name ?? event.kind, 14)} · ${STATUS[normalizeStatus(event.to)].label} · ${short(event.title, 32)}`;
    case 'agent_appeared': return `${short(event.name ?? event.kind, 14)} 학생이 입장했습니다.`;
    case 'agent_left': return `${short(event.name ?? event.kind, 14)} 학생이 퇴장했습니다.`;
    case 'agent_title_changed': return `${event.paneId} · ${short(event.title, 35)}`;
    case 'focus_changed': return event.focus.paneId ? `focus → ${event.focus.paneId}` : 'focus가 해제되었습니다.';
    case 'source_connected': return 'herdr source connected';
    case 'source_disconnected': return 'herdr source disconnected';
    default: return event.type.replaceAll('_', ' ');
  }
}

function addFeedEvent(event) {
  if (renderedEventSeqs.has(event.seq)) return;
  renderedEventSeqs.add(event.seq);
  const row = document.createElement('div');
  const eventStatus = event.type === 'agent_status_changed' ? normalizeStatus(event.to) : '';
  row.className = `feed-row ${eventStatus}`;
  const time = document.createElement('time');
  time.textContent = event.ts?.slice(11, 19) ?? 'now';
  const text = document.createElement('span');
  text.textContent = eventDescription(event);
  row.append(time, text);
  feedList.prepend(row);
  while (feedList.childElementCount > 6) feedList.lastElementChild.remove();
}

function updateHud(snapshot) {
  for (const status of ['working', 'idle', 'blocked', 'done']) {
    $(`count-${status}`).textContent = String(snapshot.stats[status] ?? 0);
  }
  $('agent-total').textContent = `${snapshot.stats.total} student${snapshot.stats.total === 1 ? '' : 's'}`;
  $('source-label').textContent = `${snapshot.source.toUpperCase()} · ${snapshot.connected ? 'LIVE' : 'LAST SEEN'}`;
  $('transport-dot').classList.toggle('down', !snapshot.connected);
  $('scene-subtitle').textContent = snapshot.stats.blocked
    ? `질문 중인 학생 ${snapshot.stats.blocked}명 — 빨간 링과 조명이 켜졌습니다.`
    : '학생 에이전트를 클릭하면 해당 pane으로 이동합니다.';
}

function syncSnapshot(snapshot) {
  latestSnapshot = snapshot;
  updateHud(snapshot);
  drawBlackboard(snapshot);
  if (!feedSeeded) {
    snapshot.recentEvents.slice(-6).forEach(addFeedEvent);
    feedSeeded = true;
  }

  const incoming = snapshot.agents.slice(0, slots.length);
  const wanted = new Set(incoming.map((agent) => agent.paneId));
  for (const slot of slots) {
    if (slot.paneId && !wanted.has(slot.paneId)) {
      studentsByPane.delete(slot.paneId);
      if (selectedStudent === slot.student) setSelected(null);
      if (hoveredStudent === slot.student) hoveredStudent = null;
      slot.paneId = null;
      slot.student.setVisible(false);
    }
  }
  for (const agent of incoming) {
    let slot = studentsByPane.get(agent.paneId);
    if (!slot) {
      slot = slots.find((candidate) => candidate.paneId === null);
      if (!slot) continue;
      slot.paneId = agent.paneId;
      studentsByPane.set(agent.paneId, slot);
    }
    slot.student.updateAgent(agent);
  }
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const parallax = new THREE.Vector2();

function pickStudent(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const targets = slots.filter((slot) => slot.paneId).map((slot) => slot.student.hitTarget);
  const hit = raycaster.intersectObjects(targets, false)[0];
  return hit?.object.userData.student ?? null;
}

function showTooltip(student, clientX, clientY) {
  if (!student?.agent) {
    tooltip.classList.remove('show');
    return;
  }
  tooltip.querySelector('strong').textContent = `${student.agent.name ?? student.agent.kind} · ${STATUS[student.status].label}`;
  tooltip.querySelector('span').textContent = student.agent.title || '작업 제목을 기다리는 중';
  tooltip.classList.add('show');
  const left = clamp(clientX + 14, 10, window.innerWidth - tooltip.offsetWidth - 10);
  const top = clamp(clientY + 14, 10, window.innerHeight - tooltip.offsetHeight - 10);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

renderer.domElement.addEventListener('pointermove', (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  parallax.set((event.clientX - rect.left) / rect.width * 2 - 1, (event.clientY - rect.top) / rect.height * 2 - 1);
  const next = pickStudent(event.clientX, event.clientY);
  if (next !== hoveredStudent) {
    if (hoveredStudent) hoveredStudent.setHovered(false);
    hoveredStudent = next;
    if (hoveredStudent) hoveredStudent.setHovered(true);
  }
  renderer.domElement.style.cursor = next ? 'pointer' : 'default';
  showTooltip(next, event.clientX, event.clientY);
});

renderer.domElement.addEventListener('pointerleave', () => {
  parallax.set(0, 0);
  if (hoveredStudent) hoveredStudent.setHovered(false);
  hoveredStudent = null;
  tooltip.classList.remove('show');
  renderer.domElement.style.cursor = 'default';
});

renderer.domElement.addEventListener('click', async (event) => {
  const student = pickStudent(event.clientX, event.clientY);
  if (!student?.agent) return;
  setSelected(student);
  const paneId = student.agent.paneId;
  showToast(`${student.agent.name ?? student.agent.kind} · ${paneId} pane으로 이동 요청…`);
  const ok = await client.focusPane(paneId);
  showToast(ok ? `${paneId} pane으로 이동했습니다.` : `${paneId} pane 이동 요청을 보냈습니다.`);
});

const client = connect();
client.onTransport((up) => {
  $('transport-dot').classList.toggle('up', up);
  if (!up) $('transport-dot').classList.remove('up');
});
client.onUpdate(({ snapshot, events }) => {
  syncSnapshot(snapshot);
  events.forEach(addFeedEvent);
});
client.onEvent('agent_status_changed', (event) => {
  const slot = studentsByPane.get(event.paneId);
  if (slot) slot.student.triggerTransition(event.to);
  const name = event.name ?? event.kind;
  showToast(`${name} · ${STATUS[normalizeStatus(event.from)].label} → ${STATUS[normalizeStatus(event.to)].label}`);
});

window.__classroom3dTerra = {
  get students() { return slots.filter((slot) => slot.paneId).length; },
  get selectedPane() { return selectedStudent?.agent?.paneId ?? null; },
  get source() { return latestSnapshot?.source ?? null; },
  get webgl() { return renderer.capabilities.isWebGL2; },
};

let previousTime = performance.now() / 1000;
function animate(nowMs) {
  requestAnimationFrame(animate);
  const time = nowMs / 1000;
  const dt = Math.min(time - previousTime, .05);
  previousTime = time;

  camera.position.x = approach(camera.position.x, cameraBase.x + parallax.x * .42, 2.3, dt);
  camera.position.y = approach(camera.position.y, cameraBase.y - parallax.y * .17, 2.3, dt);
  cameraTarget.x = approach(cameraTarget.x, cameraTargetBase.x + parallax.x * .17, 2.3, dt);
  cameraTarget.y = approach(cameraTarget.y, cameraTargetBase.y - parallax.y * .06, 2.3, dt);
  camera.lookAt(cameraTarget);

  slots.forEach((slot) => slot.student.animate(time, dt));
  const blocked = slots.find((slot) => slot.paneId && slot.student.status === 'blocked')?.student;
  const desiredAlert = blocked ? 6.2 + Math.sin(time * 8) * .6 : 0;
  alertSpot.intensity = approach(alertSpot.intensity, desiredAlert, 6, dt);
  if (blocked) {
    const position = new THREE.Vector3();
    blocked.group.getWorldPosition(position);
    alertTarget.position.lerp(position, 1 - Math.exp(-7 * dt));
    const lightPosition = position.clone().add(new THREE.Vector3(0, 8.3, 1.8));
    alertSpot.position.lerp(lightPosition, 1 - Math.exp(-5 * dt));
  }
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
