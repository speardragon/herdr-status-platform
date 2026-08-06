/**
 * 연출 — 좌석에 붙는 상시 이펙트(경광 링·빛기둥·zzz·포커스 링)와
 * 이벤트 순간에 터지는 풀 이펙트(전이 링·컨페티), 그리고 공기 중 먼지.
 * 모든 이펙트는 풀에서 재사용한다(런타임 할당 없음 = 프레임 안정).
 */
import { STATUS } from './palette.mjs';
import { glowTexture, letterTexture } from './textures.mjs';
import { clamp } from './util.mjs';

const RING_POOL = 10;
const CONFETTI_POOL = 3;
const CONFETTI_COUNT = 64;
const DUST_COUNT = 260;

let sharedGlow = null;
let sharedZ = null;
const glow = (THREE) => {
  sharedGlow = sharedGlow ?? glowTexture(THREE);
  return sharedGlow;
};
const zGlyph = (THREE) => {
  sharedZ = sharedZ ?? letterTexture(THREE, 'z');
  return sharedZ;
};

/* ─────────────────── 좌석 상시 이펙트 ─────────────────── */

export function createSeatEffects(THREE, parent) {
  const group = new THREE.Group();
  parent.add(group);

  // blocked: 머리 위 경광 링 + 천장에서 내려오는 빛기둥 — 교실에서 가장 눈에 띄어야 한다.
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: STATUS.blocked.hex, transparent: true, opacity: 0.9, toneMapped: false,
  });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.028, 8, 22), haloMaterial);
  halo.position.set(0, 1.3, 0);
  halo.rotation.x = Math.PI / 2;
  halo.visible = false;
  group.add(halo);

  const beamMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd9d0,
    transparent: true,
    opacity: 0.1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.62, 2.3, 18, 1, true), beamMaterial);
  beam.position.set(0, 2.15, 0.05);
  beam.visible = false;
  beam.renderOrder = 3;
  group.add(beam);

  // idle: 머리 위로 떠오르는 zzz
  const zzz = [0, 1].map((index) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: zGlyph(THREE), color: 0xdce8ff, transparent: true, depthWrite: false, toneMapped: false,
    }));
    sprite.scale.setScalar(0.17 + index * 0.07);
    sprite.visible = false;
    group.add(sprite);
    return sprite;
  });

  // done: 금빛 반짝임
  const sparkle = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow(THREE), color: STATUS.done.hex, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  sparkle.scale.setScalar(0.42);
  sparkle.position.set(0, 1.34, 0);
  sparkle.visible = false;
  group.add(sparkle);

  // herdr가 보고 있는 pane 표시
  const focusMaterial = new THREE.MeshBasicMaterial({
    color: 0xffe08a, transparent: true, opacity: 0.75, toneMapped: false,
  });
  const focusRing = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.022, 6, 30), focusMaterial);
  focusRing.rotation.x = Math.PI / 2;
  focusRing.position.set(0, 0.02, 0.1);
  focusRing.visible = false;
  group.add(focusRing);

  const update = (status, occupied, focused, elapsed) => {
    const blocked = occupied && status === 'blocked';
    halo.visible = blocked;
    beam.visible = blocked;
    if (blocked) {
      halo.rotation.z = elapsed * 2.2;
      halo.position.y = 1.3 + Math.sin(elapsed * 3.4) * 0.03;
      haloMaterial.opacity = 0.6 + Math.sin(elapsed * 6.2) * 0.35;
      beamMaterial.opacity = 0.08 + Math.sin(elapsed * 4) * 0.035;
    }

    const idle = occupied && status === 'idle';
    zzz.forEach((sprite, index) => {
      sprite.visible = idle;
      if (!idle) return;
      const phase = (elapsed * 0.42 + index * 0.5) % 1;
      sprite.position.set(0.19 + phase * 0.14, 0.98 + phase * 0.4 + index * 0.05, 0.32);
      sprite.material.opacity = phase < 0.2 ? phase / 0.2 : (1 - (phase - 0.2) / 0.8) * 0.85;
    });

    const done = occupied && status === 'done';
    sparkle.visible = done;
    if (done) {
      sparkle.material.opacity = 0.5 + Math.sin(elapsed * 3.1) * 0.3;
      sparkle.position.y = 1.34 + Math.sin(elapsed * 1.9) * 0.04;
    }

    focusRing.visible = occupied && focused;
    if (focusRing.visible) focusMaterial.opacity = 0.45 + Math.sin(elapsed * 4.5) * 0.3;
  };

  return { group, update };
}

/* ─────────────────── 이벤트 순간 이펙트 ─────────────────── */

export function createEffectPool(THREE, scene) {
  const ringGeometry = new THREE.RingGeometry(0.42, 0.5, 40);
  const rings = Array.from({ length: RING_POOL }, () => {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const mesh = new THREE.Mesh(ringGeometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    mesh.renderOrder = 4;
    scene.add(mesh);
    return { mesh, material, life: 0, span: 1 };
  });

  const confetti = Array.from({ length: CONFETTI_POOL }, () => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(CONFETTI_COUNT * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      size: 0.075, map: glow(THREE), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, vertexColors: false,
    });
    const points = new THREE.Points(geometry, material);
    points.visible = false;
    points.frustumCulled = false;
    scene.add(points);
    return { points, material, positions, velocities: new Float32Array(CONFETTI_COUNT * 3), life: 0 };
  });

  let ringCursor = 0;
  let confettiCursor = 0;

  /** 상태 전이 순간: 좌석 발밑에서 링이 퍼지고, done이면 컨페티까지 터진다. */
  const burst = (position, colorHex, celebrate) => {
    const ring = rings[ringCursor++ % RING_POOL];
    ring.mesh.position.set(position.x, 0.035, position.z);
    ring.mesh.scale.setScalar(0.35);
    ring.mesh.visible = true;
    ring.material.color.setHex(colorHex);
    ring.material.opacity = 0.95;
    ring.span = 0.95;
    ring.life = ring.span;

    if (!celebrate) return;
    const shower = confetti[confettiCursor++ % CONFETTI_POOL];
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.9 + Math.random() * 1.5;
      shower.positions[i * 3] = position.x + (Math.random() - 0.5) * 0.2;
      shower.positions[i * 3 + 1] = 1.15;
      shower.positions[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.2;
      shower.velocities[i * 3] = Math.cos(angle) * speed * 0.4;
      shower.velocities[i * 3 + 1] = 1.6 + Math.random() * 1.5;
      shower.velocities[i * 3 + 2] = Math.sin(angle) * speed * 0.4;
    }
    shower.material.color.setHex(colorHex);
    shower.points.geometry.attributes.position.needsUpdate = true;
    shower.points.visible = true;
    shower.life = 1.7;
  };

  const update = (dt) => {
    for (const ring of rings) {
      if (ring.life <= 0) continue;
      ring.life -= dt;
      const progress = clamp(1 - ring.life / ring.span, 0, 1);
      ring.mesh.scale.setScalar(0.35 + progress * 1.5);
      ring.material.opacity = (1 - progress) * 0.9;
      if (ring.life <= 0) ring.mesh.visible = false;
    }
    for (const shower of confetti) {
      if (shower.life <= 0) continue;
      shower.life -= dt;
      for (let i = 0; i < CONFETTI_COUNT; i++) {
        shower.velocities[i * 3 + 1] -= 3.6 * dt;
        shower.positions[i * 3] += shower.velocities[i * 3] * dt;
        shower.positions[i * 3 + 1] += shower.velocities[i * 3 + 1] * dt;
        shower.positions[i * 3 + 2] += shower.velocities[i * 3 + 2] * dt;
      }
      shower.points.geometry.attributes.position.needsUpdate = true;
      shower.material.opacity = clamp(shower.life / 1.7, 0, 1);
      if (shower.life <= 0) shower.points.visible = false;
    }
  };

  return { burst, update };
}

/* ─────────────────── 공기 중 먼지 ─────────────────── */

/** 창에서 들어오는 빛에 떠다니는 먼지 — 정적인 씬을 "살아있게" 만드는 값싼 장치. */
export function createDust(THREE, scene, bounds) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(DUST_COUNT * 3);
  const drift = new Float32Array(DUST_COUNT);
  for (let i = 0; i < DUST_COUNT; i++) {
    positions[i * 3] = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
    positions[i * 3 + 1] = 0.4 + Math.random() * 2.4;
    positions[i * 3 + 2] = bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
    drift[i] = Math.random() * Math.PI * 2;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    size: 0.035, map: glow(THREE), color: 0xfff3d6, transparent: true, opacity: 0.55,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  const update = (elapsed, dt) => {
    for (let i = 0; i < DUST_COUNT; i++) {
      positions[i * 3 + 1] += Math.sin(elapsed * 0.35 + drift[i]) * 0.035 * dt;
      positions[i * 3] += Math.cos(elapsed * 0.22 + drift[i]) * 0.05 * dt;
    }
    geometry.attributes.position.needsUpdate = true;
  };

  return { points, update };
}
