import { describe, expect, test } from 'bun:test';
import type { World, WorldAgent } from './normalize.ts';
import { StatusStore } from './store.ts';
import type { PaneInfo, PlatformEventType } from './types.ts';

const mkAgent = (paneId: string, over: Partial<WorldAgent> = {}): WorldAgent => ({
  paneId,
  tabId: 'w1:t1',
  workspaceId: 'w1',
  kind: 'claude',
  name: null,
  status: 'working',
  title: '테스트 작업',
  cwd: '/tmp/x',
  focused: false,
  ...over,
});

const mkPane = (paneId: string, over: Partial<PaneInfo> = {}): PaneInfo => ({
  paneId,
  tabId: 'w1:t1',
  workspaceId: 'w1',
  focused: false,
  cwd: '/tmp/x',
  title: '테스트 작업',
  agentKind: 'claude',
  agentStatus: 'working',
  ...over,
});

const mkWorld = (over: Partial<World> = {}): World => ({
  connected: true,
  herdr: { version: '0.8.0', protocol: 19 },
  focus: { workspaceId: 'w1', tabId: 'w1:t1', paneId: 'w1:p1' },
  workspaces: [
    { workspaceId: 'w1', number: 1, label: 'demo', focused: true, tabCount: 1, paneCount: 1, activeTabId: 'w1:t1', agentStatus: 'working', worktree: null },
  ],
  tabs: [
    { tabId: 'w1:t1', workspaceId: 'w1', number: 1, label: '1', focused: true, paneCount: 1, agentStatus: 'working' },
  ],
  panes: [mkPane('w1:p1')],
  agents: [mkAgent('w1:p1')],
  ...over,
});

/** 테스트마다 1초씩 흐르는 주입 시계. */
const mkClock = () => {
  let t = 0;
  return () => new Date(1754400000000 + 1000 * t++);
};

const types = (events: readonly { type: PlatformEventType }[]) => events.map((e) => e.type);

describe('StatusStore 베이스라인', () => {
  test('첫 세계는 기존 에이전트를 이벤트로 둔갑시키지 않는다 — source_connected만', () => {
    const store = new StatusStore({ source: 'mock', now: mkClock() });
    const update = store.setWorld(mkWorld());
    expect(update).not.toBeNull();
    expect(types(update!.events)).toEqual(['source_connected']);
    expect(update!.snapshot.agents).toHaveLength(1);
    expect(update!.snapshot.stats).toEqual({ total: 1, working: 1, idle: 0, blocked: 0, done: 0, unknown: 0 });
  });

  test('동일한 세계를 다시 넣으면 null (브로드캐스트 없음)', () => {
    const store = new StatusStore({ source: 'mock', now: mkClock() });
    store.setWorld(mkWorld());
    expect(store.setWorld(mkWorld())).toBeNull();
  });
});

describe('StatusStore 전이 파생', () => {
  test('상태 변화 → agent_status_changed(from/to) + statusSince 갱신, 무변화 에이전트는 statusSince 유지', () => {
    const store = new StatusStore({ source: 'mock', now: mkClock() });
    const first = store.setWorld(mkWorld({
      panes: [mkPane('w1:p1'), mkPane('w1:p2')],
      agents: [mkAgent('w1:p1'), mkAgent('w1:p2', { status: 'idle' })],
    }))!;
    const sinceBefore = first.snapshot.agents.find((a) => a.paneId === 'w1:p2')!.statusSince;

    const update = store.setWorld(mkWorld({
      panes: [mkPane('w1:p1'), mkPane('w1:p2')],
      agents: [mkAgent('w1:p1', { status: 'done' }), mkAgent('w1:p2', { status: 'idle' })],
    }))!;

    expect(types(update.events)).toEqual(['agent_status_changed']);
    const ev = update.events[0]!;
    expect(ev).toMatchObject({ paneId: 'w1:p1', from: 'working', to: 'done' });

    const changed = update.snapshot.agents.find((a) => a.paneId === 'w1:p1')!;
    const steady = update.snapshot.agents.find((a) => a.paneId === 'w1:p2')!;
    expect(changed.statusSince).toBe(update.snapshot.ts);
    expect(steady.statusSince).toBe(sinceBefore);
  });

  test('에이전트 등장/퇴장 → agent_appeared/agent_left (+pane_opened/closed)', () => {
    const store = new StatusStore({ source: 'mock', now: mkClock() });
    store.setWorld(mkWorld());

    const grown = store.setWorld(mkWorld({
      panes: [mkPane('w1:p1'), mkPane('w1:p2')],
      agents: [mkAgent('w1:p1'), mkAgent('w1:p2', { kind: 'codex', name: 'helper' })],
    }))!;
    expect(types(grown.events)).toEqual(['pane_opened', 'agent_appeared']);
    expect(grown.events[1]).toMatchObject({ paneId: 'w1:p2', kind: 'codex', name: 'helper' });

    const shrunk = store.setWorld(mkWorld())!;
    expect(types(shrunk.events)).toEqual(['pane_closed', 'agent_left']);
  });

  test('타이틀 변화 → agent_title_changed, 빈 타이틀로의 변화는 무시', () => {
    const store = new StatusStore({ source: 'mock', now: mkClock() });
    store.setWorld(mkWorld());

    const retitled = store.setWorld(mkWorld({
      panes: [mkPane('w1:p1', { title: '리팩토링' })],
      agents: [mkAgent('w1:p1', { title: '리팩토링' })],
    }))!;
    expect(types(retitled.events)).toEqual(['agent_title_changed']);

    const blanked = store.setWorld(mkWorld({
      panes: [mkPane('w1:p1', { title: '' })],
      agents: [mkAgent('w1:p1', { title: '' })],
    }));
    expect(blanked?.events ?? []).toHaveLength(0);
  });

  test('포커스 이동 → focus_changed', () => {
    const store = new StatusStore({ source: 'mock', now: mkClock() });
    store.setWorld(mkWorld());
    const update = store.setWorld(mkWorld({ focus: { workspaceId: 'w1', tabId: 'w1:t1', paneId: 'w1:p9' } }))!;
    expect(types(update.events)).toEqual(['focus_changed']);
  });

  test('연결 끊김/복구 → source_disconnected/source_connected', () => {
    const store = new StatusStore({ source: 'live', now: mkClock() });
    store.setWorld(mkWorld());
    const down = store.setWorld(mkWorld({ connected: false, herdr: null }))!;
    expect(types(down.events)).toEqual(['source_disconnected']);
    expect(down.snapshot.connected).toBe(false);
    const up = store.setWorld(mkWorld())!;
    expect(types(up.events)).toEqual(['source_connected']);
  });

  test('이벤트 없는 변화(워크스페이스 라벨 변경)도 스냅샷은 갱신된다', () => {
    const store = new StatusStore({ source: 'mock', now: mkClock() });
    store.setWorld(mkWorld());
    const ws = mkWorld().workspaces[0]!;
    const update = store.setWorld(mkWorld({ workspaces: [{ ...ws, label: '새이름' }] }))!;
    expect(update.events).toHaveLength(0);
    expect(update.snapshot.workspaces[0]?.label).toBe('새이름');
  });
});

describe('StatusStore 링버퍼·seq', () => {
  test('링버퍼는 ringSize를 넘지 않고 최신 이벤트를 유지한다', () => {
    const store = new StatusStore({ source: 'mock', ringSize: 3, now: mkClock() });
    store.setWorld(mkWorld());
    const statuses = ['idle', 'working', 'blocked', 'working', 'done'] as const;
    let last: ReturnType<StatusStore['setWorld']> = null;
    for (const status of statuses) {
      last = store.setWorld(mkWorld({
        panes: [mkPane('w1:p1', { agentStatus: status })],
        agents: [mkAgent('w1:p1', { status })],
      }));
    }
    const ring = last!.snapshot.recentEvents;
    expect(ring).toHaveLength(3);
    expect(ring.at(-1)).toMatchObject({ type: 'agent_status_changed', to: 'done' });
  });

  test('seq는 스냅샷·이벤트에 걸쳐 단조 증가한다', () => {
    const store = new StatusStore({ source: 'mock', now: mkClock() });
    const seqs: number[] = [];
    const first = store.setWorld(mkWorld())!;
    seqs.push(...first.events.map((e) => e.seq), first.snapshot.seq);
    const second = store.setWorld(mkWorld({ focus: { workspaceId: null, tabId: null, paneId: null } }))!;
    seqs.push(...second.events.map((e) => e.seq), second.snapshot.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    expect(new Set(seqs).size).toBe(seqs.length);
  });
});
