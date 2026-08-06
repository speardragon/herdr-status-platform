/**
 * 상태·에이전트 종류별 색과 한국어 라벨. 3D(hex number)와 HTML(css string) 양쪽에서 쓴다.
 */

export const STATUS = Object.freeze({
  working: Object.freeze({ hex: 0x3fd35f, css: '#3fd35f', label: '필기 중' }),
  idle: Object.freeze({ hex: 0x9aa4b2, css: '#9aa4b2', label: '엎드림' }),
  blocked: Object.freeze({ hex: 0xff5347, css: '#ff5347', label: '손 들었음' }),
  done: Object.freeze({ hex: 0xffc93c, css: '#ffc93c', label: '다 풀었음' }),
  unknown: Object.freeze({ hex: 0x9d7bff, css: '#9d7bff', label: '알 수 없음' }),
});

export const statusOf = (status) => STATUS[status] ?? STATUS.unknown;

/** 에이전트 종류 = 체육복(상의) 색. 같은 kind끼리 한눈에 묶인다. */
export const KIND = Object.freeze({
  claude: Object.freeze({ hex: 0xd97757, css: '#d97757' }),
  codex: Object.freeze({ hex: 0x19b8a6, css: '#19b8a6' }),
  gemini: Object.freeze({ hex: 0x5b8def, css: '#5b8def' }),
});

export const kindOf = (kind) => KIND[kind] ?? Object.freeze({ hex: 0x7c8798, css: '#7c8798' });

/** 학생마다 조금씩 다른 피부·머리색 — 복제 인간처럼 보이지 않게. */
export const SKIN_TONES = Object.freeze([0xf2cba6, 0xe8bb92, 0xd6a179, 0xbe8560, 0xf7d9bd]);
export const HAIR_TONES = Object.freeze([0x2b2118, 0x3d2b1d, 0x1d1a17, 0x53381f, 0x6b4a2a]);

export const ROOM_COLORS = Object.freeze({
  wallUpper: 0xe8e2d4,
  wallLower: 0xbfae8f,
  ceiling: 0xf4f1ea,
  floor: 0xc79a63,
  boardFrame: 0x8a6a44,
  slate: 0x1f4034,
  deskTop: 0xdcc39a,
  deskFrame: 0x8e9aa6,
  chair: 0x8fa0ae,
  chairSeat: 0xc98f52,
  metal: 0x9fb0bd,
});
