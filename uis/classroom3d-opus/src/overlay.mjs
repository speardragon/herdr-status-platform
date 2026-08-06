/**
 * HTML 오버레이 — 3D 씬의 보조 계기판.
 * 주인공은 씬이므로 정보는 얇게: 연결 상태, 상태별 집계, 이벤트 피드, 호버 툴팁, 토스트.
 */
import { statusOf } from './palette.mjs';
import { escapeHtml, relativeTime } from './util.mjs';

const FEED_LIMIT = 9;
const STAT_KEYS = ['working', 'idle', 'blocked', 'done'];

const describe = (event) => {
  switch (event.type) {
    case 'agent_status_changed':
      return `${event.name ?? event.paneId} — ${statusOf(event.from).label} → ${statusOf(event.to).label}`;
    case 'agent_appeared':
      return `${event.name ?? event.paneId} 등교 (${statusOf(event.status).label})`;
    case 'agent_left':
      return `${event.name ?? event.paneId} 하교`;
    case 'agent_title_changed':
      return `${event.paneId} 과제 변경 — ${event.title}`;
    case 'focus_changed':
      return `선생님 시선 → ${event.focus.paneId ?? '없음'}`;
    case 'pane_opened':
      return `자리 추가 ${event.paneId}`;
    case 'pane_closed':
      return `자리 정리 ${event.paneId}`;
    case 'workspace_opened':
      return `분반 개설 ${event.label}`;
    case 'workspace_closed':
      return `분반 폐지 ${event.label}`;
    case 'source_connected':
      return 'herdr 연결됨';
    case 'source_disconnected':
      return 'herdr 연결 끊김';
    default:
      return event.type;
  }
};

export function createOverlay(document) {
  const element = (id) => {
    const node = document.getElementById(id);
    if (!node) throw new Error(`오버레이 요소 #${id}를 찾을 수 없어요`);
    return node;
  };

  const nodes = {
    transport: element('transport'),
    source: element('source'),
    seq: element('seq'),
    stats: element('stats'),
    feed: element('feed'),
    tooltip: element('tooltip'),
    toast: element('toast'),
    roster: element('roster'),
  };
  let toastTimer = 0;

  const renderStats = (snapshot) => {
    const stats = snapshot.stats;
    nodes.stats.innerHTML = STAT_KEYS.map((key) => {
      const meta = statusOf(key);
      return `<span class="pill ${key}"><i style="background:${meta.css}"></i>${meta.label}<b>${stats[key]}</b></span>`;
    }).join('');
  };

  const renderSnapshot = (snapshot, placement) => {
    nodes.source.textContent = snapshot.source === 'mock' ? '모의 수업' : 'herdr 실시간';
    nodes.source.classList.toggle('warn', !snapshot.connected);
    nodes.seq.textContent = `#${snapshot.seq}`;
    renderStats(snapshot);
    const overflow = placement.overflow > 0 ? ` · 복도 대기 ${placement.overflow}명` : '';
    nodes.roster.textContent = `착석 ${placement.seated}명${overflow}`;
  };

  const pushEvent = (event) => {
    const row = document.createElement('div');
    row.className = `feed-row ${event.type}`;
    const at = escapeHtml(event.ts.slice(11, 19));
    row.innerHTML = `<span class="at">${at}</span>${escapeHtml(describe(event))}`;
    nodes.feed.prepend(row);
    while (nodes.feed.childElementCount > FEED_LIMIT) nodes.feed.lastElementChild.remove();
  };

  const setTransport = (up) => {
    nodes.transport.classList.toggle('up', up);
    nodes.transport.title = up ? 'WebSocket 연결됨' : 'WebSocket 끊김 — 재접속 중';
  };

  const showTooltip = (occupant, at) => {
    if (!occupant) {
      nodes.tooltip.classList.remove('show');
      return;
    }
    const meta = statusOf(occupant.status);
    nodes.tooltip.innerHTML = `
      <div class="tip-head"><i style="background:${meta.css}"></i>${escapeHtml(occupant.name ?? occupant.paneId)}
        <span class="tip-kind">${escapeHtml(occupant.kind)}</span></div>
      <div class="tip-title">${escapeHtml(occupant.title)}</div>
      <div class="tip-meta">${meta.label} · ${relativeTime(occupant.statusSince)} 경과 · ${escapeHtml(occupant.paneId)}</div>
      <div class="tip-hint">클릭 = herdr에서 이 pane으로 점프</div>`;
    nodes.tooltip.classList.add('show');
    const width = nodes.tooltip.offsetWidth;
    const height = nodes.tooltip.offsetHeight;
    nodes.tooltip.style.left = `${Math.min(at.x + 16, window.innerWidth - width - 12)}px`;
    nodes.tooltip.style.top = `${Math.min(at.y + 18, window.innerHeight - height - 12)}px`;
  };

  const toast = (message, ok) => {
    nodes.toast.textContent = message;
    nodes.toast.classList.toggle('bad', !ok);
    nodes.toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => nodes.toast.classList.remove('show'), 2600);
  };

  return { renderSnapshot, pushEvent, setTransport, showTooltip, toast };
}
