/**
 * LiveSource — 실제 herdr 인스턴스에 붙는 상태 소스.
 *
 * 동작:
 * - 시작·재접속 시 `session.snapshot` + `agent.list`로 전체 resync.
 * - 전역 구독 연결(pane/workspace/tab 구조 이벤트)을 유지하며,
 *   `pane_updated`(전체 pane 동봉)는 캐시에 직접 패치하고
 *   나머지 구조 이벤트는 짧은 디바운스 후 resync한다.
 * - `pane.agent_status_changed`는 전역 구독이 불가(pane_id 필수)라서, 에이전트가
 *   사는 pane 집합에 대해 별도 구독 연결을 열고 집합이 바뀌면 갈아끼운다.
 * - 연결이 끊기면 마지막 세계를 connected:false로 내보내고 재접속 루프를 돈다.
 */
import { defaultSocketPath, request, subscribe, type PushedEvent, type SubscriptionHandle } from '../herdrClient.ts';
import {
  normalizeWorld,
  type RawAgent,
  type RawPane,
  type RawTab,
  type RawWorkspace,
} from '../normalize.ts';
import type { FocusInfo } from '../types.ts';
import type { StateSource, WorldListener } from './source.ts';

const GLOBAL_SUBSCRIPTION_TYPES = [
  'pane.created', 'pane.closed', 'pane.updated', 'pane.focused', 'pane.moved', 'pane.exited', 'pane.agent_detected',
  'workspace.created', 'workspace.closed', 'workspace.focused', 'workspace.renamed', 'workspace.updated',
  'workspace.moved', 'workspace.reordered', 'workspace.metadata_updated',
  'tab.created', 'tab.closed', 'tab.focused', 'tab.renamed', 'tab.moved',
] as const;

interface RawSessionSnapshot {
  readonly snapshot: {
    readonly version: string;
    readonly protocol: number;
    readonly focused_workspace_id?: string;
    readonly focused_tab_id?: string;
    readonly focused_pane_id?: string;
    readonly workspaces: readonly RawWorkspace[];
    readonly tabs: readonly RawTab[];
    readonly panes: readonly RawPane[];
  };
}

interface Cache {
  herdr: { version: string; protocol: number };
  focus: FocusInfo;
  workspaces: Map<string, RawWorkspace>;
  tabs: Map<string, RawTab>;
  panes: Map<string, RawPane>;
  agents: Map<string, RawAgent>;
}

export interface LiveSourceOptions {
  readonly socketPath?: string;
  /** 구조 이벤트 → resync 디바운스(ms). */
  readonly resyncDebounceMs?: number;
  readonly reconnectDelayMs?: number;
  /** 드리프트 방지용 주기 resync(ms). null이면 끔. */
  readonly failsafeResyncMs?: number | null;
  readonly log?: (message: string) => void;
}

export class LiveSource implements StateSource {
  readonly #socketPath: string;
  readonly #resyncDebounceMs: number;
  readonly #reconnectDelayMs: number;
  readonly #failsafeResyncMs: number | null;
  readonly #log: (message: string) => void;

  #listener: WorldListener | null = null;
  #cache: Cache | null = null;
  #connected = false;
  #stopped = false;
  #globalSub: SubscriptionHandle | null = null;
  #statusSub: SubscriptionHandle | null = null;
  #statusSubKey = '';
  #resyncTimer: ReturnType<typeof setTimeout> | null = null;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #failsafeTimer: ReturnType<typeof setInterval> | null = null;
  #resyncInFlight = false;

  constructor(opts: LiveSourceOptions = {}) {
    this.#socketPath = opts.socketPath ?? defaultSocketPath();
    this.#resyncDebounceMs = opts.resyncDebounceMs ?? 120;
    this.#reconnectDelayMs = opts.reconnectDelayMs ?? 1500;
    this.#failsafeResyncMs = opts.failsafeResyncMs === undefined ? 60_000 : opts.failsafeResyncMs;
    this.#log = opts.log ?? (() => {});
  }

  start(listener: WorldListener): void {
    this.#listener = listener;
    void this.#connect();
    if (this.#failsafeResyncMs !== null) {
      this.#failsafeTimer = setInterval(() => {
        if (this.#connected) void this.#resync().catch(() => this.#handleDisconnect('failsafe resync 실패'));
      }, this.#failsafeResyncMs);
    }
  }

  stop(): void {
    this.#stopped = true;
    this.#globalSub?.close();
    this.#statusSub?.close();
    if (this.#resyncTimer) clearTimeout(this.#resyncTimer);
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    if (this.#failsafeTimer) clearInterval(this.#failsafeTimer);
  }

  async #connect(): Promise<void> {
    if (this.#stopped) return;
    try {
      // 구독을 먼저 열고(ack까지 대기) 그다음 resync — 그 사이 이벤트는 resync가 흡수하므로
      // 스냅샷과 구독 시작 사이의 상태 변화가 유실되지 않는다.
      await this.#openGlobalSub();
      await this.#resync();
      this.#log(`herdr 연결됨 (${this.#socketPath})`);
    } catch (error) {
      this.#globalSub?.close();
      this.#globalSub = null;
      this.#log(`herdr 연결 실패, ${this.#reconnectDelayMs}ms 후 재시도 — ${String(error)}`);
      this.#scheduleReconnect();
    }
  }

  #scheduleReconnect(): void {
    if (this.#stopped || this.#reconnectTimer) return;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      void this.#connect();
    }, this.#reconnectDelayMs);
  }

  #handleDisconnect(reason: string): void {
    if (this.#stopped || !this.#connected) return;
    this.#connected = false;
    this.#globalSub?.close();
    this.#statusSub?.close();
    this.#globalSub = null;
    this.#statusSub = null;
    this.#statusSubKey = '';
    this.#log(`herdr 연결 끊김 (${reason})`);
    this.#emit();
    this.#scheduleReconnect();
  }

  async #resync(): Promise<void> {
    if (this.#resyncInFlight) return;
    this.#resyncInFlight = true;
    try {
      const [session, agentList] = await Promise.all([
        request<RawSessionSnapshot>(this.#socketPath, 'session.snapshot'),
        request<{ agents: readonly RawAgent[] }>(this.#socketPath, 'agent.list'),
      ]);
      const s = session.snapshot;
      this.#cache = {
        herdr: { version: s.version, protocol: s.protocol },
        focus: {
          workspaceId: s.focused_workspace_id ?? null,
          tabId: s.focused_tab_id ?? null,
          paneId: s.focused_pane_id ?? null,
        },
        workspaces: new Map(s.workspaces.map((w) => [w.workspace_id, w])),
        tabs: new Map(s.tabs.map((t) => [t.tab_id, t])),
        panes: new Map(s.panes.map((p) => [p.pane_id, p])),
        agents: new Map(agentList.agents.map((a) => [a.pane_id, a])),
      };
      this.#connected = true;
      this.#emit();
      this.#ensureStatusSub();
    } finally {
      this.#resyncInFlight = false;
    }
  }

  #scheduleResync(): void {
    if (this.#stopped || this.#resyncTimer) return;
    this.#resyncTimer = setTimeout(() => {
      this.#resyncTimer = null;
      void this.#resync().catch(() => this.#handleDisconnect('resync 실패'));
    }, this.#resyncDebounceMs);
  }

  /** 전역 구독 연결을 열고 ack(`subscription_started`)까지 기다린다. */
  #openGlobalSub(): Promise<void> {
    this.#globalSub?.close();
    return new Promise((resolve, reject) => {
      let ready = false;
      this.#globalSub = subscribe(
        this.#socketPath,
        GLOBAL_SUBSCRIPTION_TYPES.map((type) => ({ type })),
        {
          onReady: () => {
            ready = true;
            resolve();
          },
          onEvent: (event) => this.#handleGlobalEvent(event),
          onClose: (error) => {
            if (!ready) reject(error ?? new Error('구독 연결이 ack 전에 종료'));
            else this.#handleDisconnect('전역 구독 종료');
          },
        },
      );
    });
  }

  /** 에이전트가 사는 pane 집합에 대한 agent_status_changed 구독을 최신으로 유지. */
  #ensureStatusSub(): void {
    if (this.#stopped || !this.#cache) return;
    const paneIds = [...this.#cache.agents.keys()].sort();
    const key = paneIds.join(',');
    if (key === this.#statusSubKey) return;
    this.#statusSub?.close();
    this.#statusSub = null;
    this.#statusSubKey = key;
    if (paneIds.length === 0) return;
    this.#statusSub = subscribe(
      this.#socketPath,
      paneIds.map((paneId) => ({ type: 'pane.agent_status_changed', pane_id: paneId })),
      {
        onEvent: (event) => this.#handleStatusEvent(event),
        onClose: () => {
          // pane이 닫히며 구독이 무효화될 수 있다. 디바운스된 resync를 거쳐 재구성한다 —
          // 서버가 죽은 상태에서 동기 재구독 루프(이벤트 루프 기아)에 빠지지 않도록
          // 절대 여기서 직접 #ensureStatusSub를 부르지 않는다.
          if (this.#stopped || !this.#connected) return;
          this.#statusSubKey = '';
          this.#scheduleResync();
        },
      },
    );
  }

  #handleGlobalEvent(event: PushedEvent): void {
    if (event.event === 'pane_updated') {
      const pane = event.data['pane'] as RawPane | undefined;
      if (pane && this.#patchPane(pane)) return;
    }
    this.#scheduleResync();
  }

  #handleStatusEvent(event: PushedEvent): void {
    const pane = event.data['pane'] as RawPane | undefined;
    if (pane && this.#patchPane(pane)) return;

    const paneId = event.data['pane_id'] as string | undefined;
    const status = event.data['agent_status'] as string | undefined;
    const cache = this.#cache;
    if (paneId && status && cache?.panes.has(paneId)) {
      const oldPane = cache.panes.get(paneId)!;
      cache.panes.set(paneId, { ...oldPane, agent_status: status });
      const agent = cache.agents.get(paneId);
      if (agent) cache.agents.set(paneId, { ...agent, agent_status: status });
      this.#emit();
      return;
    }
    this.#scheduleResync();
  }

  /** 전체 pane 페이로드를 캐시에 반영. 캐시로 처리 못 하면 false → resync 유도. */
  #patchPane(pane: RawPane): boolean {
    const cache = this.#cache;
    if (!cache || !cache.panes.has(pane.pane_id)) return false;
    cache.panes.set(pane.pane_id, pane);

    const agent = cache.agents.get(pane.pane_id);
    if (pane.agent && !agent) return false; // 새 에이전트 — name 등은 resync로 채운다.
    if (!pane.agent && agent) {
      // pane_updated 페이로드는 agent 필드를 생략할 수 있다. 여기서 지우면
      // 가짜 agent_left/appeared가 생기므로, 소멸 여부는 resync(agent.list)로 확정한다.
      return false;
    }
    if (pane.agent && agent) {
      cache.agents.set(pane.pane_id, {
        ...agent,
        agent: pane.agent,
        agent_status: pane.agent_status ?? agent.agent_status,
        terminal_title: pane.terminal_title ?? agent.terminal_title,
        terminal_title_stripped: pane.terminal_title_stripped ?? agent.terminal_title_stripped,
        cwd: pane.cwd,
        focused: pane.focused,
      });
    }
    this.#emit();
    return true;
  }

  #emit(): void {
    if (!this.#listener || !this.#cache) return;
    const c = this.#cache;
    this.#listener(normalizeWorld({
      connected: this.#connected,
      herdr: this.#connected ? c.herdr : null,
      focus: c.focus,
      workspaces: [...c.workspaces.values()],
      tabs: [...c.tabs.values()],
      panes: [...c.panes.values()],
      agents: [...c.agents.values()],
    }));
  }
}
