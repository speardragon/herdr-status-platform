/**
 * 좌/우 콘솔 패널 DOM 렌더링 — 스코프가 못 담는 텍스트 정보를 맡는다.
 *
 * 스냅샷은 초당 여러 번 올 수 있다. 매번 innerHTML을 갈아끼우면
 *  (1) 알람 카드의 등장/점멸 애니메이션이 계속 처음부터 다시 돌고
 *  (2) 스크롤 위치와 hover가 날아간다.
 * 그래서 "구성이 실제로 바뀌었을 때만" 다시 그리고, 평소엔 경과시간 텍스트만 갱신한다.
 */
import { BOARD_ORDER, STATUS, TRIAGE_ORDER, statusOf } from './palette.js';
import { callsign, esc, relTime } from './util.js';

const MAX_COMMS_LINES = 90;

const triageRank = (status) => {
  const index = TRIAGE_ORDER.indexOf(status);
  return index < 0 ? TRIAGE_ORDER.length : index;
};

/** 급한 순 → 같은 상태면 오래 기다린 순. */
export const triageAgents = (agents) =>
  [...agents].sort(
    (a, b) =>
      triageRank(a.status) - triageRank(b.status) ||
      new Date(a.statusSince).getTime() - new Date(b.statusSince).getTime() ||
      a.paneId.localeCompare(b.paneId),
  );

const whoOf = (agent) => (agent.name ? `${agent.name}·${agent.kind}` : agent.kind);

const signatureOf = (agents) =>
  agents.map((a) => `${a.paneId}~${a.status}~${a.focused}~${a.statusSince}~${a.title}`).join('|');

/** 다시 그릴 필요가 없으면 경과시간만 제자리 갱신한다. */
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

/* ───────────────────────── 마스터 알람 ───────────────────────── */

const alarmMarkup = (agents, nowMs) =>
  agents.length === 0
    ? '<div class="nominal">● ALL SYSTEMS NOMINAL</div>'
    : agents
        .map(
          (agent) => `
      <button class="alarm-card" type="button" data-pane="${esc(agent.paneId)}">
        <span class="ac-head"><b>⚠ DISTRESS</b><span>${esc(callsign(agent.paneId))}</span></span>
        <span class="ac-title">${esc(agent.title || '입력 대기')}</span>
        <span class="ac-meta">${esc(whoOf(agent))} · 대기 <span data-age>${esc(relTime(agent.statusSince, nowMs))}</span> · 클릭 → 관제 시점 이동</span>
      </button>`,
        )
        .join('');

export const renderAlarms = (el, agents, nowMs) =>
  paint(el, triageAgents(agents.filter((agent) => agent.status === 'blocked')), nowMs, alarmMarkup);

/* ───────────────────────── 로스터 ───────────────────────── */

const rosterMarkup = (agents, nowMs) =>
  agents.length === 0
    ? '<div class="nominal" style="color:var(--text-dim)">추적 중인 탐사선 없음</div>'
    : agents
        .map((agent) => {
          const spec = statusOf(agent.status);
          return `
      <button class="r-row" type="button" data-pane="${esc(agent.paneId)}" data-status="${esc(agent.status)}" data-focused="${agent.focused}">
        <span class="pip" style="background:${spec.color};box-shadow:0 0 6px ${spec.color}"></span>
        <span class="who">${esc(whoOf(agent))}<em>${esc(agent.paneId)}</em></span>
        <span class="age">${esc(spec.label)} <span data-age>${esc(relTime(agent.statusSince, nowMs))}</span></span>
        <span class="what">${esc(agent.title || '—')}</span>
      </button>`;
        })
        .join('');

export const renderRoster = (el, agents, nowMs) => paint(el, triageAgents(agents), nowMs, rosterMarkup);

/* ───────────────────────── 상태 보드 · 범례 ───────────────────────── */

const countsSignature = (stats) => BOARD_ORDER.map((key) => `${key}${stats[key] ?? 0}`).join('');

const paintCounts = (el, stats, build) => {
  const signature = countsSignature(stats);
  if (el.dataset.signature === signature) return;
  el.dataset.signature = signature;
  el.innerHTML = build(stats);
};

const tilesMarkup = (stats) =>
  BOARD_ORDER.map((key) => {
    const spec = STATUS[key];
    const count = stats[key] ?? 0;
    const hot = key === 'blocked' && count > 0;
    return `
      <div class="tile${hot ? ' hot' : ''}">
        <div class="n" style="color:${count > 0 ? spec.color : 'var(--text-dim)'}">${count}</div>
        <div class="k">${esc(spec.label)}</div>
      </div>`;
  }).join('');

const legendMarkup = (stats) =>
  BOARD_ORDER.map((key) => {
    const spec = STATUS[key];
    const count = stats[key] ?? 0;
    const hot = key === 'blocked' && count > 0;
    return `
      <span class="chip${hot ? ' hot' : ''}">
        <span class="pip" style="background:${spec.color}"></span>${esc(spec.label)}<b>${count}</b>
      </span>`;
  }).join('');

export const renderTiles = (el, stats) => paintCounts(el, stats, tilesMarkup);
export const renderLegend = (el, stats) => paintCounts(el, stats, legendMarkup);

/* ───────────────────────── COMMS 로그 ───────────────────────── */

export const pushComms = (el, line) => {
  const row = document.createElement('div');
  row.className = `c-line sev-${line.sev}`;
  row.innerHTML = `<span class="ts">${esc(line.ts)}</span><span class="tag">${esc(line.tag)}</span><span class="msg">${esc(line.msg)}</span>`;
  el.prepend(row);
  while (el.childElementCount > MAX_COMMS_LINES) el.lastElementChild?.remove();
};
