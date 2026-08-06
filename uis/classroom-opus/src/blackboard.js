/** 칠판·벽시계·시간표 — 교실 벽면의 "상태 요약" 담당. */
import { esc, koreanDate, trimText } from './util.js';

const TALLY = [
  { key: 'working', label: '공부 중', color: 'var(--c-working)' },
  { key: 'blocked', label: '손 든 학생', color: 'var(--c-blocked)' },
  { key: 'idle', label: '엎드림', color: 'var(--c-idle)' },
  { key: 'done', label: '다 함', color: 'var(--c-done)' },
];

const PERIODS = [
  ['1교시', '리팩터링'],
  ['2교시', '테스트'],
  ['3교시', '코드리뷰'],
  ['4교시', '디버깅'],
  ['5교시', '배포연습'],
  ['6교시', '자율학습'],
];

const nameOf = (agent) => agent.name ?? agent.kind;

/** 시계 눈금은 한 번만 만들어 둔다. */
const buildTicks = (root) => {
  const group = root.querySelector('.c-ticks');
  if (!group || group.childElementCount > 0) return;
  const svgns = 'http://www.w3.org/2000/svg';
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const line = document.createElementNS(svgns, 'line');
    const inner = i % 3 === 0 ? 33 : 37;
    line.setAttribute('x1', String(50 + Math.sin(angle) * inner));
    line.setAttribute('y1', String(50 - Math.cos(angle) * inner));
    line.setAttribute('x2', String(50 + Math.sin(angle) * 41));
    line.setAttribute('y2', String(50 - Math.cos(angle) * 41));
    group.appendChild(line);
  }
};

const buildTimetable = (listEl, now) => {
  if (!listEl || listEl.childElementCount > 0) return;
  const current = Math.min(PERIODS.length - 1, Math.max(0, now.getHours() - 9));
  listEl.innerHTML = PERIODS.map(
    ([period, subject], index) =>
      `<li class="${index === current ? 'now' : ''}"><span>${esc(period)}</span><em>${esc(subject)}</em></li>`,
  ).join('');
};

export const createBlackboard = (els) => {
  buildTicks(els.clock);
  let noticeKey = '';
  let tallyKey = '';

  return {
    /** 초침까지 도는 진짜 벽시계 + 날짜. */
    tickClock() {
      const now = new Date();
      const sec = now.getSeconds();
      const min = now.getMinutes() + sec / 60;
      const hour = (now.getHours() % 12) + min / 60;
      els.hourHand.setAttribute('transform', `rotate(${hour * 30} 50 50)`);
      els.minHand.setAttribute('transform', `rotate(${min * 6} 50 50)`);
      els.secHand.setAttribute('transform', `rotate(${sec * 6} 50 50)`);
      els.date.textContent = `${koreanDate(now)} · ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      buildTimetable(els.timetable, now);
    },

    /** 칠판 알림 — 손 든 학생이 있으면 그 명단이 최우선으로 적힌다. */
    render(snapshot) {
      const asking = snapshot.agents.filter((agent) => agent.status === 'blocked');
      const names = asking.map(nameOf).join(', ');
      const key = `${asking.length}:${names}:${snapshot.stats.total}`;
      if (key !== noticeKey) {
        noticeKey = key;
        // 한 줄 고정(span + ellipsis) — 좁은 화면에서 두 줄로 번져 칠판 밖으로 새는 걸 막는다.
        const write = (tone, text) => {
          els.notice.className = `bb-notice ${tone}`;
          els.notice.innerHTML = `<span>${esc(text)}</span>`;
        };
        if (asking.length > 0) write('ask', `✋ ${trimText(names, 40)} — 질문 있어요! (${asking.length}명)`);
        else if (snapshot.stats.total === 0) write('calm', '아직 등교한 학생이 없어요. 교실이 조용합니다.');
        else write('calm', '질문 없이 잘 굴러가는 중 — 모두 자기 과제에 집중!');
      }

      const stats = snapshot.stats;
      const nextTally = TALLY.map((row) => `${row.key}${stats[row.key] ?? 0}`).join('');
      if (nextTally === tallyKey) return;
      tallyKey = nextTally;
      els.tally.innerHTML = TALLY.map(
        (row) =>
          `<span><i style="background:${row.color}"></i>${esc(row.label)} <b>${stats[row.key] ?? 0}</b></span>`,
      ).join('');
    },
  };
};
