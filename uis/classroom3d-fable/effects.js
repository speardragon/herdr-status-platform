/**
 * 전이 연출 — 상태 변경 순간의 파티클 버스트 + blocked 학생을 쫓는 스포트라이트.
 */

const BURSTS = 8;
const PARTICLES = 14;
const DURATION = 1.1;

/** 파티클 버스트 풀 — agent_status_changed 순간 상태색 조각이 터진다. */
export function createBurstPool(THREE, scene) {
  const geo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  const bursts = Array.from({ length: BURSTS }, () => {
    const group = new THREE.Group();
    group.visible = false;
    const parts = Array.from({ length: PARTICLES }, (_, i) => {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      mesh.userData.spin = (i % 2 ? 1 : -1) * (2 + (i % 5));
      group.add(mesh);
      return mesh;
    });
    scene.add(group);
    return { group, parts, life: -1, vel: [] };
  });
  let cursor = 0;

  const spawn = (position, colorHex) => {
    const b = bursts[cursor];
    cursor = (cursor + 1) % BURSTS;
    b.life = 0;
    b.group.visible = true;
    b.group.position.copy(position);
    b.vel = b.parts.map((p, i) => {
      const a = (i / PARTICLES) * Math.PI * 2;
      const r = 0.9 + (i % 3) * 0.45;
      p.position.set(0, 0.1, 0);
      p.material.color.setHex(colorHex);
      p.material.opacity = 1;
      p.scale.setScalar(1 + (i % 3) * 0.4);
      return new THREE.Vector3(Math.cos(a) * r * 0.55, 1.6 + (i % 4) * 0.35, Math.sin(a) * r * 0.55);
    });
  };

  const update = (dt) => {
    for (const b of bursts) {
      if (b.life < 0) continue;
      b.life += dt;
      if (b.life >= DURATION) {
        b.life = -1;
        b.group.visible = false;
        continue;
      }
      const fade = 1 - b.life / DURATION;
      b.parts.forEach((p, i) => {
        const v = b.vel[i];
        v.y -= 4.2 * dt;
        p.position.addScaledVector(v, dt);
        p.rotation.x += p.userData.spin * dt;
        p.rotation.z += p.userData.spin * 0.7 * dt;
        p.material.opacity = fade;
      });
    }
  };

  return { spawn, update };
}

/** blocked 스포트라이트 — 가장 최근에 막힌 학생 머리 위를 붉게 비춘다. */
export function createBlockedSpotlight(THREE, scene) {
  const spot = new THREE.SpotLight(0xff7a5e, 0, 8, 0.5, 0.55, 1.2);
  spot.position.set(0, 3.0, 0);
  scene.add(spot, spot.target);
  const state = { active: false, targetIntensity: 0 };

  const aim = (worldPos) => {
    spot.position.set(worldPos.x + 0.3, 3.05, worldPos.z + 0.9);
    spot.target.position.set(worldPos.x, 0.9, worldPos.z);
    state.active = true;
  };
  const clear = () => {
    state.active = false;
  };
  const update = (t, dt) => {
    const goal = state.active ? 55 + Math.sin(t * 6) * 12 : 0;
    spot.intensity += (goal - spot.intensity) * Math.min(1, dt * 5);
  };

  return { aim, clear, update };
}
