/** 보더콜리 — herdr가 지금 보고 있는 pane(포커스)의 양 옆으로 달려간다. */

const DOG_SVG = `
<svg viewBox="0 0 92 62" aria-hidden="true">
  <ellipse class="s-shadow" cx="46" cy="58" rx="26" ry="4"/>
  <g class="d-root">
    <path class="d-tail" d="M12 28 q-10 -8 -8 -18 q7 6 13 12 z"/>
    <g class="d-legs">
      <rect class="d-leg l1" x="24" y="38" width="5.5" height="19" rx="2.5"/>
      <rect class="d-leg l2" x="34" y="38" width="5.5" height="19" rx="2.5"/>
      <rect class="d-leg l3" x="48" y="38" width="5.5" height="19" rx="2.5"/>
      <rect class="d-leg l4" x="58" y="38" width="5.5" height="19" rx="2.5"/>
    </g>
    <ellipse class="d-body" cx="43" cy="32" rx="24" ry="13"/>
    <ellipse class="d-chest" cx="52" cy="37" rx="10" ry="7"/>
    <g class="d-head">
      <path class="d-ear" d="M62 8 l7 12 -12 2 z"/>
      <path class="d-ear" d="M82 10 l3 12 -11 -1 z"/>
      <ellipse class="d-head" cx="72" cy="20" rx="13" ry="11"/>
      <path class="d-blaze" d="M70 10 q4 8 3 20 l-7 -2 q0 -10 4 -18 z"/>
      <circle class="d-eye" cx="67" cy="18" r="2.6"/>
      <circle class="s-eye" cx="67.6" cy="18.4" r="1.3"/>
      <circle class="d-eye" cx="78" cy="18" r="2.6"/>
      <circle class="s-eye" cx="78.6" cy="18.4" r="1.3"/>
      <ellipse class="d-leg" cx="83" cy="26" rx="3.4" ry="2.6"/>
    </g>
  </g>
</svg>`;

export function createDogEl() {
  const el = document.createElement('div');
  el.className = 'dog flip'; // 기본 자세는 왼쪽(대기 위치)을 본다
  el.innerHTML = `${DOG_SVG}<div class="dog-tag">🐕 herdr</div>`;
  el.style.left = '26px';
  el.style.top = '120px';
  return el;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
let runTimer = null;

/**
 * 개를 목표 양 옆(왼쪽)으로 이동시킨다. targetEl이 없으면 언덕(좌상단) 대기 위치로.
 * pasture는 스크롤 컨테이너이자 개의 offset parent다.
 */
export function placeDog(dogEl, pastureEl, targetEl) {
  const pr = pastureEl.getBoundingClientRect();
  let x = 26;
  let y = Math.max(90, pr.height * 0.18);
  if (targetEl && targetEl.isConnected) {
    const tr = targetEl.getBoundingClientRect();
    x = tr.left - pr.left + pastureEl.scrollLeft - 54;
    y = tr.top - pr.top + pastureEl.scrollTop + tr.height - 50;
    x = clamp(x, 4, Math.max(4, pastureEl.scrollWidth - 72));
    y = clamp(y, 60, Math.max(60, pastureEl.scrollHeight - 60));
  }

  const prevX = parseFloat(dogEl.style.left) || 0;
  const prevY = parseFloat(dogEl.style.top) || 0;
  const dist = Math.hypot(x - prevX, y - prevY);
  if (dist < 6) return;

  dogEl.classList.toggle('flip', x < prevX);
  dogEl.style.left = `${x}px`;
  dogEl.style.top = `${y}px`;
  if (dist > 40) {
    dogEl.classList.add('running');
    clearTimeout(runTimer);
    runTimer = setTimeout(() => dogEl.classList.remove('running'), 1350);
  }
}
