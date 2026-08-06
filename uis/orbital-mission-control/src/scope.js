/**
 * 레이더 스코프(PPI) 렌더러 — 배경·궤도 링·섹터·스윕·관제탑·이펙트를 한 프레임에 그린다.
 * 탐사선 자체는 craft.js가 그린다.
 */
import { drawCrafts } from './craft.js';
import { GRID_RGB, RING_ORDER, rgba, statusOf } from './palette.js';
import { progressOf, pulseRadius } from './state.js';
import { drawNebula, drawStars } from './starfield.js';
import { TAU, clamp } from './util.js';

/** 링 바깥(눈금 1.06R · 섹터 라벨 1.18R)까지 화면 안에 들어오도록 잡은 여유 배수. */
const SCOPE_MARGIN = 1.3;
const SECTOR_LABEL_R = 1.18;
/** 이보다 스코프가 작으면 텍스트를 줄인다(라벨끼리 엉키는 걸 막는다). */
const COMPACT_R = 200;
const SWEEP_WEDGES = 26;
const SWEEP_ARC = 1.25;
const TICK_STEP = TAU / 24;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export const computeGeom = (width, height) => ({
  w: width,
  h: height,
  cx: width / 2,
  cy: height / 2,
  R: Math.max(40, (Math.min(width, height) * 0.5) / SCOPE_MARGIN),
});

/* ───────────────────────── 배경 ───────────────────────── */

const drawBackdrop = (ctx, geom) => {
  const grad = ctx.createRadialGradient(geom.cx, geom.cy, 0, geom.cx, geom.cy, Math.max(geom.w, geom.h) * 0.78);
  grad.addColorStop(0, '#0a1523');
  grad.addColorStop(0.45, '#060c15');
  grad.addColorStop(1, '#03050a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, geom.w, geom.h);
};

/* ───────────────────────── 궤도 링 ───────────────────────── */

const drawRings = (ctx, geom, t, blockedCount) => {
  for (const key of RING_ORDER) {
    const spec = statusOf(key);
    const radius = spec.radius * geom.R;
    const hot = key === 'blocked' && blockedCount > 0;
    ctx.save();
    ctx.beginPath();
    ctx.arc(geom.cx, geom.cy, radius, 0, TAU);
    if (key === 'unknown') ctx.setLineDash([2, 6]);
    if (hot) {
      ctx.setLineDash([10, 6]);
      ctx.lineDashOffset = -t * 22;
      ctx.shadowColor = rgba(spec.rgb, 0.8);
      ctx.shadowBlur = 16;
      ctx.strokeStyle = rgba(spec.rgb, 0.35 + 0.35 * Math.sin(t * 3.2));
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = rgba(spec.rgb, key === 'unknown' ? 0.12 : 0.2);
      ctx.lineWidth = 1;
    }
    ctx.stroke();
    ctx.restore();

    ctx.font = `9px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = rgba(spec.rgb, hot ? 0.9 : 0.42);
    ctx.fillText(spec.label, geom.cx, geom.cy + radius - 3);
  }
};

/* ───────────────────────── 섹터(워크스페이스) ───────────────────────── */

const drawSectors = (ctx, geom, sectors, t) => {
  if (sectors.length === 0) return;
  for (const sector of sectors) {
    ctx.beginPath();
    ctx.moveTo(geom.cx + Math.cos(sector.a0) * geom.R * 0.16, geom.cy + Math.sin(sector.a0) * geom.R * 0.16);
    ctx.lineTo(geom.cx + Math.cos(sector.a0) * geom.R * 1.14, geom.cy + Math.sin(sector.a0) * geom.R * 1.14);
    ctx.strokeStyle = rgba(GRID_RGB, 0.13);
    ctx.lineWidth = 1;
    ctx.stroke();

    const hot = sector.blocked > 0;
    const compact = geom.R < COMPACT_R;
    ctx.font = `${compact ? 9 : 10}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 라벨은 화면 밖으로 못 나간다 — 폭을 재서 캔버스 안쪽으로 접어 넣는다.
    const half = ctx.measureText(sector.label).width / 2 + 6;
    const lx = clamp(geom.cx + Math.cos(sector.mid) * geom.R * SECTOR_LABEL_R, half, geom.w - half);
    const ly = clamp(geom.cy + Math.sin(sector.mid) * geom.R * SECTOR_LABEL_R, 12, geom.h - 30);
    ctx.fillStyle = hot
      ? rgba(statusOf('blocked').rgb, 0.7 + 0.3 * Math.sin(t * 4))
      : rgba(GRID_RGB, 0.5);
    ctx.fillText(sector.label, lx, ly);
    if (compact) continue; // 좁은 스코프에서는 부제까지 그리면 탐사선 라벨과 엉킨다.
    ctx.font = `9px ${MONO}`;
    ctx.fillStyle = rgba(GRID_RGB, 0.3);
    ctx.fillText(`SECTOR · ${sector.members.length}기`, lx, ly + 12);
  }
};

const drawTicks = (ctx, geom) => {
  ctx.strokeStyle = rgba(GRID_RGB, 0.2);
  ctx.lineWidth = 1;
  for (let a = 0; a < TAU - 1e-6; a += TICK_STEP) {
    const long = Math.abs(a % (TAU / 8)) < 1e-6;
    const r0 = geom.R * (long ? 1.0 : 1.02);
    const r1 = geom.R * 1.06;
    ctx.beginPath();
    ctx.moveTo(geom.cx + Math.cos(a) * r0, geom.cy + Math.sin(a) * r0);
    ctx.lineTo(geom.cx + Math.cos(a) * r1, geom.cy + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(geom.cx, geom.cy, geom.R * 1.06, 0, TAU);
  ctx.strokeStyle = rgba(GRID_RGB, 0.16);
  ctx.stroke();
};

/* ───────────────────────── 스윕 ───────────────────────── */

const drawSweep = (ctx, geom, sweep) => {
  ctx.save();
  ctx.translate(geom.cx, geom.cy);
  const step = SWEEP_ARC / SWEEP_WEDGES;
  for (let i = 0; i < SWEEP_WEDGES; i++) {
    const a1 = sweep - i * step;
    const alpha = Math.pow(1 - i / SWEEP_WEDGES, 2.2) * 0.16;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, geom.R * 1.06, a1 - step, a1);
    ctx.closePath();
    ctx.fillStyle = rgba('120, 235, 255', alpha);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(sweep) * geom.R * 1.06, Math.sin(sweep) * geom.R * 1.06);
  ctx.strokeStyle = rgba('150, 245, 255', 0.5);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
};

/* ───────────────────────── 관제탑(중심) ───────────────────────── */

const drawStation = (ctx, geom, t, snapshot) => {
  const total = snapshot?.stats.total ?? 0;
  ctx.save();
  ctx.translate(geom.cx, geom.cy);

  ctx.beginPath();
  ctx.arc(0, 0, 15 + Math.sin(t * 1.6) * 1.5, 0, TAU);
  ctx.strokeStyle = rgba(GRID_RGB, 0.35);
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.save();
  ctx.rotate(t * 0.35);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const x = Math.cos(a) * 8;
    const y = Math.sin(a) * 8;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = rgba('160, 220, 255', 0.16);
  ctx.strokeStyle = rgba('170, 235, 255', 0.65);
  ctx.lineWidth = 1.2;
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.font = `9px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = rgba(GRID_RGB, 0.55);
  ctx.fillText('MISSION CONTROL', 0, 22);
  ctx.fillStyle = rgba('190, 235, 255', 0.8);
  ctx.fillText(`${total} CRAFT TRACKED`, 0, 34);
  ctx.restore();
};

/* ───────────────────────── 이펙트 ───────────────────────── */

const drawPulses = (ctx, view, geom) => {
  for (const pulse of view.pulses) {
    const alpha = 1 - progressOf(pulse);
    ctx.beginPath();
    ctx.arc(geom.cx + pulse.x * geom.R, geom.cy + pulse.y * geom.R, pulseRadius(pulse) * geom.R, 0, TAU);
    ctx.strokeStyle = rgba(pulse.rgb, alpha * 0.7);
    ctx.lineWidth = pulse.width * alpha + 0.3;
    ctx.stroke();
  }
};

const drawSparks = (ctx, view, geom) => {
  for (const spark of view.sparks) {
    const alpha = 1 - progressOf(spark);
    ctx.beginPath();
    ctx.arc(geom.cx + spark.x * geom.R, geom.cy + spark.y * geom.R, spark.size * alpha + 0.3, 0, TAU);
    ctx.fillStyle = rgba(spark.rgb, alpha * 0.85);
    ctx.fill();
  }
};

/* ───────────────────────── 오버레이 ───────────────────────── */

const drawScanlines = (ctx, geom, alpha, rgb) => {
  ctx.fillStyle = rgba(rgb, alpha);
  for (let y = 0; y < geom.h; y += 3) ctx.fillRect(0, y, geom.w, 1);
};

const drawOverlays = (ctx, geom, view, snapshot) => {
  if (view.shock > 0.01) {
    ctx.fillStyle = rgba(statusOf('blocked').rgb, view.shock * 0.14);
    ctx.fillRect(0, 0, geom.w, geom.h);
  }

  if (!snapshot) {
    ctx.fillStyle = rgba(GRID_RGB, 0.55);
    ctx.font = `12px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ACQUIRING SIGNAL…', geom.cx, geom.cy + geom.R * 1.32);
    return;
  }

  if (!snapshot.connected) {
    drawScanlines(ctx, geom, 0.05, statusOf('blocked').rgb);
    ctx.fillStyle = rgba(statusOf('blocked').rgb, 0.85);
    ctx.font = `700 13px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚠ UPLINK LOST — 마지막 관측 상태', geom.cx, geom.cy + geom.R * 1.32);
  }
};

/* ───────────────────────── 프레임 ───────────────────────── */

export const drawFrame = (ctx, { view, layout, snapshot, geom, stars }) => {
  const blockedCount = snapshot?.stats.blocked ?? 0;
  drawBackdrop(ctx, geom);
  drawNebula(ctx, geom);
  drawStars(ctx, stars, geom, view.t);
  drawTicks(ctx, geom);
  drawRings(ctx, geom, view.t, blockedCount);
  drawSectors(ctx, geom, layout.sectors, view.t);
  drawSweep(ctx, geom, view.sweep);
  drawPulses(ctx, view, geom);
  drawCrafts(ctx, view, geom);
  drawSparks(ctx, view, geom);
  drawStation(ctx, geom, view.t, snapshot);
  drawOverlays(ctx, geom, view, snapshot);
};
