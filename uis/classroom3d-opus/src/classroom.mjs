/**
 * 좌석 관리 — 책상/의자/학생/라벨/이펙트 묶음을 좌석 단위로 만들고,
 * 스냅샷의 에이전트를 좌석에 안정적으로 배치한 뒤 매 프레임 애니메이션을 돌린다.
 *
 * 좌석 배치는 안정적이다: 한 번 앉은 paneId는 사라질 때까지 같은 자리에 있는다
 * (상태가 바뀔 때마다 자리를 재정렬하면 관전자가 누가 누군지 놓친다).
 */
import { setShadow } from './build.mjs';
import { buildChair, buildDesk } from './desk.mjs';
import { createSeatEffects } from './effects.mjs';
import { createLabel } from './labels.mjs';
import { SEAT, seatCount, seatPosition } from './layout.mjs';
import { statusOf } from './palette.mjs';
import { animate, createJointState, easeToPose, poseFor } from './poses.mjs';
import { buildStudent } from './student.mjs';
import { clamp, hashPick } from './util.mjs';

const POSE_RATE = 5.5;
const LABEL_Y = 1.62;

export function createClassroom(THREE, scene, effects, camera) {
  const group = new THREE.Group();
  group.name = 'classroom';
  scene.add(group);

  const seats = Array.from({ length: seatCount }, (_, index) => createSeat(THREE, group, index));
  /** paneId → 좌석 index. */
  const assigned = new Map();
  const blockedPositions = [];

  const freeSeatIndex = () => seats.findIndex((seat) => seat.occupant === null);

  /** 스냅샷 반영 — 자리 배치, 외형, 라벨, 상태. */
  const sync = (snapshot) => {
    const agents = snapshot?.agents ?? [];
    const living = new Set(agents.map((agent) => agent.paneId));

    for (const [paneId, index] of [...assigned]) {
      if (living.has(paneId)) continue;
      assigned.delete(paneId);
      vacate(seats[index]);
    }

    let overflow = 0;
    for (const agent of agents) {
      let index = assigned.get(agent.paneId);
      if (index === undefined) {
        index = freeSeatIndex();
        if (index < 0) {
          overflow += 1;
          continue;
        }
        assigned.set(agent.paneId, index);
      }
      occupy(seats[index], agent);
    }
    return { seated: agents.length - overflow, overflow };
  };

  /** 상태 전이 순간의 3D 연출. */
  const punctuate = (paneId, status, celebrate) => {
    const index = assigned.get(paneId);
    if (index === undefined) return;
    const seat = seats[index];
    seat.flash = 1;
    effects.burst(seat.root.position, statusOf(status).hex, celebrate);
  };

  const update = (elapsed, dt) => {
    blockedPositions.length = 0;
    for (const seat of seats) {
      const occupied = seat.occupant !== null;
      seat.student.group.visible = occupied;
      const status = occupied ? seat.occupant.status : 'unknown';
      easeToPose(seat.joints, poseFor(status), POSE_RATE, dt);
      if (occupied) animate(seat.student, seat.joints, status, elapsed, seat.seedKey);

      seat.flash = Math.max(0, seat.flash - dt * 1.6);
      seat.label.setScale(camera.position.distanceTo(seat.root.position), seat.flash);
      seat.effects.update(status, occupied, occupied && seat.occupant.focused, elapsed + seat.phase);
      if (occupied && status === 'blocked') blockedPositions.push(seat.root.position);
    }
    return blockedPositions;
  };

  const hitboxes = () => seats.filter((seat) => seat.occupant !== null).map((seat) => seat.hitbox);

  const occupantOf = (object) => seats.find((seat) => seat.hitbox === object)?.occupant ?? null;

  return { group, sync, punctuate, update, hitboxes, occupantOf };
}

function createSeat(THREE, parent, index) {
  const { x, z, row } = seatPosition(index);
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  // 줄마다 아주 미세하게 삐뚤어진 각도 — 자로 잰 듯한 배치보다 실제 교실 같다.
  root.rotation.y = (hashPick(`seat${index}`, 'yaw') - 0.5) * 0.09;
  parent.add(root);

  const deskAnchor = new THREE.Group();
  deskAnchor.position.z = SEAT.deskOffsetZ;
  root.add(deskAnchor);
  setShadow(buildDesk(THREE, deskAnchor), { cast: true, receive: true });
  setShadow(buildChair(THREE, root), { cast: true, receive: true });

  const seedKey = `seat${index}`;
  const student = buildStudent(THREE, root, seedKey);
  student.group.visible = false;

  const label = createLabel(THREE, root);
  // 뒷줄일수록 라벨을 조금 더 높여 화면에서 서로 겹치지 않게 한다.
  label.sprite.position.set(0, LABEL_Y + row * 0.14, 0.1);

  const hitbox = new THREE.Mesh(
    new THREE.BoxGeometry(0.78, 1.5, 1.0),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitbox.position.set(0, 0.75, 0.25);
  root.add(hitbox);

  return {
    index,
    row,
    root,
    student,
    label,
    hitbox,
    effects: createSeatEffects(THREE, root),
    joints: createJointState(),
    occupant: null,
    seedKey,
    flash: 0,
    phase: hashPick(seedKey, 'fx') * 8,
  };
}

/** 좌석에 에이전트를 앉힌다. 주인이 바뀌면 외형도 갈아입힌다. */
function occupy(seat, agent) {
  if (seat.occupant?.paneId !== agent.paneId) {
    seat.student.restyle(agent.kind, agent.paneId);
    seat.flash = clamp(seat.flash + 0.8, 0, 1);
  }
  seat.occupant = {
    paneId: agent.paneId,
    kind: agent.kind,
    name: agent.name,
    status: agent.status,
    title: agent.title,
    focused: agent.focused,
    statusSince: agent.statusSince,
  };
  seat.label.set(seat.occupant);
}

function vacate(seat) {
  seat.occupant = null;
  seat.label.set(null);
  seat.student.group.visible = false;
}
