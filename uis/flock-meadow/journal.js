/** 목장 일지 — PlatformEvent를 목장 어투 문장으로 바꿔 피드에 쌓는다. */

const MAX_ENTRIES = 60;

/** 한글 받침 유무로 이/가 조사 선택. 비한글(영문 이름 등)은 '가'로 통일. */
const josa = (word) => {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return '가';
  return (code - 0xac00) % 28 === 0 ? '가' : '이';
};

const who = (e) => e.name ?? `${e.kind} ${e.paneId}`;

const STATUS_LINES = {
  working: (w, e) => ({ cls: 'ev-working', text: `🌿 ${w}${josa(w)} 다시 풀을 뜯어요 — ${e.title}` }),
  idle: (w) => ({ cls: '', text: `💤 ${w}${josa(w)} 낮잠에 들었어요` }),
  blocked: (w, e) => ({ cls: 'ev-blocked', text: `🆘 ${w}${josa(w)} 울타리에 걸렸어요!! — ${e.title}` }),
  done: (w, e) => ({ cls: 'ev-done', text: `🏅 ${w}${josa(w)} 황금 양털이 됐어요 — ${e.title}` }),
  unknown: (w) => ({ cls: '', text: `❓ ${w}의 행방이 묘연해요` }),
};

export function describeEvent(e) {
  switch (e.type) {
    case 'agent_status_changed': {
      const line = STATUS_LINES[e.to] ?? STATUS_LINES.unknown;
      return line(who(e), e);
    }
    case 'agent_appeared':
      return { cls: 'ev-working', text: `🐑 ${who(e)}${josa(who(e))} 목장에 들어왔어요` };
    case 'agent_left':
      return { cls: 'ev-gone', text: `👋 ${who(e)}${josa(who(e))} 목장을 떠났어요` };
    case 'agent_title_changed':
      return { cls: '', text: `🗨️ ${who(e)}: ${e.title}` };
    case 'pane_opened':
      return { cls: '', text: `🌱 새 풀밭이 생겼어요 (${e.paneId})` };
    case 'pane_closed':
      return { cls: 'ev-gone', text: `🍂 풀밭이 사라졌어요 (${e.paneId})` };
    case 'workspace_opened':
      return { cls: 'ev-working', text: `🚧 새 목초지 「${e.label}」 개장!` };
    case 'workspace_closed':
      return { cls: 'ev-gone', text: `🪵 목초지 「${e.label}」 철거` };
    case 'focus_changed':
      return { cls: '', text: `🐕 보더콜리가 ${e.focus.paneId ?? '언덕 위'}로 달려가요` };
    case 'source_connected':
      return { cls: 'ev-working', text: '🌞 목장 소식이 다시 들려와요' };
    case 'source_disconnected':
      return { cls: 'ev-blocked', text: '⛈️ 목장과 연락이 끊겼어요' };
    default:
      return { cls: '', text: e.type };
  }
}

export function createJournal(listEl, toggleEl) {
  let lastSeq = -1;
  toggleEl.addEventListener('click', () => toggleEl.parentElement.classList.toggle('collapsed'));

  const push = (e) => {
    if (typeof e.seq === 'number') {
      if (e.seq <= lastSeq) return;
      lastSeq = e.seq;
    }
    const { cls, text } = describeEvent(e);
    const li = document.createElement('li');
    if (cls) li.className = cls;
    const time = document.createElement('span');
    time.className = 't';
    time.textContent = new Date(e.ts).toTimeString().slice(0, 8);
    li.append(time, document.createTextNode(text));
    listEl.prepend(li);
    while (listEl.childElementCount > MAX_ENTRIES) listEl.lastElementChild.remove();
  };

  /** SDK 밖에서 만든 안내 문구(포커스 실패 등)를 일지에 끼워넣는다. */
  const note = (text, cls = '') => {
    const li = document.createElement('li');
    if (cls) li.className = cls;
    const time = document.createElement('span');
    time.className = 't';
    time.textContent = new Date().toTimeString().slice(0, 8);
    li.append(time, document.createTextNode(text));
    listEl.prepend(li);
    while (listEl.childElementCount > MAX_ENTRIES) listEl.lastElementChild.remove();
  };

  return { push, note, seed: (events) => events.forEach(push) };
}
