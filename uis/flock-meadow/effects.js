/** 전이 연출 파티클 — fx-layer(고정 레이어)에 잠깐 살다 사라지는 스팬들. */

const PALETTE = {
  sparkle: ['#ffd766', '#fff3c2', '#ffb84d', '#ffe9a3'],
  dust: ['#c9a678', '#b28d5f', '#d8bd97'],
  pop: ['#ffffff', '#dff3ff', '#c8ecff'],
};

const layer = () => document.getElementById('fx-layer');

/** 요소 중심에서 type별 파티클을 터뜨린다. sparkle=✦ 글자, 나머지는 색점. */
export function burstAt(el, type, count = 10) {
  const host = layer();
  if (!host || !el.isConnected) return;
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const colors = PALETTE[type] ?? PALETTE.pop;

  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = `fx fx-${type}`;
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.7;
    const dist = 28 + Math.random() * 52;
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist - 24}px`);
    p.style.left = `${cx}px`;
    p.style.top = `${cy}px`;
    const color = colors[i % colors.length];
    if (type === 'sparkle') {
      p.textContent = '✦';
      p.style.color = color;
    } else {
      p.style.background = color;
    }
    host.appendChild(p);
    setTimeout(() => p.remove(), 1150);
  }
}

/** blocked 전이의 빨간 충격파 링. */
export function ringAt(el) {
  const host = layer();
  if (!host || !el.isConnected) return;
  const rect = el.getBoundingClientRect();
  const ring = document.createElement('span');
  ring.className = 'fx fx-ring';
  ring.style.left = `${rect.left + rect.width / 2}px`;
  ring.style.top = `${rect.top + rect.height / 2}px`;
  host.appendChild(ring);
  setTimeout(() => ring.remove(), 900);
}

/** 화면 가장자리 빨간 섬광 — blocked 전이 순간 한 번. */
export function flashAlert() {
  const meadow = document.getElementById('meadow');
  if (!meadow) return;
  meadow.classList.add('flash');
  setTimeout(() => meadow.classList.remove('flash'), 620);
}
