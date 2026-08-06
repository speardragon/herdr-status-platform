/**
 * 순수 헬퍼 — 수학·문자열. three.js에 의존하지 않는다.
 */

export const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

export const lerp = (from, to, amount) => from + (to - from) * amount;

/** 프레임레이트에 무관한 지수 감쇠 보간. rate가 클수록 빨리 따라붙는다. */
export const damp = (from, to, rate, dt) => lerp(from, to, 1 - Math.exp(-rate * dt));

export const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** 문자열 → 0..1 결정적 난수. 같은 paneId면 항상 같은 외형·위상. */
export function hash01(text) {
  let h = 2166136261;
  for (const char of String(text)) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** hash01의 n번째 파생값 — 키·머리색·위상처럼 서로 독립적인 변주가 필요할 때. */
export const hashPick = (text, salt) => hash01(`${salt}:${text}`);

export const pickFrom = (items, value) => items[Math.floor(value * items.length) % items.length];

export const escapeHtml = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );

/** 라벨용 말줄임 — 그래픽 폭이 한정된 CanvasTexture에서 필수. */
export function ellipsize(text, max) {
  const value = String(text ?? '').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** ISO 시각 → "12초 전" 같은 상대 표현. */
export function relativeTime(iso) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}초`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분`;
  return `${Math.floor(seconds / 3600)}시간`;
}
