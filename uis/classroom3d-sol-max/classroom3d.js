import * as THREE from './three.module.js';
import { connect } from '/sdk.js';

const host = document.getElementById('scene');
const fallback = document.getElementById('fallback');

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
} catch {
  fallback.classList.add('visible');
  document.getElementById('loading').classList.add('hidden');
}

function boot(renderer) {
  const $ = (id) => document.getElementById(id);
  const ui = {
    loading: $('loading'),
    transportDot: $('transport-dot'),
    connection: $('connection-label'),
    source: $('source-label'),
    working: $('stat-working'),
    idle: $('stat-idle'),
    blocked: $('stat-blocked'),
    done: $('stat-done'),
    clock: $('clock'),
    feed: $('event-feed'),
    hover: $('hover-card'),
    hoverName: $('hover-name'),
    hoverTitle: $('hover-title'),
    hoverMeta: $('hover-meta'),
    toast: $('toast'),
    live: $('live-region'),
  };

  const STATUS = {
    working: { color: 0x45d9a0, css: '#45d9a0', label: '필기 중', verb: '필기를 시작했어요' },
    idle: { color: 0x8da8c7, css: '#8da8c7', label: '엎드려 휴식', verb: '잠깐 엎드렸어요' },
    blocked: { color: 0xff5e69, css: '#ff5e69', label: '질문 있음', verb: '도움이 필요해 손을 들었어요' },
    done: { color: 0xffc857, css: '#ffc857', label: '완료', verb: '양손 엄지척!' },
    unknown: { color: 0xb6a7d8, css: '#b6a7d8', label: '상태 확인 중', verb: '상태를 확인하고 있어요' },
  };
  const statusOf = (status) => STATUS[status] ?? STATUS.unknown;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MAX_STUDENTS = 12;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', '교탁에서 바라본 에이전트 학생들의 3D 교실');
  renderer.domElement.dataset.threeRevision = THREE.REVISION;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb8c7bd);
  scene.fog = new THREE.Fog(0xc5c9ba, 24, 54);

  const camera = new THREE.PerspectiveCamera(53, 1, 0.1, 90);
  const cameraBase = new THREE.Vector3(0, 5.8, 15.7);
  const lookBase = new THREE.Vector3(0, 2.35, -4.6);
  const cameraLook = lookBase.clone();
  const pointerParallax = new THREE.Vector2();
  const pointerTarget = new THREE.Vector2();

  const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  const shared = createSharedAssets();
  const room = createClassroom();
  const slots = createSeats();
  const slotsByPane = new Map();
  const effects = [];
  let hoveredSlot = null;
  let lastSnapshot = null;
  let firstSnapshot = true;
  let pointerNeedsPick = false;
  let pointerInside = false;
  let pointerClientX = 0;
  let pointerClientY = 0;
  let toastTimer = 0;
  let lastFrame = performance.now();
  let lastSecond = 0;
  let statusEventCount = 0;
  let focusRequestCount = 0;

  const raycaster = new THREE.Raycaster();
  const rayPointer = new THREE.Vector2();

  const hemi = new THREE.HemisphereLight(0xe8f3ff, 0x5d4935, 1.52);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffefd0, 2.65);
  sun.position.set(15, 19, 13);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -17;
  sun.shadow.camera.right = 17;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -16;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 52;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.035;
  sun.target.position.set(0, 0, -4);
  scene.add(sun, sun.target);

  for (const z of [7, -2, -11]) {
    const light = new THREE.PointLight(0xffdfae, 19, 13, 1.75);
    light.position.set(0, 8.35, z);
    scene.add(light);
  }

  const blockedSpot = new THREE.SpotLight(0xff334d, 0, 16, Math.PI / 7, 0.68, 1.2);
  blockedSpot.position.set(0, 8.7, 0);
  blockedSpot.target.position.set(0, 2.1, 0);
  scene.add(blockedSpot, blockedSpot.target);

  const dust = createDust();
  scene.add(dust);

  drawBlackboard(null);
  updateClockHands(new Date());
  resize();

  const client = connect();
  client.onTransport((up) => {
    ui.transportDot.classList.toggle('up', up);
    ui.connection.textContent = up ? '실시간 연결' : '재연결 중';
  });

  client.onUpdate(({ snapshot }) => {
    lastSnapshot = snapshot;
    syncSnapshot(snapshot);
    renderHud(snapshot);
    drawBlackboard(snapshot);
    if (firstSnapshot) {
      firstSnapshot = false;
      for (const event of snapshot.recentEvents.slice(-5)) appendEvent(event, false);
      requestAnimationFrame(() => ui.loading.classList.add('hidden'));
    }
  });

  client.onEvent('agent_status_changed', (event) => {
    statusEventCount += 1;
    triggerStatusTransition(event);
  });

  client.onEvent('*', (event) => {
    appendEvent(event, true);
    if (event.type === 'agent_title_changed') {
      const slot = slotsByPane.get(event.paneId);
      if (slot?.agent) {
        slot.agent = { ...slot.agent, title: event.title };
        drawStudentLabel(slot);
      }
    }
  });

  renderer.domElement.addEventListener('pointermove', onPointerMove, { passive: true });
  renderer.domElement.addEventListener('pointerenter', () => { pointerInside = true; });
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);
  renderer.domElement.addEventListener('click', onCanvasClick);
  renderer.domElement.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && hoveredSlot?.agent) {
      event.preventDefault();
      focusStudent(hoveredSlot);
    }
  });
  window.addEventListener('resize', resize, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(host);
  document.addEventListener('visibilitychange', () => { lastFrame = performance.now(); });
  requestAnimationFrame(animate);

  window.__CLASSROOM3D_DEBUG__ = {
    revision: THREE.REVISION,
    get snapshot() { return lastSnapshot; },
    get statusEventCount() { return statusEventCount; },
    get focusRequestCount() { return focusRequestCount; },
    get activeEffects() { return effects.length; },
    students: () => slots.filter((slot) => slot.agent).map((slot) => ({
      paneId: slot.agent.paneId,
      title: slot.agent.title,
      status: slot.status,
      seat: slot.index,
    })),
    metrics: () => ({
      width: renderer.domElement.width,
      height: renderer.domElement.height,
      cssWidth: renderer.domElement.clientWidth,
      cssHeight: renderer.domElement.clientHeight,
      pixelRatio: renderer.getPixelRatio(),
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      cameraAspect: camera.aspect,
    }),
    projectStudent: (paneId) => {
      const slot = slotsByPane.get(paneId);
      if (!slot) return null;
      const p = slot.hitbox.getWorldPosition(new THREE.Vector3()).project(camera);
      const rect = renderer.domElement.getBoundingClientRect();
      return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
    },
  };

  function createSharedAssets() {
    const floorTexture = makeWoodTexture(1024, '#7a5035', '#a77750', 13);
    floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(3.3, 7.8);
    floorTexture.anisotropy = anisotropy;

    const deskTexture = makeWoodTexture(768, '#8a5a34', '#c18a58', 8);
    deskTexture.wrapS = deskTexture.wrapT = THREE.RepeatWrapping;
    deskTexture.repeat.set(1.8, 1);
    deskTexture.anisotropy = anisotropy;

    const wallTexture = makeWallTexture();
    wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
    wallTexture.repeat.set(5, 2);
    wallTexture.anisotropy = anisotropy;

    const materials = {
      floor: new THREE.MeshStandardMaterial({ map: floorTexture, color: 0xffffff, roughness: 0.62, metalness: 0.02 }),
      desk: new THREE.MeshStandardMaterial({ map: deskTexture, color: 0xffffff, roughness: 0.46, metalness: 0.01 }),
      deskEdge: new THREE.MeshStandardMaterial({ color: 0x4a2f21, roughness: 0.55 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x39433f, roughness: 0.3, metalness: 0.72 }),
      chair: new THREE.MeshStandardMaterial({ color: 0x4b635b, roughness: 0.56, metalness: 0.04 }),
      wall: new THREE.MeshStandardMaterial({ map: wallTexture, color: 0xe7e1d2, roughness: 0.92 }),
      wallTrim: new THREE.MeshStandardMaterial({ color: 0x776854, roughness: 0.74 }),
      ceiling: new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.88 }),
      frame: new THREE.MeshStandardMaterial({ color: 0xd7d0bd, roughness: 0.35, metalness: 0.52 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0xb7e4ed, transparent: true, opacity: 0.2, roughness: 0.08, metalness: 0.05, side: THREE.DoubleSide, depthWrite: false }),
      paper: new THREE.MeshStandardMaterial({ color: 0xf4eedb, roughness: 0.88 }),
      bookBlue: new THREE.MeshStandardMaterial({ color: 0x315f74, roughness: 0.62 }),
      bookRed: new THREE.MeshStandardMaterial({ color: 0x995648, roughness: 0.62 }),
      black: new THREE.MeshStandardMaterial({ color: 0x171b19, roughness: 0.65 }),
      pot: new THREE.MeshStandardMaterial({ color: 0x9f6846, roughness: 0.78 }),
      leaf: new THREE.MeshStandardMaterial({ color: 0x3f7653, roughness: 0.82, side: THREE.DoubleSide }),
    };

    const geometries = {
      unitBox: new THREE.BoxGeometry(1, 1, 1),
      sphere: new THREE.SphereGeometry(1, 18, 12),
      eye: new THREE.SphereGeometry(1, 10, 7),
      cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
      taperedCylinder: new THREE.CylinderGeometry(0.78, 1, 1, 12),
      capsule: new THREE.CapsuleGeometry(1, 1, 5, 12),
      hairCap: new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
      floorRing: new THREE.RingGeometry(0.82, 1.04, 48),
      beaconTorus: new THREE.TorusGeometry(0.72, 0.035, 8, 36),
      transitionTorus: new THREE.TorusGeometry(1, 0.038, 8, 48),
      octa: new THREE.OctahedronGeometry(0.15, 0),
      circle: new THREE.CircleGeometry(1, 48),
    };
    return { materials, geometries };
  }

  function createClassroom() {
    const group = new THREE.Group();
    group.name = 'procedural-classroom';
    scene.add(group);

    mesh(group, new THREE.PlaneGeometry(22, 32), shared.materials.floor, [0, 0, -0.5], [-Math.PI / 2, 0, 0], true, false);
    mesh(group, shared.geometries.unitBox, shared.materials.wall, [0, 4.55, -16.15], [0, 0, 0], true, false, [22.2, 9.1, 0.32]);
    mesh(group, shared.geometries.unitBox, shared.materials.wall, [-11.05, 4.55, -0.4], [0, 0, 0], true, false, [0.32, 9.1, 31.8]);
    mesh(group, shared.geometries.unitBox, shared.materials.wall, [11.05, 1.05, -0.4], [0, 0, 0], true, false, [0.32, 2.1, 31.8]);
    mesh(group, shared.geometries.unitBox, shared.materials.wall, [11.05, 8.45, -0.4], [0, 0, 0], true, false, [0.32, 1.3, 31.8]);
    mesh(group, shared.geometries.unitBox, shared.materials.ceiling, [0, 9.18, -0.4], [0, 0, 0], true, false, [22.2, 0.24, 31.8]);

    mesh(group, shared.geometries.unitBox, shared.materials.wallTrim, [-10.82, 0.55, -0.4], [0, 0, 0], true, false, [0.12, 1.1, 31.5]);
    mesh(group, shared.geometries.unitBox, shared.materials.wallTrim, [10.82, 0.55, -0.4], [0, 0, 0], true, false, [0.12, 1.1, 31.5]);
    mesh(group, shared.geometries.unitBox, shared.materials.wallTrim, [0, 0.3, -15.9], [0, 0, 0], true, false, [21.6, 0.6, 0.16]);

    const outdoorTexture = makeOutdoorTexture();
    for (const z of [10.25, 3.25, -3.75, -10.75]) {
      const outside = new THREE.Mesh(
        new THREE.PlaneGeometry(5.75, 5.35),
        new THREE.MeshBasicMaterial({ map: outdoorTexture, side: THREE.DoubleSide }),
      );
      outside.position.set(11.09, 5.05, z);
      outside.rotation.y = -Math.PI / 2;
      group.add(outside);

      const glass = new THREE.Mesh(new THREE.PlaneGeometry(5.75, 5.35), shared.materials.glass);
      glass.position.set(10.9, 5.05, z);
      glass.rotation.y = -Math.PI / 2;
      group.add(glass);
    }
    for (const z of [13.72, 6.75, -0.25, -7.25, -14.2]) {
      mesh(group, shared.geometries.unitBox, shared.materials.frame, [10.86, 5.05, z], [0, 0, 0], true, true, [0.3, 6.0, 0.23]);
    }
    mesh(group, shared.geometries.unitBox, shared.materials.frame, [10.86, 2.35, -0.35], [0, 0, 0], true, true, [0.3, 0.2, 27.5]);
    mesh(group, shared.geometries.unitBox, shared.materials.frame, [10.86, 7.74, -0.35], [0, 0, 0], true, true, [0.3, 0.2, 27.5]);

    for (const z of [7, -2, -11]) {
      mesh(group, shared.geometries.unitBox, shared.materials.frame, [0, 8.83, z], [0, 0, 0], false, true, [4.8, 0.08, 1.05]);
      mesh(
        group,
        shared.geometries.unitBox,
        new THREE.MeshStandardMaterial({ color: 0xffe6b5, emissive: 0xffd58c, emissiveIntensity: 2.5, roughness: 0.28 }),
        [0, 8.75, z],
        [0, 0, 0],
        false,
        false,
        [4.2, 0.055, 0.54],
      );
    }

    const boardCanvas = document.createElement('canvas');
    boardCanvas.width = 1200;
    boardCanvas.height = 430;
    const boardTexture = new THREE.CanvasTexture(boardCanvas);
    boardTexture.colorSpace = THREE.SRGBColorSpace;
    boardTexture.anisotropy = anisotropy;
    const boardMaterial = new THREE.MeshStandardMaterial({ map: boardTexture, color: 0xffffff, roughness: 0.72, emissive: 0x102b22, emissiveIntensity: 0.13 });
    mesh(group, shared.geometries.unitBox, shared.materials.deskEdge, [-1.15, 5.15, -15.72], [0, 0, 0], true, true, [12.7, 4.35, 0.18]);
    mesh(group, new THREE.PlaneGeometry(12.25, 3.9), boardMaterial, [-1.15, 5.15, -15.6], [0, 0, 0], false, false);
    mesh(group, shared.geometries.unitBox, shared.materials.frame, [-1.15, 3.1, -15.47], [0, 0, 0], true, true, [13.1, 0.15, 0.42]);
    for (let i = 0; i < 4; i++) {
      const chalkMat = new THREE.MeshStandardMaterial({ color: [0xf3e6bc, 0xf1a1a9, 0x9ccce1, 0xb7d59b][i], roughness: 0.9 });
      mesh(group, shared.geometries.unitBox, chalkMat, [-4.7 + i * 0.42, 3.24, -15.2], [0, 0, i * 0.08], true, true, [0.3, 0.08, 0.08]);
    }

    createWallClock(group);
    createPoster(group, 'DEEP WORK', ['작게 나누고', '끝까지 확인'], '#e8b86a', 7.2);
    createPoster(group, 'ASK EARLY', ['막히면 손들기', '질문은 신호'], '#e56c72', -0.2);
    createPoster(group, 'SHIP KINDLY', ['테스트 통과', '서로 리뷰'], '#69bda2', -7.6);
    createTeacherDesk(group);
    createPlant(group, -9.5, -13.8, 1.12);
    createPlant(group, 9.6, 12.8, 0.9);
    createSunPatches(group);

    return { group, boardCanvas, boardTexture };
  }

  function createTeacherDesk(parent) {
    const group = new THREE.Group();
    group.position.set(-0.7, 0, 11.25);
    parent.add(group);
    mesh(group, shared.geometries.unitBox, shared.materials.desk, [0, 2.8, 0], [0, 0, 0], true, true, [7.2, 0.32, 2.2]);
    mesh(group, shared.geometries.unitBox, shared.materials.deskEdge, [0, 1.45, -0.72], [0, 0, 0], true, true, [6.6, 2.35, 0.16]);
    for (const x of [-3.05, 3.05]) {
      for (const z of [-0.72, 0.72]) mesh(group, shared.geometries.unitBox, shared.materials.metal, [x, 1.35, z], [0, 0, 0], true, true, [0.17, 2.7, 0.17]);
    }
    mesh(group, shared.geometries.unitBox, shared.materials.bookBlue, [-2.15, 3.04, 0.1], [0, 0.12, -0.04], true, true, [1.65, 0.16, 1.06]);
    mesh(group, shared.geometries.unitBox, shared.materials.paper, [-2.02, 3.14, 0.08], [0, 0.08, 0], true, true, [1.35, 0.035, 0.82]);

    const laptop = new THREE.Group();
    laptop.position.set(1.0, 3.0, 0.2);
    group.add(laptop);
    mesh(laptop, shared.geometries.unitBox, shared.materials.metal, [0, 0.05, 0.12], [0, 0, 0], true, true, [2.15, 0.08, 1.25]);
    mesh(laptop, shared.geometries.unitBox, shared.materials.metal, [0, 0.82, -0.48], [-0.25, 0, 0], true, true, [2.15, 1.55, 0.08]);
    const screenMat = new THREE.MeshBasicMaterial({ map: makeLaptopTexture(), color: 0xffffff });
    mesh(laptop, shared.geometries.unitBox, screenMat, [0, 0.82, -0.425], [-0.25, 0, 0], false, false, [1.92, 1.31, 0.015]);

    const cupMat = new THREE.MeshStandardMaterial({ color: 0xe8dfcd, roughness: 0.45 });
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.23, 0.48, 20, 1, true), cupMat);
    cup.position.set(2.75, 3.18, 0.12);
    cup.castShadow = true;
    group.add(cup);
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.225, 20), new THREE.MeshStandardMaterial({ color: 0x2a160d, roughness: 0.2 }));
    coffee.rotation.x = -Math.PI / 2;
    coffee.position.set(2.75, 3.43, 0.12);
    group.add(coffee);
  }

  function createPlant(parent, x, z, scale) {
    const plant = new THREE.Group();
    plant.position.set(x, 0, z);
    plant.scale.setScalar(scale);
    parent.add(plant);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.85, 16), shared.materials.pot);
    pot.position.y = 0.42;
    pot.castShadow = pot.receiveShadow = true;
    plant.add(pot);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x36533a, roughness: 0.9 });
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.39;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.4 + (i % 3) * 0.18, 7), stemMat);
      stem.position.set(Math.cos(angle) * 0.16, 1.22, Math.sin(angle) * 0.16);
      stem.rotation.z = Math.cos(angle) * 0.28;
      stem.rotation.x = Math.sin(angle) * 0.28;
      stem.castShadow = true;
      plant.add(stem);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 6), shared.materials.leaf);
      leaf.scale.set(0.6, 1.45, 0.22);
      leaf.position.set(Math.cos(angle) * 0.43, 1.72 + (i % 3) * 0.17, Math.sin(angle) * 0.43);
      leaf.rotation.z = -angle * 0.4;
      leaf.castShadow = true;
      plant.add(leaf);
    }
  }

  function createSunPatches(parent) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe5a5, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 8.5), mat);
      patch.rotation.x = -Math.PI / 2;
      patch.rotation.z = -0.33;
      patch.position.set(7.5 - i * 0.25, 0.018 + i * 0.002, 9.5 - i * 7);
      parent.add(patch);
    }
  }

  function createPoster(parent, heading, lines, accent, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 360;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#eee9dc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, canvas.width, 78);
    ctx.fillStyle = '#1f2a25';
    ctx.font = '900 43px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(heading, 180, 142);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(74, 179);
    ctx.lineTo(286, 179);
    ctx.stroke();
    ctx.font = '700 31px system-ui, sans-serif';
    lines.forEach((line, index) => ctx.fillText(line, 180, 255 + index * 55));
    ctx.fillStyle = '#78847c';
    ctx.font = '600 20px ui-monospace, monospace';
    ctx.fillText('HERDR HOMEROOM', 180, 430);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 3.15), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.84 }));
    poster.position.set(-10.86, 5.05, z);
    poster.rotation.y = Math.PI / 2;
    parent.add(poster);
  }

  function createWallClock(parent) {
    const group = new THREE.Group();
    group.position.set(7.75, 6.7, -15.52);
    parent.add(group);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.16, 48), shared.materials.deskEdge);
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = true;
    group.add(rim);
    const face = new THREE.Mesh(shared.geometries.circle, new THREE.MeshBasicMaterial({ color: 0xf7f2e5 }));
    face.scale.setScalar(0.69);
    face.position.z = 0.1;
    group.add(face);
    const tickMat = new THREE.MeshBasicMaterial({ color: 0x564d41 });
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const tick = new THREE.Mesh(shared.geometries.unitBox, tickMat);
      tick.scale.set(i % 3 === 0 ? 0.045 : 0.025, i % 3 === 0 ? 0.15 : 0.09, 0.025);
      tick.position.set(Math.sin(a) * 0.54, Math.cos(a) * 0.54, 0.12);
      tick.rotation.z = -a;
      group.add(tick);
    }
    const handMat = new THREE.MeshBasicMaterial({ color: 0x26312d });
    const minute = new THREE.Group();
    const minuteMesh = new THREE.Mesh(shared.geometries.unitBox, handMat);
    minuteMesh.scale.set(0.045, 0.49, 0.03);
    minuteMesh.position.y = 0.22;
    minute.add(minuteMesh);
    const hour = new THREE.Group();
    const hourMesh = new THREE.Mesh(shared.geometries.unitBox, handMat);
    hourMesh.scale.set(0.06, 0.34, 0.04);
    hourMesh.position.y = 0.14;
    hour.add(hourMesh);
    minute.position.z = 0.145;
    hour.position.z = 0.15;
    group.add(minute, hour);
    roomClock.minute = minute;
    roomClock.hour = hour;
  }

  function createSeats() {
    const result = [];
    const xs = [-5.65, 0, 5.65];
    const zs = [5.65, 0.15, -5.35, -10.85];
    let index = 0;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) {
        const slot = createStudentSlot(index, row, col);
        slot.root.position.set(xs[col], 0, zs[row]);
        slot.root.rotation.y = ((hashString(`seat-${index}`) % 7) - 3) * 0.006;
        scene.add(slot.root);
        result.push(slot);
        index += 1;
      }
    }
    return result;
  }

  function createStudentSlot(index, row, col) {
    const root = new THREE.Group();
    root.name = `seat-${index + 1}`;
    const desk = new THREE.Group();
    root.add(desk);

    mesh(desk, shared.geometries.unitBox, shared.materials.desk, [0, 2.45, 0], [0, 0, 0], true, true, [4.25, 0.24, 1.92]);
    mesh(desk, shared.geometries.unitBox, shared.materials.deskEdge, [0, 2.28, 0], [0, 0, 0], true, true, [4.34, 0.12, 2.0]);
    for (const x of [-1.72, 1.72]) {
      for (const z of [-0.68, 0.68]) mesh(desk, shared.geometries.unitBox, shared.materials.metal, [x, 1.22, z], [0, 0, 0], true, true, [0.13, 2.38, 0.13]);
    }
    mesh(desk, shared.geometries.unitBox, shared.materials.metal, [0, 1.55, -0.82], [0, 0, 0], true, true, [3.55, 0.1, 0.1]);

    const chair = new THREE.Group();
    chair.position.set(0, 0, -1.42);
    root.add(chair);
    mesh(chair, shared.geometries.unitBox, shared.materials.chair, [0, 1.25, 0], [0, 0, 0], true, true, [1.58, 0.18, 1.28]);
    mesh(chair, shared.geometries.unitBox, shared.materials.chair, [0, 2.15, -0.57], [-0.07, 0, 0], true, true, [1.58, 1.65, 0.18]);
    for (const x of [-0.63, 0.63]) {
      for (const z of [-0.44, 0.44]) mesh(chair, shared.geometries.unitBox, shared.materials.metal, [x, 0.61, z], [0, 0, 0], true, true, [0.1, 1.22, 0.1]);
    }

    const notebookMaterial = new THREE.MeshStandardMaterial({
      color: 0xf4eedb,
      emissive: 0x45d9a0,
      emissiveIntensity: 0,
      roughness: 0.9,
    });
    mesh(desk, shared.geometries.unitBox, notebookMaterial, [0, 2.6, 0.13], [0, 0, 0], true, true, [1.78, 0.045, 1.13]);
    mesh(desk, shared.geometries.unitBox, shared.materials.bookBlue, [-1.46, 2.64, 0.22], [0, 0.13, 0], true, true, [0.62, 0.15, 1.2]);
    const pencilPivot = new THREE.Group();
    pencilPivot.position.set(0.25, 2.72, 0.15);
    desk.add(pencilPivot);
    const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.82, 8), new THREE.MeshStandardMaterial({ color: 0xe0a737, roughness: 0.5 }));
    pencil.rotation.z = Math.PI / 2;
    pencil.castShadow = true;
    pencilPivot.add(pencil);

    const student = createStudentRig(index);
    root.add(student.root);
    student.root.visible = false;

    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 768;
    labelCanvas.height = 244;
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    labelTexture.colorSpace = THREE.SRGBColorSpace;
    labelTexture.minFilter = THREE.LinearMipmapLinearFilter;
    labelTexture.magFilter = THREE.LinearFilter;
    labelTexture.anisotropy = anisotropy;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthTest: false, depthWrite: false }));
    const labelScale = 4.05 + row * 0.12;
    label.scale.set(labelScale, labelScale * 244 / 768, 1);
    label.position.set(0, 4.75 + row * 0.78, -0.73);
    label.renderOrder = 30;
    label.visible = false;
    root.add(label);

    const statusRingMaterial = new THREE.MeshBasicMaterial({ color: STATUS.unknown.color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
    const statusRing = new THREE.Mesh(shared.geometries.floorRing, statusRingMaterial);
    statusRing.rotation.x = -Math.PI / 2;
    statusRing.position.set(0, 0.035, -1.38);
    statusRing.scale.setScalar(1.13);
    statusRing.visible = false;
    root.add(statusRing);

    const hoverRingMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    const hoverRing = new THREE.Mesh(new THREE.RingGeometry(1.08, 1.16, 52), hoverRingMaterial);
    hoverRing.rotation.x = -Math.PI / 2;
    hoverRing.position.set(0, 0.045, -1.38);
    hoverRing.visible = false;
    root.add(hoverRing);

    const blockedFx = createBlockedFx();
    blockedFx.group.visible = false;
    root.add(blockedFx.group);

    const doneFx = createDoneFx(index);
    doneFx.group.visible = false;
    root.add(doneFx.group);

    const sleepyFx = createSleepyFx();
    sleepyFx.group.visible = false;
    root.add(sleepyFx.group);

    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(4.45, 5.1, 3.6),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    );
    hitbox.position.set(0, 2.55, -0.52);
    hitbox.userData.seatIndex = index;
    root.add(hitbox);

    return {
      index,
      row,
      col,
      root,
      desk,
      student,
      pencilPivot,
      notebookMaterial,
      label,
      labelCanvas,
      labelTexture,
      statusRing,
      statusRingMaterial,
      hoverRing,
      blockedFx,
      doneFx,
      sleepyFx,
      hitbox,
      agent: null,
      status: 'unknown',
      hovered: false,
      focused: false,
      labelPulseUntil: 0,
      phase: hashString(`motion-${index}`) * 0.001,
      labelBaseWidth: labelScale,
      labelBaseY: 4.75 + row * 0.78,
    };
  }

  function createStudentRig(index) {
    const root = new THREE.Group();
    root.position.set(0, 0, -1.38);

    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x4f826f, roughness: 0.7, emissive: 0x000000, emissiveIntensity: 0 });
    const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xd6a177, roughness: 0.7 });
    const hairMaterial = new THREE.MeshStandardMaterial({ color: 0x32281f, roughness: 0.82 });
    const trouserMaterial = new THREE.MeshStandardMaterial({ color: 0x293b45, roughness: 0.76 });
    const shoeMaterial = new THREE.MeshStandardMaterial({ color: 0x202522, roughness: 0.52 });
    const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xf3efe4, roughness: 0.8 });

    const hips = scaledMesh(shared.geometries.capsule, trouserMaterial, [0.55, 0.32, 0.45]);
    hips.position.set(0, 1.61, 0);
    root.add(hips);

    const torso = new THREE.Group();
    torso.position.set(0, 1.68, 0);
    root.add(torso);
    const body = scaledMesh(shared.geometries.capsule, bodyMaterial, [0.61, 0.62, 0.46]);
    body.position.y = 0.75;
    torso.add(body);
    const collar = scaledMesh(shared.geometries.unitBox, whiteMaterial, [0.43, 0.09, 0.5]);
    collar.position.set(0, 1.27, 0.13);
    collar.rotation.z = Math.PI / 4;
    torso.add(collar);

    const head = new THREE.Group();
    head.position.set(0, 1.64, 0.02);
    torso.add(head);
    const face = scaledMesh(shared.geometries.sphere, skinMaterial, [0.49, 0.53, 0.48]);
    face.position.y = 0.38;
    head.add(face);
    const hair = scaledMesh(shared.geometries.hairCap, hairMaterial, [0.515, 0.55, 0.505]);
    hair.position.set(0, 0.44, -0.025);
    head.add(hair);
    for (const x of [-0.17, 0.17]) {
      const eyeWhite = scaledMesh(shared.geometries.eye, whiteMaterial, [0.07, 0.055, 0.035]);
      eyeWhite.position.set(x, 0.45, 0.445);
      head.add(eyeWhite);
      const pupil = scaledMesh(shared.geometries.eye, shared.materials.black, [0.026, 0.03, 0.02]);
      pupil.position.set(x, 0.45, 0.48);
      head.add(pupil);
    }
    const nose = scaledMesh(shared.geometries.sphere, skinMaterial, [0.07, 0.08, 0.08]);
    nose.position.set(0, 0.34, 0.485);
    head.add(nose);
    const mouth = scaledMesh(shared.geometries.unitBox, shared.materials.black, [0.16, 0.025, 0.025]);
    mouth.position.set(0, 0.20, 0.47);
    head.add(mouth);

    const armL = createArm(bodyMaterial, skinMaterial, -1);
    const armR = createArm(bodyMaterial, skinMaterial, 1);
    armL.upper.position.set(-0.67, 1.21, 0);
    armR.upper.position.set(0.67, 1.21, 0);
    torso.add(armL.upper, armR.upper);

    const legL = createLeg(trouserMaterial, shoeMaterial);
    const legR = createLeg(trouserMaterial, shoeMaterial);
    legL.thigh.position.set(-0.32, 1.55, 0.03);
    legR.thigh.position.set(0.32, 1.55, 0.03);
    root.add(legL.thigh, legR.thigh);
    legL.thigh.rotation.x = -1.03;
    legR.thigh.rotation.x = -1.03;
    legL.shin.rotation.x = 1.12;
    legR.shin.rotation.x = 1.12;

    root.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
    });

    const current = { ...POSES.unknown };
    return {
      root,
      torso,
      head,
      armL,
      armR,
      legL,
      legR,
      bodyMaterial,
      skinMaterial,
      hairMaterial,
      trouserMaterial,
      shoeMaterial,
      mouth,
      current,
      target: { ...POSES.unknown },
      index,
    };
  }

  function createArm(shirtMaterial, skinMaterial, side) {
    const upper = new THREE.Group();
    const sleeve = scaledMesh(shared.geometries.taperedCylinder, shirtMaterial, [0.16, 0.78, 0.16]);
    sleeve.position.y = -0.39;
    upper.add(sleeve);
    const elbow = scaledMesh(shared.geometries.sphere, skinMaterial, [0.15, 0.15, 0.15]);
    elbow.position.y = -0.78;
    upper.add(elbow);
    const lower = new THREE.Group();
    lower.position.y = -0.78;
    upper.add(lower);
    const forearm = scaledMesh(shared.geometries.taperedCylinder, skinMaterial, [0.12, 0.68, 0.12]);
    forearm.position.y = -0.34;
    lower.add(forearm);
    const hand = new THREE.Group();
    hand.position.y = -0.69;
    lower.add(hand);
    hand.add(scaledMesh(shared.geometries.sphere, skinMaterial, [0.16, 0.19, 0.14]));
    const thumb = scaledMesh(shared.geometries.capsule, skinMaterial, [0.055, 0.13, 0.055]);
    thumb.position.set(side * 0.13, 0.14, 0.015);
    thumb.rotation.z = -side * 0.38;
    thumb.visible = false;
    hand.add(thumb);
    return { upper, lower, hand, thumb };
  }

  function createLeg(trouserMaterial, shoeMaterial) {
    const thigh = new THREE.Group();
    const thighMesh = scaledMesh(shared.geometries.taperedCylinder, trouserMaterial, [0.2, 0.95, 0.22]);
    thighMesh.position.y = -0.47;
    thigh.add(thighMesh);
    const shin = new THREE.Group();
    shin.position.y = -0.94;
    thigh.add(shin);
    const shinMesh = scaledMesh(shared.geometries.taperedCylinder, trouserMaterial, [0.17, 0.88, 0.18]);
    shinMesh.position.y = -0.44;
    shin.add(shinMesh);
    const shoe = scaledMesh(shared.geometries.capsule, shoeMaterial, [0.2, 0.37, 0.3]);
    shoe.rotation.x = Math.PI / 2;
    shoe.position.set(0, -0.85, 0.18);
    shin.add(shoe);
    return { thigh, shin };
  }

  function createBlockedFx() {
    const group = new THREE.Group();
    group.position.set(0, 4.35, 0);
    const materialA = new THREE.MeshBasicMaterial({ color: STATUS.blocked.color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    const materialB = materialA.clone();
    const ringA = new THREE.Mesh(shared.geometries.beaconTorus, materialA);
    const ringB = new THREE.Mesh(shared.geometries.beaconTorus, materialB);
    ringA.rotation.x = Math.PI / 2;
    ringB.rotation.y = Math.PI / 2;
    group.add(ringA, ringB);
    const glyph = makeGlyphSprite('!', '#ff5e69', '#fff5f2');
    glyph.position.set(0.72, 1.02, 0.12);
    glyph.scale.set(0.66, 0.66, 1);
    group.add(glyph);
    return { group, ringA, ringB, glyph };
  }

  function createDoneFx(index) {
    const group = new THREE.Group();
    group.position.set(0, 3.65, 0);
    const stars = [];
    const material = new THREE.MeshBasicMaterial({ color: STATUS.done.color, transparent: true, opacity: 0.9, depthWrite: false });
    for (let i = 0; i < 5; i++) {
      const star = new THREE.Mesh(shared.geometries.octa, material);
      const angle = i / 5 * Math.PI * 2 + index * 0.4;
      star.position.set(Math.cos(angle) * 1.18, Math.sin(angle * 1.7) * 0.38 + 0.3, Math.sin(angle) * 0.7);
      group.add(star);
      stars.push(star);
    }
    return { group, stars };
  }

  function createSleepyFx() {
    const group = new THREE.Group();
    group.position.set(0.58, 3.65, 0.2);
    const glyphs = [];
    for (let i = 0; i < 3; i++) {
      const glyph = makeGlyphSprite('z', '#8da8c7', '#edf5ff');
      glyph.scale.setScalar(0.42 + i * 0.1);
      glyph.material.opacity = 0;
      group.add(glyph);
      glyphs.push(glyph);
    }
    return { group, glyphs };
  }

  function createDust() {
    const count = 130;
    const positions = new Float32Array(count * 3);
    const rand = seededRandom(81027);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = -10 + rand() * 20;
      positions[i * 3 + 1] = 1.2 + rand() * 7.2;
      positions[i * 3 + 2] = -15 + rand() * 29;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xffedc0, size: 0.025, transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending });
    return new THREE.Points(geometry, material);
  }

  function syncSnapshot(snapshot) {
    const visibleAgents = snapshot.agents.slice(0, MAX_STUDENTS);
    const incoming = new Set(visibleAgents.map((agent) => agent.paneId));

    for (const [paneId, slot] of slotsByPane) {
      if (incoming.has(paneId)) continue;
      slotsByPane.delete(paneId);
      clearStudent(slot);
    }

    for (const agent of visibleAgents) {
      let slot = slotsByPane.get(agent.paneId);
      if (!slot) {
        slot = slots.find((candidate) => !candidate.agent);
        if (!slot) continue;
        assignStudent(slot, agent);
        slotsByPane.set(agent.paneId, slot);
      } else {
        refreshStudent(slot, agent);
      }
      slot.focused = agent.focused || snapshot.focus.paneId === agent.paneId;
    }
  }

  function assignStudent(slot, agent) {
    slot.agent = agent;
    slot.status = normalizeStatus(agent.status);
    slot.student.root.visible = true;
    slot.label.visible = true;
    slot.statusRing.visible = true;
    slot.hitbox.visible = true;
    applyIdentity(slot, agent);
    setStudentStatus(slot, slot.status, true);
    drawStudentLabel(slot);
  }

  function refreshStudent(slot, agent) {
    const priorTitle = slot.agent?.title;
    const priorName = slot.agent?.name;
    const priorKind = slot.agent?.kind;
    slot.agent = agent;
    if (priorName !== agent.name || priorKind !== agent.kind) applyIdentity(slot, agent);
    const nextStatus = normalizeStatus(agent.status);
    if (nextStatus !== slot.status) setStudentStatus(slot, nextStatus, false);
    if (priorTitle !== agent.title || priorName !== agent.name || priorKind !== agent.kind || nextStatus !== slot.status) drawStudentLabel(slot);
  }

  function clearStudent(slot) {
    if (slot.agent) slotsByPane.delete(slot.agent.paneId);
    slot.agent = null;
    slot.student.root.visible = false;
    slot.label.visible = false;
    slot.statusRing.visible = false;
    slot.hoverRing.visible = false;
    slot.blockedFx.group.visible = false;
    slot.doneFx.group.visible = false;
    slot.sleepyFx.group.visible = false;
    slot.hitbox.visible = false;
    if (hoveredSlot === slot) setHoveredSlot(null);
  }

  function applyIdentity(slot, agent) {
    const hash = hashString(`${agent.kind}:${agent.name ?? agent.paneId}`);
    const kindColors = { codex: 0x287f72, claude: 0xb9684e };
    const color = new THREE.Color(kindColors[agent.kind] ?? new THREE.Color().setHSL((hash % 360) / 360, 0.42, 0.43));
    color.offsetHSL((((hash >>> 4) % 11) - 5) / 300, 0, (((hash >>> 9) % 7) - 3) / 100);
    const skinTones = [0xf0c39e, 0xdfad83, 0xc98f65, 0xa96d49, 0x7d4c32];
    const hairTones = [0x201c19, 0x38291f, 0x5a3826, 0x251f28, 0x654936];
    slot.student.bodyMaterial.color.copy(color);
    slot.student.skinMaterial.color.setHex(skinTones[hash % skinTones.length]);
    slot.student.hairMaterial.color.setHex(hairTones[(hash >>> 3) % hairTones.length]);
    slot.student.trouserMaterial.color.setHSL(((hash >>> 7) % 24) / 360 + 0.54, 0.24, 0.22);
  }

  function setStudentStatus(slot, status, immediate) {
    status = normalizeStatus(status);
    slot.status = status;
    slot.student.target = { ...POSES[status] };
    if (immediate) Object.assign(slot.student.current, slot.student.target);
    const meta = statusOf(status);
    slot.statusRingMaterial.color.setHex(meta.color);
    slot.statusRingMaterial.opacity = status === 'blocked' ? 0.56 : 0.28;
    slot.notebookMaterial.emissive.setHex(meta.color);
    slot.notebookMaterial.emissiveIntensity = status === 'working' ? 0.2 : status === 'blocked' ? 0.13 : 0;
    slot.blockedFx.group.visible = status === 'blocked';
    slot.doneFx.group.visible = status === 'done';
    slot.sleepyFx.group.visible = status === 'idle';
    slot.student.armL.thumb.visible = status === 'done';
    slot.student.armR.thumb.visible = status === 'done';
    drawStudentLabel(slot);
  }

  function drawStudentLabel(slot) {
    if (!slot.agent) return;
    const canvas = slot.labelCanvas;
    const ctx = canvas.getContext('2d');
    const meta = statusOf(slot.status);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.48)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 9;
    roundedPath(ctx, 18, 18, 732, 204, 30);
    ctx.fillStyle = 'rgba(15, 24, 21, .94)';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 4;
    ctx.strokeStyle = meta.css;
    ctx.globalAlpha = 0.7;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = meta.css;
    ctx.beginPath();
    ctx.arc(52, 55, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = meta.css;
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    const name = slot.agent.name || slot.agent.kind;
    ctx.fillStyle = '#f7f2e7';
    ctx.font = '800 30px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 76, 55);
    const nameWidth = ctx.measureText(name).width;
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.font = '650 21px ui-monospace, monospace';
    ctx.fillText(slot.agent.paneId, Math.min(500, 92 + nameWidth), 57);

    ctx.textAlign = 'right';
    ctx.fillStyle = meta.css;
    ctx.font = '800 23px system-ui, sans-serif';
    ctx.fillText(meta.label, 710, 56);
    ctx.textAlign = 'left';

    const lines = wrapCanvasText(ctx, slot.agent.title || '작업 제목 없음', 660, 2, '750 38px system-ui, sans-serif');
    ctx.fillStyle = '#fffdf7';
    ctx.font = '750 38px system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    lines.forEach((line, index) => ctx.fillText(line, 52, 125 + index * 46));
    ctx.restore();
    slot.labelTexture.needsUpdate = true;
  }

  function triggerStatusTransition(event) {
    const slot = slotsByPane.get(event.paneId);
    if (!slot) return;
    setStudentStatus(slot, event.to, false);
    slot.labelPulseUntil = performance.now() + (reducedMotion ? 350 : 1050);
    spawnTransitionEffect(slot, event.to);
    const name = event.name || event.kind;
    ui.live.textContent = `${name}: ${statusOf(event.to).verb}. ${event.title}`;
  }

  function spawnTransitionEffect(slot, status) {
    const meta = statusOf(status);
    const group = new THREE.Group();
    group.position.set(0, 0.12, -1.38);
    slot.root.add(group);
    const rings = [];
    const ringCount = reducedMotion ? 1 : 3;
    for (let i = 0; i < ringCount; i++) {
      const material = new THREE.MeshBasicMaterial({ color: meta.color, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(shared.geometries.transitionTorus, material);
      ring.rotation.x = Math.PI / 2;
      ring.scale.setScalar(0.44);
      group.add(ring);
      rings.push(ring);
    }

    const particleCount = reducedMotion ? 6 : status === 'done' ? 28 : 18;
    const positions = new Float32Array(particleCount * 3);
    const velocities = [];
    const rand = seededRandom(hashString(`${slot.agent?.paneId}:${performance.now()}`));
    for (let i = 0; i < particleCount; i++) {
      const angle = rand() * Math.PI * 2;
      const speed = 0.9 + rand() * 1.9;
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 2.3 + rand() * 1.2;
      positions[i * 3 + 2] = 0;
      velocities.push(new THREE.Vector3(Math.cos(angle) * speed, 1.1 + rand() * 2.3, Math.sin(angle) * speed));
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({ color: meta.color, size: status === 'blocked' ? 0.16 : 0.12, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    group.add(particles);
    effects.push({
      group,
      rings,
      particles,
      velocities,
      start: performance.now(),
      duration: reducedMotion ? 420 : 1350,
    });
  }

  function updateEffects(now) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      const progress = (now - effect.start) / effect.duration;
      if (progress >= 1) {
        effect.group.parent?.remove(effect.group);
        effect.particles.geometry.dispose();
        effect.particles.material.dispose();
        effect.rings.forEach((ring) => ring.material.dispose());
        effects.splice(i, 1);
        continue;
      }
      const ease = 1 - Math.pow(1 - progress, 3);
      effect.rings.forEach((ring, ringIndex) => {
        const delayed = Math.max(0, Math.min(1, progress * 1.35 - ringIndex * 0.16));
        ring.scale.setScalar(0.45 + delayed * 2.15);
        ring.material.opacity = (1 - delayed) * 0.72;
        ring.position.y = ringIndex * 0.38 + ease * 0.32;
      });
      const attr = effect.particles.geometry.getAttribute('position');
      for (let p = 0; p < effect.velocities.length; p++) {
        const v = effect.velocities[p];
        const t = progress * 1.15;
        attr.setXYZ(p, v.x * t, 2.3 + v.y * t - 2.7 * t * t, v.z * t);
      }
      attr.needsUpdate = true;
      effect.particles.material.opacity = 1 - progress;
    }
  }

  function animateStudent(slot, delta, elapsed, now) {
    if (!slot.agent) return;
    const rig = slot.student;
    const lambda = reducedMotion ? 22 : 8.5;
    for (const key of Object.keys(rig.current)) {
      rig.current[key] = THREE.MathUtils.damp(rig.current[key], rig.target[key], lambda, delta);
    }

    const c = rig.current;
    const motion = reducedMotion ? 0 : 1;
    rig.torso.rotation.set(c.torsoX, 0, c.torsoZ);
    rig.head.rotation.set(c.headX, 0, c.headZ);
    rig.armL.upper.rotation.set(c.armLUpperX, 0, c.armLUpperZ);
    rig.armL.lower.rotation.set(c.armLLowerX, 0, c.armLLowerZ);
    rig.armR.upper.rotation.set(c.armRUpperX, 0, c.armRUpperZ);
    rig.armR.lower.rotation.set(c.armRLowerX, 0, c.armRLowerZ);
    rig.root.position.y = c.rootY;

    if (slot.status === 'working') {
      const write = Math.sin(elapsed * 11.5 + slot.phase);
      rig.armR.lower.rotation.x += write * 0.16 * motion;
      rig.armR.lower.rotation.z += Math.cos(elapsed * 7.8 + slot.phase) * 0.07 * motion;
      rig.head.rotation.z += Math.sin(elapsed * 1.3 + slot.phase) * 0.025 * motion;
      slot.pencilPivot.position.x = 0.25 + write * 0.19 * motion;
      slot.pencilPivot.rotation.y = write * 0.16 * motion;
    } else if (slot.status === 'idle') {
      rig.root.position.y += Math.sin(elapsed * 1.45 + slot.phase) * 0.025 * motion;
      rig.head.rotation.z += Math.sin(elapsed * 0.8 + slot.phase) * 0.035 * motion;
      slot.sleepyFx.glyphs.forEach((glyph, index) => {
        const cycle = (elapsed * 0.32 + index * 0.31 + slot.phase * 0.1) % 1;
        glyph.position.set(cycle * 0.62, cycle * 1.05 + index * 0.12, 0.05);
        glyph.material.opacity = Math.sin(cycle * Math.PI) * 0.88;
      });
    } else if (slot.status === 'blocked') {
      rig.armR.upper.rotation.z += Math.sin(elapsed * 8.5 + slot.phase) * 0.12 * motion;
      rig.head.rotation.z += Math.sin(elapsed * 6.2 + slot.phase) * 0.045 * motion;
      slot.blockedFx.ringA.rotation.z = elapsed * 2.4;
      slot.blockedFx.ringB.rotation.x = elapsed * 2.0;
      const pulse = 1 + Math.sin(elapsed * 7.4) * 0.12 * motion;
      slot.blockedFx.group.scale.setScalar(pulse);
      slot.blockedFx.ringA.material.opacity = 0.58 + Math.sin(elapsed * 7.4) * 0.2;
    } else if (slot.status === 'done') {
      const cheer = Math.sin(elapsed * 4.2 + slot.phase) * 0.07 * motion;
      rig.armL.upper.rotation.z += cheer;
      rig.armR.upper.rotation.z -= cheer;
      slot.doneFx.stars.forEach((star, index) => {
        star.rotation.x = elapsed * (1.1 + index * 0.08);
        star.rotation.y = elapsed * (1.5 - index * 0.05);
        star.position.y += Math.sin(elapsed * 2.7 + index) * 0.0025 * motion;
      });
    }

    const hoverScale = slot.hovered ? 1.055 : 1;
    rig.root.scale.x = THREE.MathUtils.damp(rig.root.scale.x, hoverScale, 11, delta);
    rig.root.scale.y = THREE.MathUtils.damp(rig.root.scale.y, hoverScale, 11, delta);
    rig.root.scale.z = THREE.MathUtils.damp(rig.root.scale.z, hoverScale, 11, delta);
    slot.hoverRing.visible = slot.hovered || slot.focused;
    slot.hoverRingMaterialColor = slot.focused ? 0x62c8ff : 0xffffff;
    slot.hoverRing.material.color.setHex(slot.hoverRingMaterialColor);
    slot.hoverRing.material.opacity = slot.focused ? 0.72 : 0.9;
    slot.hoverRing.rotation.z = elapsed * (slot.focused ? 0.45 : 0.15);

    const pulseActive = now < slot.labelPulseUntil;
    const labelTarget = (slot.hovered ? 1.09 : 1) * (pulseActive ? 1 + Math.sin(elapsed * 15) * 0.06 : 1);
    const baseW = slot.labelBaseWidth;
    const nextW = THREE.MathUtils.damp(slot.label.scale.x, baseW * labelTarget, 10, delta);
    slot.label.scale.set(nextW, nextW * 244 / 768, 1);
    slot.label.position.y = slot.labelBaseY + (motion ? Math.sin(elapsed * 1.2 + slot.phase) * 0.025 : 0);
    slot.statusRing.rotation.z = elapsed * (slot.status === 'blocked' ? 1.5 : 0.22);
    const ringPulse = 1.13 + (slot.status === 'blocked' ? Math.sin(elapsed * 6.8) * 0.13 * motion : 0);
    slot.statusRing.scale.setScalar(ringPulse);

    rig.bodyMaterial.emissive.setHex(statusOf(slot.status).color);
    rig.bodyMaterial.emissiveIntensity = slot.status === 'blocked'
      ? 0.13 + Math.sin(elapsed * 7) * 0.05
      : slot.status === 'done' ? 0.055 : 0;
  }

  function updateBlockedSpot(elapsed, delta) {
    const blocked = slots.find((slot) => slot.agent && slot.status === 'blocked');
    const targetIntensity = blocked ? 125 + Math.sin(elapsed * 7.5) * 32 : 0;
    blockedSpot.intensity = THREE.MathUtils.damp(blockedSpot.intensity, targetIntensity, 6, delta);
    if (!blocked) return;
    const world = blocked.root.getWorldPosition(tempVector);
    blockedSpot.position.set(world.x + 0.3, 8.65, world.z + 0.35);
    blockedSpot.target.position.set(world.x, 2.25, world.z - 1.25);
    blockedSpot.target.updateMatrixWorld();
  }

  function renderHud(snapshot) {
    ui.working.textContent = snapshot.stats.working;
    ui.idle.textContent = snapshot.stats.idle;
    ui.blocked.textContent = snapshot.stats.blocked;
    ui.done.textContent = snapshot.stats.done;
    ui.source.textContent = `${snapshot.source.toUpperCase()} · ${snapshot.agents.length}${snapshot.agents.length > MAX_STUDENTS ? ` / +${snapshot.agents.length - MAX_STUDENTS}` : ''}`;
    ui.connection.textContent = snapshot.connected ? (snapshot.source === 'mock' ? '모의 수업' : 'herdr 연결') : '소스 끊김';
    ui.transportDot.classList.toggle('up', client.transportUp && snapshot.connected);
  }

  function appendEvent(event, animate) {
    const item = document.createElement('li');
    const status = event.type === 'agent_status_changed' ? normalizeStatus(event.to) : event.type === 'agent_appeared' ? normalizeStatus(event.status) : 'unknown';
    item.className = `feed-item ${status}`;
    if (!animate) item.style.animation = 'none';
    const bar = document.createElement('i');
    bar.className = 'bar';
    const copy = document.createElement('div');
    copy.className = 'feed-copy';
    const title = document.createElement('b');
    const detail = document.createElement('span');
    const name = 'name' in event && event.name ? event.name : 'kind' in event ? event.kind : 'herdr';
    if (event.type === 'agent_status_changed') {
      title.textContent = `${name} · ${statusOf(event.to).label}`;
      detail.textContent = `${statusOf(event.from).label} → ${statusOf(event.to).label} · ${event.title}`;
    } else if (event.type === 'agent_appeared') {
      title.textContent = `${name} 학생이 들어왔어요`;
      detail.textContent = event.title || event.paneId;
    } else if (event.type === 'agent_left') {
      title.textContent = `${name} 학생이 나갔어요`;
      detail.textContent = event.paneId;
    } else if (event.type === 'agent_title_changed') {
      title.textContent = `${name} · 새 작업`;
      detail.textContent = event.title;
    } else if (event.type === 'focus_changed') {
      title.textContent = '선생님 시선 이동';
      detail.textContent = event.focus.paneId || '교실 전체';
    } else if (event.type === 'source_connected' || event.type === 'source_disconnected') {
      title.textContent = event.type === 'source_connected' ? '출석 시스템 연결' : '출석 시스템 끊김';
      detail.textContent = '실시간 상태 소스';
    } else {
      title.textContent = event.type.replaceAll('_', ' ');
      detail.textContent = 'paneId' in event ? event.paneId : '교실 업데이트';
    }
    copy.append(title, detail);
    const time = document.createElement('time');
    time.className = 'feed-time';
    time.dateTime = event.ts;
    time.textContent = formatClock(new Date(event.ts));
    item.append(bar, copy, time);
    ui.feed.prepend(item);
    while (ui.feed.children.length > 5) ui.feed.lastElementChild.remove();
  }

  function drawBlackboard(snapshot) {
    const canvas = room.boardCanvas;
    const ctx = canvas.getContext('2d');
    const grain = seededRandom(4271);
    ctx.fillStyle = '#173c31';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 0.075;
    for (let i = 0; i < 220; i++) {
      ctx.strokeStyle = grain() > 0.5 ? '#dfead4' : '#071c15';
      ctx.lineWidth = 1 + grain() * 3;
      ctx.beginPath();
      const y = grain() * canvas.height;
      ctx.moveTo(grain() * 100, y);
      ctx.lineTo(canvas.width - grain() * 100, y + (grain() - 0.5) * 5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#f1ead7';
    ctx.font = '800 46px system-ui, sans-serif';
    ctx.fillText('HERDR HOMEROOM', 58, 72);
    ctx.fillStyle = '#b9c9bb';
    ctx.font = '650 25px system-ui, sans-serif';
    ctx.fillText('오늘의 병렬 자율학습 · 막히면 손을 높이 들어 주세요', 60, 112);
    ctx.strokeStyle = 'rgba(236,235,209,.34)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 9]);
    ctx.beginPath();
    ctx.moveTo(58, 141);
    ctx.lineTo(1140, 141);
    ctx.stroke();
    ctx.setLineDash([]);

    const stats = snapshot?.stats ?? { total: 0, working: 0, idle: 0, blocked: 0, done: 0, unknown: 0 };
    const cells = [
      ['필기', stats.working, STATUS.working.css],
      ['엎드림', stats.idle, STATUS.idle.css],
      ['손들기', stats.blocked, STATUS.blocked.css],
      ['엄지척', stats.done, STATUS.done.css],
    ];
    cells.forEach(([label, value, color], index) => {
      const x = 65 + index * 275;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x + 18, 210, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f7f1df';
      ctx.font = '800 67px ui-monospace, monospace';
      ctx.fillText(String(value), x + 48, 231);
      ctx.fillStyle = '#bec9bf';
      ctx.font = '700 25px system-ui, sans-serif';
      ctx.fillText(label, x + 50, 272);
    });
    const total = stats.total;
    ctx.fillStyle = '#e8dfc6';
    ctx.font = '700 28px ui-monospace, monospace';
    ctx.fillText(`출석 ${total}명  ·  ${snapshot?.source === 'live' ? 'LIVE CLASS' : snapshot ? 'MOCK CLASS' : 'CONNECTING…'}`, 62, 360);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9eae9f';
    ctx.font = '650 24px ui-monospace, monospace';
    ctx.fillText(formatClock(new Date()), 1138, 360);
    ctx.textAlign = 'left';
    room.boardTexture.needsUpdate = true;
  }

  function onPointerMove(event) {
    pointerInside = true;
    pointerClientX = event.clientX;
    pointerClientY = event.clientY;
    const rect = renderer.domElement.getBoundingClientRect();
    pointerTarget.set(
      THREE.MathUtils.clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1),
      THREE.MathUtils.clamp(-(((event.clientY - rect.top) / rect.height) * 2 - 1), -1, 1),
    );
    pointerNeedsPick = true;
  }

  function onPointerLeave() {
    pointerInside = false;
    pointerTarget.set(0, 0);
    setHoveredSlot(null);
  }

  function pickStudent(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    rayPointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(rayPointer, camera);
    const active = slots.filter((slot) => slot.agent).map((slot) => slot.hitbox);
    const hit = raycaster.intersectObjects(active, false)[0];
    return hit ? slots[hit.object.userData.seatIndex] : null;
  }

  function setHoveredSlot(slot) {
    if (hoveredSlot === slot) return;
    if (hoveredSlot) hoveredSlot.hovered = false;
    hoveredSlot = slot;
    if (!slot?.agent) {
      renderer.domElement.style.cursor = 'default';
      ui.hover.classList.remove('visible');
      return;
    }
    slot.hovered = true;
    renderer.domElement.style.cursor = 'pointer';
    const meta = statusOf(slot.status);
    ui.hover.style.setProperty('--status-color', meta.css);
    ui.hoverName.textContent = `${slot.agent.name || slot.agent.kind} · ${meta.label}`;
    ui.hoverTitle.textContent = slot.agent.title || '작업 제목 없음';
    ui.hoverMeta.textContent = `${slot.agent.kind} · ${slot.agent.paneId} · ${formatDuration(slot.agent.statusSince)}`;
    ui.hover.classList.add('visible');
    positionHoverCard(pointerClientX, pointerClientY);
  }

  function positionHoverCard(x, y) {
    const width = ui.hover.offsetWidth || 310;
    const height = ui.hover.offsetHeight || 100;
    ui.hover.style.left = `${Math.max(8, Math.min(x, innerWidth - width - 22))}px`;
    ui.hover.style.top = `${Math.max(8, Math.min(y, innerHeight - height - 24))}px`;
  }

  function onCanvasClick(event) {
    const slot = pickStudent(event.clientX, event.clientY);
    if (slot?.agent) focusStudent(slot);
  }

  async function focusStudent(slot) {
    if (!slot.agent) return;
    focusRequestCount += 1;
    const paneId = slot.agent.paneId;
    showToast(`${slot.agent.name || slot.agent.kind} 자리로 이동 요청…`);
    const success = await client.focusPane(paneId);
    if (success) {
      showToast(`✓ ${paneId} pane으로 이동했습니다`, 'good');
    } else if (lastSnapshot?.source === 'mock') {
      showToast(`모의 수업 · ${paneId} (실제 pane 이동은 live에서 활성화됩니다)`, 'warn');
    } else {
      showToast(`${paneId} pane을 찾지 못했습니다`, 'warn');
    }
  }

  function showToast(message, tone = '') {
    clearTimeout(toastTimer);
    ui.toast.textContent = message;
    ui.toast.className = tone;
    requestAnimationFrame(() => ui.toast.classList.add('visible'));
    toastTimer = setTimeout(() => ui.toast.classList.remove('visible'), 2600);
  }

  function resize() {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    const aspect = width / height;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = aspect;
    if (aspect < 0.72) {
      camera.fov = 67;
      cameraBase.set(0, 7.75, 25.2);
      lookBase.set(0, 2.25, -3.7);
    } else if (aspect < 1.18) {
      camera.fov = 58;
      cameraBase.set(0, 6.65, 19.2);
      lookBase.set(0, 2.25, -4.1);
    } else {
      camera.fov = 53;
      cameraBase.set(0, 5.8, 15.7);
      lookBase.set(0, 2.35, -4.6);
    }
    for (const slot of slots) {
      slot.labelBaseWidth = (aspect < 0.72 ? 3.38 : aspect < 1.18 ? 3.95 : 4.05) + slot.row * 0.12;
      slot.labelBaseY = 4.75 + slot.row * (aspect < 0.72 ? 0.82 : 0.78);
      slot.label.position.x = aspect < 0.72 ? (slot.col === 0 ? 1.08 : slot.col === 2 ? -1.08 : 0) : 0;
    }
    camera.updateProjectionMatrix();
    camera.position.copy(cameraBase);
    cameraLook.copy(lookBase);
    camera.lookAt(cameraLook);
  }

  function animate(now) {
    requestAnimationFrame(animate);
    const delta = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
    lastFrame = now;
    const elapsed = now / 1000;

    pointerParallax.x = THREE.MathUtils.damp(pointerParallax.x, pointerInside && !reducedMotion ? pointerTarget.x : 0, 3.2, delta);
    pointerParallax.y = THREE.MathUtils.damp(pointerParallax.y, pointerInside && !reducedMotion ? pointerTarget.y : 0, 3.2, delta);
    const breath = reducedMotion ? 0 : Math.sin(elapsed * 0.42) * 0.045;
    camera.position.x = THREE.MathUtils.damp(camera.position.x, cameraBase.x + pointerParallax.x * 0.46, 4.5, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, cameraBase.y + pointerParallax.y * 0.2 + breath, 4.5, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, cameraBase.z, 4.5, delta);
    cameraLook.x = THREE.MathUtils.damp(cameraLook.x, lookBase.x + pointerParallax.x * 0.3, 4.5, delta);
    cameraLook.y = THREE.MathUtils.damp(cameraLook.y, lookBase.y + pointerParallax.y * 0.12, 4.5, delta);
    cameraLook.z = lookBase.z;
    camera.lookAt(cameraLook);

    slots.forEach((slot) => animateStudent(slot, delta, elapsed, now));
    updateBlockedSpot(elapsed, delta);
    updateEffects(now);
    dust.rotation.y = Math.sin(elapsed * 0.06) * 0.035;

    if (pointerNeedsPick) {
      pointerNeedsPick = false;
      const slot = pickStudent(pointerClientX, pointerClientY);
      setHoveredSlot(slot);
      if (slot) positionHoverCard(pointerClientX, pointerClientY);
    }

    if (now - lastSecond > 1000) {
      lastSecond = now;
      const date = new Date();
      ui.clock.textContent = formatClock(date);
      updateClockHands(date);
      if (lastSnapshot) drawBlackboard(lastSnapshot);
    }

    renderer.render(scene, camera);
  }

  function updateClockHands(date) {
    if (!roomClock.minute || !roomClock.hour) return;
    const minutes = date.getMinutes() + date.getSeconds() / 60;
    const hours = (date.getHours() % 12) + minutes / 60;
    roomClock.minute.rotation.z = -minutes / 60 * Math.PI * 2;
    roomClock.hour.rotation.z = -hours / 12 * Math.PI * 2;
  }

  function mesh(parent, geometry, material, position, rotation, receiveShadow, castShadow, scale = null) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...position);
    object.rotation.set(...rotation);
    if (scale) object.scale.set(...scale);
    object.receiveShadow = receiveShadow;
    object.castShadow = castShadow;
    parent.add(object);
    return object;
  }

  function scaledMesh(geometry, material, scale) {
    const object = new THREE.Mesh(geometry, material);
    object.scale.set(...scale);
    return object;
  }

  function makeWoodTexture(size, dark, light, rows) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const rand = seededRandom(size + rows * 91);
    const plankH = size / rows;
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, size, size);
    for (let row = 0; row < rows; row++) {
      ctx.globalAlpha = 0.55 + rand() * 0.25;
      ctx.fillStyle = row % 2 ? light : dark;
      ctx.fillRect(0, row * plankH + 1, size, plankH - 2);
      ctx.globalAlpha = 0.11;
      ctx.strokeStyle = rand() > 0.5 ? '#fff6df' : '#2c170e';
      for (let line = 0; line < 12; line++) {
        const y = row * plankH + rand() * plankH;
        ctx.beginPath();
        ctx.moveTo(-20, y);
        for (let x = 0; x <= size + 30; x += 40) ctx.lineTo(x, y + Math.sin(x * 0.025 + rand() * 3) * (1 + rand() * 2.2));
        ctx.stroke();
      }
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = '#3b2116';
      ctx.fillRect((row % 2) * size * 0.46, row * plankH, 2, plankH);
    }
    ctx.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function makeWallTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(512, 512);
    const rand = seededRandom(8812);
    for (let i = 0; i < image.data.length; i += 4) {
      const noise = Math.floor(rand() * 12);
      image.data[i] = 224 + noise;
      image.data[i + 1] = 219 + noise;
      image.data[i + 2] = 207 + noise;
      image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function makeOutdoorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');
    const sky = ctx.createLinearGradient(0, 0, 0, 640);
    sky.addColorStop(0, '#99c9e5');
    sky.addColorStop(0.62, '#e8f2df');
    sky.addColorStop(0.63, '#82986a');
    sky.addColorStop(1, '#405b44');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 640, 640);
    ctx.fillStyle = 'rgba(255,255,255,.65)';
    for (const [x, y, w] of [[80, 95, 170], [320, 145, 220], [510, 80, 120]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, w * 0.38, 34, 0, 0, Math.PI * 2);
      ctx.ellipse(x + w * 0.25, y + 4, w * 0.32, 43, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const rand = seededRandom(431);
    for (let i = 0; i < 36; i++) {
      ctx.fillStyle = `rgba(${45 + rand() * 30}, ${88 + rand() * 40}, ${52 + rand() * 24}, .85)`;
      ctx.beginPath();
      ctx.arc(rand() * 640, 410 + rand() * 170, 28 + rand() * 70, 0, Math.PI * 2);
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    return texture;
  }

  function makeLaptopTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 960, 600);
    gradient.addColorStop(0, '#071b16');
    gradient.addColorStop(1, '#0b3026');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 960, 600);
    ctx.strokeStyle = 'rgba(92, 220, 165, .08)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 960; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 600);
      ctx.stroke();
    }
    for (let y = 0; y <= 600; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(960, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#46d9a0';
    ctx.font = '800 54px ui-monospace, monospace';
    ctx.fillText('HERDR // CLASS OBSERVER', 62, 92);
    ctx.fillStyle = '#a5bdb2';
    ctx.font = '650 27px ui-monospace, monospace';
    ctx.fillText('LIVE STUDENT TELEMETRY', 64, 139);
    ctx.fillStyle = 'rgba(255,255,255,.1)';
    roundedPath(ctx, 62, 190, 836, 232, 20);
    ctx.fill();
    const rows = [
      ['WORKING', '#45d9a0', 0.82],
      ['IDLE', '#8da8c7', 0.31],
      ['BLOCKED', '#ff5e69', 0.16],
      ['DONE', '#ffc857', 0.58],
    ];
    rows.forEach(([label, color, width], index) => {
      const y = 225 + index * 48;
      ctx.fillStyle = color;
      ctx.font = '750 22px ui-monospace, monospace';
      ctx.fillText(label, 88, y + 20);
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      roundedPath(ctx, 265, y, 590, 20, 10);
      ctx.fill();
      ctx.fillStyle = color;
      roundedPath(ctx, 265, y, 590 * width, 20, 10);
      ctx.fill();
    });
    ctx.fillStyle = '#78978a';
    ctx.font = '650 24px ui-monospace, monospace';
    ctx.fillText('SELECT A STUDENT  ·  FOCUS PANE', 64, 500);
    ctx.fillStyle = '#45d9a0';
    ctx.beginPath();
    ctx.arc(76, 544, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a4b9af';
    ctx.fillText('STREAM CONNECTED', 98, 552);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    return texture;
  }

  function makeGlyphSprite(glyph, color, foreground) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 160;
    const ctx = canvas.getContext('2d');
    ctx.shadowColor = color;
    ctx.shadowBlur = 25;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(80, 80, 57, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = foreground;
    ctx.font = '900 92px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, 80, 82);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 31;
    return sprite;
  }

  function roundedPath(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function wrapCanvasText(ctx, text, maxWidth, maxLines, font) {
    ctx.font = font;
    const chars = Array.from(String(text || ''));
    const lines = [];
    let line = '';
    for (const char of chars) {
      const candidate = line + char;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line.trim());
        line = char;
        if (lines.length === maxLines - 1) break;
      } else {
        line = candidate;
      }
    }
    if (lines.length < maxLines && line) {
      const consumed = lines.join('').length + line.length;
      let final = line.trim();
      if (consumed < chars.length) {
        while (ctx.measureText(`${final}…`).width > maxWidth && final.length > 1) final = final.slice(0, -1);
        final += '…';
      }
      lines.push(final);
    }
    return lines.length ? lines : ['작업 제목 없음'];
  }

  function normalizeStatus(status) {
    return Object.prototype.hasOwnProperty.call(STATUS, status) ? status : 'unknown';
  }

  function hashString(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function formatClock(date) {
    if (Number.isNaN(date.getTime())) return '--:--:--';
    return date.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatDuration(iso) {
    const elapsed = Math.max(0, Date.now() - new Date(iso).getTime());
    if (!Number.isFinite(elapsed)) return '방금 전';
    const seconds = Math.floor(elapsed / 1000);
    if (seconds < 60) return `${seconds}초째`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}분째`;
    return `${Math.floor(minutes / 60)}시간째`;
  }
}

const POSES = Object.freeze({
  working: Object.freeze({
    rootY: 0,
    torsoX: 0.20, torsoZ: -0.015,
    headX: 0.06, headZ: 0.035,
    armLUpperX: -0.76, armLUpperZ: -0.16,
    armLLowerX: -1.10, armLLowerZ: 0.20,
    armRUpperX: -0.82, armRUpperZ: 0.13,
    armRLowerX: -1.12, armRLowerZ: -0.16,
  }),
  idle: Object.freeze({
    rootY: -0.08,
    torsoX: 0.83, torsoZ: 0.015,
    headX: 0.68, headZ: -0.12,
    armLUpperX: -1.94, armLUpperZ: -0.46,
    armLLowerX: -0.38, armLLowerZ: 0.18,
    armRUpperX: -1.94, armRUpperZ: 0.46,
    armRLowerX: -0.38, armRLowerZ: -0.18,
  }),
  blocked: Object.freeze({
    rootY: 0.04,
    torsoX: -0.06, torsoZ: -0.025,
    headX: -0.09, headZ: -0.07,
    armLUpperX: -0.42, armLUpperZ: -0.22,
    armLLowerX: -0.42, armLLowerZ: 0.16,
    armRUpperX: 0.04, armRUpperZ: 2.94,
    armRLowerX: 0.03, armRLowerZ: 0.08,
  }),
  done: Object.freeze({
    rootY: 0.06,
    torsoX: -0.04, torsoZ: 0,
    headX: -0.06, headZ: 0.02,
    armLUpperX: -0.10, armLUpperZ: -1.28,
    armLLowerX: 0.04, armLLowerZ: -1.72,
    armRUpperX: -0.10, armRUpperZ: 1.28,
    armRLowerX: 0.04, armRLowerZ: 1.72,
  }),
  unknown: Object.freeze({
    rootY: 0,
    torsoX: 0.03, torsoZ: 0,
    headX: 0.02, headZ: 0,
    armLUpperX: -0.18, armLUpperZ: -0.08,
    armLLowerX: -0.28, armLLowerZ: 0.10,
    armRUpperX: -0.18, armRUpperZ: 0.08,
    armRLowerX: -0.28, armRLowerZ: -0.10,
  }),
});

const roomClock = { minute: null, hour: null };
const tempVector = new THREE.Vector3();

if (renderer) boot(renderer);
