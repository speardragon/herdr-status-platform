/** 전이 연출 — fx-layer(고정 레이어)에 잠깐 살다 사라지는 파티클과 섬광. */

const PALETTE = {
  star: ['#ffd766', '#fff3c2', '#ffb84d', '#ffe9a3'],
  chalk: ['#ffffff', '#f2ecdd', '#e5dcc4'],
  pop: ['#ffffff', '#ffe9a3', '#c8ecff'],
};

const layer = () => document.getElementById('fx-layer');

const centerOf = (el) => {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
};

/** 요소 중심에서 type별 파티클을 터뜨린다. star=✦ 글자, 나머지는 색점. */
export function burstAt(el, type, count = 10) {
  const host = layer();
  if (!host || !el.isConnected) return;
  const { x, y } = centerOf(el);
  const colors = PALETTE[type] ?? PALETTE.pop;

  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = `fx fx-${type === 'star' ? 'star' : 'dot'}`;
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.7;
    const dist = 28 + Math.random() * 52;
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist - 26}px`);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    const color = colors[i % colors.length];
    if (type === 'star') {
      p.textContent = '✦';
      p.style.color = color;
    } else {
      p.style.background = color;
    }
    host.appendChild(p);
    setTimeout(() => p.remove(), 1150);
  }
}

/** done 전이 — 학생 위에 💯 도장이 쾅 찍힌다. */
export function stampAt(el) {
  const host = layer();
  if (!host || !el.isConnected) return;
  const { x, y } = centerOf(el);
  const stamp = document.createElement('span');
  stamp.className = 'fx-stamp';
  stamp.textContent = '💯';
  stamp.style.left = `${x}px`;
  stamp.style.top = `${y - 20}px`;
  host.appendChild(stamp);
  setTimeout(() => stamp.remove(), 900);
}

/** blocked 전이 — 화면 가장자리 앰버 섬광 한 번. */
let vignetteEl = null;
export function flashAmber() {
  const host = layer();
  if (!host) return;
  if (!vignetteEl) {
    vignetteEl = document.createElement('div');
    vignetteEl.className = 'vignette';
    host.appendChild(vignetteEl);
  }
  vignetteEl.classList.add('on');
  setTimeout(() => vignetteEl.classList.remove('on'), 500);
}
