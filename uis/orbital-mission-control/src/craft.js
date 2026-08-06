/**
 * 탐사선(=에이전트) 렌더링.
 *
 * 상태 4종을 "첫눈에" 가르는 장치는 세 겹이다.
 *   1) 궤도 반경   — 어느 링에 앉아 있는가 (palette.js)
 *   2) 색          — 시안/회색/적색/금색
 *   3) 실루엣      — 삼각 순항선 / 흐린 점 / 붉은 경보 코어 / 도킹 완료 마크
 * blocked만 추가로 락온 브래킷 · 중앙 직통 채널 · SOS 핑을 달고 다닌다.
 */
import { FOCUS_RGB, rgba, statusOf } from './palette.js';
import { DEATH_DURATION } from './state.js';
import { TAU, callsign, clamp } from './util.js';

const SWEEP_TAIL = 1.5;
const LABEL_FONT = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
const ALERT_FONT = '700 11px ui-monospace, SFMono-Regular, Menlo, monospace';

export const screenOf = (craft, geom) => ({
  x: geom.cx + craft.rx * geom.R,
  y: geom.cy + craft.ry * geom.R,
});

const alphaOf = (craft) =>
  craft.dying ? Math.max(0, 1 - craft.deathT / DEATH_DURATION) : Math.min(1, craft.life);

/** 레이더 스윕이 방금 훑고 지나간 정도 0..1 — blip이 밝아졌다 사그라든다. */
const sweepGlowOf = (craft, sweep) => {
  const angle = craft.renderAngle ?? craft.angle;
  const behind = (((sweep - angle) % TAU) + TAU) % TAU;
  return behind > SWEEP_TAIL ? 0 : Math.pow(1 - behind / SWEEP_TAIL, 2);
};

const withGlow = (ctx, rgb, blur, draw) => {
  ctx.save();
  ctx.shadowColor = rgba(rgb, 0.9);
  ctx.shadowBlur = blur;
  draw();
  ctx.restore();
};

/* ───────────────────────── 궤적 ───────────────────────── */

const drawTrail = (ctx, craft, geom, spec, alpha) => {
  const points = craft.trail;
  if (points.length < 2) return;
  const boost = craft.transferring ? 1 : 0.4;
  ctx.lineCap = 'round';
  for (let i = 1; i < points.length; i++) {
    const k = i / (points.length - 1);
    ctx.beginPath();
    ctx.moveTo(geom.cx + points[i - 1].x * geom.R, geom.cy + points[i - 1].y * geom.R);
    ctx.lineTo(geom.cx + points[i].x * geom.R, geom.cy + points[i].y * geom.R);
    ctx.strokeStyle = rgba(spec.rgb, k * k * 0.5 * boost * alpha);
    ctx.lineWidth = 0.6 + k * 1.9 * boost;
    ctx.stroke();
  }
};

/* ───────────────────────── 상태별 실루엣 ───────────────────────── */

const drawCruise = (ctx, x, y, craft, spec, alpha, glow, t) => {
  const heading = (craft.renderAngle ?? craft.angle) + Math.PI / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);

  const flicker = 0.55 + 0.45 * Math.sin(t * 22 + craft.phase * 5);
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.lineTo(-6 - 9 * flicker, 0);
  ctx.strokeStyle = rgba(spec.rgb, 0.55 * alpha);
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.stroke();

  withGlow(ctx, spec.rgb, 10 + glow * 12, () => {
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-6, 6);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, -6);
    ctx.closePath();
    ctx.fillStyle = rgba(spec.rgb, (0.75 + 0.25 * glow) * alpha);
    ctx.fill();
  });
  ctx.restore();
};

const drawParked = (ctx, x, y, craft, spec, alpha, glow, t) => {
  const breath = 0.45 + 0.25 * Math.sin(t * 1.1 + craft.phase);
  ctx.beginPath();
  ctx.arc(x, y, 5.5, 0, TAU);
  ctx.strokeStyle = rgba(spec.rgb, (breath + glow * 0.4) * alpha);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 1.8, 0, TAU);
  ctx.fillStyle = rgba(spec.rgb, (0.6 + glow * 0.4) * alpha);
  ctx.fill();
};

const drawDocked = (ctx, x, y, craft, spec, alpha, glow, t) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 0.6 + craft.phase);
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, TAU);
  ctx.setLineDash([3, 5]);
  ctx.strokeStyle = rgba(spec.rgb, 0.4 * alpha);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  withGlow(ctx, spec.rgb, 9 + glow * 10, () => {
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, TAU);
    ctx.fillStyle = rgba(spec.rgb, (0.85 + 0.15 * glow) * alpha);
    ctx.fill();
  });

  ctx.beginPath();
  ctx.moveTo(x - 2.8, y);
  ctx.lineTo(x - 0.6, y + 2.4);
  ctx.lineTo(x + 3, y - 2.4);
  ctx.strokeStyle = `rgba(30, 22, 0, ${0.9 * alpha})`;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
};

const drawDistress = (ctx, x, y, craft, spec, alpha, glow, t) => {
  // 끊임없이 퍼지는 SOS 핑 — 이벤트 없이도 계속 시선을 끈다.
  const ping = (t * 0.85 + craft.phase) % 1;
  ctx.beginPath();
  ctx.arc(x, y, 9 + ping * 34, 0, TAU);
  ctx.strokeStyle = rgba(spec.rgb, (1 - ping) * 0.55 * alpha);
  ctx.lineWidth = 2 * (1 - ping) + 0.4;
  ctx.stroke();

  // 락온 브래킷 4조각
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-t * 1.3);
  ctx.strokeStyle = rgba(spec.rgb, (0.85 + 0.15 * glow) * alpha);
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'square';
  const arm = 5;
  const off = 12;
  for (let q = 0; q < 4; q++) {
    const sx = q === 0 || q === 3 ? 1 : -1;
    const sy = q < 2 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(sx * off, sy * (off - arm));
    ctx.lineTo(sx * off, sy * off);
    ctx.lineTo(sx * (off - arm), sy * off);
    ctx.stroke();
  }
  ctx.restore();

  const pulse = 0.72 + 0.28 * Math.sin(t * 7 + craft.phase);
  withGlow(ctx, spec.rgb, 18 + glow * 14, () => {
    ctx.beginPath();
    ctx.arc(x, y, 7.5, 0, TAU);
    ctx.fillStyle = rgba(spec.rgb, pulse * alpha);
    ctx.fill();
  });

  ctx.fillStyle = `rgba(20, 0, 3, ${0.95 * alpha})`;
  ctx.font = '700 10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', x, y + 0.5);
};

const drawUnknown = (ctx, x, y, craft, spec, alpha, glow, t) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 0.4);
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, TAU);
  ctx.setLineDash([2, 3]);
  ctx.strokeStyle = rgba(spec.rgb, (0.6 + glow * 0.4) * alpha);
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.restore();
};

const SHAPES = {
  working: drawCruise,
  idle: drawParked,
  done: drawDocked,
  blocked: drawDistress,
  unknown: drawUnknown,
};

/* ───────────────────────── 부가 표시 ───────────────────────── */

/** 조난선 → 관제 중심 직통 채널(움직이는 점선). */
const drawDistressChannel = (ctx, craft, geom, t, alpha) => {
  const { x, y } = screenOf(craft, geom);
  ctx.save();
  ctx.setLineDash([4, 7]);
  ctx.lineDashOffset = -t * 34;
  ctx.strokeStyle = rgba(statusOf('blocked').rgb, 0.35 * alpha);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(geom.cx, geom.cy);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();
};

const drawFocusBracket = (ctx, x, y, t, alpha) => {
  const size = 16 + Math.sin(t * 3) * 1.2;
  ctx.save();
  ctx.strokeStyle = rgba(FOCUS_RGB, 0.75 * alpha);
  ctx.lineWidth = 1.2;
  const arm = 6;
  for (let q = 0; q < 4; q++) {
    const sx = q === 0 || q === 3 ? 1 : -1;
    const sy = q < 2 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(x + sx * size, y + sy * (size - arm));
    ctx.lineTo(x + sx * size, y + sy * size);
    ctx.lineTo(x + sx * (size - arm), y + sy * size);
    ctx.stroke();
  }
  ctx.fillStyle = rgba(FOCUS_RGB, 0.6 * alpha);
  ctx.font = '9px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('CTRL VIEW', x, y - size - 3);
  ctx.restore();
};

/** 캔버스 밖으로 삐져나가지 않는 x 좌표. side에 맞춘 textAlign을 전제로 한다. */
const clampLabelX = (ctx, geom, text, x, side) => {
  const width = ctx.measureText(text).width;
  return side > 0 ? clamp(x, 4, geom.w - width - 4) : clamp(x, width + 4, geom.w - 4);
};

const drawLabel = (ctx, craft, x, y, spec, alpha, geom) => {
  const angle = craft.renderAngle ?? craft.angle;
  const side = Math.cos(angle) >= 0 ? 1 : -1;
  const blocked = craft.status === 'blocked';
  const gap = blocked ? 21 : 13;
  ctx.textAlign = side > 0 ? 'left' : 'right';
  ctx.textBaseline = 'middle';

  const who = craft.name ? `${craft.name}·${craft.kind}` : craft.kind;
  const head = `${blocked ? '⚠ ' : ''}${who} ${callsign(craft.paneId)}`;
  const raw = craft.title || '입력 대기';
  const title = raw.length > 26 ? `${raw.slice(0, 25)}…` : raw;

  ctx.font = blocked ? ALERT_FONT : LABEL_FONT;
  const headX = clampLabelX(ctx, geom, head, x + side * gap, side);
  const headW = ctx.measureText(head).width;
  ctx.font = LABEL_FONT;
  const titleX = blocked ? clampLabelX(ctx, geom, title, x + side * gap, side) : headX;
  const titleW = blocked ? ctx.measureText(title).width : 0;

  if (blocked) {
    // 조난 라벨은 무엇 위에 겹쳐도 읽혀야 한다 — 어두운 판을 깔고 쓴다.
    const headL = side > 0 ? headX : headX - headW;
    const titleL = side > 0 ? titleX : titleX - titleW;
    const left = Math.min(headL, titleL) - 4;
    const right = Math.max(headL + headW, titleL + titleW) + 4;
    ctx.fillStyle = `rgba(12, 2, 5, ${0.72 * alpha})`;
    ctx.fillRect(left, y - 15, right - left, 30);
  }

  ctx.font = blocked ? ALERT_FONT : LABEL_FONT;
  ctx.fillStyle = rgba(spec.rgb, (blocked ? 1 : 0.85) * alpha);
  ctx.fillText(head, headX, y - (blocked ? 6 : 0));

  if (!blocked) return;
  ctx.font = LABEL_FONT;
  ctx.fillStyle = rgba(spec.rgb, 0.72 * alpha);
  ctx.fillText(title, titleX, y + 7);
};

/* ───────────────────────── 진입점 ───────────────────────── */

export const drawCrafts = (ctx, view, geom) => {
  const ordered = [...view.crafts].sort((a, b) => statusOf(a.status).z - statusOf(b.status).z);

  for (const craft of ordered) {
    if (craft.status !== 'blocked') continue;
    drawDistressChannel(ctx, craft, geom, view.t, alphaOf(craft));
  }

  for (const craft of ordered) {
    const alpha = alphaOf(craft);
    if (alpha <= 0.01) continue;
    const spec = statusOf(craft.status);
    const { x, y } = screenOf(craft, geom);
    const glow = clamp(sweepGlowOf(craft, view.sweep) + craft.flare, 0, 1);

    drawTrail(ctx, craft, geom, spec, alpha);

    if (craft.flare > 0.02) {
      ctx.beginPath();
      ctx.arc(x, y, 6 + craft.flare * 16, 0, TAU);
      ctx.fillStyle = rgba(spec.rgb, craft.flare * 0.18 * alpha);
      ctx.fill();
    }

    (SHAPES[craft.status] ?? drawUnknown)(ctx, x, y, craft, spec, alpha, glow, view.t);
    if (craft.focused) drawFocusBracket(ctx, x, y, view.t, alpha);
    drawLabel(ctx, craft, x, y, spec, alpha, geom);
  }
};

/** 캔버스 좌표 → 가장 가까운 탐사선. 없으면 null. */
export const hitTest = (view, geom, px, py, threshold = 22) => {
  const found = view.crafts.reduce(
    (best, craft) => {
      if (craft.dying) return best;
      const { x, y } = screenOf(craft, geom);
      const dist = Math.hypot(px - x, py - y);
      return dist < best.dist ? { craft, dist } : best;
    },
    { craft: null, dist: Infinity },
  );
  return found.dist <= threshold ? found.craft : null;
};
