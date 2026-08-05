/**
 * 상태 저장소 — 소스가 넘긴 정규화 세계(World)를 이전 세계와 diff해서
 * 도메인 이벤트를 파생하고, 링버퍼·seq가 붙은 완성 스냅샷을 만든다.
 *
 * 소스가 어떤 경로(이벤트 패치든 전체 resync든)로 세계를 만들었든,
 * 전이 이벤트는 항상 여기서 diff로 일관되게 파생된다.
 */
import type { World, WorldAgent } from './normalize.ts';
import type { AgentInfo, AgentStats, PlatformEvent, Snapshot } from './types.ts';

export interface StoreUpdate {
  readonly snapshot: Snapshot;
  readonly events: readonly PlatformEvent[];
}

export interface StoreOptions {
  readonly source: 'live' | 'mock';
  /** recentEvents 링버퍼 크기. */
  readonly ringSize?: number;
  /** 시계 주입(테스트용). */
  readonly now?: () => Date;
}

const EMPTY_STATS: AgentStats = { total: 0, working: 0, idle: 0, blocked: 0, done: 0, unknown: 0 };

const computeStats = (agents: readonly WorldAgent[]): AgentStats =>
  agents.reduce(
    (s, a) => ({ ...s, total: s.total + 1, [a.status]: s[a.status] + 1 }),
    EMPTY_STATS,
  );

const toMap = <T, K>(items: readonly T[], key: (item: T) => K): ReadonlyMap<K, T> =>
  new Map(items.map((item) => [key(item), item]));

export class StatusStore {
  readonly #source: 'live' | 'mock';
  readonly #ringSize: number;
  readonly #now: () => Date;
  #seq = 0;
  #prevWorld: World | null = null;
  #prevWorldJson = '';
  #statusSince: ReadonlyMap<string, string> = new Map();
  #ring: readonly PlatformEvent[] = [];
  #snapshot: Snapshot;

  constructor(opts: StoreOptions) {
    this.#source = opts.source;
    this.#ringSize = opts.ringSize ?? 50;
    this.#now = opts.now ?? (() => new Date());
    this.#snapshot = this.#buildSnapshot(
      { connected: false, herdr: null, focus: { workspaceId: null, tabId: null, paneId: null }, workspaces: [], tabs: [], panes: [], agents: [] },
      this.#now().toISOString(),
    );
  }

  get snapshot(): Snapshot {
    return this.#snapshot;
  }

  /** 새 세계를 적용한다. 의미 있는 변화가 없으면 null. */
  setWorld(world: World): StoreUpdate | null {
    const worldJson = JSON.stringify(world);
    const ts = this.#now().toISOString();
    const events = this.#deriveEvents(this.#prevWorld, world, ts);
    if (events.length === 0 && worldJson === this.#prevWorldJson) return null;

    this.#statusSince = this.#nextStatusSince(world, ts);
    this.#prevWorld = world;
    this.#prevWorldJson = worldJson;
    this.#ring = [...this.#ring, ...events].slice(-this.#ringSize);
    this.#snapshot = this.#buildSnapshot(world, ts);
    return { snapshot: this.#snapshot, events };
  }

  #nextSeq(): number {
    this.#seq += 1;
    return this.#seq;
  }

  #nextStatusSince(world: World, ts: string): ReadonlyMap<string, string> {
    const prevAgents = toMap(this.#prevWorld?.agents ?? [], (a) => a.paneId);
    return new Map(
      world.agents.map((a) => {
        const prev = prevAgents.get(a.paneId);
        const carried = prev && prev.status === a.status ? this.#statusSince.get(a.paneId) : undefined;
        return [a.paneId, carried ?? ts];
      }),
    );
  }

  #deriveEvents(prev: World | null, next: World, ts: string): PlatformEvent[] {
    const events: PlatformEvent[] = [];
    const base = () => ({ seq: this.#nextSeq(), ts });

    if (prev === null) {
      // 부팅 베이스라인 — 기존 세계 전체를 "방금 일어난 일"로 둔갑시키지 않는다.
      if (next.connected) events.push({ ...base(), type: 'source_connected' });
      return events;
    }

    if (prev.connected !== next.connected) {
      events.push({ ...base(), type: next.connected ? 'source_connected' : 'source_disconnected' });
    }

    const prevWs = toMap(prev.workspaces, (w) => w.workspaceId);
    const nextWs = toMap(next.workspaces, (w) => w.workspaceId);
    for (const w of next.workspaces) {
      if (!prevWs.has(w.workspaceId)) {
        events.push({ ...base(), type: 'workspace_opened', workspaceId: w.workspaceId, label: w.label });
      }
    }
    for (const w of prev.workspaces) {
      if (!nextWs.has(w.workspaceId)) {
        events.push({ ...base(), type: 'workspace_closed', workspaceId: w.workspaceId, label: w.label });
      }
    }

    const prevPanes = toMap(prev.panes, (p) => p.paneId);
    const nextPanes = toMap(next.panes, (p) => p.paneId);
    for (const p of next.panes) {
      if (!prevPanes.has(p.paneId)) {
        events.push({ ...base(), type: 'pane_opened', paneId: p.paneId, workspaceId: p.workspaceId });
      }
    }
    for (const p of prev.panes) {
      if (!nextPanes.has(p.paneId)) {
        events.push({ ...base(), type: 'pane_closed', paneId: p.paneId, workspaceId: p.workspaceId });
      }
    }

    const prevAgents = toMap(prev.agents, (a) => a.paneId);
    const nextAgents = toMap(next.agents, (a) => a.paneId);
    for (const a of next.agents) {
      const was = prevAgents.get(a.paneId);
      if (!was) {
        events.push({ ...base(), type: 'agent_appeared', paneId: a.paneId, kind: a.kind, name: a.name, status: a.status, title: a.title });
        continue;
      }
      if (was.status !== a.status) {
        events.push({ ...base(), type: 'agent_status_changed', paneId: a.paneId, kind: a.kind, name: a.name, from: was.status, to: a.status, title: a.title });
      }
      if (was.title !== a.title && a.title !== '') {
        events.push({ ...base(), type: 'agent_title_changed', paneId: a.paneId, kind: a.kind, title: a.title });
      }
    }
    for (const a of prev.agents) {
      if (!nextAgents.has(a.paneId)) {
        events.push({ ...base(), type: 'agent_left', paneId: a.paneId, kind: a.kind, name: a.name });
      }
    }

    const pf = prev.focus;
    const nf = next.focus;
    if (pf.workspaceId !== nf.workspaceId || pf.tabId !== nf.tabId || pf.paneId !== nf.paneId) {
      events.push({ ...base(), type: 'focus_changed', focus: nf });
    }

    return events;
  }

  #buildSnapshot(world: World, ts: string): Snapshot {
    const agents: AgentInfo[] = world.agents.map((a) => ({
      ...a,
      statusSince: this.#statusSince.get(a.paneId) ?? ts,
    }));
    return {
      seq: this.#nextSeq(),
      ts,
      source: this.#source,
      connected: world.connected,
      herdr: world.herdr,
      focus: world.focus,
      workspaces: world.workspaces,
      tabs: world.tabs,
      panes: world.panes,
      agents,
      stats: computeStats(world.agents),
      recentEvents: this.#ring,
      ext: {},
    };
  }
}
