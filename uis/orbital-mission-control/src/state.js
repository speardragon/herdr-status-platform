/**
 * 스코프 뷰 상태 — 스냅샷(진실)에서 파생된 "연출용" 상태.
 *
 * 규칙 두 가지:
 *  1. 궤도(반경) 변화의 진실은 항상 `snapshot.agents`다 → `syncCrafts`가 전이를 시작한다.
 *  2. `PlatformEvent`는 순간 연출(충격파·파편·화면 섬광)만 담당한다 → `applyEvent`.
 * 덕분에 이벤트가 유실돼도 궤도는 스냅샷을 따라 스스로 맞춰진다.
 *
 * 모든 함수는 새 상태를 돌려주는 순수 함수다(제자리 수정 없음).
 */
import { statusOf } from './palette.js';
import { angleLerp, clamp, easeInOutCubic, easeOutCubic, hash01, lerp, trackK } from './util.js';

const TRAIL_MAX = 26;
const TRANSFER_SEC = 1.15;
const LAUNCH_SEC = 1.7;
const LAUNCH_RADIUS = 1.5;
const DEATH_SEC = 0.9;
const ANGLE_RATE = 3.2;
const FLARE_DECAY = 2.4;
const LIFE_RATE = 2.2;
const SWEEP_SPEED = 0.62;
const SHOCK_DECAY = 3.4;
const PULSE_LIMIT = 48;
const SPARK_LIMIT = 240;

export const createView = () => ({
  crafts: [],
  pulses: [],
  sparks: [],
  /** 누적 시간(초) — 진동·맥동 위상의 기준. */
  t: 0,
  sweep: 0,
  /** 0..1 화면 충격(적색 섬광 세기). */
  shock: 0,
});

/* ───────────────────────── craft 생성·동기화 ───────────────────────── */

const makeCraft = (agent, angle, now) => ({
  paneId: agent.paneId,
  kind: agent.kind,
  name: agent.name,
  title: agent.title,
  status: agent.status,
  statusSince: agent.statusSince,
  focused: agent.focused,
  workspaceId: agent.workspaceId,
  angle,
  targetAngle: angle,
  phase: hash01(agent.paneId) * Math.PI * 2,
  radius: LAUNCH_RADIUS,
  fromRadius: LAUNCH_RADIUS,
  toRadius: statusOf(agent.status).radius,
  transferStart: now,
  transferDur: LAUNCH_SEC,
  rx: Math.cos(angle) * LAUNCH_RADIUS,
  ry: Math.sin(angle) * LAUNCH_RADIUS,
  trail: [],
  flare: 1,
  life: 0,
  dying: false,
  deathT: 0,
});

const beginTransfer = (craft, status, now) => ({
  ...craft,
  status,
  fromRadius: craft.radius,
  toRadius: statusOf(status).radius,
  transferStart: now,
  transferDur: TRANSFER_SEC,
  flare: 1,
});

const reconcile = (craft, agent, now) => {
  const merged = {
    ...craft,
    kind: agent.kind,
    name: agent.name,
    title: agent.title,
    statusSince: agent.statusSince,
    focused: agent.focused,
    workspaceId: agent.workspaceId,
    dying: false,
    deathT: 0,
  };
  return agent.status === craft.status ? merged : beginTransfer(merged, agent.status, now);
};

/** 스냅샷과 craft 목록을 맞춘다 — 신규는 발사, 사라진 것은 소멸 진입. */
export const syncCrafts = (view, snapshot, layout, now) => {
  const byPane = new Map(snapshot.agents.map((agent) => [agent.paneId, agent]));
  const kept = view.crafts.map((craft) => {
    const agent = byPane.get(craft.paneId);
    if (agent) return reconcile(craft, agent, now);
    return craft.dying ? craft : { ...craft, dying: true, deathT: 0 };
  });

  const known = new Set(view.crafts.map((craft) => craft.paneId));
  const born = snapshot.agents
    .filter((agent) => !known.has(agent.paneId))
    .map((agent) => makeCraft(agent, layout.slots.get(agent.paneId) ?? 0, now));

  return { ...view, crafts: [...kept, ...born] };
};

/* ───────────────────────── 프레임 전진 ───────────────────────── */

const stepCraft = (craft, dt, now, layout, t) => {
  const target = layout.slots.get(craft.paneId);
  const targetAngle = target === undefined ? craft.targetAngle : target;
  const angle = angleLerp(craft.angle, targetAngle, trackK(dt, ANGLE_RATE));

  const [wobbleSpeed, wobbleAmp] = statusOf(craft.status).wobble;
  const renderAngle = angle + Math.sin(t * wobbleSpeed + craft.phase) * wobbleAmp;

  const progress = craft.transferDur <= 0 ? 1 : clamp((now - craft.transferStart) / craft.transferDur, 0, 1);
  const radius = lerp(craft.fromRadius, craft.toRadius, easeInOutCubic(progress));

  const rx = Math.cos(renderAngle) * radius;
  const ry = Math.sin(renderAngle) * radius;

  return {
    ...craft,
    angle,
    targetAngle,
    renderAngle,
    radius,
    rx,
    ry,
    transferring: progress < 1,
    trail: [...craft.trail, { x: rx, y: ry }].slice(-TRAIL_MAX),
    flare: craft.flare * Math.exp(-dt * FLARE_DECAY),
    life: Math.min(1, craft.life + dt * LIFE_RATE),
    deathT: craft.dying ? craft.deathT + dt : 0,
  };
};

const stepPulse = (pulse, dt) => ({ ...pulse, age: pulse.age + dt });

const stepSpark = (spark, dt) => ({
  ...spark,
  x: spark.x + spark.vx * dt,
  y: spark.y + spark.vy * dt,
  vx: spark.vx * Math.exp(-dt * 2.6),
  vy: spark.vy * Math.exp(-dt * 2.6),
  age: spark.age + dt,
});

export const stepView = (view, dt, layout, now) => ({
  ...view,
  t: view.t + dt,
  sweep: view.sweep + SWEEP_SPEED * dt,
  shock: view.shock * Math.exp(-dt * SHOCK_DECAY),
  crafts: view.crafts
    .map((craft) => stepCraft(craft, dt, now, layout, view.t + dt))
    .filter((craft) => !(craft.dying && craft.deathT > DEATH_SEC)),
  pulses: view.pulses.map((pulse) => stepPulse(pulse, dt)).filter((pulse) => pulse.age < pulse.dur),
  sparks: view.sparks.map((spark) => stepSpark(spark, dt)).filter((spark) => spark.age < spark.dur),
});

/** 펄스/파편의 진행도 0..1 — 렌더러가 알파·반경으로 환산한다. */
export const progressOf = (item) => clamp(item.age / item.dur, 0, 1);
export const pulseRadius = (pulse) => lerp(pulse.r0, pulse.r1, easeOutCubic(progressOf(pulse)));

/* ───────────────────────── 이벤트 연출 ───────────────────────── */

const makePulse = (x, y, rgb, r0, r1, dur, width) => ({ x, y, rgb, r0, r1, dur, age: 0, width });

const makeSparks = (x, y, rgb, count, speed, dur) =>
  Array.from({ length: count }, () => {
    const dir = Math.random() * Math.PI * 2;
    const power = speed * (0.35 + Math.random() * 0.65);
    return {
      x,
      y,
      vx: Math.cos(dir) * power,
      vy: Math.sin(dir) * power,
      rgb,
      dur: dur * (0.6 + Math.random() * 0.6),
      age: 0,
      size: 1 + Math.random() * 1.6,
    };
  });

const withEffects = (view, pulses, sparks, shock = 0) => ({
  ...view,
  pulses: [...view.pulses, ...pulses].slice(-PULSE_LIMIT),
  sparks: [...view.sparks, ...sparks].slice(-SPARK_LIMIT),
  shock: Math.max(view.shock, shock),
});

/** 조난 전이 — 3중 충격파 + 파편 + 화면 섬광. 이 UI에서 가장 요란해야 하는 순간. */
const distressBurst = (view, craft) => {
  const rgb = statusOf('blocked').rgb;
  const rings = [0, 1, 2].map((i) => makePulse(craft.rx, craft.ry, rgb, 0.01 + i * 0.02, 0.3 + i * 0.1, 1.1 + i * 0.35, 3 - i * 0.7));
  return withEffects(view, rings, makeSparks(craft.rx, craft.ry, rgb, 18, 0.55, 0.9), 1);
};

const statusBurst = (view, craft, status) => {
  if (status === 'blocked') return distressBurst(view, craft);
  const { rgb } = statusOf(status);
  if (status === 'done') {
    return withEffects(view, [makePulse(craft.rx, craft.ry, rgb, 0.01, 0.16, 0.9, 2)], makeSparks(craft.rx, craft.ry, rgb, 14, 0.3, 0.8));
  }
  if (status === 'working') {
    return withEffects(view, [makePulse(craft.rx, craft.ry, rgb, 0.01, 0.12, 0.7, 1.6)], makeSparks(craft.rx, craft.ry, rgb, 10, 0.26, 0.6));
  }
  return withEffects(view, [makePulse(craft.rx, craft.ry, rgb, 0.01, 0.09, 0.8, 1.2)], []);
};

/** 도메인 이벤트 → 순간 연출. 궤도 이동 자체는 syncCrafts가 이미 걸어놨다. */
export const applyEvent = (view, event) => {
  const craft = 'paneId' in event ? view.crafts.find((c) => c.paneId === event.paneId) : undefined;
  if (!craft) return view;

  if (event.type === 'agent_status_changed') return statusBurst(view, craft, event.to);
  if (event.type === 'agent_appeared') {
    return withEffects(view, [makePulse(craft.rx, craft.ry, statusOf(event.status).rgb, 0.02, 0.2, 1, 1.6)], []);
  }
  if (event.type === 'agent_left') {
    return withEffects(view, [], makeSparks(craft.rx, craft.ry, statusOf('unknown').rgb, 12, 0.34, 0.9));
  }
  return view;
};

export const DEATH_DURATION = DEATH_SEC;
