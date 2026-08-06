/**
 * 3학년 herdr반 부트스트랩.
 *
 *   /ws ─▶ onUpdate : snapshot → 자리 배치 → 학생 포즈/말풍선 → 칠판 → 교탁 서랍
 *        └ onEvent  : 상태 전이 순간 연출(벌떡 손들기·만세) + 학급 일지 + 알림음
 *   resize ─▶ 자리 재계산 (좁아져도 학생이 겹치지 않게)
 */
import { connect } from '/sdk.js';
import { createBlackboard } from './blackboard.js';
import { createChime } from './chime.js';
import { pushJournal, renderQueue, renderRoll } from './desk.js';
import { describe } from './journal.js';
import { computeSeating } from './seating.js';
import { createStudentLayer } from './students.js';

const CLOCK_MS = 1000;
const AGE_REFRESH_MS = 5000;
const TOAST_MS = 2400;

const $ = (id) => document.getElementById(id);

const el = {
  students: $('students'),
  emptyRoom: $('empty-room'),
  link: $('ind-link'),
  src: $('ind-src'),
  srcLabel: $('src-label'),
  headCount: $('head-count'),
  seq: $('seq'),
  bell: $('bell-toggle'),
  banner: $('hand-banner'),
  toast: $('toast'),
  queue: $('queue'),
  roll: $('roll'),
  journal: $('journal'),
};

const boardEls = {
  clock: document.querySelector('.clock'),
  hourHand: $('c-hour'),
  minHand: $('c-min'),
  secHand: $('c-sec'),
  date: $('bb-date'),
  notice: $('bb-notice'),
  tally: $('bb-tally'),
  timetable: $('timetable-list'),
};

const client = connect();
const chime = createChime();
const blackboard = createBlackboard(boardEls);
const seenJournal = new Set();

let snapshot = null;
let toastTimer = null;

/* ───────────────── 작은 UI 헬퍼 ───────────────── */

const showToast = (message, tone = '') => {
  el.toast.textContent = message;
  el.toast.className = tone;
  el.toast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.hidden = true;
  }, TOAST_MS);
};

const goToSeat = async (paneId) => {
  if (!paneId) return;
  try {
    const ok = await client.focusPane(paneId);
    showToast(
      ok ? `🚶 ${paneId} 자리로 갑니다` : `✕ 이동 못 했어요 — mock 수업이거나 자리가 비었습니다 (${paneId})`,
      ok ? 'good' : 'bad',
    );
  } catch (error) {
    showToast(`✕ 자리 이동 실패: ${String(error)}`, 'bad');
  }
};

const students = createStudentLayer(el.students, (paneId) => void goToSeat(paneId));

const deskClick = (event) => {
  const target = event.target.closest('[data-pane]');
  if (target) void goToSeat(target.dataset.pane);
};
el.queue.addEventListener('click', deskClick);
el.roll.addEventListener('click', deskClick);

/* ───────────────── 렌더 ───────────────── */

const seatBox = () => {
  const rect = el.students.getBoundingClientRect();
  return { width: Math.max(120, rect.width), height: Math.max(120, rect.height) };
};

const layoutStudents = () => {
  if (!snapshot) return;
  const { seats } = computeSeating(snapshot.agents, snapshot.workspaces, seatBox());
  students.sync(snapshot.agents, seats);
  el.emptyRoom.hidden = snapshot.agents.length > 0;
};

const renderDesk = () => {
  if (!snapshot) return;
  const nowMs = Date.now();
  renderQueue(el.queue, snapshot.agents, nowMs);
  renderRoll(el.roll, snapshot.agents, nowMs);
};

const renderHud = () => {
  el.link.classList.toggle('up', client.transportUp);
  el.link.classList.toggle('down', !client.transportUp);
  if (!snapshot) return;
  el.seq.textContent = String(snapshot.seq);
  el.headCount.textContent = String(snapshot.stats.total);
  el.srcLabel.textContent = snapshot.source === 'mock' ? '모의 수업' : '출석 시스템';
  el.src.classList.toggle('up', snapshot.connected);
  el.src.classList.toggle('down', !snapshot.connected);

  const asking = snapshot.stats.blocked;
  document.body.classList.toggle('has-question', asking > 0);
  el.banner.hidden = asking === 0;
  if (asking > 0) el.banner.textContent = `✋ 손 든 학생 ${asking}명 — 선생님, 질문 받아주세요!`;
};

/* ───────────────── SDK 배선 ───────────────── */

client.onTransport(() => renderHud());

client.onUpdate(({ snapshot: next }) => {
  snapshot = next;
  layoutStudents();
  blackboard.render(next);
  renderDesk();
  renderHud();
});

client.onEvent('*', (event) => {
  const line = describe(event);
  if (seenJournal.has(line.key)) return;
  seenJournal.add(line.key);
  pushJournal(el.journal, line);
});

client.onEvent('agent_status_changed', (event) => {
  students.playStatusChange(event.paneId, event.to);
  if (event.to === 'blocked') chime.hand();
  else if (event.to === 'done') chime.done();
  else if (event.to === 'working') chime.sit();
});

client.onEvent('agent_appeared', (event) => {
  students.playArrival(event.paneId);
  chime.enter();
});

/** 링버퍼로 늦게 들어와도 앞선 수업 내용을 일지에서 볼 수 있게 한다. */
const primeJournal = () => {
  const snap = client.snapshot;
  if (!snap) {
    setTimeout(primeJournal, 120);
    return;
  }
  for (const event of snap.recentEvents) {
    const line = describe(event);
    if (seenJournal.has(line.key)) continue;
    seenJournal.add(line.key);
    pushJournal(el.journal, line);
  }
};
primeJournal();

/* ───────────────── 입력 · 타이머 ───────────────── */

el.bell.addEventListener('click', () => {
  const on = chime.toggle();
  el.bell.textContent = on ? '🔔 알림음' : '🔕 알림음';
  el.bell.classList.toggle('on', on);
  if (!on && chime.lastError) showToast(chime.lastError, 'bad');
});

new ResizeObserver(() => layoutStudents()).observe(el.students);

blackboard.tickClock();
setInterval(() => blackboard.tickClock(), CLOCK_MS);
setInterval(renderDesk, AGE_REFRESH_MS);
