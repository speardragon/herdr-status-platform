/**
 * 궤도 관제소 부트스트랩 — SDK 배선 · 렌더 루프 · 입력 처리.
 *
 * 데이터 흐름
 *   /ws ─▶ onUpdate  : snapshot → 레이아웃 재계산 → craft 동기화(궤도 전이 시작) → 패널/HUD
 *        └ onEvent   : 순간 연출(충격파·섬광·사이렌) + COMMS 교신록
 *   rAF  ─▶ stepView → drawFrame (스냅샷과 무관하게 60fps로 흐른다)
 */
import { connect } from '/sdk.js';
import { createAlarm } from './alarm.js';
import { hitTest } from './craft.js';
import { computeLayout } from './layout.js';
import { statusOf } from './palette.js';
import { pushComms, renderAlarms, renderLegend, renderRoster, renderTiles } from './panels.js';
import { computeGeom, drawFrame } from './scope.js';
import { createStarfield } from './starfield.js';
import { applyEvent, createView, stepView, syncCrafts } from './state.js';
import { describe } from './comms.js';
import { callsign, clamp, esc, missionClock, nowSec, relTime } from './util.js';

const MAX_DT = 0.05;
const REDUCED_MOTION_SCALE = 0.4;
const CLOCK_INTERVAL_MS = 1000;
const REFRESH_INTERVAL_MS = 5000;
const TOAST_MS = 2200;
const FLASH_MS = 480;

const $ = (id) => document.getElementById(id);

const el = {
  canvas: $('scope'),
  tooltip: $('tooltip'),
  toast: $('toast'),
  legend: $('legend'),
  banner: $('banner'),
  alarms: $('alarm-list'),
  roster: $('roster'),
  tiles: $('tiles'),
  comms: $('comms'),
  met: $('met'),
  seq: $('seq'),
  link: $('ind-link'),
  uplink: $('ind-uplink'),
  uplinkLabel: $('uplink-label'),
  audio: $('audio-toggle'),
};

const ctx = el.canvas.getContext('2d');
const stars = createStarfield();
const alarm = createAlarm();
const client = connect();
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const missionStart = nowSec();

let view = createView();
let layout = computeLayout(null);
let snapshot = null;
let geom = computeGeom(el.canvas.clientWidth || 600, el.canvas.clientHeight || 600);
let lastFrame = nowSec();
let renderFailed = false;
let toastTimer = null;
let flashTimer = null;
const seenComms = new Set();

/* ───────────────────────── 캔버스 크기 ───────────────────────── */

const resize = () => {
  const rect = el.canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  el.canvas.width = Math.round(width * dpr);
  el.canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  geom = computeGeom(width, height);
};

new ResizeObserver(resize).observe(el.canvas.parentElement ?? el.canvas);
resize();

/* ───────────────────────── 작은 UI 헬퍼 ───────────────────────── */

const showToast = (message, tone = '') => {
  el.toast.textContent = message;
  el.toast.className = tone;
  el.toast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.hidden = true;
  }, TOAST_MS);
};

const flashAlert = () => {
  document.body.classList.add('flash');
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => document.body.classList.remove('flash'), FLASH_MS);
};

const jumpTo = async (paneId) => {
  if (!paneId) return;
  try {
    const ok = await client.focusPane(paneId);
    showToast(
      ok ? `▶ 관제 시점 이동 → ${paneId}` : `✕ 포커스 거부 — mock 모드이거나 사라진 pane (${paneId})`,
      ok ? 'good' : 'bad',
    );
  } catch (error) {
    showToast(`✕ 포커스 명령 실패: ${String(error)}`, 'bad');
  }
};

/* ───────────────────────── 패널 갱신 ───────────────────────── */

const renderPanels = () => {
  if (!snapshot) return;
  const nowMs = Date.now();
  renderAlarms(el.alarms, snapshot.agents, nowMs);
  renderRoster(el.roster, snapshot.agents, nowMs);
  renderTiles(el.tiles, snapshot.stats);
  renderLegend(el.legend, snapshot.stats);
};

const renderHud = () => {
  el.link.classList.toggle('up', client.transportUp);
  el.link.classList.toggle('down', !client.transportUp);
  if (!snapshot) return;
  el.seq.textContent = String(snapshot.seq);
  el.uplinkLabel.textContent = snapshot.source === 'mock' ? 'MOCK FEED' : 'UPLINK';
  el.uplink.classList.toggle('up', snapshot.connected);
  el.uplink.classList.toggle('down', !snapshot.connected);

  const blocked = snapshot.stats.blocked;
  document.body.classList.toggle('alert', blocked > 0);
  el.banner.hidden = blocked === 0;
  if (blocked > 0) {
    el.banner.textContent = `⚠ MASTER ALARM — ${blocked}기 조난, 관제 지시 대기 중 ⚠`;
  }
};

/* ───────────────────────── SDK 배선 ───────────────────────── */

client.onTransport(() => renderHud());

client.onUpdate(({ snapshot: next }) => {
  snapshot = next;
  layout = computeLayout(next);
  view = syncCrafts(view, next, layout, nowSec());
  renderHud();
  renderPanels();
});

client.onEvent('*', (event) => {
  view = applyEvent(view, event);
  const line = describe(event);
  if (seenComms.has(line.key)) return;
  seenComms.add(line.key);
  pushComms(el.comms, line);
});

client.onEvent('agent_status_changed', (event) => {
  if (event.to === 'blocked') {
    flashAlert();
    alarm.distress();
    return;
  }
  if (event.to === 'done') alarm.docked();
  if (event.to === 'working') alarm.ignition();
});

client.onEvent('agent_appeared', () => alarm.blip());

/** 링버퍼로 늦게 접속해도 최근 교신을 볼 수 있게 한다(오래된 것 → 최신 순으로 넣어 최신이 위). */
const primeComms = () => {
  const snap = client.snapshot;
  if (!snap) {
    setTimeout(primeComms, 120);
    return;
  }
  for (const event of snap.recentEvents) {
    const line = describe(event);
    if (seenComms.has(line.key)) continue;
    seenComms.add(line.key);
    pushComms(el.comms, line);
  }
};
primeComms();

/* ───────────────────────── 입력 ───────────────────────── */

const canvasPoint = (event) => {
  const rect = el.canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
};

el.canvas.addEventListener('mousemove', (event) => {
  const point = canvasPoint(event);
  const craft = hitTest(view, geom, point.x, point.y);
  if (!craft) {
    el.tooltip.hidden = true;
    el.canvas.style.cursor = 'crosshair';
    return;
  }
  const spec = statusOf(craft.status);
  el.tooltip.innerHTML =
    `<div class="tt-head">${esc(craft.name ? `${craft.name}·${craft.kind}` : craft.kind)} · ${esc(callsign(craft.paneId))}</div>` +
    `<div class="tt-sub" style="color:${spec.color}">${esc(spec.label)} (${esc(spec.ko)}) · ${esc(relTime(craft.statusSince))} 경과</div>` +
    `<div class="tt-title">${esc(craft.title || '—')}</div>` +
    `<div class="tt-sub">${esc(craft.paneId)} · 클릭 → 관제 시점 이동</div>`;
  el.tooltip.hidden = false;
  const rect = el.canvas.getBoundingClientRect();
  const left = clamp(point.x + 16, 8, Math.max(8, rect.width - 276));
  const top = clamp(point.y + 14, 8, Math.max(8, rect.height - 96));
  el.tooltip.style.left = `${left}px`;
  el.tooltip.style.top = `${top}px`;
  el.canvas.style.cursor = 'pointer';
});

el.canvas.addEventListener('mouseleave', () => {
  el.tooltip.hidden = true;
});

el.canvas.addEventListener('click', (event) => {
  const point = canvasPoint(event);
  const craft = hitTest(view, geom, point.x, point.y);
  if (craft) void jumpTo(craft.paneId);
});

const paneClickHandler = (event) => {
  const target = event.target.closest('[data-pane]');
  if (target) void jumpTo(target.dataset.pane);
};
el.roster.addEventListener('click', paneClickHandler);
el.alarms.addEventListener('click', paneClickHandler);

el.audio.addEventListener('click', () => {
  const on = alarm.toggle();
  el.audio.textContent = on ? '🔊 ALARM' : '🔇 ALARM';
  el.audio.classList.toggle('on', on);
  if (!on && alarm.lastError) showToast(alarm.lastError, 'bad');
});

/* ───────────────────────── 루프 ───────────────────────── */

const tick = () => {
  requestAnimationFrame(tick);
  try {
    const now = nowSec();
    const dt = clamp(now - lastFrame, 0, MAX_DT) * (reduceMotion ? REDUCED_MOTION_SCALE : 1);
    lastFrame = now;
    view = stepView(view, dt, layout, now);
    drawFrame(ctx, { view, layout, snapshot, geom, stars });
  } catch (error) {
    if (!renderFailed) {
      renderFailed = true;
      showToast(`스코프 렌더 오류: ${String(error)}`, 'bad');
    }
  }
};
requestAnimationFrame(tick);

setInterval(() => {
  el.met.textContent = missionClock(nowSec() - missionStart);
}, CLOCK_INTERVAL_MS);

setInterval(renderPanels, REFRESH_INTERVAL_MS);
