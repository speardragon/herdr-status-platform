/**
 * MockSource — UI 개발·데모용 herdr 세계 시뮬레이터.
 *
 * 가짜 워크스페이스/에이전트들이 working↔idle↔blocked↔done을 오가며 이벤트를
 * 만들어낸다. LiveSource와 같은 와이어 형태(RawWorldParts)를 만들어 같은 정규화
 * 경로를 태우므로, mock으로 개발한 UI는 그대로 live에서도 동작한다.
 * seed가 같으면 전개도 같다(결정적) — 연출 튜닝과 테스트에 유리하다.
 */
import { normalizeWorld, type RawWorldParts } from '../normalize.ts';
import type { AgentStatus } from '../types.ts';
import type { StateSource, WorldListener } from './source.ts';

export interface MockSourceOptions {
  readonly seed?: number;
  /** 틱 간격(ms) — 틱마다 세계가 한 번 움직인다. */
  readonly tempoMs?: number;
  /** 최소/최대 에이전트 수. */
  readonly minAgents?: number;
  readonly maxAgents?: number;
}

interface MockAgent {
  readonly paneId: string;
  readonly tabId: string;
  readonly workspaceId: string;
  readonly kind: string;
  readonly name: string | null;
  readonly status: AgentStatus;
  readonly title: string;
}

export interface MockWorldState {
  readonly agents: readonly MockAgent[];
  readonly focusPaneId: string | null;
  readonly paneSeq: number;
  readonly rand: () => number;
}

const WORKSPACES = [
  { id: 'mw1', number: 1, label: 'herdr-status-platform' },
  { id: 'mw2', number: 2, label: 'ray-brain' },
  { id: 'mw3', number: 3, label: 'aidt-edu-core' },
] as const;

const TABS = [
  { id: 'mw1:t1', workspaceId: 'mw1', number: 1, label: 'main' },
  { id: 'mw2:t1', workspaceId: 'mw2', number: 1, label: 'main' },
  { id: 'mw2:t2', workspaceId: 'mw2', number: 2, label: 'dashboard' },
  { id: 'mw3:t1', workspaceId: 'mw3', number: 1, label: 'main' },
] as const;

const TITLES = [
  '로그인 버그 잡는 중', 'e2e 테스트 고치는 중', 'store 모듈 리팩토링', 'PR 리뷰 반영 중',
  '의존성 업그레이드', '경합 조건 추적 중', 'CSS 픽셀 밀당', '스키마 마이그레이션',
  '벤치마크 돌리는 중', '플레이키 테스트 격리', 'API 응답 캐싱', '에러 메시지 다듬는 중',
] as const;

const KINDS = ['claude', 'claude', 'claude', 'codex', 'codex'] as const;
const NAMES = ['reviewer', 'builder', 'scout', 'helper', null, null, null] as const;

/** mulberry32 — 시드 고정 결정적 RNG. */
const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = <T>(rand: () => number, items: readonly T[]): T =>
  items[Math.floor(rand() * items.length)]!;

/** 확률 표에서 하나 뽑기 — [가중치, 값] 목록. */
const weighted = <T>(rand: () => number, table: ReadonlyArray<readonly [number, T]>): T => {
  const total = table.reduce((sum, [w]) => sum + w, 0);
  let roll = rand() * total;
  for (const [w, value] of table) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return table[table.length - 1]![1];
};

const TRANSITIONS: Readonly<Record<AgentStatus, ReadonlyArray<readonly [number, AgentStatus]>>> = {
  working: [[40, 'idle'], [35, 'done'], [25, 'blocked']],
  idle: [[100, 'working']],
  blocked: [[100, 'working']],
  done: [[100, 'working']],
  unknown: [[100, 'working']],
};

const spawnAgent = (state: MockWorldState): MockWorldState => {
  const tab = pick(state.rand, TABS);
  const paneSeq = state.paneSeq + 1;
  const agent: MockAgent = {
    paneId: `${tab.workspaceId}:p${paneSeq}`,
    tabId: tab.id,
    workspaceId: tab.workspaceId,
    kind: pick(state.rand, KINDS),
    name: pick(state.rand, NAMES),
    status: 'working',
    title: pick(state.rand, TITLES),
  };
  return { ...state, paneSeq, agents: [...state.agents, agent] };
};

export const createMockWorldState = (seed = 42, initialAgents = 5): MockWorldState => {
  let state: MockWorldState = { agents: [], focusPaneId: null, paneSeq: 0, rand: mulberry32(seed) };
  for (let i = 0; i < initialAgents; i++) state = spawnAgent(state);
  return { ...state, focusPaneId: state.agents[0]?.paneId ?? null };
};

type MockAction = 'transition' | 'retitle' | 'refocus' | 'join' | 'leave';

/** 세계를 한 틱 전진 — 항상 새 상태를 돌려준다. */
export const advanceMockWorld = (
  state: MockWorldState,
  bounds: { min: number; max: number } = { min: 3, max: 9 },
): MockWorldState => {
  const action = weighted<MockAction>(state.rand, [
    [55, 'transition'], [15, 'retitle'], [10, 'refocus'], [10, 'join'], [10, 'leave'],
  ]);

  if (action === 'join' && state.agents.length < bounds.max) return spawnAgent(state);

  if (action === 'leave' && state.agents.length > bounds.min) {
    const gone = pick(state.rand, state.agents);
    return {
      ...state,
      agents: state.agents.filter((a) => a.paneId !== gone.paneId),
      focusPaneId: state.focusPaneId === gone.paneId ? null : state.focusPaneId,
    };
  }

  if (action === 'refocus' && state.agents.length > 0) {
    return { ...state, focusPaneId: pick(state.rand, state.agents).paneId };
  }

  if (action === 'retitle') {
    const working = state.agents.filter((a) => a.status === 'working');
    if (working.length === 0) return state;
    const target = pick(state.rand, working);
    const title = pick(state.rand, TITLES);
    if (title === target.title) return state;
    return {
      ...state,
      agents: state.agents.map((a) => (a.paneId === target.paneId ? { ...a, title } : a)),
    };
  }

  if (state.agents.length === 0) return state;
  const target = pick(state.rand, state.agents);
  const to = weighted(state.rand, TRANSITIONS[target.status]);
  const title = to === 'working' && target.status !== 'blocked' ? pick(state.rand, TITLES) : target.title;
  return {
    ...state,
    agents: state.agents.map((a) => (a.paneId === target.paneId ? { ...a, status: to, title } : a)),
  };
};

/** 상태 우선순위 롤업 — herdr의 워크스페이스/탭 agent_status 근사. */
const rollup = (agents: readonly MockAgent[]): string | undefined => {
  for (const status of ['blocked', 'working', 'done', 'idle'] as const) {
    if (agents.some((a) => a.status === status)) return status;
  }
  return agents.length > 0 ? 'unknown' : undefined;
};

export const mockStateToRawParts = (state: MockWorldState): RawWorldParts => {
  const agentsIn = (pred: (a: MockAgent) => boolean) => state.agents.filter(pred);
  const focused = state.agents.find((a) => a.paneId === state.focusPaneId) ?? null;
  const usedTabs = TABS.filter((t) => agentsIn((a) => a.tabId === t.id).length > 0);
  const usedWorkspaces = WORKSPACES.filter((w) => agentsIn((a) => a.workspaceId === w.id).length > 0);

  return {
    connected: true,
    herdr: null,
    focus: {
      workspaceId: focused?.workspaceId ?? null,
      tabId: focused?.tabId ?? null,
      paneId: focused?.paneId ?? null,
    },
    workspaces: usedWorkspaces.map((w) => {
      const members = agentsIn((a) => a.workspaceId === w.id);
      return {
        workspace_id: w.id,
        number: w.number,
        label: w.label,
        focused: focused?.workspaceId === w.id,
        pane_count: members.length,
        tab_count: usedTabs.filter((t) => t.workspaceId === w.id).length,
        active_tab_id: usedTabs.find((t) => t.workspaceId === w.id)?.id,
        agent_status: rollup(members),
      };
    }),
    tabs: usedTabs.map((t) => {
      const members = agentsIn((a) => a.tabId === t.id);
      return {
        tab_id: t.id,
        workspace_id: t.workspaceId,
        number: t.number,
        label: t.label,
        focused: focused?.tabId === t.id,
        pane_count: members.length,
        agent_status: rollup(members),
      };
    }),
    panes: state.agents.map((a) => ({
      pane_id: a.paneId,
      workspace_id: a.workspaceId,
      tab_id: a.tabId,
      focused: a.paneId === state.focusPaneId,
      cwd: `/mock/${WORKSPACES.find((w) => w.id === a.workspaceId)?.label ?? 'repo'}`,
      agent: a.kind,
      agent_status: a.status,
      terminal_title: a.title,
      terminal_title_stripped: a.title,
    })),
    agents: state.agents.map((a) => ({
      pane_id: a.paneId,
      workspace_id: a.workspaceId,
      tab_id: a.tabId,
      agent: a.kind,
      name: a.name ?? undefined,
      agent_status: a.status,
      terminal_title: a.title,
      terminal_title_stripped: a.title,
      cwd: `/mock/${WORKSPACES.find((w) => w.id === a.workspaceId)?.label ?? 'repo'}`,
      focused: a.paneId === state.focusPaneId,
    })),
  };
};

export class MockSource implements StateSource {
  readonly #seed: number;
  readonly #tempoMs: number;
  readonly #bounds: { min: number; max: number };
  #state: MockWorldState;
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: MockSourceOptions = {}) {
    this.#seed = opts.seed ?? 42;
    this.#tempoMs = opts.tempoMs ?? 1200;
    this.#bounds = { min: opts.minAgents ?? 3, max: opts.maxAgents ?? 9 };
    this.#state = createMockWorldState(this.#seed);
  }

  start(listener: WorldListener): void {
    listener(normalizeWorld(mockStateToRawParts(this.#state)));
    this.#timer = setInterval(() => {
      this.#state = advanceMockWorld(this.#state, this.#bounds);
      listener(normalizeWorld(mockStateToRawParts(this.#state)));
    }, this.#tempoMs);
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }
}
