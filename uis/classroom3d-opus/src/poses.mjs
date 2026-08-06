/**
 * 상태 → 3D 포즈 + 절차적 애니메이션.
 *
 * 두 단계로 나뉜다:
 *   1) POSES의 목표 관절각으로 damp 보간 → 상태 전이가 부드럽게 이어진다.
 *   2) 보간된 기준값 위에 상태별 오실레이션을 얹는다(필기·손 흔들기·바운스).
 *
 * 회전 규약(전부 X축):
 *   torsoX  + → 앞(+Z, 책상 쪽)으로 숙임        headX + → 고개 숙임
 *   shoulderX - → 팔이 앞으로,  -2.8 정도면 머리 위로 번쩍
 *   엄지·연필 피벗은 누적 X 회전을 상쇄해 항상 하늘/공책을 향한다.
 */
import { damp, hashPick, smoothstep } from './util.mjs';

export const JOINTS = Object.freeze([
  'torsoX', 'headX', 'headZ',
  'shoulderLX', 'shoulderLZ', 'elbowLX',
  'shoulderRX', 'shoulderRZ', 'elbowRX',
  'lift',
]);

function zeroed() {
  const base = {};
  for (const joint of JOINTS) base[joint] = 0;
  return base;
}

const pose = (values) => Object.freeze({ ...zeroed(), ...values });

export const POSES = Object.freeze({
  // 필기 — 상체를 숙이고 두 팔을 상판에 올린 채 오른손으로 쓴다.
  working: pose({
    torsoX: 0.3, headX: 0.32,
    shoulderLX: -1.62, shoulderLZ: 0.16, elbowLX: -0.16,
    shoulderRX: -1.65, shoulderRZ: -0.14, elbowRX: -0.18,
  }),
  // 엎드림 — 상체를 45°까지 숙여 팔베개 위에 머리를 얹는다.
  idle: pose({
    torsoX: 0.78, headX: 0.06, headZ: 0.13,
    shoulderLX: -2.43, shoulderLZ: 0.46, elbowLX: 0.06,
    shoulderRX: -2.43, shoulderRZ: -0.46, elbowRX: 0.06,
  }),
  // 손 번쩍 — 허리를 세우고 오른팔을 머리 위로 완전히 든다.
  blocked: pose({
    torsoX: -0.06, headX: -0.08,
    shoulderLX: -1.46, shoulderLZ: 0.18, elbowLX: -0.2,
    shoulderRX: -2.96, shoulderRZ: -0.04, elbowRX: -0.06,
  }),
  // 양손 엄지척 — 가슴 앞에서 두 주먹을 세운다.
  done: pose({
    torsoX: 0, headX: -0.05,
    shoulderLX: -0.78, shoulderLZ: 0.44, elbowLX: -1.98,
    shoulderRX: -0.78, shoulderRZ: -0.44, elbowRX: -1.98,
  }),
  // 상태 미확인 — 멀뚱히 앉아 두리번거린다.
  unknown: pose({
    torsoX: 0.06, headX: 0.02,
    shoulderLX: -0.9, shoulderLZ: 0.12, elbowLX: -0.5,
    shoulderRX: -0.9, shoulderRZ: -0.12, elbowRX: -0.5,
  }),
});

export const poseFor = (status) => POSES[status] ?? POSES.unknown;

/** 좌석마다 하나씩 두는 가변 관절 상태. */
export const createJointState = () => zeroed();

/** 목표 포즈로 감쇠 보간. rate가 클수록 전이가 짧다. */
export function easeToPose(state, target, rate, dt) {
  for (const joint of JOINTS) state[joint] = damp(state[joint], target[joint], rate, dt);
  return state;
}

/** 보간된 기준값 + 상태별 오실레이션을 rig에 쓴다. */
export function animate(rig, state, status, elapsed, seedKey) {
  const t = elapsed + hashPick(seedKey, 'phase') * Math.PI * 2;

  let torsoX = state.torsoX + Math.sin(t * 1.15) * 0.012; // 호흡
  let headX = state.headX;
  let headZ = state.headZ;
  let shoulderRX = state.shoulderRX;
  let shoulderRZ = state.shoulderRZ;
  let elbowRX = state.elbowRX;
  let elbowLX = state.elbowLX;
  let lift = state.lift;

  if (status === 'working') {
    // 필기는 몰아 쓰고 잠깐 쉰다 — 균일한 진동보다 사람처럼 보인다.
    const burst = smoothstep(0.15, 0.75, Math.sin(t * 0.42) * 0.5 + 0.5);
    elbowRX += Math.sin(t * 11.5) * 0.1 * burst;
    shoulderRZ += Math.cos(t * 11.5) * 0.055 * burst;
    headX += Math.sin(t * 1.6) * 0.02;
    elbowLX += Math.sin(t * 0.8) * 0.02;
  } else if (status === 'idle') {
    torsoX += Math.sin(t * 0.62) * 0.02;
    headZ += Math.sin(t * 0.5) * 0.05;
  } else if (status === 'blocked') {
    shoulderRZ += Math.sin(t * 7.4) * 0.26; // 좌우로 흔드는 손
    elbowRX += Math.sin(t * 7.4 + 0.7) * 0.12;
    torsoX += Math.sin(t * 2.2) * 0.035;
    headZ += Math.sin(t * 7.4) * 0.05;
    lift += Math.abs(Math.sin(t * 3.7)) * 0.014;
  } else if (status === 'done') {
    const bounce = Math.abs(Math.sin(t * 2.6));
    lift += bounce * 0.035;
    headX -= bounce * 0.05;
    shoulderRZ += Math.sin(t * 2.6) * 0.06;
  } else {
    headZ += Math.sin(t * 0.7) * 0.05;
  }

  rig.torso.rotation.x = torsoX;
  rig.head.rotation.set(headX, 0, headZ);
  rig.arms.left.shoulder.rotation.set(state.shoulderLX, 0, state.shoulderLZ);
  rig.arms.left.elbow.rotation.x = elbowLX;
  rig.arms.right.shoulder.rotation.set(shoulderRX, 0, shoulderRZ);
  rig.arms.right.elbow.rotation.x = elbowRX;
  rig.group.position.y = lift;

  const showThumbs = status === 'done';
  rig.arms.left.thumb.visible = showThumbs;
  rig.arms.right.thumb.visible = showThumbs;
  if (showThumbs) {
    rig.arms.left.thumb.rotation.x = -(torsoX + state.shoulderLX + elbowLX);
    rig.arms.right.thumb.rotation.x = -(torsoX + shoulderRX + elbowRX);
  }
  rig.pencil.visible = status === 'working';
  if (rig.pencil.visible) rig.pencil.rotation.x = -(torsoX + shoulderRX + elbowRX) - 0.5;
}
