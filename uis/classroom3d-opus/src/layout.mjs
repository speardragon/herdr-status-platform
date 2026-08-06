/**
 * 씬 치수·좌표 상수 — 단위는 미터. 모든 모듈이 이 한 곳만 참조한다.
 *
 * 좌표계: +X 오른쪽, +Y 위, +Z 카메라(교탁) 쪽.
 * 학생은 +Z(선생님)를 바라보고 앉고, 자기 책상은 자기보다 +Z에 있다.
 */

export const ROOM = Object.freeze({
  halfWidth: 5.2,
  height: 3.32,
  /** 칠판이 걸린 앞벽(카메라 뒤). */
  frontZ: 1.5,
  /** 뒤 칠판이 걸린 뒷벽. */
  backZ: -11.7,
});

export const CAMERA = Object.freeze({
  fov: 56,
  near: 0.08,
  far: 60,
  /** 선생님 눈높이. */
  position: Object.freeze([0, 1.72, 0.5]),
  lookAt: Object.freeze([0, 0.88, -5.6]),
  /** 마우스 시차 최대 이동량(px 비율 → m). */
  parallax: Object.freeze({ x: 0.2, y: 0.1, look: 0.5, lerp: 2.4 }),
});

export const SEAT = Object.freeze({
  /** 좌우 2열씩 + 가운데 통로 — 뒤 칠판까지 시야가 트인다. */
  columnsX: Object.freeze([-3.2, -1.08, 1.08, 3.2]),
  firstRowZ: -3.3,
  rowGap: 1.74,
  maxRows: 5,
  /** 뒷줄이 앞줄에 가리지 않도록 줄마다 살짝 지그재그. */
  stagger: 0.17,
  /** 학생 → 자기 책상까지의 거리(+Z). */
  deskOffsetZ: 0.63,
});

export const DESK = Object.freeze({
  width: 1.04,
  depth: 0.52,
  topY: 0.735,
  topThickness: 0.035,
});

export const PODIUM = Object.freeze({
  position: Object.freeze([-0.62, 0, -1.86]),
  width: 0.98,
  depth: 0.48,
  height: 0.86,
});

export const BOARD = Object.freeze({
  /** 뒷벽 칠판 — 카메라 정면이라 학급 현황을 여기 적는다. */
  rear: Object.freeze({ width: 4.4, height: 1.42, centerY: 1.72 }),
  /** 앞벽 칠판 — 카메라 뒤(선생님 등 뒤). */
  front: Object.freeze({ width: 4.8, height: 1.36, centerY: 1.66 }),
});

export const WINDOW = Object.freeze({
  /** 창문은 왼쪽 벽 — 자연광이 이 방향에서 들어온다. */
  width: 2.5,
  bottomY: 0.92,
  topY: 2.44,
  centersZ: Object.freeze([-2.4, -5.4, -8.4]),
});

export const CEILING_LAMPS = Object.freeze([-2.2, -5.2, -8.2]);

export const seatCount = SEAT.columnsX.length * SEAT.maxRows;

/** 좌석 index → 씬 좌표. index는 앞줄 → 뒷줄, 각 줄은 왼쪽 → 오른쪽. */
export function seatPosition(index) {
  const columns = SEAT.columnsX.length;
  const row = Math.floor(index / columns);
  const column = index % columns;
  const shift = row % 2 === 0 ? -SEAT.stagger : SEAT.stagger;
  return {
    x: SEAT.columnsX[column] + shift,
    z: SEAT.firstRowZ - row * SEAT.rowGap,
    row,
    column,
  };
}
