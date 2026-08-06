/**
 * 학생 캐릭터 SVG.
 *
 * viewBox 0 0 100 132 — 바닥(y=132)이 발밑, 책상 앞판이 y 101 아래를 가린다.
 * 포즈 4종을 전부 그려두고 CSS(`[data-status]`)로 하나만 보여준다. 그래야 상태가 바뀔 때
 * DOM을 다시 만들 필요가 없고, 몸통 transform 트랜지션이 끊기지 않는다.
 *   working 공부  /  idle 엎드림  /  blocked 손들기  /  done 양손 따봉
 *
 * 레이어 순서가 중요하다: 의자 → 몸통·얼굴 → **책상** → 팔.
 * 팔을 책상 뒤에 두면 공부하는 손이 상판에 먹혀서 "가만히 앉아만 있는" 그림이 된다.
 * 그래서 팔은 책상 위에 얹고, 몸통과 같은 transform을 걸어 함께 움직이게 한다.
 */
import { hash01, pickBy } from './util.js';

const SKINS = ['#f9dcc0', '#f0c8a2', '#dda87c', '#c08a5c', '#94623c'];
const HAIRS = ['#2b2521', '#4a3524', '#6b4a2a', '#191716', '#7c5a35', '#3d2b2b'];
const SHIRTS = {
  claude: ['#8b6ad6', '#9d7ee6', '#7a5cc4'],
  codex: ['#1fa39a', '#2fb8a8', '#178c86'],
  default: ['#e0794a', '#ef8f5e', '#cf6a3c'],
};

export const personaOf = (paneId, kind) => ({
  skin: pickBy(paneId, SKINS, 1),
  hair: pickBy(paneId, HAIRS, 2),
  shirt: pickBy(paneId, SHIRTS[kind] ?? SHIRTS.default, 3),
  hairStyle: Math.floor(hash01(`${paneId}#4`) * 3),
});

const hairExtras = (style, hair) => {
  if (style === 1) {
    return `<rect x="32.5" y="44" width="7" height="17" rx="3.5" fill="${hair}"/>
      <rect x="60.5" y="44" width="7" height="17" rx="3.5" fill="${hair}"/>`;
  }
  if (style === 2) {
    return `<path d="M42 32 l2.5 -8 3.5 7 z" fill="${hair}"/>
      <path d="M50 30 l3 -9 3.5 8 z" fill="${hair}"/>
      <path d="M57 33 l3.5 -7 2 7.5 z" fill="${hair}"/>`;
  }
  return `<path d="M36 40 q14 -9 28 -1 l-1.5 -5 q-13 -6 -25 0 z" fill="${hair}" opacity="0.75"/>`;
};

const arm = (d, skin) =>
  `<path d="${d}" fill="none" stroke="${skin}" stroke-width="7.5" stroke-linecap="round"/>`;

/* ───────────── 얼굴·소품(몸통 레이어) ───────────── */

const faceWork = `
<g class="pose pose-work">
  <ellipse cx="44.6" cy="48.6" rx="1.7" ry="2.5" fill="#33302a"/>
  <ellipse cx="55.4" cy="48.6" rx="1.7" ry="2.5" fill="#33302a"/>
  <path d="M41.5 42.6 q3.2 -1.6 6.2 -0.2" stroke="#33302a" stroke-width="1.3" fill="none" stroke-linecap="round"/>
  <path d="M52.3 42.4 q3 -1.4 6.2 0.2" stroke="#33302a" stroke-width="1.3" fill="none" stroke-linecap="round"/>
  <path d="M46.6 55.4 q3.4 2.2 6.8 0" stroke="#8a5646" stroke-width="1.6" fill="none" stroke-linecap="round"/>
</g>`;

const faceIdle = `
<g class="pose pose-idle">
  <path d="M41.4 48.6 q3.2 3.4 6.2 0" stroke="#33302a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <path d="M52.4 48.6 q3.2 3.4 6.2 0" stroke="#33302a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <ellipse cx="50" cy="56" rx="2.2" ry="1.5" fill="#8a5646"/>
  <circle cx="62" cy="53" r="3.4" fill="#ff9a9a" opacity="0.5"/>
  <g class="zzz" style="animation-delay:0s"><text x="70" y="58" font-size="10" font-weight="700" fill="#6b7791" font-family="system-ui, sans-serif">z</text></g>
  <g class="zzz" style="animation-delay:0.8s"><text x="76" y="52" font-size="12" font-weight="700" fill="#6b7791" font-family="system-ui, sans-serif">z</text></g>
  <g class="zzz" style="animation-delay:1.6s"><text x="82" y="45" font-size="14" font-weight="700" fill="#6b7791" font-family="system-ui, sans-serif">z</text></g>
</g>`;

const faceAsk = `
<g class="pose pose-ask">
  <circle cx="44.6" cy="48" r="2.9" fill="#33302a"/>
  <circle cx="55.4" cy="48" r="2.9" fill="#33302a"/>
  <circle cx="45.4" cy="47.2" r="1" fill="#fff"/>
  <circle cx="56.2" cy="47.2" r="1" fill="#fff"/>
  <path d="M41 40.6 q3.4 -2.6 6.6 -0.6" stroke="#33302a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M52.4 40 q3.2 -2 6.6 0.6" stroke="#33302a" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <ellipse cx="50" cy="56.4" rx="3.4" ry="3.8" fill="#7a3b2f"/>
  <g class="ask-badge">
    <circle cx="24" cy="26" r="9.5" fill="#ffd23f" stroke="#f5361f" stroke-width="2.4"/>
    <text x="24" y="31" text-anchor="middle" font-size="13" font-weight="800" fill="#c22a11" font-family="system-ui, sans-serif">?</text>
  </g>
</g>`;

const faceDone = `
<g class="pose pose-done">
  <path d="M41.6 49.4 q3.4 -4.4 6.6 0" stroke="#33302a" stroke-width="1.9" fill="none" stroke-linecap="round"/>
  <path d="M51.8 49.4 q3.4 -4.4 6.6 0" stroke="#33302a" stroke-width="1.9" fill="none" stroke-linecap="round"/>
  <path d="M43.4 54.4 q6.6 6.6 13.2 0" stroke="#8a5646" stroke-width="1.9" fill="none" stroke-linecap="round"/>
  <circle cx="38" cy="55" r="3.2" fill="#ff9a9a" opacity="0.55"/>
  <circle cx="62" cy="55" r="3.2" fill="#ff9a9a" opacity="0.55"/>
  <g class="sparks" fill="#ffcf3d">
    <path d="M19 33 l1.8 4.6 4.6 1.8 -4.6 1.8 -1.8 4.6 -1.8 -4.6 -4.6 -1.8 4.6 -1.8 z"/>
    <path d="M83 29 l1.4 3.6 3.6 1.4 -3.6 1.4 -1.4 3.6 -1.4 -3.6 -3.6 -1.4 3.6 -1.4 z"/>
    <path d="M50 15 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6 z"/>
  </g>
</g>`;

const faceUnknown = `
<g class="pose pose-unknown">
  <circle cx="44.6" cy="48" r="1.6" fill="#33302a"/>
  <circle cx="55.4" cy="48" r="1.6" fill="#33302a"/>
  <path d="M44 56 h12" stroke="#8a5646" stroke-width="1.6" stroke-linecap="round"/>
  <text x="25" y="31" text-anchor="middle" font-size="15" font-weight="800" fill="#8b6ad6" font-family="system-ui, sans-serif">?</text>
</g>`;

/* ───────────── 팔(책상 위 레이어) ───────────── */

/** 공부: 왼손은 공책을 누르고, 오른손은 연필로 끄적인다. 둘 다 상판 위에 보여야 한다. */
const armsWork = (skin) => `
<g class="pose pose-work">
  ${arm('M36 76 Q29 84 35 88', skin)}
  <circle cx="35" cy="88" r="5" fill="${skin}"/>
  <g class="arm-write">
    ${arm('M64 76 Q72 82 64 87', skin)}
    <circle cx="64" cy="87" r="5" fill="${skin}"/>
    <path d="M67 84 L55 95" stroke="#e4b23c" stroke-width="3" stroke-linecap="round"/>
    <path d="M56 94 L53.4 96.4" stroke="#3b332c" stroke-width="3" stroke-linecap="round"/>
  </g>
</g>`;

/** 엎드림: 두 팔을 책상 위에 포개고 그 위에 얼굴을 얹는다. */
const armsIdle = (skin) => `
<g class="pose pose-idle">
  ${arm('M36 76 Q26 68 42 62', skin)}
  ${arm('M64 76 Q74 68 58 62', skin)}
  <circle cx="42" cy="62" r="4.6" fill="${skin}"/>
  <circle cx="58" cy="62" r="4.6" fill="${skin}"/>
</g>`;

/** 손들기: 오른팔이 viewBox 위로 솟는다(svg overflow: visible). 교실에서 가장 큰 실루엣. */
const armsAsk = (skin) => `
<g class="pose pose-ask">
  ${arm('M36 76 Q29 84 35 88', skin)}
  <circle cx="35" cy="88" r="5" fill="${skin}"/>
  <g class="arm-raise">
    ${arm('M64 76 Q78 44 82 6', skin)}
    <circle cx="82.5" cy="-1" r="7.5" fill="${skin}"/>
    <rect x="76.5" y="-12" width="3.6" height="10" rx="1.8" fill="${skin}"/>
    <rect x="80.8" y="-14" width="3.6" height="12" rx="1.8" fill="${skin}"/>
    <rect x="85.1" y="-11.5" width="3.6" height="10" rx="1.8" fill="${skin}"/>
    <path d="M92 -6 q5 2 5.5 8" stroke="#f5361f" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.9"/>
    <path d="M73 -8 q-5 2 -5.5 8" stroke="#f5361f" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.9"/>
  </g>
</g>`;

/** 따봉: 가슴 앞에서 주먹 두 개, 엄지만 위로 쭉. 바깥으로 살짝 기울여 엄지가 갈라져 보이게. */
const thumbsUp = (cx, tilt, skin) => `
<g transform="rotate(${tilt} ${cx} 70)">
  <circle cx="${cx}" cy="70" r="6.8" fill="${skin}"/>
  <rect x="${cx - 3}" y="54" width="6" height="15" rx="3" fill="${skin}"/>
  <path d="M${cx - 3.4} 62.6 q3.4 -2 6.8 0" stroke="rgba(120,70,40,0.32)" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  <path d="M${cx - 4.8} 69.4 h9.6" stroke="rgba(120,70,40,0.32)" stroke-width="1.2" stroke-linecap="round"/>
</g>`;

const armsDone = (skin) => `
<g class="pose pose-done">
  ${arm('M36 78 Q26 80 30 71', skin)}
  ${arm('M64 78 Q74 80 70 71', skin)}
  ${thumbsUp(30, -14, skin)}
  ${thumbsUp(70, 14, skin)}
</g>`;

const armsUnknown = (skin) => `
<g class="pose pose-unknown">
  ${arm('M36 76 Q30 84 36 89', skin)}
  ${arm('M64 76 Q70 84 64 89', skin)}
</g>`;

/* ───────────── 책상 · 의자 ───────────── */

/**
 * 앞판을 바닥까지 내린다 — 엎드린 자세에서 몸통이 책상 밑으로 삐져나오는 걸 막는 가림판.
 * 다리는 앞판 위에 어두운 홈으로 표현한다.
 */
const DESK = `
<g class="g-desk">
  <path d="M14 92 H86 L94 101 H6 Z" fill="#d7a86a"/>
  <path d="M14 92 H86 L88 94.4 H12 Z" fill="#e8bf85"/>
  <rect x="30" y="93" width="36" height="7.6" rx="1" fill="#fdfaf0" transform="skewX(-6)"/>
  <path class="pencil-line" d="M28 95.4 h30 M27 98 h26" stroke="#9bb4d6" stroke-width="1" fill="none"/>
  <rect x="4" y="101" width="92" height="31" rx="2" fill="#c1935a"/>
  <rect x="4" y="101" width="92" height="3" fill="#a97a45"/>
  <rect x="9" y="120" width="8" height="12" rx="1" fill="#a3743f"/>
  <rect x="83" y="120" width="8" height="12" rx="1" fill="#a3743f"/>
  <path d="M4 120 H96" stroke="rgba(120,80,40,0.28)" stroke-width="1"/>
</g>`;

const CHAIR = `
<g class="g-chair">
  <rect x="32" y="62" width="36" height="42" rx="7" fill="#8a6a4a"/>
  <rect x="36" y="66" width="28" height="34" rx="5" fill="#a5825c"/>
</g>`;

/** 학생 한 명의 SVG 문자열. 포즈 전환은 CSS가 담당한다. */
export const kidSvg = (persona) => {
  const { skin, hair, shirt, hairStyle } = persona;
  return `<svg class="kid" viewBox="0 0 100 132" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
  <ellipse cx="50" cy="129" rx="32" ry="4" fill="rgba(60,35,10,0.16)"/>
  ${CHAIR}
  <g class="g-body">
    <rect x="45" y="56" width="10" height="14" rx="4.5" fill="${skin}"/>
    <path d="M34 100 V80 a16 16 0 0 1 32 0 V100 Z" fill="${shirt}"/>
    <path d="M43 65 l7 7 7 -7 -3 -2 -4 4 -4 -4 z" fill="#ffffff" opacity="0.85"/>
    <circle cx="50" cy="44" r="16" fill="${hair}"/>
    <circle cx="34.4" cy="49" r="3.4" fill="${skin}"/>
    <circle cx="65.6" cy="49" r="3.4" fill="${skin}"/>
    <circle cx="50" cy="47" r="14.5" fill="${skin}"/>
    ${hairExtras(hairStyle, hair)}
    ${faceWork}
    ${faceIdle}
    ${faceAsk}
    ${faceDone}
    ${faceUnknown}
  </g>
  ${DESK}
  <g class="g-arms">
    ${armsWork(skin)}
    ${armsIdle(skin)}
    ${armsAsk(skin)}
    ${armsDone(skin)}
    ${armsUnknown(skin)}
  </g>
</svg>`;
};
