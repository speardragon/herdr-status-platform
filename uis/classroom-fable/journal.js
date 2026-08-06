/** 알림장 — PlatformEvent를 교실 어투 문장으로 바꿔 공책 피드에 쌓는다. */

const MAX_ENTRIES = 60;

/** 한글 받침 유무로 이/가 조사 선택. 비한글(영문 이름 등)은 '가'로 통일. */
const josa = (word) => {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return '가';
  return (code - 0xac00) % 28 === 0 ? '가' : '이';
};

const who = (e) => e.name ?? `${e.kind} ${e.paneId}`;

const STATUS_LINES = {
  working: (w, e) => ({ cls: 'ev-working', text: `✏️ ${w}${josa(w)} 문제 풀이 시작 — ${e.title}` }),
  idle: (w) => ({ cls: '', text: `💤 ${w}${josa(w)} 책상에 엎드렸어요` }),
  blocked: (w, e) => ({ cls: 'ev-blocked', text: `✋ ${w}${josa(w)} 손 들고 질문!! — ${e.title}` }),
  done: (w, e) => ({ cls: 'ev-done', text: `💯 ${w}${josa(w)} 다 풀었대요 — ${e.title}` }),
  unknown: (w) => ({ cls: '', text: `❓ ${w}${josa(w)} 어디 갔지…` }),
};

export function describeEvent(e) {
  switch (e.type) {
    case 'agent_status_changed': {
      const line = STATUS_LINES[e.to] ?? STATUS_LINES.unknown;
      return line(who(e), e);
    }
    case 'agent_appeared':
      return { cls: 'ev-working', text: `🎒 전학생 ${who(e)} 등교!` };
    case 'agent_left':
      return { cls: 'ev-gone', text: `🏃 ${who(e)}${josa(who(e))} 조퇴했어요` };
    case 'agent_title_changed':
      return { cls: '', text: `📖 ${who(e)} 새 문제: ${e.title}` };
    case 'pane_opened':
      return { cls: '', text: `🪑 새 책상이 들어왔어요 (${e.paneId})` };
    case 'pane_closed':
      return { cls: 'ev-gone', text: `🪑 책상을 치웠어요 (${e.paneId})` };
    case 'workspace_opened':
      return { cls: 'ev-working', text: `🏫 「${e.label}」 분단 신설` };
    case 'workspace_closed':
      return { cls: 'ev-gone', text: `🧹 「${e.label}」 분단 정리` };
    case 'focus_changed':
      return { cls: '', text: `👀 선생님이 ${e.focus.paneId ?? '창밖'} 쪽을 봐요` };
    case 'source_connected':
      return { cls: 'ev-working', text: '🔔 교무 방송이 연결됐어요' };
    case 'source_disconnected':
      return { cls: 'ev-blocked', text: '📵 교무 방송이 끊겼어요' };
    default:
      return { cls: '', text: e.type };
  }
}

export function createJournal(listEl, toggleEl) {
  let lastSeq = -1;
  toggleEl.addEventListener('click', () => toggleEl.parentElement.classList.toggle('collapsed'));

  const append = (cls, timeText, text) => {
    const li = document.createElement('li');
    if (cls) li.className = cls;
    const time = document.createElement('span');
    time.className = 't';
    time.textContent = timeText;
    li.append(time, document.createTextNode(text));
    listEl.prepend(li);
    while (listEl.childElementCount > MAX_ENTRIES) listEl.lastElementChild.remove();
  };

  const push = (e) => {
    if (typeof e.seq === 'number') {
      if (e.seq <= lastSeq) return;
      lastSeq = e.seq;
    }
    const { cls, text } = describeEvent(e);
    append(cls, new Date(e.ts).toTimeString().slice(0, 8), text);
  };

  /** SDK 밖에서 만든 안내(포커스 실패 등)를 알림장에 끼워넣는다. */
  const note = (text, cls = '') => append(cls, new Date().toTimeString().slice(0, 8), text);

  return { push, note, seed: (events) => events.forEach(push) };
}
