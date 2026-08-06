/**
 * 뒤 칠판 판서와 벽시계 문자판 그리기. 둘 다 CanvasTexture를 갱신한다.
 * 칠판은 스냅샷이 바뀔 때만, 시계는 1초에 한 번만 다시 그린다.
 */
import { STATUS } from './palette.mjs';
import { ellipsize } from './util.mjs';

const BOARD_WIDTH = 1280;
const BOARD_HEIGHT = 420;
const CHALK = '#eef3ea';

const chalkLine = (ctx, from, to, y, alpha) => {
  ctx.strokeStyle = `rgba(238,243,234,${alpha})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(from, y);
  ctx.lineTo(to, y + (Math.random() - 0.5) * 2);
  ctx.stroke();
};

/** 분필 느낌 — 같은 글자를 살짝 흐트려 두 번 겹쳐 쓴다. */
const chalkText = (ctx, text, x, y, font, color = CHALK, align = 'left') => {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = color;
  ctx.fillText(text, x + 1.5, y + 1.5);
  ctx.globalAlpha = 0.95;
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
};

const drawSlate = (ctx) => {
  ctx.fillStyle = '#1f4034';
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  for (let smear = 0; smear < 90; smear++) {
    ctx.fillStyle = `rgba(226,240,228,${0.012 + Math.random() * 0.03})`;
    const w = 40 + Math.random() * 220;
    ctx.fillRect(Math.random() * BOARD_WIDTH, Math.random() * BOARD_HEIGHT, w, 6 + Math.random() * 16);
  }
};

/**
 * 학급 현황 판서.
 * @param {{ctx: CanvasRenderingContext2D, texture: import('three').CanvasTexture}} surface
 */
export function drawBoard(surface, snapshot) {
  const { ctx, texture } = surface;
  drawSlate(ctx);

  const stats = snapshot?.stats ?? { total: 0, working: 0, idle: 0, blocked: 0, done: 0, unknown: 0 };
  chalkText(ctx, '3학년 herdr반 · 학급 현황', 52, 76, '700 54px system-ui, "Apple SD Gothic Neo", sans-serif');
  chalkLine(ctx, 52, 700, 96, 0.6);

  const rows = [
    ['출석', `${stats.total}명`, CHALK],
    [STATUS.working.label, `${stats.working}명`, '#b6f0bc'],
    [STATUS.idle.label, `${stats.idle}명`, '#d7dde4'],
    [STATUS.blocked.label, `${stats.blocked}명`, '#ffb3ac'],
    [STATUS.done.label, `${stats.done}명`, '#ffe6a1'],
  ];
  rows.forEach(([label, value, color], index) => {
    const y = 158 + index * 52;
    chalkText(ctx, `· ${label}`, 56, y, '600 38px system-ui, "Apple SD Gothic Neo", sans-serif', color);
    chalkText(ctx, value, 330, y, '700 38px system-ui, sans-serif', color, 'right');
  });

  const waiting = (snapshot?.agents ?? []).filter((agent) => agent.status === 'blocked');
  chalkText(ctx, '질문 대기 명단', 430, 158, '700 36px system-ui, "Apple SD Gothic Neo", sans-serif', '#ffd0cb');
  if (waiting.length === 0) {
    chalkText(ctx, '— 없음, 모두 진행 중', 430, 208, '400 32px system-ui, sans-serif', '#cfe0d4');
  } else {
    waiting.slice(0, 4).forEach((agent, index) => {
      const who = agent.name ?? agent.paneId;
      chalkText(
        ctx, `${index + 1}. ${ellipsize(who, 12)} — ${ellipsize(agent.title, 22)}`,
        430, 208 + index * 44, '400 30px system-ui, "Apple SD Gothic Neo", sans-serif', '#ffe7e3',
      );
    });
    if (waiting.length > 4) {
      chalkText(ctx, `외 ${waiting.length - 4}명`, 430, 208 + 4 * 44, '400 28px system-ui, sans-serif', '#ffe7e3');
    }
  }

  const source = snapshot ? `${snapshot.source}${snapshot.connected ? '' : ' (연결 끊김)'}` : '연결 대기';
  chalkText(
    ctx, `seq #${snapshot?.seq ?? 0} · ${source}`,
    BOARD_WIDTH - 52, BOARD_HEIGHT - 34, '400 28px ui-monospace, monospace', '#a9c4b2', 'right',
  );
  texture.needsUpdate = true;
}

/** 벽시계 — 로컬 시각. */
export function drawClock(surface, date = new Date()) {
  const { ctx, texture } = surface;
  const size = 256;
  const radius = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#fdfaf2';
  ctx.beginPath();
  ctx.arc(radius, radius, radius - 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2f3a44';
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.strokeStyle = '#5c6672';
  ctx.lineWidth = 6;
  for (let tick = 0; tick < 12; tick++) {
    const angle = (tick / 12) * Math.PI * 2;
    const outer = radius - 22;
    const inner = tick % 3 === 0 ? radius - 42 : radius - 34;
    ctx.beginPath();
    ctx.moveTo(radius + Math.sin(angle) * outer, radius - Math.cos(angle) * outer);
    ctx.lineTo(radius + Math.sin(angle) * inner, radius - Math.cos(angle) * inner);
    ctx.stroke();
  }
  const hand = (fraction, length, width, color) => {
    const angle = fraction * Math.PI * 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(radius, radius);
    ctx.lineTo(radius + Math.sin(angle) * length, radius - Math.cos(angle) * length);
    ctx.stroke();
  };
  hand(((date.getHours() % 12) + date.getMinutes() / 60) / 12, radius * 0.48, 12, '#222b33');
  hand(date.getMinutes() / 60, radius * 0.68, 9, '#222b33');
  hand(date.getSeconds() / 60, radius * 0.74, 4, '#d8452f');
  texture.needsUpdate = true;
}
