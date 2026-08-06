/** 양 한 마리 — DOM 생성, 상태 반영, 말풍선. 위치·이동 계획은 app.js가 담당한다. */

const SHEEP_SVG = `
<svg viewBox="0 0 116 84" aria-hidden="true">
  <ellipse class="s-shadow" cx="56" cy="79" rx="33" ry="5"/>
  <g class="s-root">
    <g class="s-legs">
      <rect class="s-leg l1" x="32" y="52" width="6.5" height="25" rx="3"/>
      <rect class="s-leg l2" x="44" y="52" width="6.5" height="25" rx="3"/>
      <rect class="s-leg l3" x="58" y="52" width="6.5" height="25" rx="3"/>
      <rect class="s-leg l4" x="70" y="52" width="6.5" height="25" rx="3"/>
    </g>
    <g class="s-body">
      <circle class="s-tail" cx="27" cy="34" r="8"/>
      <circle class="s-fluff" cx="55" cy="40" r="24"/>
      <circle class="s-fluff" cx="34" cy="45" r="14"/>
      <circle class="s-fluff" cx="76" cy="45" r="14"/>
      <circle class="s-fluff" cx="38" cy="28" r="13"/>
      <circle class="s-fluff" cx="70" cy="27" r="13"/>
      <circle class="s-fluff" cx="54" cy="23" r="14"/>
    </g>
    <g class="s-head">
      <ellipse class="s-ear" cx="83" cy="21" rx="9" ry="4.5" transform="rotate(-24 83 21)"/>
      <ellipse class="s-face" cx="93" cy="30" rx="13" ry="11"/>
      <ellipse class="s-ear" cx="82" cy="30" rx="8" ry="4" transform="rotate(14 82 30)"/>
      <circle class="s-fluff" cx="86" cy="17" r="8"/>
      <circle class="s-eye" cx="96" cy="27" r="2.1"/>
      <path class="s-lid" d="M92.5 27.5 q3.5 3 7 0"/>
      <ellipse class="s-cheek" cx="98" cy="33" rx="3.4" ry="2.2"/>
    </g>
  </g>
</svg>`;

const STATUS_CLASSES = ['st-working', 'st-idle', 'st-blocked', 'st-done', 'st-unknown'];
const bubbleTimers = new WeakMap();

export function createSheepEl(agent) {
  const el = document.createElement('div');
  el.className = `sheep spawn st-${agent.status}`;
  el.dataset.pane = agent.paneId;
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.innerHTML = `
    <div class="bubble"></div>
    <div class="alarm">🆘 <b class="alarm-time"></b></div>
    <div class="medal">🏅</div>
    <div class="qmark">?</div>
    <span class="zzz">💤</span>
    ${SHEEP_SVG}
    <div class="nametag"><span class="nm"></span><span class="kind"></span></div>`;
  setTimeout(() => el.classList.remove('spawn'), 700);
  return el;
}

const STATUS_KO = {
  working: '풀 뜯는 중',
  idle: '낮잠',
  blocked: '구조 요청!',
  done: '황금 양털',
  unknown: '행방불명',
};

/** 스냅샷의 agent 정보를 양 DOM에 반영한다. 위치는 건드리지 않는다. */
export function applySheep(el, agent) {
  for (const cls of STATUS_CLASSES) el.classList.remove(cls);
  el.classList.add(`st-${agent.status}`);
  el.classList.toggle('focused', agent.focused);
  if (agent.status !== 'working') el.classList.remove('walking', 'grazing');

  const label = agent.name ?? agent.kind;
  el.querySelector('.nametag .nm').textContent = agent.focused ? `👁 ${label}` : label;
  el.querySelector('.nametag .kind').textContent = agent.name ? `· ${agent.kind}` : '';
  el.title = `${label} (${agent.kind}) — ${STATUS_KO[agent.status] ?? agent.status}\n${agent.title}\npane ${agent.paneId} · 클릭하면 herdr에서 점프`;
  el.setAttribute('aria-label', `${label}, ${STATUS_KO[agent.status] ?? agent.status}, ${agent.title}`);
}

/** blocked 배지의 경과 시간 갱신용. */
export function setAlarmTime(el, text) {
  const slot = el.querySelector('.alarm-time');
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
