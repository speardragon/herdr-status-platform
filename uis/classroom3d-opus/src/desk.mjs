/**
 * 학생 책상 + 의자. 책상은 학생 기준 +Z(선생님 쪽)에 놓인다.
 * 재질은 모듈 안에서 한 번만 만들어 모든 책상이 공유한다(드로우콜은 그대로, 메모리만 절약).
 */
import { box, standard } from './build.mjs';
import { DESK } from './layout.mjs';
import { ROOM_COLORS } from './palette.mjs';
import { deskTexture } from './textures.mjs';

let shared = null;

const materials = (THREE) => {
  shared = shared ?? {
    top: standard(THREE, ROOM_COLORS.deskTop, { map: deskTexture(THREE), roughness: 0.58 }),
    frame: standard(THREE, ROOM_COLORS.deskFrame, { roughness: 0.42, metalness: 0.55 }),
    chairSeat: standard(THREE, ROOM_COLORS.chairSeat, { roughness: 0.66 }),
    chairFrame: standard(THREE, ROOM_COLORS.chair, { roughness: 0.44, metalness: 0.45 }),
    notebook: standard(THREE, 0xf7f3e6, { roughness: 0.82 }),
    notebookLine: standard(THREE, 0x6f89b8, { roughness: 0.8 }),
    pencilCase: standard(THREE, 0x2f4a72, { roughness: 0.6 }),
  };
  return shared;
};

/** 책상 1개(+공책·필통) — 학생 로컬 좌표계에서 +Z로 밀려 있다. */
export function buildDesk(THREE, parent) {
  const m = materials(THREE);
  const desk = new THREE.Group();
  desk.position.z = 0;
  parent.add(desk);

  const top = DESK.topY;
  box(THREE, desk, m.top, [DESK.width, DESK.topThickness, DESK.depth], [0, top, 0], 'desk-top');
  box(THREE, desk, m.frame, [DESK.width - 0.06, 0.03, 0.06], [0, top - 0.09, -DESK.depth / 2 + 0.06], 'desk-rail');
  box(THREE, desk, m.frame, [DESK.width - 0.14, 0.02, DESK.depth - 0.2], [0, 0.3, 0], 'desk-basket');
  for (const x of [-DESK.width / 2 + 0.07, DESK.width / 2 - 0.07]) {
    for (const z of [-DESK.depth / 2 + 0.06, DESK.depth / 2 - 0.06]) {
      box(THREE, desk, m.frame, [0.035, top - 0.02, 0.035], [x, (top - 0.02) / 2, z], 'desk-leg');
    }
  }

  // 상판 위 — 펼친 공책(학생 손이 닿는 앞쪽)과 필통
  box(THREE, desk, m.notebook, [0.3, 0.012, 0.22], [-0.02, top + 0.026, -0.07], 'notebook');
  box(THREE, desk, m.notebookLine, [0.006, 0.014, 0.22], [-0.02, top + 0.027, -0.07], 'notebook-spine');
  box(THREE, desk, m.pencilCase, [0.2, 0.045, 0.07], [0.34, top + 0.042, -0.12], 'pencil-case');
  return desk;
}

/** 의자 — 학생 등 뒤(-Z)에 등받이. */
export function buildChair(THREE, parent) {
  const m = materials(THREE);
  const chair = new THREE.Group();
  parent.add(chair);
  box(THREE, chair, m.chairSeat, [0.38, 0.03, 0.36], [0, 0.44, 0.02], 'chair-seat');
  box(THREE, chair, m.chairSeat, [0.38, 0.34, 0.03], [0, 0.66, -0.17], 'chair-back');
  box(THREE, chair, m.chairFrame, [0.03, 0.24, 0.03], [-0.16, 0.56, -0.16], 'chair-post');
  box(THREE, chair, m.chairFrame, [0.03, 0.24, 0.03], [0.16, 0.56, -0.16], 'chair-post');
  for (const x of [-0.16, 0.16]) {
    for (const z of [-0.14, 0.16]) {
      box(THREE, chair, m.chairFrame, [0.028, 0.43, 0.028], [x, 0.215, z], 'chair-leg');
    }
  }
  return chair;
}
