/** PlatformEvent → 관제 무전 한 줄. 로그 톤은 관제사가 받아적는 교신록. */
import { callsign } from './util.js';

const STATUS_CALL = {
  working: { tag: 'IGNITION', sev: 'good', line: (e) => `엔진 점화 — 순항 궤도 진입 · ${e.title || '임무 수행'}` },
  idle: { tag: 'HOLD', sev: 'mute', line: () => '추진 정지 — 파킹 궤도에서 대기' },
  blocked: { tag: 'MAYDAY', sev: 'alert', line: (e) => `⚠ 항로 차단 — 관제 지시 대기 · ${e.title || '입력 요청'}` },
  done: { tag: 'DOCKED', sev: 'gold', line: () => '도킹 완료 — 임무 종료' },
  unknown: { tag: 'NO SIG', sev: 'warn', line: () => '텔레메트리 판독 불가' },
};

const entry = (event, tag, sev, msg) => ({
  key: `${event.seq}:${event.type}`,
  ts: String(event.ts ?? '').slice(11, 19),
  tag,
  sev,
  msg,
  paneId: 'paneId' in event ? event.paneId : null,
});

/** @returns {{key: string, ts: string, tag: string, sev: string, msg: string, paneId: string|null}} */
export const describe = (event) => {
  switch (event.type) {
    case 'agent_status_changed': {
      const call = STATUS_CALL[event.to] ?? STATUS_CALL.unknown;
      const who = event.name ? `${event.name}·${event.kind}` : event.kind;
      return entry(event, call.tag, call.sev, `${callsign(event.paneId)} ${who} — ${call.line(event)}`);
    }
    case 'agent_appeared':
      return entry(event, 'LAUNCH', 'info', `${callsign(event.paneId)} ${event.kind} 발사체 궤도 진입 [${event.status}]`);
    case 'agent_left':
      return entry(event, 'LOST', 'warn', `${callsign(event.paneId)} ${event.kind} 추적 종료 — 스코프 이탈`);
    case 'agent_title_changed':
      return entry(event, 'TLM', 'mute', `${callsign(event.paneId)} 텔레메트리 — ${event.title}`);
    case 'pane_opened':
      return entry(event, 'DOCK', 'mute', `도크 개방 ${callsign(event.paneId)}`);
    case 'pane_closed':
      return entry(event, 'DOCK', 'mute', `도크 폐쇄 ${callsign(event.paneId)}`);
    case 'workspace_opened':
      return entry(event, 'SECTOR', 'info', `신규 섹터 개방 — ${event.label}`);
    case 'workspace_closed':
      return entry(event, 'SECTOR', 'warn', `섹터 폐쇄 — ${event.label}`);
    case 'focus_changed':
      return entry(event, 'SCOPE', 'info', `관제 시점 이동 → ${callsign(event.focus.paneId) || '없음'}`);
    case 'source_connected':
      return entry(event, 'UPLINK', 'good', '업링크 확보 — 텔레메트리 수신 재개');
    case 'source_disconnected':
      return entry(event, 'UPLINK', 'alert', '⚠ 업링크 두절 — 마지막 관측 상태 유지');
    default:
      return entry(event, 'MISC', 'mute', String(event.type));
  }
};
