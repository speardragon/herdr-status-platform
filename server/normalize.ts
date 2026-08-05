/**
 * herdr 소켓 API 와이어 페이로드 → 플랫폼 정규화 모델.
 *
 * LiveSource와 MockSource 모두 와이어 형태(`RawWorldParts`)를 만들어 이 모듈을
 * 통과시킨다 — mock도 같은 정규화 경로를 타야 계약 검증이 겸사겸사 이뤄진다.
 */
import type { AgentInfo, AgentStatus, FocusInfo, PaneInfo, TabInfo, WorkspaceInfo } from './types.ts';

/* herdr 와이어 페이로드 — 우리가 읽는 필드만 선언한다. */

export interface RawWorktree {
  readonly repo_name: string;
  readonly checkout_path: string;
  readonly is_linked_worktree: boolean;
}

export interface RawWorkspace {
  readonly workspace_id: string;
  readonly number: number;
  readonly label: string;
  readonly focused: boolean;
  readonly pane_count: number;
  readonly tab_count: number;
  readonly active_tab_id?: string;
  readonly agent_status?: string;
  readonly worktree?: RawWorktree;
}

export interface RawTab {
  readonly tab_id: string;
  readonly workspace_id: string;
  readonly number: number;
  readonly label: string;
  readonly focused: boolean;
  readonly pane_count: number;
  readonly agent_status?: string;
}

export interface RawPane {
  readonly pane_id: string;
  readonly workspace_id: string;
  readonly tab_id: string;
  readonly focused: boolean;
  readonly cwd: string;
  readonly agent?: string;
  readonly agent_status?: string;
  readonly terminal_title?: string;
  readonly terminal_title_stripped?: string;
}

export interface RawAgent {
  readonly pane_id: string;
  readonly workspace_id: string;
  readonly tab_id: string;
  readonly agent: string;
  readonly name?: string;
  readonly agent_status: string;
  readonly terminal_title?: string;
  readonly terminal_title_stripped?: string;
  readonly cwd: string;
  readonly focused: boolean;
}

/** 소스가 store에 넘기는 재료 일습. */
export interface RawWorldParts {
  readonly connected: boolean;
  readonly herdr: { readonly version: string; readonly protocol: number } | null;
  readonly focus: FocusInfo;
  readonly workspaces: readonly RawWorkspace[];
  readonly tabs: readonly RawTab[];
  readonly panes: readonly RawPane[];
  readonly agents: readonly RawAgent[];
}

/** statusSince는 store가 전이 관측 시점 기준으로 부여하므로 소스 단계에는 없다. */
export type WorldAgent = Omit<AgentInfo, 'statusSince'>;

/** 정규화된 세계 — store의 diff 입력. */
export interface World {
  readonly connected: boolean;
  readonly herdr: { readonly version: string; readonly protocol: number } | null;
  readonly focus: FocusInfo;
  readonly workspaces: readonly WorkspaceInfo[];
  readonly tabs: readonly TabInfo[];
  readonly panes: readonly PaneInfo[];
  readonly agents: readonly WorldAgent[];
}

const AGENT_STATUSES: readonly AgentStatus[] = ['working', 'idle', 'blocked', 'done', 'unknown'];

export function toAgentStatus(raw: string | undefined | null): AgentStatus | null {
  if (raw == null) return null;
  return AGENT_STATUSES.includes(raw as AgentStatus) ? (raw as AgentStatus) : 'unknown';
}

const bestTitle = (stripped: string | undefined, plain: string | undefined): string =>
  (stripped ?? plain ?? '').trim();

export function normalizeWorkspace(w: RawWorkspace): WorkspaceInfo {
  return {
    workspaceId: w.workspace_id,
    number: w.number,
    label: w.label,
    focused: w.focused,
    tabCount: w.tab_count,
    paneCount: w.pane_count,
    activeTabId: w.active_tab_id ?? null,
    agentStatus: toAgentStatus(w.agent_status),
    worktree: w.worktree
      ? {
          repoName: w.worktree.repo_name,
          checkoutPath: w.worktree.checkout_path,
          isLinkedWorktree: w.worktree.is_linked_worktree,
        }
      : null,
  };
}

export function normalizeTab(t: RawTab): TabInfo {
  return {
    tabId: t.tab_id,
    workspaceId: t.workspace_id,
    number: t.number,
    label: t.label,
    focused: t.focused,
    paneCount: t.pane_count,
    agentStatus: toAgentStatus(t.agent_status),
  };
}

export function normalizePane(p: RawPane): PaneInfo {
  return {
    paneId: p.pane_id,
    tabId: p.tab_id,
    workspaceId: p.workspace_id,
    focused: p.focused,
    cwd: p.cwd,
    title: bestTitle(p.terminal_title_stripped, p.terminal_title),
    agentKind: p.agent ?? null,
    agentStatus: p.agent ? (toAgentStatus(p.agent_status) ?? 'unknown') : null,
  };
}

export function normalizeAgent(a: RawAgent): WorldAgent {
  return {
    paneId: a.pane_id,
    tabId: a.tab_id,
    workspaceId: a.workspace_id,
    kind: a.agent,
    name: a.name ?? null,
    status: toAgentStatus(a.agent_status) ?? 'unknown',
    title: bestTitle(a.terminal_title_stripped, a.terminal_title),
    cwd: a.cwd,
    focused: a.focused,
  };
}

const byNumber = <T extends { number: number }>(a: T, b: T) => a.number - b.number;

/** 와이어 재료 일습 → 정렬까지 끝난 정규화 세계. */
export function normalizeWorld(raw: RawWorldParts): World {
  return {
    connected: raw.connected,
    herdr: raw.herdr,
    focus: raw.focus,
    workspaces: [...raw.workspaces].sort(byNumber).map(normalizeWorkspace),
    tabs: [...raw.tabs]
      .sort((a, b) => a.workspace_id.localeCompare(b.workspace_id) || a.number - b.number)
      .map(normalizeTab),
    panes: [...raw.panes]
      .sort((a, b) => a.pane_id.localeCompare(b.pane_id))
      .map(normalizePane),
    agents: [...raw.agents]
      .sort((a, b) => a.pane_id.localeCompare(b.pane_id))
      .map(normalizeAgent),
  };
}
