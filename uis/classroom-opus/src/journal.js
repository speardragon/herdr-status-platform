/** PlatformEvent → 학급 일지 한 줄. 담임 선생님이 적는 어투. */

const SHORT = (paneId) => String(paneId ?? '').split(':').pop() ?? '';

const STATUS_LINE = {
  working: { sev: 'work', line: (who, title) => `${who} — 공부 시작 · ${title || '과제 착수'}` },
  idle: { sev: 'mute', line: (who) => `${who} — 책상에 엎드림 (잠깐 쉬는 중)` },
  blocked: { sev: 'ask', line: (who, title) => `✋ ${who} — 손 들고 질문! · ${title || '도움 요청'}` },
  done: { sev: 'done', line: (who) => `${who} — 다 했어요! 양손 따봉 🙌` },
  unknown: { sev: 'mute', line: (who) => `${who} — 상태를 알 수 없음` },
};

/** 이벤트 ts는 ISO(UTC)라 벽시계와 어긋난다 — 교실 시계와 맞추려면 로컬 시각으로 읽어야 한다. */
const localTime = (iso) => {
  const at = new Date(iso);
  return Number.isFinite(at.getTime()) ? at.toTimeString().slice(0, 8) : String(iso ?? '').slice(11, 19);
};

const row = (event, sev, msg) => ({
  key: `${event.seq}:${event.type}`,
  t: localTime(event.ts),
  sev,
  msg,
  paneId: 'paneId' in event ? event.paneId : null,
});

const whoOf = (event) => {
  const label = event.name ? `${event.name}(${event.kind})` : event.kind;
  return `${label} ${SHORT(event.paneId)}번`;
};

/** @returns {{key: string, t: string, sev: string, msg: string, paneId: string|null}} */
export const describe = (event) => {
  switch (event.type) {
    case 'agent_status_changed': {
      const call = STATUS_LINE[event.to] ?? STATUS_LINE.unknown;
      return row(event, call.sev, call.line(whoOf(event), event.title));
    }
    case 'agent_appeared':
      return row(event, 'work', `${whoOf(event)} 등교 — 자리에 앉음 [${event.status}]`);
    case 'agent_left':
      return row(event, 'mute', `${whoOf(event)} 조퇴 — 자리 비움`);
    case 'agent_title_changed':
      return row(event, 'mute', `${SHORT(event.paneId)}번 공책 바뀜 — ${event.title}`);
    case 'pane_opened':
      return row(event, 'mute', `책상 하나 더 놓음 (${SHORT(event.paneId)})`);
    case 'pane_closed':
      return row(event, 'mute', `책상 정리함 (${SHORT(event.paneId)})`);
    case 'workspace_opened':
      return row(event, 'work', `새 분단 편성 — ${event.label}`);
    case 'workspace_closed':
      return row(event, 'mute', `분단 해체 — ${event.label}`);
    case 'focus_changed':
      return row(event, 'mute', `선생님 시선 이동 → ${SHORT(event.focus.paneId) || '교실 전체'}`);
    case 'source_connected':
      return row(event, 'work', '출석 시스템 연결됨 — 교실 상황 수신 시작');
    case 'source_disconnected':
      return row(event, 'ask', '⚠ 출석 시스템 끊김 — 마지막으로 본 교실 상태입니다');
    default:
      return row(event, 'mute', String(event.type));
  }
};
