/**
 * 학생 캐릭터 — 로우폴리 박스 조립 + 상태별 3D 포즈/모션.
 * 관절(어깨·목·허리) 피벗을 두고 매 프레임 목표 포즈로 부드럽게 수렴시킨다.
 * 학생은 +Z(교탁/카메라)를 바라보고, 책상은 학생 앞(+Z)에 있다.
 */
import { makeCanvasTexture, drawStudentLabel, glyphTexture } from './textures.js';

export const KIND_COLOR = { claude: 0xd97757, codex: 0x14b8a6, gemini: 0x4c8df6, cursor: 0x8b7cf6 };
export const STATUS_COLOR = { working: 0x35c26a, idle: 0x93a0ac, blocked: 0xff5040, done: 0xf3b53a, unknown: 0xa98ae8 };

const HAIR_COLORS = [0x3a2c20, 0x1e1a16, 0x5c4630, 0x776150, 0x2c2c34];
const SKIN_TONES = [0xf2c99b, 0xe8bd90, 0xf7d7ae, 0xdfae82];

const hashCode = (s) => [...String(s)].reduce((h, ch) => ((h * 31 + ch.charCodeAt(0)) | 0), 7);

const mat = (THREE, color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.02, ...opts });

const box = (THREE, parent, material, [w, h, d], [x, y, z]) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
};

/** 책상+의자 — 좌석 그룹(학생과 독립, 빈 자리도 놓인다). */
export function buildDeskChair(THREE, seed) {
  const group = new THREE.Group();
  const jitter = ((seed % 7) - 3) * 0.015;
  group.rotation.y = jitter;
  const woodTone = 0xc9a06a + ((seed % 5) - 2) * 0x050403;
  const wood = mat(THREE, woodTone, { roughness: 0.55 });
  const steel = mat(THREE, 0x9aa3ab, { roughness: 0.35, metalness: 0.55 });

  box(THREE, group, wood, [0.68, 0.04, 0.46], [0, 0.72, 0.42]); // 상판
  box(THREE, group, mat(THREE, 0xb08b55), [0.64, 0.05, 0.4], [0, 0.62, 0.42]); // 서랍
  for (const sx of [-0.3, 0.3]) {
    box(THREE, group, steel, [0.035, 0.72, 0.035], [sx, 0.36, 0.26]);
    box(THREE, group, steel, [0.035, 0.72, 0.035], [sx, 0.36, 0.58]);
  }
  box(THREE, group, mat(THREE, 0xfdfaef), [0.3, 0.012, 0.22], [-0.09, 0.747, 0.4]); // 공책
  box(THREE, group, mat(THREE, 0x476ba0), [0.2, 0.03, 0.15], [0.19, 0.755, 0.34]); // 교과서

  box(THREE, group, wood, [0.4, 0.035, 0.38], [0, 0.44, -0.06]); // 의자 좌판
  box(THREE, group, wood, [0.4, 0.3, 0.035], [0, 0.66, -0.24]); // 등받이
  for (const sx of [-0.17, 0.17]) {
    for (const sz of [-0.21, 0.1]) box(THREE, group, steel, [0.03, 0.44, 0.03], [sx, 0.22, sz]);
  }
  return group;
}

/** 학생 본체 — 관절 피벗과 소품(연필·엄지)을 노출한다. */
function buildBody(THREE, paneId, kind) {
  const seed = Math.abs(hashCode(paneId));
  const hoodie = mat(THREE, KIND_COLOR[kind] ?? 0x8f9aa5, { roughness: 0.75 });
  const skin = mat(THREE, SKIN_TONES[seed % SKIN_TONES.length]);
  const hair = mat(THREE, HAIR_COLORS[seed % HAIR_COLORS.length]);
  const pants = mat(THREE, 0x3f4652);
  const shoe = mat(THREE, 0x2b3036);

  const group = new THREE.Group();

  // 앉은 다리 — 허벅지는 책상(+Z) 쪽, 정강이는 바닥으로.
  for (const sx of [-0.09, 0.09]) {
    box(THREE, group, pants, [0.13, 0.1, 0.32], [sx, 0.5, 0.12]);
    box(THREE, group, pants, [0.11, 0.3, 0.11], [sx, 0.3, 0.26]);
    box(THREE, group, shoe, [0.12, 0.06, 0.2], [sx, 0.03, 0.3]);
  }

  const torso = new THREE.Object3D();
  torso.position.set(0, 0.52, -0.02);
  group.add(torso);
  box(THREE, torso, hoodie, [0.4, 0.5, 0.22], [0, 0.27, 0]);
  box(THREE, torso, hoodie, [0.3, 0.12, 0.06], [0, 0.42, -0.13]); // 후드

  const head = new THREE.Object3D();
  head.position.set(0, 0.56, 0);
  torso.add(head);
  box(THREE, head, skin, [0.09, 0.07, 0.09], [0, 0.02, 0]); // 목
  box(THREE, head, skin, [0.24, 0.22, 0.22], [0, 0.16, 0]); // 얼굴
  box(THREE, head, hair, [0.26, 0.07, 0.24], [0, 0.28, -0.01]); // 머리 위
  box(THREE, head, hair, [0.26, 0.16, 0.05], [0, 0.18, -0.11]); // 뒷머리
  const eyeMat = mat(THREE, 0x22262b, { roughness: 0.3 });
  box(THREE, head, eyeMat, [0.035, 0.045, 0.01], [-0.055, 0.16, 0.112]);
  box(THREE, head, eyeMat, [0.035, 0.045, 0.01], [0.055, 0.16, 0.112]);

  const makeArm = (side) => {
    const pivot = new THREE.Object3D();
    pivot.position.set(side * 0.235, 0.44, 0);
    torso.add(pivot);
    box(THREE, pivot, hoodie, [0.1, 0.32, 0.1], [0, -0.15, 0]);
    const fist = box(THREE, pivot, skin, [0.08, 0.08, 0.08], [0, -0.34, 0]);
    // 엄지 — 팔을 들면(rotation.x≈-2) 로컬 -Z가 화면 위쪽을 향해 "엄지척"으로 읽힌다.
    const thumb = box(THREE, pivot, skin, [0.04, 0.04, 0.11], [0, -0.34, -0.08]);
    thumb.visible = false;
    return { pivot, fist, thumb };
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // 연필 — working일 때 오른손에.
  const pencil = box(THREE, armR.pivot, mat(THREE, 0xe8b431, { roughness: 0.4 }), [0.016, 0.16, 0.016], [0.02, -0.38, 0.04]);
  pencil.rotation.x = 0.7;
  pencil.visible = false;

  return { group, torso, head, armL, armR, pencil, hoodie, seed };
}

/* 상태별 기본 포즈: [허리x, 목x, 팔L x, 팔L z, 팔R x, 팔R z] */
const POSES = {
  working: { torso: 0.2, head: 0.32, lX: -1.1, lZ: 0.1, rX: -1.28, rZ: -0.05 },
  idle: { torso: 0.9, head: 0.55, lX: -1.4, lZ: 0.32, rX: -1.4, rZ: -0.32 },
  blocked: { torso: -0.06, head: -0.2, lX: -0.85, lZ: 0.12, rX: -2.92, rZ: 0 },
  done: { torso: -0.13, head: -0.18, lX: -2.02, lZ: -0.38, rX: -2.02, rZ: 0.38 },
  unknown: { torso: 0.12, head: 0.12, lX: -0.5, lZ: 0.08, rX: -0.5, rZ: -0.08 },
};

/**
 * 학생 하나 — 좌석 그룹에 몸·라벨·마커·경광 링을 얹고,
 * update(t, dt)로 포즈를 목표에 수렴 + 상태별 프로시저럴 모션을 더한다.
 */
export function createStudent(THREE, { paneId, kind, markers }) {
  const body = buildBody(THREE, paneId, kind);
  const root = new THREE.Group();
  root.add(body.group);

  const labelTex = makeCanvasTexture(THREE, 512, 144);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex.tex, transparent: true }));
  const LABEL_W = 1.02;
  const LABEL_H = 0.287;
  label.scale.set(LABEL_W, LABEL_H, 1);
  label.position.set(0, 1.78, 0.1);
  root.add(label);

  const makeMarker = (tex, scale, y) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(scale, scale, 1);
    sp.position.set(0.28, y, 0.15);
    sp.visible = false;
    root.add(sp);
    return sp;
  };
  const excl = makeMarker(markers.excl, 0.42, 1.55);
  const star = makeMarker(markers.star, 0.32, 1.45);
  const zzz = [makeMarker(markers.zzz, 0.22, 1.2), makeMarker(markers.zzz, 0.16, 1.35)];

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.44, 0.56, 40),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.015;
  root.add(ring);

  const hitbox = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 1.95, 1.2),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitbox.position.set(0, 0.97, 0.2);
  root.add(hitbox);

  const phase = (body.seed % 100) / 100 * Math.PI * 2;
  const state = { status: 'unknown', labelKey: '', flashUntil: 0, hover: false };

  const applyAgent = (agent) => {
    state.status = agent.status;
    const key = `${agent.name}|${agent.title}|${agent.status}`;
    if (key !== state.labelKey) {
      state.labelKey = key;
      drawStudentLabel(labelTex, agent);
    }
  };

  const update = (t, dt) => {
    const pose = POSES[state.status] ?? POSES.unknown;
    const s = state.status;
    // 목표치 = 기본 포즈 + 상태별 진동 모션
    let torsoX = pose.torso;
    let headX = pose.head;
    let headZ = 0;
    let lX = pose.lX;
    let lZ = pose.lZ;
    let rX = pose.rX;
    let rZ = pose.rZ;
    let bounce = 0;
    if (s === 'working') {
      rX += Math.sin(t * 11 + phase) * 0.1; // 필기 — 팔이 사각사각
      rZ += Math.cos(t * 11 + phase) * 0.08;
      headZ = Math.sin(t * 1.6 + phase) * 0.04;
      torsoX += Math.sin(t * 1.1 + phase) * 0.015; // 호흡
    } else if (s === 'idle') {
      torsoX += Math.sin(t * 1.0 + phase) * 0.025; // 엎드려 숨쉬기
      headZ = 0.35;
    } else if (s === 'blocked') {
      rZ = Math.sin(t * 9 + phase) * 0.42; // 손 흔들기
      rX += Math.sin(t * 18 + phase) * 0.06;
      headZ = Math.sin(t * 5 + phase) * 0.06;
      bounce = Math.abs(Math.sin(t * 5 + phase)) * 0.035; // 들썩들썩
    } else if (s === 'done') {
      lZ += Math.sin(t * 3 + phase) * 0.08;
      rZ -= Math.sin(t * 3 + phase) * 0.08;
      headZ = Math.sin(t * 2.4 + phase) * 0.08;
      bounce = Math.abs(Math.sin(t * 2.6 + phase)) * 0.02;
    } else {
      headZ = Math.sin(t * 0.8 + phase) * 0.05;
    }
    const k = 1 - Math.exp(-dt * 7); // 프레임률 무관 수렴
    body.torso.rotation.x += (torsoX - body.torso.rotation.x) * k;
    body.head.rotation.x += (headX - body.head.rotation.x) * k;
    body.head.rotation.z += (headZ - body.head.rotation.z) * k;
    body.armL.pivot.rotation.x += (lX - body.armL.pivot.rotation.x) * k;
    body.armL.pivot.rotation.z += (lZ - body.armL.pivot.rotation.z) * k;
    body.armR.pivot.rotation.x += (rX - body.armR.pivot.rotation.x) * k;
    body.armR.pivot.rotation.z += (rZ - body.armR.pivot.rotation.z) * k;
    body.group.position.y += (bounce - body.group.position.y) * k;

    body.pencil.visible = s === 'working';
    body.armL.thumb.visible = body.armR.thumb.visible = s === 'done';
    excl.visible = s === 'blocked';
    star.visible = s === 'done';
    if (s === 'blocked') {
      excl.position.y = 1.55 + Math.sin(t * 6 + phase) * 0.06;
      excl.material.rotation = Math.sin(t * 9 + phase) * 0.18;
    }
    if (s === 'done') star.material.rotation = t * 1.2;
    for (let i = 0; i < zzz.length; i++) {
      const sp = zzz[i];
      sp.visible = s === 'idle';
      if (sp.visible) {
        const ph = (t * 0.4 + phase + i * 0.45) % 1;
        sp.position.set(0.3 + ph * 0.18 + i * 0.08, 1.05 + ph * 0.5 + i * 0.12, 0.15);
        sp.material.opacity = ph < 0.2 ? ph / 0.2 : 1 - (ph - 0.2) / 0.8;
      }
    }

    // 경광 링 — blocked는 강하게 맥동, 그 외는 상태색 은은히
    const ringColor = STATUS_COLOR[s] ?? STATUS_COLOR.unknown;
    ring.material.color.setHex(ringColor);
    if (s === 'blocked') {
      const pulse = Math.sin(t * 6 + phase) * 0.5 + 0.5;
      ring.material.opacity = 0.3 + pulse * 0.5;
      ring.scale.setScalar(1 + pulse * 0.18);
    } else {
      ring.material.opacity = s === 'done' ? 0.4 : s === 'working' ? 0.22 : 0.08;
      ring.scale.setScalar(1);
    }

    // 전이 직후 라벨 팝 + 호버 확대
    const pop = state.flashUntil > t ? 1 + (state.flashUntil - t) * 0.35 : 1;
    const hoverScale = state.hover ? 1.12 : 1;
    label.scale.set(LABEL_W * pop * hoverScale, LABEL_H * pop * hoverScale, 1);
    body.hoodie.emissive.setHex(state.hover ? 0x333333 : 0x000000);
  };

  const dispose = () => {
    root.removeFromParent();
    labelTex.tex.dispose(); // 마커 글리프 텍스처는 학생 간 공유라 건드리지 않는다
    root.traverse((o) => {
      if (o.isMesh || o.isSprite) {
        o.geometry?.dispose?.();
        o.material?.dispose?.();
      }
    });
  };

  return { root, hitbox, state, applyAgent, update, dispose, headWorldY: 1.4 };
}
