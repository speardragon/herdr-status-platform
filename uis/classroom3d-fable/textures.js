/**
 * CanvasTexture 헬퍼 — 바닥 나무결·창밖 하늘·게시판·학생 라벨·글리프 스프라이트.
 * three 인스턴스는 호출부에서 주입받는다 (벤더 모듈 단일 로드 보장).
 */

export function makeCanvasTexture(THREE, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { canvas, ctx, tex };
}

/** 마룻바닥 — 판자 결·명도 편차·미세 스크래치. */
export function woodFloorTexture(THREE) {
  const { canvas, ctx, tex } = makeCanvasTexture(THREE, 512, 512);
  const plankH = 64;
  for (let row = 0; row < canvas.height / plankH; row++) {
    const offset = (row % 2) * 170;
    for (let x = -170; x < canvas.width; x += 256) {
      const hue = 30 + Math.sin(row * 3.7 + x) * 4;
      const light = 58 + Math.sin(row * 12.9 + x * 0.53) * 6;
      ctx.fillStyle = `hsl(${hue}, 34%, ${light}%)`;
      ctx.fillRect(x + offset, row * plankH, 254, plankH - 2);
      ctx.fillStyle = 'rgba(80, 50, 20, 0.35)';
      ctx.fillRect(x + offset, row * plankH + plankH - 2, 254, 2);
      ctx.fillRect(x + offset + 254, row * plankH, 2, plankH);
    }
    for (let i = 0; i < 26; i++) {
      const gx = Math.sin(row * 91 + i * 37.3) * 0.5 + 0.5;
      const gy = Math.sin(row * 17 + i * 71.9) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(96, 62, 30, ${0.05 + gy * 0.08})`;
      ctx.fillRect(gx * canvas.width, row * plankH + gy * plankH, 30 + gx * 60, 1.4);
    }
  }
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

/** 창밖 풍경 — 하늘 그라데이션 + 원경 실루엣. MeshBasic으로 항상 밝게. */
export function skyTexture(THREE) {
  const { canvas, ctx, tex } = makeCanvasTexture(THREE, 512, 256);
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#8ec8f5');
  grad.addColorStop(0.55, '#cfe8fb');
  grad.addColorStop(0.72, '#f1ead1');
  grad.addColorStop(1, '#a8c58a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  for (const [cx, cy, r] of [[90, 60, 26], [130, 52, 34], [175, 62, 24], [360, 40, 20], [400, 34, 28], [440, 44, 18]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 7);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(90, 120, 90, 0.9)';
  for (let x = 0; x < canvas.width; x += 34) {
    const h = 22 + Math.sin(x * 1.3) * 12;
    ctx.beginPath();
    ctx.arc(x, 186, h, 0, 7);
    ctx.fill();
  }
  return tex;
}

/** 게시판 — 코르크 바탕에 색색 게시물. */
export function bulletinTexture(THREE) {
  const { canvas, ctx, tex } = makeCanvasTexture(THREE, 512, 288);
  ctx.fillStyle = '#b98f5e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 900; i++) {
    const x = (Math.sin(i * 12.9898) * 0.5 + 0.5) * canvas.width;
    const y = (Math.sin(i * 78.233) * 0.5 + 0.5) * canvas.height;
    ctx.fillStyle = `rgba(120, 84, 44, ${0.12 + (i % 5) * 0.03})`;
    ctx.fillRect(x, y, 2, 2);
  }
  const papers = [
    ['#fdf6e3', 28, 30, 120, 96, -0.05], ['#ffd8d8', 176, 24, 108, 132, 0.06],
    ['#d8ecff', 310, 40, 128, 92, -0.03], ['#e6ffd8', 60, 152, 132, 104, 0.04],
    ['#fff3c4', 224, 176, 112, 84, -0.06], ['#f3ddff', 356, 156, 116, 108, 0.05],
  ];
  for (const [color, x, y, w, h, rot] of papers) {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(rot);
    ctx.fillStyle = 'rgba(60, 40, 20, 0.3)';
    ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = 'rgba(70, 80, 100, 0.55)';
    for (let line = 0; line < Math.floor(h / 22) - 1; line++) {
      ctx.fillRect(-w / 2 + 10, -h / 2 + 18 + line * 20, w - 26 - (line % 3) * 14, 4);
    }
    ctx.fillStyle = '#d64545';
    ctx.beginPath();
    ctx.arc(0, -h / 2 + 7, 5, 0, 7);
    ctx.fill();
    ctx.restore();
  }
  return tex;
}

const truncate = (text, max) => {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

export const STATUS_LABEL = {
  working: '공부중', idle: '조는중', blocked: '질문!!', done: '완료', unknown: '???',
};
export const STATUS_CSS = {
  working: '#35c26a', idle: '#93a0ac', blocked: '#ff5d4f', done: '#f3b53a', unknown: '#a98ae8',
};

/** 머리 위 빌보드 — 이름·상태·현재 작업(title) 2줄. 상태색 테두리. */
export function drawStudentLabel({ canvas, ctx, tex }, { name, kind, status, title }) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const accent = STATUS_CSS[status] ?? STATUS_CSS.unknown;
  ctx.fillStyle = 'rgba(16, 20, 27, 0.86)';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(4, 4, w - 8, h - 8, 22);
  ctx.fill();
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(36, 42, 11, 0, 7);
  ctx.fill();
  ctx.font = "700 38px 'Apple SD Gothic Neo', system-ui, sans-serif";
  ctx.fillStyle = '#f3f6fa';
  const displayName = truncate(name || kind, 14);
  ctx.fillText(displayName, 58, 44);
  const nameW = ctx.measureText(displayName).width;
  ctx.font = "600 26px 'Apple SD Gothic Neo', system-ui, sans-serif";
  ctx.fillStyle = accent;
  ctx.fillText(STATUS_LABEL[status] ?? status, 58 + nameW + 18, 46);

  ctx.font = "500 28px 'Apple SD Gothic Neo', system-ui, sans-serif";
  ctx.fillStyle = '#aeb9c6';
  ctx.fillText(truncate(title || '…', 28), 36, 96);
  tex.needsUpdate = true;
}

/** 글자 하나짜리 스프라이트 텍스처 ('!', 'z', '★' 등). */
export function glyphTexture(THREE, glyph, color, px = 96) {
  const { canvas, ctx, tex } = makeCanvasTexture(THREE, 128, 128);
  ctx.font = `900 ${px}px 'Apple SD Gothic Neo', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;
  ctx.fillText(glyph, 64, 70);
  tex.needsUpdate = true;
  return tex;
}
