/**
 * 학생 레이어 — 스냅샷과 DOM을 diff로 맞춘다.
 *
 * 노드를 매번 새로 만들지 않는 게 핵심이다. 그래야
 *  (1) 포즈 전환 트랜지션과 손 흔들기 같은 무한 애니메이션이 끊기지 않고
 *  (2) 자리 이동이 CSS transition으로 스르륵 이어진다.
 */
import { kidSvg, personaOf } from './kid.js';
import { esc, playOnce, trimText } from './util.js';

const LEAD = {
  working: '공부 중',
  idle: '엎드려 쉬는 중',
  blocked: '✋ 질문 있어요!',
  done: '✅ 다 했어요!',
  unknown: '어디 갔지?',
};

const FX = {
  working: 'fx-sit',
  idle: 'fx-slump',
  blocked: 'fx-ask',
  done: 'fx-cheer',
  unknown: 'fx-sit',
};

const POP_WORD = {
  blocked: { text: '저요! 저요!', tone: '' },
  done: { text: '다 했어요!', tone: 'good' },
  working: { text: '시작!', tone: 'good' },
};

const LEAVE_MS = 560;
const FX_MS = 900;
const POP_MS = 1200;
const TASK_MAX = 22;

const nameOf = (agent) => agent.name ?? agent.kind;

const buildElement = (agent) => {
  const el = document.createElement('div');
  el.className = 'student';
  el.dataset.pane = agent.paneId;
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.innerHTML =
    '<div class="spot"></div>' +
    `<div class="figure"><div class="hop">${kidSvg(personaOf(agent.paneId, agent.kind))}</div></div>` +
    `<div class="tag"><b></b><i></i></div>` +
    '<div class="bubble"><span class="lead"></span><span class="task"></span></div>';
  return el;
};

const applySeat = (el, seat) => {
  if (!seat) return;
  el.style.left = `${seat.x}%`;
  el.style.top = `${seat.y}%`;
  el.style.setProperty('--s', seat.scale.toFixed(3));
  el.style.zIndex = String(seat.z);
};

const applyAgent = (node, agent) => {
  const { el } = node;
  if (el.dataset.status !== agent.status) el.dataset.status = agent.status;
  const focused = String(agent.focused);
  if (el.dataset.focused !== focused) el.dataset.focused = focused;

  const lead = LEAD[agent.status] ?? LEAD.unknown;
  const task = trimText(agent.title, TASK_MAX) || '(무슨 일인지 비밀)';
  if (node.lead !== lead) {
    node.leadEl.textContent = lead;
    node.lead = lead;
  }
  if (node.task !== task) {
    node.taskEl.textContent = task;
    node.task = task;
    playOnce(node.bubbleEl, 'ping', 520);
  }
  const label = nameOf(agent);
  if (node.label !== label) {
    node.nameEl.textContent = label;
    node.kindEl.textContent = agent.name ? agent.kind : '';
    node.label = label;
  }
  el.setAttribute('aria-label', `${label} (${agent.kind}) — ${lead}, ${agent.title || '작업 없음'}. 눌러서 이 자리로 이동`);
};

/**
 * @param {HTMLElement} container `.students`
 * @param {(paneId: string) => void} onSelect 학생 선택 콜백
 */
export const createStudentLayer = (container, onSelect) => {
  const nodes = new Map();

  const select = (event) => {
    const el = event.target.closest('.student');
    if (el?.dataset.pane) onSelect(el.dataset.pane);
  };
  container.addEventListener('click', select);
  container.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    select(event);
  });

  const create = (agent) => {
    const el = buildElement(agent);
    const node = {
      el,
      leadEl: el.querySelector('.lead'),
      taskEl: el.querySelector('.task'),
      bubbleEl: el.querySelector('.bubble'),
      nameEl: el.querySelector('.tag b'),
      kindEl: el.querySelector('.tag i'),
      lead: null,
      task: null,
      label: null,
    };
    container.appendChild(el);
    nodes.set(agent.paneId, node);
    playOnce(el, 'fx-enter', 640);
    return node;
  };

  return {
    /** 스냅샷 기준으로 학생 목록·자리·포즈를 맞춘다. */
    sync(agents, seats) {
      const present = new Set();
      for (const agent of agents) {
        present.add(agent.paneId);
        const node = nodes.get(agent.paneId) ?? create(agent);
        node.el.classList.remove('leaving');
        applySeat(node.el, seats.get(agent.paneId));
        applyAgent(node, agent);
      }
      for (const [paneId, node] of nodes) {
        if (present.has(paneId) || node.el.classList.contains('leaving')) continue;
        node.el.classList.add('leaving');
        nodes.delete(paneId);
        setTimeout(() => node.el.remove(), LEAVE_MS);
      }
    },

    /** agent_status_changed 순간 연출 — 벌떡 손들기 / 만세 / 착석 / 엎드림. */
    playStatusChange(paneId, to) {
      const node = nodes.get(paneId);
      if (!node) return;
      playOnce(node.el, FX[to] ?? FX.unknown, FX_MS);
      const pop = POP_WORD[to];
      if (!pop) return;
      const word = document.createElement('span');
      word.className = `pop-word ${pop.tone}`;
      word.textContent = pop.text;
      node.el.appendChild(word);
      setTimeout(() => word.remove(), POP_MS);
    },

    /** 새로 등장/퇴장 이벤트의 부가 연출. */
    playArrival(paneId) {
      const node = nodes.get(paneId);
      if (node) playOnce(node.el, 'fx-enter', 640);
    },

    has: (paneId) => nodes.has(paneId),
    size: () => nodes.size,
  };
};

export const leadTextOf = (status) => LEAD[status] ?? LEAD.unknown;
export const escapeText = esc;
