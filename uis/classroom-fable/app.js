/**
 * 우리반 에이전트 오케스트레이터 — 스냅샷을 교실 풍경으로 조립한다.
 * 자리 배치: 입장 순서대로 앞줄부터 채우고, 뒷줄일수록 작게 그려 선생님
 * 1인칭 원근을 만든다. 열 수는 화면 폭에서 계산해 반응형으로 재배치한다.
 */
import { connect } from '/sdk.js';
import { createStudentEl, applyStudent, setHandTime, showBubble } from './student.js';
import { createJournal } from './journal.js';
import { burstAt, stampAt, flashAmber } from './effects.js';

const $ = (id) => document.getElementById(id);
const client = connect();
const journal = createJournal($('journal-list'), $('journal-toggle'));
// 좁은 화면에선 알림장이 뒷줄을 가리지 않게 접힌 채로 시작한다
if (matchMedia('(max-width: 640px)').matches) $('journal').classList.add('collapsed');

const seatsEl = $('seats');
const roster = new Map(); // paneId → { el, agent } — 삽입 순서가 곧 자리 순서
let rosterSignature = '';

const rel = (iso) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}초`;
  if (s < 3600) return `${Math.floor(s / 60)}분`;
  return `${Math.floor(s / 3600)}시간`;
};

/* ───────── 자리 배치 (반응형 + 원근) ───────── */
function layoutSeats() {
  const students = [...roster.values()].filter((s) => !s.el.classList.contains('leaving'));
  const width = seatsEl.clientWidth - 24;
  const cols = Math.max(2, Math.min(6, Math.floor(width / 172)));
  const seatW = Math.min(172, Math.floor(width / cols) - 8);

  for (const row of seatsEl.querySelectorAll('.row')) row.remove();

  const rows = [];
  for (let i = 0; i < students.length; i += cols) rows.push(students.slice(i, i + cols));
  // rows[0]=앞줄(화면 아래·크게). DOM은 위(뒷줄)부터 그린다.
  let isFirstRow = true;
  for (let r = rows.length - 1; r >= 0; r--) {
    const rowEl = document.createElement('div');
    rowEl.className = 'row';
    // flex-end 대신 auto-margin — 위로 넘칠 때도 스크롤이 살아 있게 바닥으로 민다
    if (isFirstRow) {
      rowEl.style.marginTop = 'auto';
      isFirstRow = false;
    }
    const scale = Math.max(0.72, 1 - 0.09 * r);
    rowEl.style.setProperty('--sw', `${Math.round(seatW * scale)}px`);
    rowEl.style.filter = r > 0 ? `brightness(${1 - 0.03 * r})` : '';
    for (const s of rows[r]) rowEl.appendChild(s.el);
    seatsEl.appendChild(rowEl);
  }
  seatsEl.scrollTop = seatsEl.scrollHeight; // 기본 시점은 앞줄(교탁 앞)
}

/* ───────── 학생 reconcile ───────── */
function ensureStudent(agent, wsLabel) {
  let entry = roster.get(agent.paneId);
  if (!entry) {
    entry = { el: createStudentEl(agent), agent };
    roster.set(agent.paneId, entry);
  }
  entry.agent = agent;
  applyStudent(entry.el, agent, wsLabel);
  if (agent.status === 'blocked') setHandTime(entry.el, `${rel(agent.statusSince)}째`);
}

function removeStudent(paneId) {
  const entry = roster.get(paneId);
  if (!entry) return;
  roster.delete(paneId);
  entry.el.classList.add('leaving');
  setTimeout(() => {
    entry.el.remove();
    layoutSeats();
  }, 660);
}

/* ───────── 렌더 ───────── */
function updateConn(snapshot) {
  const online = snapshot.connected && client.transportUp;
  document.body.classList.toggle('offline', !online);
  $('offline-banner').hidden = online;
  $('conn-emoji').textContent = online ? '🔔' : '📵';
  $('conn-label').textContent = client.transportUp
    ? `${snapshot.source === 'mock' ? '모의 수업' : 'herdr 실황'} · seq ${snapshot.seq}`
    : '재접속 중…';
}

function render(snapshot) {
  for (const key of ['working', 'idle', 'blocked', 'done']) $(`c-${key}`).textContent = snapshot.stats[key];
  $('c-blocked').closest('.chip').classList.toggle('hot', snapshot.stats.blocked > 0);
  document.body.classList.toggle('has-blocked', snapshot.stats.blocked > 0);
  updateConn(snapshot);

  const wsLabels = new Map(snapshot.workspaces.map((w) => [w.workspaceId, w.label]));
  const livePanes = new Set();
  for (const agent of snapshot.agents) {
    livePanes.add(agent.paneId);
    ensureStudent(agent, wsLabels.get(agent.workspaceId) ?? agent.workspaceId);
  }
  for (const paneId of [...roster.keys()]) {
    if (!livePanes.has(paneId)) removeStudent(paneId);
  }

  $('empty-hint').hidden = snapshot.agents.length > 0;

  const signature = [...roster.keys()].join('|');
  if (signature !== rosterSignature) {
    rosterSignature = signature;
    layoutSeats();
  }
}

/* ───────── 이벤트 연출 ───────── */
const BUBBLES = {
  blocked: (e) => [`선생님!! 저요!! ✋ ${e.title}`, { urgent: true, ms: 5200 }],
  done: () => ['다 풀었어요! 👍👍', {}],
  working: (e) => [`✏️ ${e.title}`, {}],
  idle: () => ['하암… 잠깐만요 💤', {}],
  unknown: () => ['…어라?', {}],
};

client.onUpdate(({ snapshot }) => render(snapshot));

client.onEvent('*', (e) => {
  journal.push(e);
  if (e.type === 'agent_status_changed') {
    const entry = roster.get(e.paneId);
    if (!entry) return;
    const bubble = BUBBLES[e.to];
    if (bubble) {
      const [text, opts] = bubble(e);
      showBubble(entry.el, text, opts);
    }
    if (e.to === 'blocked') {
      flashAmber();
    } else if (e.to === 'done') {
      stampAt(entry.el);
      burstAt(entry.el, 'star', 12);
    } else if (e.to === 'working') {
      burstAt(entry.el, 'chalk', 6);
    }
  } else if (e.type === 'agent_appeared') {
    const entry = roster.get(e.paneId);
    if (entry) burstAt(entry.el, 'pop', 9);
  } else if (e.type === 'agent_title_changed') {
    const entry = roster.get(e.paneId);
    if (entry) showBubble(entry.el, `📖 ${e.title}`);
  }
});

client.onTransport(() => {
  if (client.snapshot) render(client.snapshot);
});

/* ───────── 클릭 → herdr pane 점프 ───────── */
async function jumpToPane(seatEl) {
  const paneId = seatEl.dataset.pane;
  const ok = await client.focusPane(paneId);
  seatEl.classList.add(ok ? 'focus-ok' : 'focus-fail');
  setTimeout(() => seatEl.classList.remove('focus-ok', 'focus-fail'), 1000);
  if (ok) journal.note(`👀 ${paneId} 자리로 시선 이동!`, 'ev-working');
  else journal.note(`👆 ${paneId}를 불렀지만 대답이 없어요 (mock에선 점프 불가)`, 'ev-gone');
}

seatsEl.addEventListener('click', (ev) => {
  const seatEl = ev.target.closest('.seat');
  if (seatEl) jumpToPane(seatEl);
});
seatsEl.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  const seatEl = ev.target.closest('.seat');
  if (seatEl) {
    ev.preventDefault();
    jumpToPane(seatEl);
  }
});

/* ───────── 교실 시계 · 손든 시간 · 리사이즈 ───────── */
function tickClock() {
  const now = new Date();
  const h = (now.getHours() % 12) + now.getMinutes() / 60;
  const m = now.getMinutes() + now.getSeconds() / 60;
  $('clk-h').style.transform = `rotate(${h * 30}deg)`;
  $('clk-m').style.transform = `rotate(${m * 6}deg)`;
}
tickClock();
setInterval(tickClock, 10000);

setInterval(() => {
  for (const entry of roster.values()) {
    if (entry.agent.status === 'blocked') setHandTime(entry.el, `${rel(entry.agent.statusSince)}째`);
  }
}, 5000);

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(layoutSeats, 150);
});

// 늦게 접속해도 최근 활동이 보이도록 첫 스냅샷의 링버퍼로 알림장을 채운다.
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
