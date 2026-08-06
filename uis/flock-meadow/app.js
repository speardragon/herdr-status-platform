/**
 * 양떼 초원 오케스트레이터 — 스냅샷을 목장 풍경으로 조립한다.
 * - workspace → 울타리 목초지(paddock), agent → 양, focus → 보더콜리
 * - 스냅샷은 항상 전체 상태라 keyed reconcile만 하면 된다 (diff 불필요)
 */
import { connect } from '/sdk.js';
import { createSheepEl, applySheep, setAlarmTime, showBubble } from './sheep.js';
import { createDogEl, placeDog } from './dog.js';
import { createJournal } from './journal.js';
import { burstAt, ringAt, flashAlert } from './effects.js';

const $ = (id) => document.getElementById(id);
const client = connect();
const journal = createJournal($('journal-list'), $('journal-toggle'));

const pastureEl = $('pasture');
const paddocksEl = $('paddocks');
const dogEl = createDogEl();
pastureEl.appendChild(dogEl);

const paddocks = new Map(); // workspaceId → { el, field, sign }
const flock = new Map(); // paneId → { el, agent, x, y, phase, nextAt }
let focusPaneId = null;

const rel = (iso) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}초`;
  if (s < 3600) return `${Math.floor(s / 60)}분`;
  return `${Math.floor(s / 3600)}시간`;
};

/* ───────── 목초지 ───────── */
function ensurePaddock(ws, sheepCount) {
  let entry = paddocks.get(ws.workspaceId);
  if (!entry) {
    const el = document.createElement('div');
    el.className = 'paddock';
    el.dataset.ws = ws.workspaceId;
    el.innerHTML = '<div class="signpost"></div><div class="field"></div>';
    paddocksEl.appendChild(el);
    entry = { el, field: el.querySelector('.field'), sign: el.querySelector('.signpost') };
    paddocks.set(ws.workspaceId, entry);
  }
  entry.el.style.order = String(ws.number);
  entry.el.classList.toggle('has-blocked', ws.agentStatus === 'blocked');

  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = `🐑 ${sheepCount}마리`;
  const parts = [document.createTextNode(`🪧 ${ws.label}`), count];
  if (ws.worktree?.isLinkedWorktree) {
    const wt = document.createElement('span');
    wt.className = 'wt';
    wt.textContent = '🌿 worktree';
    parts.push(wt);
  }
  entry.sign.replaceChildren(...parts);
  return entry;
}

/* ───────── 양 ───────── */
function ensureSheep(agent) {
  const paddock = paddocks.get(agent.workspaceId);
  if (!paddock) return; // 목초지가 아직 없으면 다음 스냅샷에서 처리된다

  let entry = flock.get(agent.paneId);
  if (!entry) {
    const el = createSheepEl(agent);
    entry = {
      el,
      agent,
      x: 8 + Math.random() * 74,
      y: 16 + Math.random() * 60,
      phase: 'graze',
      nextAt: performance.now() + 600 + Math.random() * 2200,
    };
    el.style.left = `${entry.x}%`;
    el.style.top = `${entry.y}%`;
    el.style.zIndex = String(20 + Math.round(entry.y));
    paddock.field.appendChild(el);
    flock.set(agent.paneId, entry);
  } else if (entry.el.parentElement !== paddock.field) {
    paddock.field.appendChild(entry.el); // 드물지만 목초지 이사
  }

  const prevStatus = entry.agent.status;
  entry.agent = agent;
  if (prevStatus === 'working' && agent.status !== 'working') freezeSheep(entry);
  if (prevStatus !== 'working' && agent.status === 'working') {
    entry.phase = 'graze';
    entry.nextAt = performance.now() + 400;
  }
  applySheep(entry.el, agent);
  // 구조 요청 중인 양은 무리에 가려지지 않게 맨 앞으로
  entry.el.style.zIndex = agent.status === 'blocked' ? '400' : String(20 + Math.round(entry.y));
  if (agent.status === 'blocked') setAlarmTime(entry.el, `${rel(agent.statusSince)}째`);
}

/** 이동 트랜지션 중이던 양을 현재 위치에 그대로 세운다. */
function freezeSheep(entry) {
  const field = entry.el.parentElement;
  const cs = getComputedStyle(entry.el);
  entry.el.style.transitionProperty = 'none';
  entry.el.style.left = cs.left;
  entry.el.style.top = cs.top;
  entry.el.getBoundingClientRect(); // reflow — 위치 고정을 확정
  entry.el.style.transitionProperty = '';
  entry.el.classList.remove('walking', 'grazing');
  if (field && field.clientWidth > 0) {
    entry.x = (parseFloat(cs.left) / field.clientWidth) * 100;
    entry.y = (parseFloat(cs.top) / field.clientHeight) * 100;
  }
}

function removeSheep(paneId) {
  const entry = flock.get(paneId);
  if (!entry) return;
  flock.delete(paneId);
  entry.el.classList.add('leaving');
  setTimeout(() => entry.el.remove(), 650);
}

/* ───────── 어슬렁 이동 (working 양만) ───────── */
function walkTick() {
  const now = performance.now();
  for (const entry of flock.values()) {
    if (entry.agent.status !== 'working' || now < entry.nextAt) continue;
    if (entry.phase === 'graze') beginWalk(entry, now);
    else beginGraze(entry, now);
  }
}

function beginWalk(entry, now) {
  const nx = 6 + Math.random() * 80;
  const ny = 14 + Math.random() * 62;
  const field = entry.el.parentElement;
  const distPx = field
    ? Math.hypot(((nx - entry.x) / 100) * field.clientWidth, ((ny - entry.y) / 100) * field.clientHeight)
    : 120;
  const dur = Math.max(1400, Math.min(7000, distPx * 28));
  entry.el.classList.toggle('flip', nx < entry.x);
  entry.el.classList.add('walking');
  entry.el.classList.remove('grazing');
  entry.el.style.setProperty('--wd', `${dur}ms`);
  entry.el.style.left = `${nx}%`;
  entry.el.style.top = `${ny}%`;
  entry.el.style.zIndex = String(20 + Math.round(ny));
  entry.x = nx;
  entry.y = ny;
  entry.phase = 'walk';
  entry.nextAt = now + dur;
}

function beginGraze(entry, now) {
  entry.el.classList.remove('walking');
  entry.el.classList.add('grazing');
  entry.phase = 'graze';
  entry.nextAt = now + 1800 + Math.random() * 5200;
}

/* ───────── 보더콜리 ───────── */
function updateDog(paneId) {
  focusPaneId = paneId;
  requestAnimationFrame(() => {
    const target = focusPaneId ? (flock.get(focusPaneId)?.el ?? null) : null;
    placeDog(dogEl, pastureEl, target);
  });
}

/* ───────── 렌더 ───────── */
function updateConn(snapshot) {
  const online = snapshot.connected && client.transportUp;
  document.body.classList.toggle('offline', !online);
  $('offline-banner').hidden = online;
  $('conn-emoji').textContent = online ? '🌞' : '⛈️';
  $('conn-label').textContent = client.transportUp
    ? `${snapshot.source === 'mock' ? '모의 목장' : 'herdr 실황'} · seq ${snapshot.seq}`
    : '재접속 중…';
}

function render(snapshot) {
  for (const key of ['working', 'idle', 'blocked', 'done']) $(`c-${key}`).textContent = snapshot.stats[key];
  $('c-blocked').closest('.chip').classList.toggle('hot', snapshot.stats.blocked > 0);
  document.body.classList.toggle('has-blocked', snapshot.stats.blocked > 0);
  updateConn(snapshot);

  const liveWs = new Set();
  for (const ws of snapshot.workspaces) {
    liveWs.add(ws.workspaceId);
    const count = snapshot.agents.filter((a) => a.workspaceId === ws.workspaceId).length;
    ensurePaddock(ws, count);
  }
  for (const [id, entry] of paddocks) {
    if (liveWs.has(id)) continue;
    paddocks.delete(id);
    entry.el.classList.add('leaving');
    setTimeout(() => entry.el.remove(), 550);
  }

  const livePanes = new Set();
  for (const agent of snapshot.agents) {
    livePanes.add(agent.paneId);
    ensureSheep(agent);
  }
  for (const paneId of [...flock.keys()]) {
    if (!livePanes.has(paneId)) removeSheep(paneId);
  }

  $('empty-hint').hidden = snapshot.agents.length > 0;
  updateDog(snapshot.focus.paneId);
}

/* ───────── 이벤트 연출 ───────── */
const BUBBLES = {
  blocked: (e) => [`메에에!! 🆘 ${e.title}`, { urgent: true, ms: 5200 }],
  done: () => ['다 끝냈어요! ✨', {}],
  working: (e) => [`🌿 ${e.title}`, {}],
  idle: () => ['하암… 💤', {}],
  unknown: () => ['…어라?', {}],
};

client.onUpdate(({ snapshot }) => render(snapshot));

client.onEvent('*', (e) => {
  journal.push(e);
  if (e.type === 'agent_status_changed') {
    const entry = flock.get(e.paneId);
    if (!entry) return;
    const bubble = BUBBLES[e.to];
    if (bubble) {
      const [text, opts] = bubble(e);
      showBubble(entry.el, text, opts);
    }
    if (e.to === 'blocked') {
      ringAt(entry.el);
      flashAlert();
    } else if (e.to === 'done') {
      burstAt(entry.el, 'sparkle', 14);
    } else if (e.to === 'working') {
      burstAt(entry.el, 'dust', 7);
    }
  } else if (e.type === 'agent_appeared') {
    const entry = flock.get(e.paneId);
    if (entry) burstAt(entry.el, 'pop', 9);
  } else if (e.type === 'agent_title_changed') {
    const entry = flock.get(e.paneId);
    if (entry) showBubble(entry.el, `🗨️ ${e.title}`);
  }
});

client.onTransport(() => {
  if (client.snapshot) render(client.snapshot);
});

/* ───────── 클릭 → herdr pane 점프 ───────── */
async function jumpToPane(sheepEl) {
  const paneId = sheepEl.dataset.pane;
  const ok = await client.focusPane(paneId);
  sheepEl.classList.add(ok ? 'focus-ok' : 'focus-fail');
  setTimeout(() => sheepEl.classList.remove('focus-ok', 'focus-fail'), 1000);
  if (ok) journal.note(`🐕 휘파람! ${paneId}로 점프했어요`, 'ev-working');
  else journal.note(`🐕 ${paneId}에 휘파람을 불었지만 대답이 없어요 (mock에선 점프 불가)`, 'ev-gone');
}

pastureEl.addEventListener('click', (ev) => {
  const sheepEl = ev.target.closest('.sheep');
  if (sheepEl) jumpToPane(sheepEl);
});
pastureEl.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  const sheepEl = ev.target.closest('.sheep');
  if (sheepEl) {
    ev.preventDefault();
    jumpToPane(sheepEl);
  }
});

/* ───────── 시계·시드 ───────── */
setInterval(walkTick, 640);
setInterval(() => {
  for (const entry of flock.values()) {
    if (entry.agent.status === 'blocked') setAlarmTime(entry.el, `${rel(entry.agent.statusSince)}째`);
  }
  updateDog(focusPaneId); // 어슬렁대는 양을 개가 따라잡는다
}, 5000);
window.addEventListener('resize', () => updateDog(focusPaneId));

// 늦게 접속해도 최근 활동이 보이도록 첫 스냅샷의 링버퍼로 일지를 채운다.
const seed = () => {
  const snap = client.snapshot;
  if (!snap) {
    setTimeout(seed, 120);
    return;
  }
  journal.seed(snap.recentEvents);
  render(snap);
};
seed();
