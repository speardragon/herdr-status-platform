/**
 * 교실 셸 — 바닥·벽·창문·칠판·게시판·시계·교탁·소품 + 조명.
 * 좌표계: 미터. 학생들은 +Z(교탁·카메라 쪽)를 바라본다.
 */
import { makeCanvasTexture, woodFloorTexture, skyTexture, bulletinTexture, STATUS_LABEL } from './textures.js';

export const ROOM = { width: 10.8, depth: 11.4, height: 3.2 };

const box = (THREE, parent, material, [w, h, d], [x, y, z], { cast = false, receive = true } = {}) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  parent.add(mesh);
  return mesh;
};

const std = (THREE, color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, ...opts });

/* ── 칠판 판서 — 반 현황 + 최근 전이 이력 ── */
function drawChalk({ canvas, ctx, tex }, stats, lines) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#25503f';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    const x = (Math.sin(i * 12.99) * 0.5 + 0.5) * w;
    const y = (Math.sin(i * 47.31) * 0.5 + 0.5) * h;
    ctx.fillStyle = `rgba(230, 235, 220, ${0.015 + (i % 4) * 0.008})`;
    ctx.fillRect(x, y, 60 + (i % 7) * 22, 8);
  }
  const chalk = (text, x, y, font, color = 'rgba(238, 240, 228, 0.92)') => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  };
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  chalk('< 자율 코딩 시간 >', 52, 92, "700 62px 'Apple SD Gothic Neo', sans-serif");
  ctx.textAlign = 'right';
  const now = new Date();
  chalk(`${now.getMonth() + 1}월 ${now.getDate()}일`, w - 56, 88, "600 44px 'Apple SD Gothic Neo', sans-serif", 'rgba(238,240,228,0.75)');
  ctx.textAlign = 'left';
  ctx.strokeStyle = 'rgba(238, 240, 228, 0.55)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(48, 120);
  ctx.lineTo(w - 48, 116);
  ctx.stroke();

  const s = stats ?? { working: 0, idle: 0, blocked: 0, done: 0, total: 0 };
  const items = [
    [`공부중 ${s.working}`, 'rgba(150, 235, 178, 0.95)'],
    [`조는중 ${s.idle}`, 'rgba(210, 216, 222, 0.8)'],
    [`질문 ${s.blocked}`, 'rgba(255, 158, 142, 0.98)'],
    [`완료 ${s.done}`, 'rgba(255, 219, 128, 0.95)'],
  ];
  let x = 56;
  for (const [text, color] of items) {
    chalk(text, x, 196, "700 52px 'Apple SD Gothic Neo', sans-serif", color);
    ctx.font = "700 52px 'Apple SD Gothic Neo', sans-serif";
    x += ctx.measureText(text).width + 52;
  }
  let y = 274;
  for (const line of (lines ?? []).slice(0, 3)) {
    chalk(`· ${line}`, 64, y, "500 40px 'Apple SD Gothic Neo', sans-serif", 'rgba(232, 236, 224, 0.78)');
    y += 62;
  }
  ctx.textAlign = 'right';
  chalk('급훈: 막히면 손을 들자', w - 56, h - 40, "600 40px 'Apple SD Gothic Neo', sans-serif", 'rgba(255, 226, 150, 0.85)');
  tex.needsUpdate = true;
}

function drawClock({ canvas, ctx, tex }) {
  const r = canvas.width / 2;
  const d = new Date();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f8f5ea';
  ctx.beginPath();
  ctx.arc(r, r, r - 6, 0, 7);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#3a4148';
  ctx.stroke();
  ctx.strokeStyle = '#7c8790';
  ctx.lineWidth = 4;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(r + Math.sin(a) * (r - 14), r - Math.cos(a) * (r - 14));
    ctx.lineTo(r + Math.sin(a) * (r - 22), r - Math.cos(a) * (r - 22));
    ctx.stroke();
  }
  const hand = (frac, len, width, color) => {
    const a = frac * Math.PI * 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(r, r);
    ctx.lineTo(r + Math.sin(a) * len, r - Math.cos(a) * len);
    ctx.stroke();
  };
  hand(((d.getHours() % 12) + d.getMinutes() / 60) / 12, r * 0.45, 7, '#2c3238');
  hand(d.getMinutes() / 60, r * 0.68, 5, '#2c3238');
  hand(d.getSeconds() / 60, r * 0.76, 2.5, '#d64545');
  tex.needsUpdate = true;
}

/** 교실 전체를 만들어 scene에 붙이고, 갱신 핸들(chalk/clock)을 돌려준다. */
export function buildClassroom(THREE, scene) {
  const group = new THREE.Group();
  const halfW = ROOM.width / 2;
  const halfD = ROOM.depth / 2;

  /* 바닥 — 나무 마루 */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.width, ROOM.depth),
    new THREE.MeshStandardMaterial({ map: woodFloorTexture(THREE), roughness: 0.62, metalness: 0.05 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  /* 천장 */
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.depth), std(THREE, 0xe9e6dd, { roughness: 0.95 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM.height;
  group.add(ceiling);

  /* 벽 — 상단 크림 도장 + 하단 우드 징두리 */
  const wallMat = std(THREE, 0xded8c8);
  const wainscotMat = std(THREE, 0x9c7b52, { roughness: 0.7 });
  const wainscotH = 1.0;
  // 뒷벽(칠판 벽, 학생들 등 뒤 = -Z)
  box(THREE, group, wallMat, [ROOM.width, ROOM.height, 0.12], [0, ROOM.height / 2, -halfD]);
  box(THREE, group, wainscotMat, [ROOM.width, wainscotH, 0.14], [0, wainscotH / 2, -halfD + 0.01]);
  // 앞벽(카메라 등 뒤 = +Z)
  box(THREE, group, wallMat, [ROOM.width, ROOM.height, 0.12], [0, ROOM.height / 2, halfD]);
  // 오른쪽 벽(+X): 게시판·문·시계
  box(THREE, group, wallMat, [0.12, ROOM.height, ROOM.depth], [halfW, ROOM.height / 2, 0]);
  box(THREE, group, wainscotMat, [0.14, wainscotH, ROOM.depth], [halfW - 0.01, wainscotH / 2, 0]);

  /* 왼쪽 벽(-X): 창문 3개 — 기둥 사이 유리 */
  const winMat = std(THREE, 0xd8d2c2);
  const sillY = 0.95;
  const winH = 1.5;
  const winW = 2.1;
  const centers = [1.2, -1.3, -3.8];
  box(THREE, group, winMat, [0.12, sillY, ROOM.depth], [-halfW, sillY / 2, 0]); // 창 아래 벽
  const topH = ROOM.height - sillY - winH;
  box(THREE, group, winMat, [0.12, topH, ROOM.depth], [-halfW, sillY + winH + topH / 2, 0]); // 창 위 벽
  const frameMat = std(THREE, 0x8a8f96, { roughness: 0.4, metalness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xbfe2ff, transparent: true, opacity: 0.16, roughness: 0.08, metalness: 0.1 });
  const frontEdge = centers[0] + winW / 2;
  const backEdge = centers[centers.length - 1] - winW / 2;
  box(THREE, group, winMat, [0.12, winH, halfD - frontEdge], [-halfW, sillY + winH / 2, (frontEdge + halfD) / 2]);
  box(THREE, group, winMat, [0.12, winH, backEdge + halfD], [-halfW, sillY + winH / 2, (backEdge - halfD) / 2]);
  for (let i = 0; i < centers.length - 1; i++) {
    box(THREE, group, winMat, [0.12, winH, centers[i] - winW - centers[i + 1]], [-halfW, sillY + winH / 2, (centers[i] + centers[i + 1]) / 2]);
  }
  for (const cz of centers) {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), glassMat);
    glass.rotation.y = Math.PI / 2;
    glass.position.set(-halfW + 0.05, sillY + winH / 2, cz);
    group.add(glass);
    box(THREE, group, frameMat, [0.06, winH + 0.1, 0.06], [-halfW + 0.06, sillY + winH / 2, cz - winW / 2], { cast: true });
    box(THREE, group, frameMat, [0.06, winH + 0.1, 0.06], [-halfW + 0.06, sillY + winH / 2, cz + winW / 2], { cast: true });
    box(THREE, group, frameMat, [0.06, 0.06, winW], [-halfW + 0.06, sillY, cz], { cast: true });
    box(THREE, group, frameMat, [0.06, 0.06, winW], [-halfW + 0.06, sillY + winH, cz], { cast: true });
    box(THREE, group, frameMat, [0.05, 0.05, winW], [-halfW + 0.06, sillY + winH / 2, cz], { cast: true }); // 중간 살
    box(THREE, group, frameMat, [0.05, winH, 0.05], [-halfW + 0.06, sillY + winH / 2, cz], { cast: true });
  }

  /* 창밖 하늘 — 큰 밝은 판 (조명 무관) */
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.depth * 1.8, ROOM.height * 2.6),
    new THREE.MeshBasicMaterial({ map: skyTexture(THREE) }),
  );
  sky.rotation.y = Math.PI / 2;
  sky.position.set(-halfW - 2.4, 1.6, 0);
  group.add(sky);

  /* 칠판 — 뒷벽(-Z), 카메라 정면. 판서는 CanvasTexture. */
  const chalkTex = makeCanvasTexture(THREE, 1280, 512);
  const boardW = 5.2;
  const boardH = 1.35;
  box(THREE, group, std(THREE, 0x6d4f2e, { roughness: 0.6 }), [boardW + 0.16, boardH + 0.16, 0.06], [0, 1.62, -halfD + 0.08]);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(boardW, boardH),
    new THREE.MeshStandardMaterial({ map: chalkTex.tex, roughness: 0.92 }),
  );
  board.position.set(0, 1.62, -halfD + 0.115);
  group.add(board);
  box(THREE, group, std(THREE, 0x6d4f2e), [boardW + 0.16, 0.05, 0.14], [0, 0.9, -halfD + 0.14], { cast: true }); // 분필 받침
  box(THREE, group, std(THREE, 0xf2efe4), [0.09, 0.02, 0.02], [-0.7, 0.93, -halfD + 0.15]);
  box(THREE, group, std(THREE, 0xf5d9d9), [0.09, 0.02, 0.02], [0.4, 0.93, -halfD + 0.15]);

  /* 오른쪽 벽 — 게시판·시계·문 */
  const bulletin = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.45),
    new THREE.MeshStandardMaterial({ map: bulletinTexture(THREE), roughness: 0.9 }),
  );
  bulletin.rotation.y = -Math.PI / 2;
  bulletin.position.set(halfW - 0.07, 1.7, -1.4);
  group.add(bulletin);
  const clockTex = makeCanvasTexture(THREE, 160, 160);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.26, 40), new THREE.MeshBasicMaterial({ map: clockTex.tex, transparent: true }));
  clock.rotation.y = -Math.PI / 2;
  clock.position.set(halfW - 0.07, 2.55, -1.4);
  group.add(clock);
  box(THREE, group, std(THREE, 0x7a5a38, { roughness: 0.55 }), [0.08, 2.15, 1.0], [halfW - 0.05, 1.075, 2.6], { cast: true }); // 미닫이문
  box(THREE, group, std(THREE, 0xcfd6dd, { roughness: 0.3 }), [0.1, 0.5, 0.28], [halfW - 0.09, 1.45, 2.35]);
  box(THREE, group, std(THREE, 0x2f353b, { roughness: 0.4 }), [0.04, 0.18, 0.04], [halfW - 0.12, 1.05, 2.25]);

  /* 교탁(연단) — 카메라 바로 앞 오른쪽 하단, 1인칭 전경 */
  const podiumMat = std(THREE, 0x8a6844, { roughness: 0.55 });
  box(THREE, group, podiumMat, [0.85, 0.06, 0.55], [0.95, 1.02, 3.42], { cast: true });
  box(THREE, group, podiumMat, [0.72, 0.98, 0.44], [0.95, 0.51, 3.42], { cast: true });
  box(THREE, group, std(THREE, 0xf5f2e6), [0.3, 0.015, 0.4], [0.83, 1.055, 3.4], { cast: true }); // 출석부
  box(THREE, group, std(THREE, 0xd64545), [0.012, 0.012, 0.15], [1.2, 1.06, 3.42], { cast: true }); // 빨간펜

  /* 뒷벽 소품 — 사물함·화분·책꽂이 */
  const lockerMat = std(THREE, 0xa8b6c2, { roughness: 0.5, metalness: 0.2 });
  for (let i = 0; i < 3; i++) {
    box(THREE, group, lockerMat, [0.9, 0.85, 0.4], [-halfW + 1.0 + i * 0.98, 0.425, -halfD + 0.32], { cast: true });
    box(THREE, group, std(THREE, 0x93a2af), [0.86, 0.02, 0.38], [-halfW + 1.0 + i * 0.98, 0.44, -halfD + 0.33]);
  }
  const potMat = std(THREE, 0xb5623a);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.32, 14), potMat);
  pot.position.set(halfW - 0.6, 0.16, -halfD + 0.6);
  pot.castShadow = true;
  group.add(pot);
  const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), std(THREE, 0x3e7d46, { roughness: 0.9 }));
  leaves.scale.set(1, 1.35, 1);
  leaves.position.set(halfW - 0.6, 0.85, -halfD + 0.6);
  leaves.castShadow = true;
  group.add(leaves);

  /* 천장 형광등 — 발광 박스 */
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6da, emissiveIntensity: 1.6, roughness: 0.4 });
  for (const lx of [-2.6, 2.6]) {
    for (const lz of [2.4, -0.4, -3.2]) {
      box(THREE, group, lampMat, [0.24, 0.05, 1.5], [lx, ROOM.height - 0.04, lz], { receive: false });
    }
  }

  scene.add(group);

  /* ── 조명 ── */
  const hemi = new THREE.HemisphereLight(0xfdf3e0, 0x8f7f68, 0.92);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.5);
  sun.position.set(-7.5, 6.2, 2.2);
  sun.target.position.set(2.5, 0, -1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -9;
  sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9;
  sun.shadow.camera.bottom = -9;
  sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  for (const [px, pz] of [[-2.6, 1.2], [2.6, -2.0]]) {
    const p = new THREE.PointLight(0xfff3dd, 9, 13, 1.7);
    p.position.set(px, ROOM.height - 0.35, pz);
    scene.add(p);
  }

  const state = { stats: null, lines: [] };
  drawChalk(chalkTex, state.stats, state.lines);
  drawClock(clockTex);

  return {
    group,
    /** 칠판 판서 갱신 — stats/전이 이력이 바뀔 때만 호출. */
    updateChalk(stats, transitionLines) {
      state.stats = stats;
      state.lines = transitionLines;
      drawChalk(chalkTex, stats, transitionLines);
    },
    /** 1초마다 호출 — 벽시계. */
    tickClock() {
      drawClock(clockTex);
    },
  };
}

export { STATUS_LABEL };
