/**
 * herdr-status-platform 계약 타입.
 *
 * 이 파일이 UI ↔ 모듈 사이의 단일 계약 문서다.
 * - UI는 WebSocket(`/ws`)으로 `WireMessage`를 받는다: 항상 완전한 `Snapshot` + 이번
 *   푸시를 유발한 `PlatformEvent[]`(대개 1개).
 * - 스냅샷은 항상 전체 상태라 UI 쪽에 diff/재조립 코드가 필요 없다.
 * - 전이 애니메이션은 `events`(그리고 `snapshot.recentEvents` 링버퍼)로 트리거한다.
 */

/** herdr가 감지하는 에이전트 상태. */
export type AgentStatus = 'working' | 'idle' | 'blocked' | 'done' | 'unknown';

/** 에이전트 — 대부분의 UI가 주로 소비하는 평탄화된 목록. */
export interface AgentInfo {
  /** 에이전트가 사는 pane. UI에서 focus 점프의 타깃 id. */
  readonly paneId: string;
  readonly tabId: string;
  readonly workspaceId: string;
  /** 에이전트 종류: 'claude' | 'codex' | ... */
  readonly kind: string;
  /** `herdr agent start/rename`으로 부여된 이름. 없으면 null. */
  readonly name: string | null;
  readonly status: AgentStatus;
  /** 터미널 타이틀(스피너 글리프 제거본) — "지금 뭘 하는지"의 한 줄 요약. */
  readonly title: string;
  readonly cwd: string;
  /** herdr UI에서 이 pane이 포커스되어 있는지. */
  readonly focused: boolean;
  /** 현재 status로 바뀐 시각(이 모듈이 관측한 기준, ISO). 초기 스냅샷 시점엔 관측 시작 시각. */
  readonly statusSince: string;
}

export interface PaneInfo {
  readonly paneId: string;
  readonly tabId: string;
  readonly workspaceId: string;
  readonly focused: boolean;
  readonly cwd: string;
  readonly title: string;
  /** pane에 에이전트가 감지되면 그 종류, 아니면 null (평범한 셸). */
  readonly agentKind: string | null;
  readonly agentStatus: AgentStatus | null;
}

export interface TabInfo {
  readonly tabId: string;
  readonly workspaceId: string;
  readonly number: number;
  readonly label: string;
  readonly focused: boolean;
  readonly paneCount: number;
  /** herdr가 계산한 탭 단위 에이전트 상태 롤업. */
  readonly agentStatus: AgentStatus | null;
}

export interface WorktreeInfo {
  readonly repoName: string;
  readonly checkoutPath: string;
  readonly isLinkedWorktree: boolean;
}

export interface WorkspaceInfo {
  readonly workspaceId: string;
  readonly number: number;
  readonly label: string;
  readonly focused: boolean;
  readonly tabCount: number;
  readonly paneCount: number;
  readonly activeTabId: string | null;
  readonly agentStatus: AgentStatus | null;
  /** git worktree 기반 워크스페이스면 그 정보. */
  readonly worktree: WorktreeInfo | null;
}

/** herdr UI가 현재 보고 있는 위치. */
export interface FocusInfo {
  readonly workspaceId: string | null;
  readonly tabId: string | null;
  readonly paneId: string | null;
}

/** 에이전트 상태별 마릿수 집계 — 상태바류 UI 편의. */
export interface AgentStats {
  readonly total: number;
  readonly working: number;
  readonly idle: number;
  readonly blocked: number;
  readonly done: number;
  readonly unknown: number;
}

/* ───────────────────────── 도메인 이벤트 ───────────────────────── */

interface EventBase {
  /** 스냅샷 seq와 같은 시퀀스 공간의 단조 증가 번호. */
  readonly seq: number;
  readonly ts: string;
}

/** 에이전트 상태 전이 — 애니메이션 트리거의 주인공. */
export interface AgentStatusChangedEvent extends EventBase {
  readonly type: 'agent_status_changed';
  readonly paneId: string;
  readonly kind: string;
  readonly name: string | null;
  readonly from: AgentStatus;
  readonly to: AgentStatus;
  readonly title: string;
}

export interface AgentAppearedEvent extends EventBase {
  readonly type: 'agent_appeared';
  readonly paneId: string;
  readonly kind: string;
  readonly name: string | null;
  readonly status: AgentStatus;
  readonly title: string;
}

export interface AgentLeftEvent extends EventBase {
  readonly type: 'agent_left';
  readonly paneId: string;
  readonly kind: string;
  readonly name: string | null;
}

/** 에이전트가 하는 일(타이틀)이 바뀜 — 말풍선/자막류 연출용. */
export interface AgentTitleChangedEvent extends EventBase {
  readonly type: 'agent_title_changed';
  readonly paneId: string;
  readonly kind: string;
  readonly title: string;
}

export interface PaneOpenedEvent extends EventBase {
  readonly type: 'pane_opened';
  readonly paneId: string;
  readonly workspaceId: string;
}

export interface PaneClosedEvent extends EventBase {
  readonly type: 'pane_closed';
  readonly paneId: string;
  readonly workspaceId: string;
}

export interface WorkspaceOpenedEvent extends EventBase {
  readonly type: 'workspace_opened';
  readonly workspaceId: string;
  readonly label: string;
}

export interface WorkspaceClosedEvent extends EventBase {
  readonly type: 'workspace_closed';
  readonly workspaceId: string;
  readonly label: string;
}

/** 사용자가 herdr에서 보는 pane이 바뀜. */
export interface FocusChangedEvent extends EventBase {
  readonly type: 'focus_changed';
  readonly focus: FocusInfo;
}

/** 소스(herdr 소켓 또는 mock) 연결 상태 변화. */
export interface SourceStatusEvent extends EventBase {
  readonly type: 'source_connected' | 'source_disconnected';
}

export type PlatformEvent =
  | AgentStatusChangedEvent
  | AgentAppearedEvent
  | AgentLeftEvent
  | AgentTitleChangedEvent
  | PaneOpenedEvent
  | PaneClosedEvent
  | WorkspaceOpenedEvent
  | WorkspaceClosedEvent
  | FocusChangedEvent
  | SourceStatusEvent;

export type PlatformEventType = PlatformEvent['type'];

/* ───────────────────────── 스냅샷 ───────────────────────── */

export interface Snapshot {
  /** 단조 증가 시퀀스. UI는 이걸로 중복/역행을 감지할 수 있다. */
  readonly seq: number;
  readonly ts: string;
  /** 'live' = 실제 herdr, 'mock' = 시뮬레이터. */
  readonly source: 'live' | 'mock';
  /** 소스와의 연결 상태. false면 아래 데이터는 마지막으로 본 상태다. */
  readonly connected: boolean;
  /** herdr 서버 정보 (live 연결 시). */
  readonly herdr: { readonly version: string; readonly protocol: number } | null;
  readonly focus: FocusInfo;
  readonly workspaces: readonly WorkspaceInfo[];
  readonly tabs: readonly TabInfo[];
  readonly panes: readonly PaneInfo[];
  readonly agents: readonly AgentInfo[];
  readonly stats: AgentStats;
  /** 최근 도메인 이벤트 링버퍼(오래된 것 → 최신 순). 늦게 접속한 UI의 활동 피드용. */
  readonly recentEvents: readonly PlatformEvent[];
  /** 확장 슬롯 — 외부 컨텍스트 provider가 나중에 꽂는 자리. 코어는 비워둔다. */
  readonly ext: Readonly<Record<string, unknown>>;
}

/* ───────────────────────── WebSocket 와이어 ───────────────────────── */

/** 접속 직후 1회: 현재 상태 전달. */
export interface HelloMessage {
  readonly kind: 'hello';
  readonly snapshot: Snapshot;
}

/** 상태가 바뀔 때마다: 새 스냅샷 + 이번 변경을 유발한 이벤트(대개 1개, 버스트 시 여러 개). */
export interface UpdateMessage {
  readonly kind: 'update';
  readonly snapshot: Snapshot;
  readonly events: readonly PlatformEvent[];
}

export type WireMessage = HelloMessage | UpdateMessage;

/* ───────────────────────── UI 매니페스트 ───────────────────────── */

/** `uis/<id>/ui.json`의 스키마. */
export interface UiMeta {
  readonly title: string;
  readonly description: string;
  readonly emoji: string;
  /** 갤러리 정렬 가중치(작을수록 앞). 생략 시 100. */
  readonly order?: number;
}

/** `GET /api/uis` 응답 항목. */
export interface UiManifestEntry extends UiMeta {
  readonly id: string;
  readonly path: string;
}
