/**
 * ray-brain 오늘 대시보드 — three.js "사무실 통로 시점" 씬 (v2).
 * v1(아이소메트릭 디오라마)에서 전환: 원근 카메라가 사무실 입구에서 안쪽을 바라봐
 * 세로 화면(701×990)을 위(천장·정면벽)~아래(가까운 책상)로 꽉 채운다.
 * 지오메트리: assets3d.mjs(buildInterior 등, codex 제작) · 여기는 씬·조명·애니메이션·배선.
 */
import * as THREE from './vendor/three.module.js';
import * as A from './assets3d.mjs';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KIND_COLOR = { claude: 0xd97757, codex: 0x14b8a6 };

/* ───────── 렌더러·카메라 ───────── */
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18; // 밝은 사무실
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf3ead9);

const camera = new THREE.PerspectiveCamera(66, 1, 1, 3000);
function fitCamera(floorD) {
  camera.aspect = stage.clientWidth / stage.clientHeight;
  camera.position.set(6, 120, floorD / 2 + 62); // 입구(열린 쪽)에서 살짝 위
  camera.lookAt(0, 24, -floorD / 2 + 80);
  camera.updateProjectionMatrix();
}
function resize() {
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  if (room) fitCamera(room.floorD);
}
addEventListener('resize', resize);

/* ───────── 조명 — 밝은 낮 사무실 ───────── */
const hemi = new THREE.HemisphereLight(0xfff7e8, 0xd9c8a6, 0.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.5); // 오른쪽 창에서 들어오는 햇살
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -420; sun.shadow.camera.right = 420;
sun.shadow.camera.top = 420; sun.shadow.camera.bottom = -420;
sun.shadow.bias = -0.001;
scene.add(sun);
const ceilingPts = []; // buildInterior의 매입등 위치에 얹는 실내등

function updateDaylight() {
  const d = new Date();
  const t = (d.getHours() * 60 + d.getMinutes() - 9 * 60) / (11 * 60); // 09~20시 → 0~1
  if (t >= 0 && t <= 1) {
    const a = t * Math.PI;
    // 오른쪽 창(+x) 밖에서 들어오는 해 — 시간에 따라 앞뒤(z)로 이동
    sun.position.set(340, 150 + Math.sin(a) * 180, 160 - t * 340);
    const warm = Math.pow(Math.abs(t - 0.5) * 2, 2);
    sun.color.setHSL(0.11 - warm * 0.05, 0.5, 0.66 + (1 - warm) * 0.1);
    sun.intensity = 1.15 + (1 - warm) * 0.65;
    hemi.intensity = 0.9 + (1 - warm) * 0.15;
    ceilingPts.forEach(p => p.intensity = 14);          // 낮에도 은은히
  } else { // 야간 — 실내등 중심
    sun.intensity = 0.18; sun.color.set(0x9db4dd);
    sun.position.set(300, 240, -80);
    hemi.intensity = 0.55;
    ceilingPts.forEach(p => p.intensity = 46);
  }
}

/* ───────── CanvasTexture 헬퍼 ───────── */
function canvasTex(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { c, ctx: c.getContext('2d'), tex };
}

function drawScreen({ ctx, c, tex }, mode, frame) {
  ctx.fillStyle = { working: '#0e2d1b', idle: '#171b21', blocked: '#3d100c', off: '#23262b' }[mode] || '#23262b';
  ctx.fillRect(0, 0, c.width, c.height);
  if (mode === 'working') {
    for (let i = 0; i < 6; i++) {
      const seed = Math.sin(i * 37.7 + Math.floor(frame / 2)) * 0.5 + 0.5;
      ctx.fillStyle = i % 2 ? '#2fbf6b' : '#3ddc7f';
      ctx.globalAlpha = 0.45 + seed * 0.55;
      ctx.fillRect(10, 8 + i * 14, 20 + seed * (c.width - 55), 7);
    }
    ctx.globalAlpha = 1;
  } else if (mode === 'idle') {
    ctx.fillStyle = '#4a5560'; ctx.fillRect(10, 10, 42, 7);
    if (frame % 4 < 2) { ctx.fillStyle = '#8899a6'; ctx.fillRect(10, 26, 12, 8); }
  } else if (mode === 'blocked') {
    ctx.fillStyle = '#ff6b6b'; ctx.font = 'bold 54px monospace'; ctx.textAlign = 'center';
    ctx.fillText('!', c.width / 2, c.height / 2 + 20);
  }
  tex.needsUpdate = true;
}

/** 화이트보드 — 이제 카메라 정면이라 글씨가 잘 읽힌다 */
function drawWhiteboard({ ctx, c, tex }, s) {
  ctx.fillStyle = '#fdfdfb'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#a89c82'; ctx.font = '800 24px sans-serif';
  ctx.fillText('오 늘', 26, 38);
  let y = 80;
  const nowHM = new Date().toTimeString().slice(0, 5);
  const line = (label, text, color, strike) => {
    if (y > c.height - 12) return;
    ctx.font = '800 28px ui-monospace, monospace'; ctx.fillStyle = color;
    ctx.fillText(label, 26, y);
    ctx.font = '600 28px sans-serif'; ctx.fillStyle = strike ? '#b6ac97' : '#544c3d';
    const t = text.length > 26 ? text.slice(0, 25) + '…' : text;
    ctx.fillText(t, 140, y);
    if (strike) { ctx.strokeStyle = '#b6ac97'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(138, y - 9); ctx.lineTo(140 + ctx.measureText(t).width, y - 9); ctx.stroke(); }
    y += 40;
  };
  for (const e of s.timeline) line(e.time, e.title, '#1971c2', e.time < nowHM);
  if (!s.timeline.length) line('—', '미팅 없음', '#a89c82', false);
  for (const dl of s.deadlines.slice(0, 4)) {
    line(dl.dDay === 0 ? '오늘⚠' : `D-${dl.dDay}`, dl.title, dl.dDay === 0 ? '#e8590c' : dl.hard ? '#e03131' : '#a89c82', false);
  }
  tex.needsUpdate = true;
}

function drawClock({ ctx, c, tex }) {
  const r = c.width / 2, d = new Date();
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#fffdf4'; ctx.beginPath(); ctx.arc(r, r, r - 4, 0, 7); ctx.fill();
  ctx.strokeStyle = '#7a5c3e'; ctx.lineWidth = 7; ctx.stroke();
  ctx.strokeStyle = '#b3a688'; ctx.lineWidth = 3;
  for (let i = 0; i < 12; i += 3) {
    const a = i / 12 * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(r + Math.sin(a) * (r - 12), r - Math.cos(a) * (r - 12));
    ctx.lineTo(r + Math.sin(a) * (r - 20), r - Math.cos(a) * (r - 20));
    ctx.stroke();
  }
  const hand = (frac, len, w, color) => {
    const a = frac * Math.PI * 2;
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(r, r); ctx.lineTo(r + Math.sin(a) * len, r - Math.cos(a) * len); ctx.stroke();
  };
  hand(((d.getHours() % 12) + d.getMinutes() / 60) / 12, r * 0.45, 6, '#3a3226');
  hand(d.getMinutes() / 60, r * 0.66, 4.5, '#3a3226');
  hand(d.getSeconds() / 60, r * 0.74, 2, '#e8590c');
  tex.needsUpdate = true;
}

function makePlate(text, { strike = false, dotColor = null } = {}) {
  const { c, ctx, tex } = canvasTex(256, 56);
  ctx.fillStyle = 'rgba(255,253,245,.96)'; ctx.strokeStyle = '#c8b892'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.roundRect(2, 2, c.width - 4, c.height - 4, 12); ctx.fill(); ctx.stroke();
  ctx.font = '700 26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = strike ? '#a89e88' : '#4a4335';
  let label = text.length > 15 ? text.slice(0, 14) + '…' : text;
  if (dotColor) {
    ctx.fillText('  ' + label, c.width / 2, c.height / 2 + 1);
    ctx.fillStyle = dotColor;
    const w = ctx.measureText('  ' + label).width;
    ctx.beginPath(); ctx.arc(c.width / 2 - w / 2 - 4, c.height / 2, 7, 0, 7); ctx.fill();
  } else ctx.fillText(label, c.width / 2, c.height / 2 + 1);
  if (strike) {
    ctx.strokeStyle = '#a89e88'; ctx.lineWidth = 3;
    const w = ctx.measureText(label).width;
    ctx.beginPath(); ctx.moveTo(c.width / 2 - w / 2, c.height / 2); ctx.lineTo(c.width / 2 + w / 2, c.height / 2); ctx.stroke();
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(50, 11, 1);
  sp.renderOrder = 5;
  return sp;
}
function makeTextSprite(text, color, px = 40) {
  const { c, ctx, tex } = canvasTex(64, 64);
  ctx.font = `800 ${px}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.fillText(text, 32, 34);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sp.scale.set(13, 13, 1);
  return sp;
}

/* ───────── 방·가구 ───────── */
let room = null;
const deskPool = [];
const loungePool = [];
let wbTex = null, clockTex = null;

const DESK_COL_X = 58;      // 통로(중앙) 양옆 책상 열
const ROW_SPACING = 126;
const NEAR_ROW_OFFSET = 155; // 입구에서 첫 행까지 (가까운 책상이 하단에 크게)

function ensureRoom(rows) {
  if (room) return;
  room = A.buildInterior(THREE, { cols: 2, rows });
  room.group.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  scene.add(room.group);
  wbTex = canvasTex(640, 256);
  room.whiteboard.material = new THREE.MeshBasicMaterial({ map: wbTex.tex });
  clockTex = canvasTex(128, 128);
  room.clockFace.material = new THREE.MeshBasicMaterial({ map: clockTex.tex, transparent: true });
  // 매입등 위치에 포인트라이트 (부하 조절: 최대 3개, 하나 걸러 하나)
  room.ceilingLights.forEach((m, i) => {
    if (i % 2 === 1 || ceilingPts.length >= 3) return;
    const p = new THREE.PointLight(0xfff2dc, 14, 420, 1.8);
    m.getWorldPosition(p.position);
    p.position.y -= 12;
    scene.add(p);
    ceilingPts.push(p);
  });
  // 입구 근처 전경 소품 — 화면 하단 모서리에 걸치는 깊이감
  const sofa = A.buildSofa(THREE);
  sofa.group.position.set(-room.floorW / 2 + 46, 0, room.floorD / 2 - 60);
  sofa.group.rotation.y = Math.PI / 2;
  scene.add(sofa.group);
  const p1 = A.buildPlant(THREE), p2 = A.buildPlant(THREE);
  p1.group.position.set(room.floorW / 2 - 32, 0, room.floorD / 2 - 70);
  p1.group.scale.setScalar(1.5);
  p2.group.position.set(-room.floorW / 2 + 30, 0, -room.floorD / 2 + 46);
  scene.add(p1.group, p2.group);
  sofa.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
  fitCamera(room.floorD);
  resize();
}

function makeDeskSlot() {
  const desk = A.buildDesk(THREE);
  desk.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const screen = canvasTex(128, 96);
  desk.screen.material = new THREE.MeshBasicMaterial({ map: screen.tex });
  const plateAnchor = new THREE.Object3D();
  plateAnchor.position.set(0, 70, 8); // 모니터 위 공중 팻말
  desk.group.add(plateAnchor);
  const hitbox = new THREE.Mesh(new THREE.BoxGeometry(84, 84, 96), new THREE.MeshBasicMaterial({ visible: false }));
  hitbox.position.y = 36;
  desk.group.add(hitbox);
  const zzz = [makeTextSprite('z', '#748ffc', 34), makeTextSprite('z', '#748ffc', 26)];
  zzz.forEach(z => { z.visible = false; desk.group.add(z); });
  const excl = A.buildExclamation(THREE);
  excl.group.visible = false;
  desk.group.add(excl.group);
  scene.add(desk.group);
  return { desk, screen, plateAnchor, hitbox, zzz, excl: excl.group, char: null, plate: null, mode: 'off', item: null };
}

function setCharacter(slot, kind) {
  if (slot.char) { slot.desk.group.remove(slot.char.group); slot.char = null; }
  if (kind === undefined) return;
  slot.char = A.buildCharacter(THREE, KIND_COLOR[kind] ?? 0x9aa0a6);
  slot.char.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
  slot.char.group.position.set(0, 0, 26);
  slot.desk.group.add(slot.char.group);
}

/* ───────── 상태 반영 ───────── */
let state = null, lastMsgAt = 0;
const prevSig = new Map();
const deskMode = (item) => {
  if (item.outcome === 'done' || item.poolStatus === 'done') return 'done';
  const a = item.agents[0];
  if (!a) return 'empty';
  return a.status === 'working' ? 'working' : a.status === 'blocked' ? 'blocked' : 'idle';
};
const RANK = { working: 0, blocked: 1, idle: 2, empty: 3, done: 9 };
const idHash = (s) => [...String(s)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7);

function apply(s) {
  state = s;
  const rows = Math.max(2, Math.ceil(s.board.length / 2));
  ensureRoom(rows);
  drawWhiteboard(wbTex, s);

  // working이 가장 가까운(큰) 책상 — "지금 하는 일"이 제일 잘 보이게
  const sorted = [...s.board].sort((a, b) => RANK[deskMode(a)] - RANK[deskMode(b)]);
  while (deskPool.length < sorted.length) deskPool.push(makeDeskSlot());
  deskPool.forEach((slot, i) => {
    const item = sorted[i];
    if (!item) { slot.desk.group.visible = false; slot.item = null; return; }
    slot.desk.group.visible = true;
    const col = i % 2, row = Math.floor(i / 2);
    slot.desk.group.position.set(
      col === 0 ? -DESK_COL_X : DESK_COL_X, 0,
      room.floorD / 2 - NEAR_ROW_OFFSET - row * ROW_SPACING,
    );
    slot.desk.group.rotation.y = ((idHash(item.id) % 5) - 2) * 0.02; // 미세한 흐트러짐 = 실제감
    const mode = deskMode(item);
    const kindOfFirst = item.agents[0]?.kind;
    if (slot.mode !== mode || slot.charKind !== kindOfFirst) {
      setCharacter(slot, mode === 'empty' || mode === 'done' ? undefined : kindOfFirst);
      slot.charKind = kindOfFirst;
    }
    slot.mode = mode; slot.item = item;
    slot.desk.papers.visible = mode === 'empty';
    slot.desk.flag.visible = mode === 'done';
    slot.zzz.forEach(z => z.visible = mode === 'idle');
    slot.excl.visible = mode === 'blocked';
    if (slot.plate) slot.plateAnchor.remove(slot.plate);
    const dot = kindOfFirst ? '#' + (KIND_COLOR[kindOfFirst] ?? 0x9aa0a6).toString(16).padStart(6, '0') : null;
    const extra = item.agents.length > 1 ? ` +${item.agents.length - 1}` : '';
    slot.plate = makePlate(shortTitle(item.title) + extra, { strike: mode === 'done', dotColor: dot });
    slot.plateAnchor.add(slot.plate);
    const sig = JSON.stringify([item.outcome, item.poolStatus, item.agents.map(a => a.status)]);
    if (prevSig.get(item.id) !== undefined && prevSig.get(item.id) !== sig) slot.flashUntil = performance.now() + 1800;
    prevSig.set(item.id, sig);
  });

  // 라운지 — 좌·우 벽면에 번갈아 (통로 안쪽, 시야에 들어오는 깊이부터)
  const etc = [
    ...s.outsideBatch.map(a => ({ ...a, plate: shortTitle(a.poolTitle), hover: loungeHover(a, a.poolTitle, '오늘 배치 밖') })),
    ...s.unlinked.map(a => ({ ...a, plate: a.paneId, hover: loungeHover(a, `${a.workspaceLabel} · ${a.cwd}`, 'pool 미연결') })),
  ];
  while (loungePool.length < etc.length) {
    const c = { char: null, plate: null, anchor: new THREE.Object3D(), hitbox: new THREE.Mesh(new THREE.BoxGeometry(36, 58, 36), new THREE.MeshBasicMaterial({ visible: false })) };
    c.anchor.add(c.hitbox); c.hitbox.position.y = 26;
    scene.add(c.anchor);
    loungePool.push(c);
  }
  loungePool.forEach((c, i) => {
    const a = etc[i];
    if (!a) { c.anchor.visible = false; c.data = null; return; }
    c.anchor.visible = true; c.data = a;
    const side = i % 2 === 0 ? -1 : 1;
    c.anchor.position.set(side * (room.floorW / 2 - 40), 0, room.floorD / 2 - 320 - Math.floor(i / 2) * 78);
    c.anchor.rotation.y = side * Math.PI / 2; // 통로 쪽을 바라봄
    if (c.kind !== a.kind || !c.char) {
      if (c.char) c.anchor.remove(c.char.group);
      c.char = A.buildCharacter(THREE, KIND_COLOR[a.kind] ?? 0x9aa0a6);
      c.char.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
      c.anchor.add(c.char.group);
      c.kind = a.kind;
    }
    c.status = a.status;
    if (c.plate) c.anchor.remove(c.plate);
    c.plate = makePlate(a.plate, {});
    c.plate.scale.set(34, 7.5, 1);
    c.plate.position.set(0, 52, 0);
    c.anchor.add(c.plate);
  });

  // 상태바 (HTML)
  const done = s.board.filter(b => b.outcome === 'done' || b.poolStatus === 'done').length;
  const agentsAll = [...s.board.flatMap(b => b.agents), ...s.outsideBatch, ...s.unlinked];
  const working = agentsAll.filter(a => a.status === 'working').length;
  const blocked = agentsAll.filter(a => a.status === 'blocked').length;
  $('sb-done').textContent = done; $('sb-total').textContent = s.board.length;
  $('sb-agents').textContent = agentsAll.length; $('sb-working').textContent = working;
  $('sb-blocked').innerHTML = blocked ? ` · 블록 <b class="r">${blocked}</b>` : '';
  const dueToday = s.deadlines.filter(d => d.dDay === 0).length;
  $('sb-due').innerHTML = dueToday ? `<b class="t">⚠ 오늘 마감 ${dueToday}건</b>` : '';
  const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(`${s.today}T12:00:00`).getDay()];
  $('np-date').textContent = `${Number(s.today.slice(5, 7))}/${Number(s.today.slice(8))} ${dow}`;
  $('led').classList.toggle('live', s.herdr === 'live');
}
const shortTitle = (t) => {
  let x = String(t).split(' — ')[0].split('(')[0].trim();
  return x.length > 14 ? x.slice(0, 13) + '…' : x;
};
const loungeHover = (a, title, note) =>
  `<div class="hc-title">${esc(title)}</div><div class="hc-row"><b>${esc(a.paneId)}</b> ${esc(a.kind)} · ${esc(a.status)}${a.title ? ` — ${esc(a.title)}` : ''}</div><div class="hc-row" style="color:#988c72">${note} · 클릭 = pane 점프</div>`;
function deskHover(item) {
  const rows = [];
  if (item.due) rows.push(`<b>due</b> ${esc(item.due)}`);
  if (item.carriedFrom) rows.push(`<b>이월</b> ${esc(item.carriedFrom)}부터 (${item.carriedAs === 'partial' ? '◐ 진행' : '○ 미착수'})`);
  for (const a of item.agents) rows.push(`<b>${esc(a.paneId)}</b> ${esc(a.kind)} · ${esc(a.status)}${a.title ? ` — ${esc(a.title)}` : ''}`);
  if (!item.agents.length && deskMode(item) !== 'done') rows.push('Ray 직접 / 미배정');
  if (item.agents.length) rows.push('<span style="color:#988c72">클릭 = pane으로 점프</span>');
  return `<div class="hc-title">${esc(item.title)}</div>` + rows.map(r => `<div class="hc-row">${r}</div>`).join('');
}

/* ───────── 인터랙션 ───────── */
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoverTarget = null;
function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const boxes = [
    ...deskPool.filter(s => s.item).map(s => s.hitbox),
    ...loungePool.filter(c => c.data).map(c => c.hitbox),
  ];
  const hit = ray.intersectObjects(boxes, false)[0];
  if (!hit) return null;
  const slot = deskPool.find(s => s.hitbox === hit.object);
  if (slot) return { kind: 'desk', slot };
  return { kind: 'lounge', seat: loungePool.find(c => c.hitbox === hit.object) };
}
const hc = $('hc');
renderer.domElement.addEventListener('pointermove', (ev) => {
  const t = pick(ev);
  hoverTarget = t;
  renderer.domElement.style.cursor = t ? 'pointer' : 'default';
  if (!t) { hc.classList.remove('show'); return; }
  hc.innerHTML = t.kind === 'desk' ? deskHover(t.slot.item) : t.seat.data.hover;
  hc.classList.add('show');
  hc.style.left = Math.min(ev.clientX + 14, innerWidth - hc.offsetWidth - 10) + 'px';
  hc.style.top = Math.min(ev.clientY + 16, innerHeight - hc.offsetHeight - 10) + 'px';
});
renderer.domElement.addEventListener('pointerleave', () => hc.classList.remove('show'));
renderer.domElement.addEventListener('click', () => {
  if (!hoverTarget) return;
  const pane = hoverTarget.kind === 'desk' ? hoverTarget.slot.item.agents[0]?.paneId : hoverTarget.seat.data.paneId;
  if (pane) fetch(`/api/focus?pane=${encodeURIComponent(pane)}`, { method: 'POST' }).catch(() => {});
});

/* ───────── 루프 ───────── */
let frame = 0, lastScreenAt = 0, lastClockAt = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const sec = t / 1000;
  for (const s of deskPool) {
    if (!s.item || !s.desk.group.visible) continue;
    if (s.char) {
      if (s.mode === 'working') {
        s.char.armL.rotation.x = Math.sin(sec * 14) * 0.28;
        s.char.armR.rotation.x = Math.sin(sec * 14 + Math.PI) * 0.28;
        s.char.head.rotation.z = 0;
      } else if (s.mode === 'idle') {
        s.char.head.rotation.z = 0.05 + Math.sin(sec * 1.4 + s.desk.group.position.x) * 0.1;
        s.char.armL.rotation.x = 0; s.char.armR.rotation.x = 0;
      } else if (s.mode === 'blocked') {
        s.char.head.rotation.z = Math.sin(sec * 9) * 0.05;
      }
    }
    if (s.mode === 'idle') {
      s.zzz.forEach((z, i) => {
        const ph = (sec * 0.55 + i * 0.5) % 1;
        z.position.set(16 + ph * 10 + i * 4, 62 + ph * 18 + i * 6, 30);
        z.material.opacity = ph < 0.15 ? ph / 0.15 : 1 - (ph - 0.15) / 0.85;
      });
    }
    if (s.mode === 'blocked') s.excl.position.set(6, 64 + Math.sin(sec * 6) * 2.5, 24);
    if (s.mode === 'done') s.desk.flagPivot.rotation.z = Math.sin(sec * 4) * 0.16;
    if (s.flashUntil > performance.now() && s.plate) {
      s.plate.material.color.setHSL(0.14, 1, 0.55 + Math.sin(sec * 18) * 0.3);
    } else if (s.plate) s.plate.material.color.set(0xffffff);
  }
  for (const c of loungePool) {
    if (!c.data || !c.char) continue;
    if (c.status === 'working') {
      c.char.armL.rotation.x = Math.sin(sec * 14) * 0.25;
      c.char.armR.rotation.x = Math.sin(sec * 14 + Math.PI) * 0.25;
    } else if (c.status === 'idle') {
      c.char.head.rotation.z = 0.04 + Math.sin(sec * 1.2 + c.anchor.position.z) * 0.09;
    }
  }
  if (t - lastScreenAt > 250) {
    lastScreenAt = t; frame++;
    for (const s of deskPool) {
      if (!s.item) continue;
      drawScreen(s.screen, s.mode === 'empty' || s.mode === 'done' ? 'off' : s.mode, frame);
    }
  }
  if (t - lastClockAt > 1000) {
    lastClockAt = t;
    if (clockTex) drawClock(clockTex);
    updateDaylight();
    const d = new Date();
    $('np-clock').textContent = d.toTimeString().slice(0, 8);
    if (state?.lastTrigger && lastMsgAt) {
      const s2 = Math.round((Date.now() - lastMsgAt) / 1000);
      const ev = state.lastTrigger.source === 'herdr' ? state.lastTrigger.event : `파일: ${state.lastTrigger.event}`;
      $('sb-tick').textContent = `${ev} · ${s2 < 60 ? s2 + '초' : Math.floor(s2 / 60) + '분'} 전`;
    }
    if (state && wbTex) drawWhiteboard(wbTex, state);
  }
  renderer.render(scene, camera);
}

/* ───────── SSE ───────── */
function connect() {
  const es = new EventSource('/events');
  es.onmessage = (ev) => {
    lastMsgAt = Date.now();
    const l = $('led');
    l.classList.remove('pulse'); void l.offsetWidth; l.classList.add('pulse');
    apply(JSON.parse(ev.data));
  };
  es.onerror = () => { es.close(); setTimeout(connect, 3000); };
}
connect();
resize();
updateDaylight();
requestAnimationFrame(loop);
