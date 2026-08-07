/**
 * 3D 교실 관전 — 오케스트레이션.
 * 교탁 앞 선생님 1인칭 원근 카메라, /sdk.js 스냅샷 → 학생 포즈, Raycaster 클릭 → pane 점프.
 */
import * as THREE from './three.module.js';
import { connect } from '/sdk.js';
import { buildClassroom } from './room.js';
import { createStudent, buildDeskChair, STATUS_COLOR } from './student.js';
import { createBurstPool, createBlockedSpotlight } from './effects.js';
import { glyphTexture, STATUS_LABEL } from './textures.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ── 렌더러 — WebGL 불가 환경이면 안내만 남기고 중단 ── */
const stage = $('stage');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch {
  $('fallback').style.display = 'grid';
  throw new Error('WebGL을 사용할 수 없는 환경');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfd8de);

/* ── 카메라 — 교탁 앞 선생님 눈높이 + 마우스 시차 ── */
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 60);
const CAM_BASE = new THREE.Vector3(0, 1.78, 5.15);
const LOOK_BASE = new THREE.Vector3(0, 0.86, -2.4);
const camGoal = CAM_BASE.clone();
const lookGoal = LOOK_BASE.clone();
const lookNow = LOOK_BASE.clone();
camera.position.copy(CAM_BASE);

const pointer = { x: 0, y: 0 };
addEventListener('pointermove', (ev) => {
  pointer.x = (ev.clientX / innerWidth) * 2 - 1;
  pointer.y = (ev.clientY / innerHeight) * 2 - 1;
});

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();

/* ── 씬 구성 ── */
const room = buildClassroom(THREE, scene);
const bursts = createBurstPool(THREE, scene);
const spotlight = createBlockedSpotlight(THREE, scene);
const markers = {
  excl: glyphTexture(THREE, '!', '#ff5040', 100),
  star: glyphTexture(THREE, '★', '#f3b53a', 84),
  zzz: glyphTexture(THREE, 'z', '#8fa8ff', 88),
};

/* ── 좌석 배치 — 앞줄부터 채우고, 20명 초과 시 5열로 재배열 ── */
const ROW_Z0 = 1.5;
const ROW_STEP = 1.55;
const seats = []; // { group } — 책상·의자는 빈 자리에도 남는다
const seatOf = new Map(); // paneId → seat index
const students = new Map(); // paneId → student
let cols = 4;

const seatPos = (i, c) => ({
  x: (i % c - (c - 1) / 2) * (c === 4 ? 2.05 : 1.75),
  z: ROW_Z0 - Math.floor(i / c) * ROW_STEP,
});

function ensureSeats(count) {
  // seats는 줄지 않으므로 seats.length도 반영 — 20명 초과 후 낮은 인덱스 호출로 4열로 되돌아가는 왕복을 막는다
  const needCols = Math.max(count, seats.length) > 20 ? 5 : 4;
  if (needCols !== cols) {
    cols = needCols;
    seats.forEach((seat, i) => {
      const p = seatPos(i, cols);
      seat.group.position.set(p.x, 0, p.z);
    });
  }
  while (seats.length < count) {
    const i = seats.length;
    const group = new THREE.Group();
    const p = seatPos(i, cols);
    group.position.set(p.x, 0, p.z);
    group.add(buildDeskChair(THREE, i * 37 + 11));
    scene.add(group);
    seats.push({ group });
  }
}
ensureSeats(8); // 빈 교실도 책상은 두 줄

function assignSeat(paneId) {
  const used = new Set(seatOf.values());
  let i = 0;
  while (used.has(i)) i += 1;
  seatOf.set(paneId, i);
  return i;
}

/* ── 오버레이(HTML 보조) ── */
const feedEl = $('feed');
const MAX_FEED = 9;
const shortName = (e) => e.name || `${e.kind ?? ''} ${e.paneId ?? ''}`.trim();
const trunc = (s, n) => (String(s ?? '').length > n ? String(s).slice(0, n - 1) + '…' : String(s ?? ''));

function describeEvent(e) {
  switch (e.type) {
    case 'agent_status_changed': return `${shortName(e)} · ${STATUS_LABEL[e.from] ?? e.from} → ${STATUS_LABEL[e.to] ?? e.to}`;
    case 'agent_appeared': return `${shortName(e)} 등원 (${STATUS_LABEL[e.status] ?? e.status})`;
    case 'agent_left': return `${shortName(e)} 하교`;
    case 'agent_title_changed': return `${e.paneId} 과제: ${trunc(e.title, 28)}`;
    case 'workspace_opened': return `교실 열림: ${e.label}`;
    case 'workspace_closed': return `교실 닫힘: ${e.label}`;
    case 'focus_changed': return `선생님 시선 → ${e.focus.paneId ?? '칠판'}`;
    case 'source_connected': return 'herdr 연결됨';
    case 'source_disconnected': return 'herdr 연결 끊김';
    default: return null; // pane_opened/closed는 소음이라 생략
  }
}

function pushFeed(e) {
  const text = describeEvent(e);
  if (!text) return;
  const row = document.createElement('div');
  row.className = `ev ${e.type}`;
  row.innerHTML = `<span class="t">${esc(e.ts.slice(11, 19))}</span>${esc(text)}`;
  feedEl.prepend(row);
  while (feedEl.childElementCount > MAX_FEED) feedEl.lastElementChild.remove();
}

function updateOverlay(snapshot) {
  $('dot-src').classList.toggle('up', snapshot.connected);
  $('src-label').textContent = snapshot.source;
  for (const key of ['working', 'idle', 'blocked', 'done']) $(`c-${key}`).textContent = snapshot.stats[key];
  $('c-total').textContent = snapshot.stats.total;
}

/* ── 스냅샷 → 학생 동기화 (전이 연출은 스냅샷 diff 기준 = 단일 진실) ── */
const prevStatus = new Map();
const chalkLines = [];
let chalkKey = '';
let lastBlockedPane = null;
let clockNow = 0; // 애니메이션 시계(초) — 이벤트 핸들러에서 flash 타이밍에 사용

function noteTransition(agent, from) {
  chalkLines.unshift(`${trunc(agent.name || agent.kind, 10)}: ${STATUS_LABEL[from] ?? from} → ${STATUS_LABEL[agent.status] ?? agent.status}`);
  chalkLines.length = Math.min(chalkLines.length, 3);
}

function applySnapshot(snapshot) {
  ensureSeats(Math.max(8, Math.ceil(Math.max(snapshot.agents.length, 1) / 4) * 4));

  const alive = new Set();
  for (const agent of snapshot.agents) {
    alive.add(agent.paneId);
    const seatIdx = seatOf.get(agent.paneId) ?? assignSeat(agent.paneId);
    ensureSeats(seatIdx + 1);
    let student = students.get(agent.paneId);
    if (!student) {
      student = createStudent(THREE, { paneId: agent.paneId, kind: agent.kind, markers });
      seats[seatIdx].group.add(student.root);
      students.set(agent.paneId, student);
      bursts.spawn(seats[seatIdx].group.position.clone().setY(0.4), 0xbfd7ff); // 등원 연출
    }
    student.agent = agent;
    student.applyAgent({
      name: agent.name || `${agent.kind} · ${agent.paneId}`,
      kind: agent.kind,
      status: agent.status,
      title: agent.title,
    });

    const before = prevStatus.get(agent.paneId);
    if (before && before !== agent.status) {
      const pos = new THREE.Vector3();
      student.root.getWorldPosition(pos);
      bursts.spawn(pos.setY(1.15), STATUS_COLOR[agent.status] ?? 0xffffff);
      student.state.flashUntil = clockNow + 1.4;
      if (agent.status === 'blocked') lastBlockedPane = agent.paneId;
    }
    prevStatus.set(agent.paneId, agent.status);
  }

  for (const [paneId, student] of students) {
    if (alive.has(paneId)) continue;
    student.dispose();
    students.delete(paneId);
    seatOf.delete(paneId);
    prevStatus.delete(paneId);
  }

  // 스포트라이트 — 가장 최근에 막힌 학생, 없으면 소등
  const blocked = snapshot.agents.filter((a) => a.status === 'blocked');
  if (blocked.length === 0) {
    spotlight.clear();
    lastBlockedPane = null;
  } else {
    if (!blocked.some((a) => a.paneId === lastBlockedPane)) lastBlockedPane = blocked[blocked.length - 1].paneId;
    const target = students.get(lastBlockedPane);
    if (target) {
      const pos = new THREE.Vector3();
      target.root.getWorldPosition(pos);
      spotlight.aim(pos);
    }
  }

  const key = JSON.stringify([snapshot.stats, chalkLines]);
  if (key !== chalkKey) {
    chalkKey = key;
    room.updateChalk(snapshot.stats, chalkLines);
  }
  updateOverlay(snapshot);
}

/* ── SDK 배선 ── */
const client = connect();
let seededFeed = false;
client.onTransport((up) => $('dot-ws').classList.toggle('up', up));
client.onUpdate(({ snapshot, events }) => {
  if (!seededFeed) {
    seededFeed = true;
    for (const e of snapshot.recentEvents) {
      pushFeed(e);
      if (e.type === 'agent_status_changed') noteTransition({ name: e.name, kind: e.kind, status: e.to }, e.from);
    }
  }
  for (const e of events) {
    pushFeed(e);
    if (e.type === 'agent_status_changed') noteTransition({ name: e.name, kind: e.kind, status: e.to }, e.from);
  }
  applySnapshot(snapshot);
});

/* ── Raycaster — 호버 툴팁 + 클릭 = pane 점프 ── */
const ray = new THREE.Raycaster();
const mouseNdc = new THREE.Vector2();
const tip = $('tip');
let hovered = null;

function pick(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouseNdc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(mouseNdc, camera);
  const boxes = [...students.values()].map((s) => s.hitbox);
  const hit = ray.intersectObjects(boxes, false)[0];
  if (!hit) return null;
  return [...students.values()].find((s) => s.hitbox === hit.object) ?? null;
}

const relTime = (iso) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}초` : s < 3600 ? `${Math.floor(s / 60)}분` : `${Math.floor(s / 3600)}시간`;
};

renderer.domElement.addEventListener('pointermove', (ev) => {
  const target = pick(ev);
  if (hovered && hovered !== target) hovered.state.hover = false;
  hovered = target;
  renderer.domElement.style.cursor = target ? 'pointer' : 'default';
  if (!target?.agent) {
    tip.classList.remove('show');
    return;
  }
  target.state.hover = true;
  const a = target.agent;
  tip.innerHTML = `
    <div class="tt"><b style="color:${'#' + (STATUS_COLOR[a.status] ?? 0xfff).toString(16).padStart(6, '0')}">●</b> ${esc(a.name ?? a.kind)} <span class="mut">${esc(a.paneId)} · ${esc(a.kind)}</span></div>
    <div>${esc(a.title || '…')}</div>
    <div class="mut">${esc(STATUS_LABEL[a.status] ?? a.status)} ${relTime(a.statusSince)}째 · 클릭 = pane 점프</div>`;
  tip.classList.add('show');
  tip.style.left = `${Math.min(ev.clientX + 16, innerWidth - tip.offsetWidth - 12)}px`;
  tip.style.top = `${Math.min(ev.clientY + 18, innerHeight - tip.offsetHeight - 12)}px`;
});
renderer.domElement.addEventListener('pointerleave', () => {
  if (hovered) hovered.state.hover = false;
  hovered = null;
  tip.classList.remove('show');
});
renderer.domElement.addEventListener('click', async (ev) => {
  const target = pick(ev);
  if (!target?.agent) return;
  target.state.flashUntil = clockNow + 0.8;
  await client.focusPane(target.agent.paneId);
});

/* ── 루프 ── */
let prevT = 0;
let lastClockTick = 0;
function loop(ms) {
  requestAnimationFrame(loop);
  const t = ms / 1000;
  const dt = clamp(t - prevT, 0.001, 0.05);
  prevT = t;
  clockNow = t;

  for (const student of students.values()) student.update(t, dt);
  bursts.update(dt);
  spotlight.update(t, dt);

  // 시차 + 미세 idle 스웨이 — "서 있는 선생님"의 호흡
  camGoal.set(
    CAM_BASE.x + pointer.x * 0.35 + Math.sin(t * 0.32) * 0.02,
    CAM_BASE.y - pointer.y * 0.16 + Math.sin(t * 0.5) * 0.018,
    CAM_BASE.z,
  );
  lookGoal.set(LOOK_BASE.x + pointer.x * 1.0, LOOK_BASE.y - pointer.y * 0.45, LOOK_BASE.z);
  const k = 1 - Math.exp(-dt * 4);
  camera.position.lerp(camGoal, k);
  lookNow.lerp(lookGoal, k);
  camera.lookAt(lookNow);

  if (t - lastClockTick > 1) {
    lastClockTick = t;
    room.tickClock();
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);
