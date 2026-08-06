/**
 * 상태 → 궤도 스펙 테이블.
 *
 * 이 UI의 핵심 은유: **상태가 곧 궤도 반경**이다.
 *   DOCKED(done) 0.32R ─ CRUISE(working) 0.56R ─ DISTRESS(blocked) 0.78R ─ PARKED(idle) 0.94R
 * blocked를 idle보다 안쪽에 둬서 스코프 중앙부에 가깝게(=눈에 먼저 들어오게) 배치한다.
 */

/** @param {string} rgb `"60, 229, 168"` 형태 — rgba() 합성을 위해 채널만 보관한다. */
const spec = (key, label, ko, rgb, radius, wobble, z) => ({
  key,
  label,
  ko,
  rgb,
  color: `rgb(${rgb})`,
  radius,
  /** [진동 각속도, 진폭(rad)] — 상태의 "안절부절" 정도. */
  wobble,
  /** 그리기 순서(클수록 위) + 로스터 정렬 우선순위. */
  z,
});

export const STATUS = Object.freeze({
  done: spec('done', 'DOCKED', '도킹', '255, 196, 77', 0.32, [0.5, 0.005], 2),
  working: spec('working', 'CRUISE', '순항', '60, 229, 168', 0.56, [1.6, 0.03], 3),
  blocked: spec('blocked', 'DISTRESS', '조난', '255, 59, 72', 0.78, [5.2, 0.014], 5),
  idle: spec('idle', 'PARKED', '대기', '125, 143, 166', 0.94, [0.25, 0.008], 1),
  unknown: spec('unknown', 'NO SIG', '미상', '160, 107, 255', 1.08, [0.9, 0.02], 0),
});

/** 궤도 링을 안쪽부터 그리는 순서. */
export const RING_ORDER = ['done', 'working', 'blocked', 'idle', 'unknown'];

/** 로스터·알람 정렬 순서 — 급한 것이 위. */
export const TRIAGE_ORDER = ['blocked', 'working', 'done', 'idle', 'unknown'];

/** 상태 보드 타일에 띄우는 4종. */
export const BOARD_ORDER = ['working', 'blocked', 'idle', 'done'];

export const statusOf = (status) => STATUS[status] ?? STATUS.unknown;

export const rgba = (rgb, alpha) => `rgba(${rgb}, ${alpha})`;

export const FOCUS_RGB = '235, 245, 255';
export const GRID_RGB = '96, 176, 224';
