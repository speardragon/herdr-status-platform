/** 배경 성층 — 시드 고정 별밭 + 성운 두 덩이. 스코프 밖 여백을 "우주"로 만든다. */
import { TAU } from './util.js';

const STAR_COUNT = 220;
const STAR_SEED = 20260806;

/** mulberry32 — 새로고침해도 별자리가 같도록 결정적 난수를 쓴다. */
const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** 좌표는 0..1 정규화 — 리사이즈해도 다시 만들 필요가 없다. */
export const createStarfield = (count = STAR_COUNT, seed = STAR_SEED) => {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    x: rand(),
    y: rand(),
    r: 0.3 + rand() * 1.1,
    base: 0.15 + rand() * 0.5,
    twSpeed: 0.4 + rand() * 1.6,
    twPhase: rand() * TAU,
    warm: rand() > 0.85,
  }));
};

export const drawNebula = (ctx, geom) => {
  const blobs = [
    { x: geom.w * 0.18, y: geom.h * 0.22, r: geom.h * 0.55, rgb: '30, 90, 150', a: 0.14 },
    { x: geom.w * 0.86, y: geom.h * 0.82, r: geom.h * 0.5, rgb: '95, 45, 140', a: 0.11 },
  ];
  for (const blob of blobs) {
    const grad = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.r);
    grad.addColorStop(0, `rgba(${blob.rgb}, ${blob.a})`);
    grad.addColorStop(1, `rgba(${blob.rgb}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, geom.w, geom.h);
  }
};

export const drawStars = (ctx, stars, geom, t) => {
  for (const star of stars) {
    const alpha = star.base * (0.55 + 0.45 * Math.sin(t * star.twSpeed + star.twPhase));
    ctx.fillStyle = star.warm ? `rgba(255, 224, 190, ${alpha})` : `rgba(200, 228, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(star.x * geom.w, star.y * geom.h, star.r, 0, TAU);
    ctx.fill();
  }
};
