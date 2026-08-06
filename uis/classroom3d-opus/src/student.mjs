/**
 * 학생 캐릭터 리그 — +Z(선생님/카메라)를 바라보고 앉은 상체 중심 골격.
 *
 * 관절 규약(모든 회전은 X축, 팔은 기본 -Y로 늘어져 있다):
 *   rotation.x = 0     → 팔이 아래로
 *   rotation.x ≈ -1.5  → 팔이 앞(+Z, 책상 위)으로
 *   rotation.x ≈ -2.7  → 팔이 위로 번쩍 (blocked)
 * 엄지·연필 피벗은 누적 X 회전을 상쇄해 항상 원하는 세계 방향을 가리킨다.
 */
import { box, setShadow, standard } from './build.mjs';
import { HAIR_TONES, SKIN_TONES, kindOf } from './palette.mjs';
import { hashPick, pickFrom } from './util.mjs';

const HIP_Y = 0.48;
const SHOULDER_Y = 0.38;
const UPPER_ARM = 0.2;
const FOREARM = 0.19;

let sharedMaterials = null;

const shared = (THREE) => {
  sharedMaterials = sharedMaterials ?? {
    pants: standard(THREE, 0x39424f, { roughness: 0.85 }),
    shoe: standard(THREE, 0x2a2f36, { roughness: 0.7 }),
    dark: standard(THREE, 0x1c2128, { roughness: 0.55 }),
    pencil: standard(THREE, 0xf2c14e, { roughness: 0.5 }),
    lead: standard(THREE, 0x333a42, { roughness: 0.6 }),
  };
  return sharedMaterials;
};

const buildArm = (THREE, torso, side, materials) => {
  const shoulder = new THREE.Object3D();
  shoulder.position.set(side * 0.175, SHOULDER_Y, 0);
  torso.add(shoulder);
  box(THREE, shoulder, materials.uniform, [0.09, UPPER_ARM, 0.095], [0, -UPPER_ARM / 2, 0], 'upper-arm');

  const elbow = new THREE.Object3D();
  elbow.position.y = -UPPER_ARM;
  shoulder.add(elbow);
  box(THREE, elbow, materials.uniform, [0.082, FOREARM * 0.62, 0.086], [0, -FOREARM * 0.31, 0], 'sleeve');
  box(THREE, elbow, materials.skin, [0.072, FOREARM * 0.42, 0.078], [0, -FOREARM * 0.78, 0], 'forearm');

  const hand = new THREE.Object3D();
  hand.position.y = -FOREARM;
  elbow.add(hand);
  box(THREE, hand, materials.skin, [0.078, 0.082, 0.092], [0, -0.03, 0], 'fist');

  // 엄지 피벗 — done 포즈에서 누적 회전을 상쇄해 하늘을 가리킨다.
  const thumb = new THREE.Object3D();
  hand.add(thumb);
  box(THREE, thumb, materials.skin, [0.045, 0.115, 0.045], [side * 0.035, 0.07, 0.01], 'thumb');
  thumb.visible = false;

  return { shoulder, elbow, hand, thumb };
};

const buildHead = (THREE, torso, materials, seed) => {
  const head = new THREE.Object3D();
  head.position.set(0, 0.44, 0.005);
  torso.add(head);

  box(THREE, head, materials.skin, [0.056, 0.06, 0.056], [0, 0.02, 0], 'neck');
  box(THREE, head, materials.skin, [0.185, 0.205, 0.185], [0, 0.12, 0], 'skull');
  box(THREE, head, materials.hair, [0.196, 0.055, 0.196], [0, 0.225, 0], 'hair-top');
  box(THREE, head, materials.hair, [0.196, 0.13, 0.03], [0, 0.15, -0.093], 'hair-back');
  box(THREE, head, materials.hair, [0.03, 0.1, 0.15], [-0.093, 0.15, -0.01], 'hair-side');
  box(THREE, head, materials.hair, [0.03, 0.1, 0.15], [0.093, 0.15, -0.01], 'hair-side');
  box(THREE, head, materials.hair, [0.16, 0.03, 0.03], [0, 0.185, 0.086], 'bangs');

  const dark = shared(THREE).dark;
  box(THREE, head, dark, [0.032, 0.026, 0.012], [-0.045, 0.125, 0.094], 'eye');
  box(THREE, head, dark, [0.032, 0.026, 0.012], [0.045, 0.125, 0.094], 'eye');
  box(THREE, head, dark, [0.05, 0.012, 0.01], [0, 0.062, 0.094], 'mouth');

  // 머리 스타일 변주 — 같은 paneId면 항상 같은 외형.
  const style = hashPick(seed, 'style');
  if (style < 0.3) {
    box(THREE, head, materials.hair, [0.1, 0.16, 0.1], [0, 0.14, -0.14], 'ponytail');
  } else if (style < 0.5) {
    box(THREE, head, materials.uniform, [0.21, 0.05, 0.21], [0, 0.245, 0], 'cap');
    box(THREE, head, materials.uniform, [0.19, 0.02, 0.1], [0, 0.225, 0.14], 'cap-brim');
  }
  return head;
};

/**
 * 학생 하나를 만든다. 좌석에 계속 남아 있고, 주인이 바뀌면 restyle만 다시 호출한다.
 */
export function buildStudent(THREE, parent, seed = 'seat') {
  const materials = {
    uniform: standard(THREE, 0x7c8798, { roughness: 0.82 }),
    skin: standard(THREE, SKIN_TONES[0], { roughness: 0.72 }),
    hair: standard(THREE, HAIR_TONES[0], { roughness: 0.68 }),
  };
  const s = shared(THREE);

  const group = new THREE.Group();
  parent.add(group);

  // 다리는 몸통 기울기와 무관하게 책상 아래에 고정.
  for (const side of [-1, 1]) {
    box(THREE, group, s.pants, [0.125, 0.13, 0.4], [side * 0.1, 0.43, 0.2], 'thigh');
    box(THREE, group, s.pants, [0.115, 0.4, 0.12], [side * 0.1, 0.21, 0.4], 'shin');
    box(THREE, group, s.shoe, [0.11, 0.06, 0.19], [side * 0.1, 0.035, 0.46], 'shoe');
  }

  // 상체 피벗 — 앞으로 숙이면 필기, 더 숙이면 엎드림.
  const torso = new THREE.Object3D();
  torso.position.set(0, HIP_Y, 0);
  group.add(torso);
  box(THREE, torso, materials.uniform, [0.34, 0.42, 0.22], [0, 0.2, 0], 'torso');
  box(THREE, torso, materials.uniform, [0.2, 0.07, 0.05], [0, 0.36, -0.12], 'hood');

  const head = buildHead(THREE, torso, materials, seed);
  const arms = {
    left: buildArm(THREE, torso, -1, materials),
    right: buildArm(THREE, torso, 1, materials),
  };

  // 연필 — 필기 포즈에서만 보인다.
  const pencil = new THREE.Object3D();
  arms.right.hand.add(pencil);
  box(THREE, pencil, s.pencil, [0.014, 0.15, 0.014], [0, -0.06, 0.02], 'pencil-body');
  box(THREE, pencil, s.lead, [0.012, 0.02, 0.012], [0, -0.14, 0.02], 'pencil-tip');
  pencil.visible = false;

  setShadow(group, { cast: true, receive: true });

  /** 주인이 바뀔 때 외형만 갈아입힌다(지오메트리는 그대로). */
  const restyle = (kind, seedKey) => {
    materials.uniform.color.setHex(kindOf(kind).hex);
    materials.skin.color.setHex(pickFrom(SKIN_TONES, hashPick(seedKey, 'skin')));
    materials.hair.color.setHex(pickFrom(HAIR_TONES, hashPick(seedKey, 'hair')));
    group.scale.setScalar(0.94 + hashPick(seedKey, 'size') * 0.12);
  };

  return { group, torso, head, arms, pencil, materials, restyle };
}
