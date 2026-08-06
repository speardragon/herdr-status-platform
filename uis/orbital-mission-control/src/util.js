/** 궤도 관제소 공용 헬퍼 — 수학·각도·포맷. 부수효과 없는 순수 함수만 둔다. */

export const TAU = Math.PI * 2;

export const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);

export const lerp = (from, to, k) => from + (to - from) * k;

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/** -π..π 로 접는다. 각도 보간의 최단 경로 계산용. */
export const wrapAngle = (angle) => {
  const folded = (((angle + Math.PI) % TAU) + TAU) % TAU;
  return folded - Math.PI;
};

export const angleLerp = (from, to, k) => from + wrapAngle(to - from) * k;

/** 프레임레이트에 무관한 수렴 계수 — dt가 흔들려도 같은 속도로 따라간다. */
export const trackK = (dt, rate) => 1 - Math.exp(-dt * rate);

/** 문자열 → 0..1 결정적 해시. 개체별 위상 오프셋 배정에 쓴다. */
export const hash01 = (text) => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
};

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

/** ISO 시각 → "12초 / 3분 / 2시간" 상대 표기. 파싱 실패는 빈 문자열. */
export const relTime = (iso, nowMs = Date.now()) => {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return '';
  const sec = Math.max(0, Math.round((nowMs - at) / 1000));
  if (sec < 60) return `${sec}초`;
  if (sec < 3600) return `${Math.floor(sec / 60)}분`;
  return `${Math.floor(sec / 3600)}시간`;
};

/** 경과 초 → "T+00:12:34" 미션 경과시간. */
export const missionClock = (elapsedSec) => {
  const total = Math.max(0, Math.floor(elapsedSec));
  const pad = (n) => String(n).padStart(2, '0');
  return `T+${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
};

/** pane id의 꼬리표(`mw2:p7` → `p7`) — 스코프 라벨용 짧은 호출부호. */
export const callsign = (paneId) => String(paneId ?? '').split(':').pop() ?? '';

export const nowSec = () => performance.now() / 1000;
