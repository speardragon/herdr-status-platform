/**
 * 학생 한 명 — 책상에 앉은 정면 뷰 SVG. 외모(머리·옷·피부)는 paneId 해시로
 * 결정되어 같은 에이전트는 항상 같은 얼굴을 가진다. 포즈 전환은 CSS 클래스가 담당.
 */

const SKINS = ['#ffdbac', '#f1c27d', '#e0ac69'];
const HAIRS = ['#2c222b', '#5a3825', '#8c5a2b', '#b06f2f', '#4a4e69'];
const SHIRTS = ['#e2574c', '#4a90d9', '#58b368', '#f2a54a', '#9b6dd6', '#3aa6a6'];

/** djb2 문자열 해시 — 외모 결정용. */
const hash = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
};

const HAIR_BACK = [
  '', // v0 짧은 머리
  '', // v1 더벅머리
  '<circle cx="45" cy="52" r="9"/><circle cx="95" cy="52" r="9"/>', // v2 양갈래
  '<path d="M46 32 Q42 58 50 62 L56 58 Q50 46 52 33 Z"/><path d="M94 32 Q98 58 90 62 L84 58 Q90 46 88 33 Z"/>', // v3 단발
];

const HAIR_FRONT = [
  'M48 42 Q48 14 70 14 Q92 14 92 42 Q86 25 70 25 Q54 25 48 42 Z',
  'M48 42 Q48 22 55 17 L57 8 L63 15 L70 6 L77 15 L83 8 L85 17 Q92 22 92 42 Q86 25 70 25 Q54 25 48 42 Z',
  'M48 42 Q48 14 70 14 Q92 14 92 42 Q86 25 70 25 Q54 25 48 42 Z',
  'M48 44 Q46 14 70 14 Q94 14 92 44 Q88 24 70 24 Q52 24 48 44 Z',
];

const studentSvg = (look) => `
<svg viewBox="0 0 140 158" aria-hidden="true">
  <ellipse class="seat-shadow" cx="70" cy="152" rx="52" ry="5"/>
  <g class="body-g">
    <path d="M42 104 Q42 76 58 70 L82 70 Q98 76 98 104 Z" fill="${look.shirt}"/>
    <path d="M58 70 L82 70 L78 78 L62 78 Z" fill="#fffdf5" opacity=".85"/>
    <rect x="64" y="55" width="12" height="15" rx="4" fill="${look.skin}"/>
  </g>
  <g class="head-g">
    <g fill="${look.hair}">${HAIR_BACK[look.hair_v]}</g>
    <circle cx="70" cy="40" r="21" fill="${look.skin}"/>
    <path d="${HAIR_FRONT[look.hair_v]}" fill="${look.hair}"/>
    <g class="eyes-open">
      <circle cx="61.5" cy="43" r="2.4" fill="#2a2119"/>
      <circle cx="78.5" cy="43" r="2.4" fill="#2a2119"/>
    </g>
    <g class="eyes-closed"><path d="M58 44 q3.5 2.6 7 0"/><path d="M75 44 q3.5 2.6 7 0"/></g>
    <g class="eyes-happy"><path d="M58 43 q3.5 -3 7 0"/><path d="M75 43 q3.5 -3 7 0"/></g>
    <path class="mouth-smile" d="M66 52 q4 3.4 8 0"/>
    <path class="mouth-grin" d="M62 51 q8 7.5 16 0" fill="#8c3b34"/>
    <ellipse class="mouth-open" cx="70" cy="53" rx="4.4" ry="5.4" fill="#8c3b34"/>
    <ellipse class="cheek" cx="55" cy="49" rx="3.6" ry="2.1"/>
    <ellipse class="cheek" cx="85" cy="49" rx="3.6" ry="2.1"/>
  </g>
  <g class="arm-l">
    <rect x="46" y="72" width="11" height="30" rx="5.5" fill="${look.shirt}"/>
    <circle cx="51.5" cy="103" r="6.2" fill="${look.skin}"/>
    <rect class="thumb" x="48.5" y="106" width="5.4" height="12" rx="2.7" fill="${look.skin}"/>
  </g>
  <g class="arm-r">
    <rect x="83" y="72" width="11" height="30" rx="5.5" fill="${look.shirt}"/>
    <circle cx="88.5" cy="103" r="6.2" fill="${look.skin}"/>
    <rect class="thumb" x="85.5" y="106" width="5.4" height="12" rx="2.7" fill="${look.skin}"/>
    <g class="pencil" transform="rotate(-42 88.5 103)">
      <rect x="86.7" y="88" width="3.6" height="17" rx="1" fill="#f2c94c"/>
      <path d="M86.7 105 L90.3 105 L88.5 110 Z" fill="#4a3524"/>
    </g>
  </g>
  <g class="arm-up">
    <rect x="83" y="24" width="11" height="52" rx="5.5" fill="${look.shirt}"/>
    <circle cx="88.5" cy="20" r="7.2" fill="${look.skin}"/>
    <path class="wave-line" d="M78 14 q-4 -3 -5 -8"/>
    <path class="wave-line" d="M99 14 q4 -3 5 -8"/>
  </g>
  <g class="desk-g">
    <path d="M14 106 L126 106 L118 132 L22 132 Z" class="desk-top"/>
    <path d="M22 132 L118 132 L116 140 L24 140 Z" class="desk-front"/>
    <rect x="30" y="140" width="6" height="15" class="desk-leg"/>
    <rect x="104" y="140" width="6" height="15" class="desk-leg"/>
    <g class="notebook">
      <path d="M50 110 L92 110 L88 126 L46 126 Z" fill="#fffdf5" stroke="#d8cfba"/>
      <line x1="69" y1="110" x2="67" y2="126" stroke="#d8cfba"/>
      <path class="scribble s1" d="M53 115 h11"/>
      <path class="scribble s2" d="M52 120 h12"/>
      <path class="scribble s3" d="M73 115 h12"/>
    </g>
  </g>
</svg>`;

const STATUS_CLASSES = ['st-working', 'st-idle', 'st-blocked', 'st-done', 'st-unknown'];
const STATUS_KO = {
  working: '열공 중',
  idle: '엎드려 잠',
  blocked: '질문 있어요!',
  done: '다 풀었어요',
  unknown: '행방불명',
};
const bubbleTimers = new WeakMap();

export function createStudentEl(agent) {
  const h = hash(agent.paneId);
  const look = {
    skin: SKINS[h % SKINS.length],
    hair: HAIRS[(h >> 3) % HAIRS.length],
    shirt: SHIRTS[(h >> 7) % SHIRTS.length],
    hair_v: (h >> 11) % HAIR_FRONT.length,
  };
  const el = document.createElement('div');
  el.className = `seat spawn st-${agent.status}`;
  el.dataset.pane = agent.paneId;
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.innerHTML = `
    <div class="bubble"></div>
    <div class="hand-badge">✋ <b class="hand-time"></b></div>
    <div class="stamp">💯</div>
    <div class="qmark">?</div>
    <span class="zzz">💤</span>
    ${studentSvg(look)}
    <div class="nametag"><span class="ws-dot"></span><span class="nm"></span></div>
    <div class="worksheet"></div>`;
  setTimeout(() => el.classList.remove('spawn'), 700);
  return el;
}

/** 워크스페이스 식별 색 — 명찰의 색점. */
export const wsColor = (workspaceId) => `hsl(${hash(workspaceId) % 360} 62% 52%)`;

/** 스냅샷의 agent 정보를 학생 DOM에 반영한다 (자리 배치는 app.js 소관). */
export function applyStudent(el, agent, wsLabel) {
  for (const cls of STATUS_CLASSES) el.classList.remove(cls);
  el.classList.add(`st-${agent.status}`);
  el.classList.toggle('focused', agent.focused);

  const label = agent.name ?? agent.kind;
  el.querySelector('.nm').textContent = agent.focused ? `👀 ${label}` : label;
  el.querySelector('.ws-dot').style.background = wsColor(agent.workspaceId);
  const sheet = el.querySelector('.worksheet');
  if (sheet.textContent !== agent.title) sheet.textContent = agent.title;
  el.title = [
    `${label} (${agent.kind}) — ${STATUS_KO[agent.status] ?? agent.status}`,
    `문제: ${agent.title}`,
    `분단: ${wsLabel} · pane ${agent.paneId}`,
    '클릭하면 herdr에서 이 학생 자리로 점프',
  ].join('\n');
  el.setAttribute('aria-label', `${label}, ${STATUS_KO[agent.status] ?? agent.status}, ${agent.title}`);
}

export function setHandTime(el, text) {
  const slot = el.querySelector('.hand-time');
  if (slot.textContent !== text) slot.textContent = text;
}

export function showBubble(el, text, { urgent = false, ms = 3400 } = {}) {
  const bubble = el.querySelector('.bubble');
  bubble.textContent = text;
  bubble.classList.toggle('urgent', urgent);
  bubble.classList.add('show');
  clearTimeout(bubbleTimers.get(el));
  bubbleTimers.set(el, setTimeout(() => bubble.classList.remove('show'), ms));
}
