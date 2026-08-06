/**
 * 교탁 서랍 패널 — 질문 대기 줄 · 출석부 · 학급 일지.
 *
 * 스냅샷은 초당 여러 번 올 수 있다. 매번 innerHTML을 갈아끼우면 질문 카드의 반짝임이
 * 계속 처음부터 다시 돌고 스크롤이 튄다. 그래서 "구성이 실제로 바뀔 때만" 다시 그리고,
 * 평소에는 경과시간 텍스트만 제자리에서 갈아 끼운다.
 */
import { esc, relTime, trimText } from './util.js';

const MAX_JOURNAL = 90;

const TRIAGE = ['blocked', 'working', 'done', 'idle', 'unknown'];

const STATUS_BADGE = {
  working: { face: '✏️', label: '공부', color: 'var(--c-working)' },
  idle: { face: '😴', label: '엎드림', color: 'var(--c-idle)' },
  blocked: { face: '🙋', label: '질문!', color: 'var(--c-blocked)' },
  done: { face: '👍', label: '완료', color: 'var(--c-done)' },
  unknown: { face: '❔', label: '미상', color: '#8b6ad6' },
};

const rank = (status) => {
  const index = TRIAGE.indexOf(status);
  return index < 0 ? TRIAGE.length : index;
};

export const triage = (agents) =>
  [...agents].sort(
    (a, b) =>
      rank(a.status) - rank(b.status) ||
      new Date(a.statusSince).getTime() - new Date(b.statusSince).getTime() ||
      a.paneId.localeCompare(b.paneId),
  );

const nameOf = (agent) => agent.name ?? agent.kind;

const signatureOf = (agents) =>
  agents.map((a) => `${a.paneId}~${a.status}~${a.focused}~${a.statusSince}~${a.title}`).join('|');

const refreshAges = (el, agents, nowMs) => {
  const nodes = el.querySelectorAll('[data-age]');
  agents.forEach((agent, index) => {
    const node = nodes[index];
    if (node) node.textContent = relTime(agent.statusSince, nowMs);
  });
};

const paint = (el, agents, nowMs, build) => {
  const signature = signatureOf(agents);
  if (el.dataset.signature === signature) {
    refreshAges(el, agents, nowMs);
    return;
  }
  el.dataset.signature = signature;
  el.innerHTML = build(agents, nowMs);
};

/* ───────────────── 질문 대기 줄 ───────────────── */

const queueMarkup = (agents, nowMs) =>
  agents.length === 0
    ? '<p class="q-empty">지금은 손 든 학생이 없어요 🙂</p>'
    : agents
        .map(
          (agent, index) => `
      <button class="q-card" type="button" data-pane="${esc(agent.paneId)}">
        <span class="q-top"><span>${index + 1}번째 · ${esc(nameOf(agent))}</span><span>${esc(agent.paneId)}</span></span>
        <span class="q-task">${esc(trimText(agent.title, 46) || '무엇을 물어볼지 정리 중')}</span>
        <span class="q-meta">손 든 지 <span data-age>${esc(relTime(agent.statusSince, nowMs))}</span> · 클릭하면 그 자리로 갑니다</span>
      </button>`,
        )
        .join('');

export const renderQueue = (el, agents, nowMs) =>
  paint(el, triage(agents.filter((agent) => agent.status === 'blocked')), nowMs, queueMarkup);

/* ───────────────── 출석부 ───────────────── */

const rollMarkup = (agents, nowMs) =>
  agents.length === 0
    ? '<p class="q-empty">출석한 학생이 없습니다.</p>'
    : agents
        .map((agent) => {
          const badge = STATUS_BADGE[agent.status] ?? STATUS_BADGE.unknown;
          return `
      <button class="r-row" type="button" data-pane="${esc(agent.paneId)}" data-status="${esc(agent.status)}" data-focused="${agent.focused}">
        <span class="face">${badge.face}</span>
        <span class="who">
          <b>${esc(nameOf(agent))}</b><em>${esc(agent.paneId)}</em>
          <span>${esc(trimText(agent.title, 40) || '—')}</span>
        </span>
        <span class="st" style="background:${badge.color}">${esc(badge.label)} <span data-age>${esc(relTime(agent.statusSince, nowMs))}</span></span>
      </button>`;
        })
        .join('');

export const renderRoll = (el, agents, nowMs) => paint(el, triage(agents), nowMs, rollMarkup);

/* ───────────────── 학급 일지 ───────────────── */

export const pushJournal = (el, line) => {
  const row = document.createElement('div');
  row.className = `j-line sev-${line.sev}`;
  row.innerHTML = `<span class="t">${esc(line.t)}</span><span class="m">${esc(line.msg)}</span>`;
  el.prepend(row);
  while (el.childElementCount > MAX_JOURNAL) el.lastElementChild?.remove();
};
