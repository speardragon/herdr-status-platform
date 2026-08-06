/**
 * 절차적 CanvasTexture 공장 — 외부 이미지 없이 실사풍 재질감을 만든다.
 * (플랫폼에 빌드/에셋 파이프라인이 없으므로 모든 텍스처는 런타임 캔버스 생성.)
 */

/** 캔버스 + 2D 컨텍스트 + 연결된 CanvasTexture 한 묶음. */
export function canvasTexture(THREE, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D 캔버스 컨텍스트를 만들 수 없어요 (CanvasTexture 생성 실패)');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, ctx, texture };
}

const noise = (ctx, width, height, amount, alpha) => {
  for (let i = 0; i < amount; i++) {
    const gray = 120 + Math.random() * 135;
    ctx.fillStyle = `rgba(${gray},${gray - 8},${gray - 20},${alpha})`;
    ctx.fillRect(Math.random() * width, Math.random() * height, 1 + Math.random() * 2, 1);
  }
};

/** 교실 바닥 — 마루 널 + 결. */
export function floorTexture(THREE) {
  const { ctx, texture } = canvasTexture(THREE, 512, 512);
  ctx.fillStyle = '#c39a68';
  ctx.fillRect(0, 0, 512, 512);
  for (let plank = 0; plank < 8; plank++) {
    const y = plank * 64;
    ctx.fillStyle = `rgba(${168 + Math.random() * 30},${126 + Math.random() * 24},${82 + Math.random() * 20},0.55)`;
    ctx.fillRect(0, y, 512, 62);
    ctx.strokeStyle = 'rgba(90,60,32,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y + 63);
    ctx.lineTo(512, y + 63);
    ctx.stroke();
    for (let grain = 0; grain < 26; grain++) {
      ctx.strokeStyle = `rgba(120,82,46,${0.05 + Math.random() * 0.12})`;
      ctx.lineWidth = 1;
      const gy = y + 6 + Math.random() * 50;
      ctx.beginPath();
      ctx.moveTo(Math.random() * 512, gy);
      ctx.bezierCurveTo(160, gy + 4, 340, gy - 4, 512, gy + 2);
      ctx.stroke();
    }
  }
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 6);
  return texture;
}

/** 벽 — 미세 얼룩이 있는 도장면. */
export function wallTexture(THREE) {
  const { ctx, texture } = canvasTexture(THREE, 256, 256);
  ctx.fillStyle = '#e9e3d5';
  ctx.fillRect(0, 0, 256, 256);
  noise(ctx, 256, 256, 2600, 0.055);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 1);
  return texture;
}

/** 책상 상판 — 밝은 라미네이트 + 낙서 자국. */
export function deskTexture(THREE) {
  const { ctx, texture } = canvasTexture(THREE, 256, 128);
  ctx.fillStyle = '#dfc59d';
  ctx.fillRect(0, 0, 256, 128);
  for (let grain = 0; grain < 40; grain++) {
    ctx.strokeStyle = `rgba(158,116,72,${0.05 + Math.random() * 0.1})`;
    ctx.lineWidth = 1;
    const y = Math.random() * 128;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y + (Math.random() - 0.5) * 6);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(70,90,140,0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(190, 40, 14, 0.4, 4.6);
  ctx.stroke();
  return texture;
}

/** 창밖 배경 — 하늘 그라데이션 + 나무·건물 실루엣. 창을 통한 깊이감의 핵심. */
export function outsideTexture(THREE) {
  const { ctx, texture } = canvasTexture(THREE, 512, 256);
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#7fb4e8');
  sky.addColorStop(0.55, '#cfe4f5');
  sky.addColorStop(0.72, '#e8eedd');
  sky.addColorStop(1, '#9fb37a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const cloud of [[70, 48, 34], [190, 34, 22], [360, 56, 40], [460, 40, 24]]) {
    ctx.beginPath();
    ctx.ellipse(cloud[0], cloud[1], cloud[2], cloud[2] * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(120,138,150,0.5)';
  ctx.fillRect(30, 120, 70, 60);
  ctx.fillRect(410, 132, 84, 48);
  for (let tree = 0; tree < 9; tree++) {
    const x = 40 + tree * 56 + Math.random() * 14;
    const height = 52 + Math.random() * 38;
    ctx.fillStyle = 'rgba(58,88,52,0.9)';
    ctx.beginPath();
    ctx.ellipse(x, 182 - height * 0.4, 26, height * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(74,56,38,0.9)';
    ctx.fillRect(x - 4, 182 - height * 0.1, 8, height * 0.35);
  }
  ctx.fillStyle = '#8fa26a';
  ctx.fillRect(0, 200, 512, 56);
  return texture;
}

/** 창에서 쏟아지는 빛 기둥용 알파 그라데이션. */
export function shaftTexture(THREE) {
  const { ctx, texture } = canvasTexture(THREE, 64, 128);
  const gradient = ctx.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, 'rgba(255,246,214,0.55)');
  gradient.addColorStop(0.5, 'rgba(255,244,206,0.2)');
  gradient.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 128);
  const sides = ctx.createLinearGradient(0, 0, 64, 0);
  sides.addColorStop(0, 'rgba(0,0,0,0.85)');
  sides.addColorStop(0.2, 'rgba(0,0,0,0)');
  sides.addColorStop(0.8, 'rgba(0,0,0,0)');
  sides.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = sides;
  ctx.fillRect(0, 0, 64, 128);
  ctx.globalCompositeOperation = 'source-over';
  return texture;
}

/** 부드러운 원형 알파 — 먼지·컨페티·후광 스프라이트 공용. */
export function glowTexture(THREE) {
  const { ctx, texture } = canvasTexture(THREE, 64, 64);
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return texture;
}

/** 글리프 스프라이트(zzz의 'z' 등) — 소프트 광원 블롭보다 의미가 즉시 읽힌다. */
export function letterTexture(THREE, letter) {
  const { ctx, texture } = canvasTexture(THREE, 128, 128);
  ctx.font = '800 104px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(20,30,60,0.55)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#eef3ff';
  ctx.fillText(letter, 64, 68);
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(70,100,180,0.9)';
  ctx.strokeText(letter, 64, 68);
  return texture;
}

/** PMREMGenerator용 하늘↔바닥 그라데이션 — 표준 재질에 값싼 IBL을 준다. */
export function environmentTexture(THREE) {
  const { ctx, texture } = canvasTexture(THREE, 128, 64);
  const gradient = ctx.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, '#eef4fb');
  gradient.addColorStop(0.45, '#dfe7ee');
  gradient.addColorStop(0.55, '#c8b899');
  gradient.addColorStop(1, '#8d7856');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 64);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}
