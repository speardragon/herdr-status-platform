/**
 * LiveSource 통합 테스트 — 실측한 herdr 0.8.0 소켓 프로토콜(1연결 1요청,
 * 구독 연결 푸시)을 흉내 내는 가짜 herdr 서버를 unix socket에 띄우고 검증한다.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { ndjsonSplitter } from '../herdrClient.ts';
import type { World } from '../normalize.ts';
import { LiveSource } from './live.ts';

interface FakeState {
  workspaces: Record<string, unknown>[];
  tabs: Record<string, unknown>[];
  panes: Record<string, unknown>[];
  agents: Record<string, unknown>[];
}

const basePane = (paneId: string, status: string) => ({
  pane_id: paneId,
  workspace_id: 'w1',
  tab_id: 'w1:t1',
  focused: false,
  cwd: '/repo',
  agent: 'claude',
  agent_status: status,
  terminal_title: `⠐ 작업중-${paneId}`,
  terminal_title_stripped: `작업중-${paneId}`,
});

const baseAgent = (paneId: string, status: string) => ({
  ...basePane(paneId, status),
  name: undefined,
  agent: 'claude',
});

const initialFakeState = (): FakeState => ({
  workspaces: [{ workspace_id: 'w1', number: 1, label: 'demo', focused: true, pane_count: 1, tab_count: 1, active_tab_id: 'w1:t1', agent_status: 'working' }],
  tabs: [{ tab_id: 'w1:t1', workspace_id: 'w1', number: 1, label: '1', focused: true, pane_count: 1, agent_status: 'working' }],
  panes: [basePane('w1:p1', 'working')],
  agents: [baseAgent('w1:p1', 'working')],
});

/** 1연결 1요청 + 구독 푸시 프로토콜을 흉내 내는 가짜 herdr. */
class FakeHerdr {
  readonly requests: string[] = [];
  #server: net.Server | null = null;
  #subscribers = new Set<net.Socket>();
  #sockets = new Set<net.Socket>();

  constructor(readonly socketPath: string, public state: FakeState) {}

  listen(): Promise<void> {
    try {
      fs.unlinkSync(this.socketPath); // 이전 서버가 남긴 소켓 파일 정리 (재기동 시나리오)
    } catch {
      /* 없으면 그만 */
    }
    return new Promise((resolve, reject) => {
      this.#server = net.createServer((sock) => {
        this.#sockets.add(sock);
        sock.on('close', () => this.#sockets.delete(sock));
        let handled = false;
        sock.on('data', ndjsonSplitter((line) => {
          if (handled) {
            sock.destroy(); // 실제 herdr처럼 두 번째 요청은 거부
            return;
          }
          handled = true;
          const req = JSON.parse(line) as { id: string; method: string };
          this.requests.push(req.method);
          if (req.method === 'session.snapshot') {
            this.#reply(sock, req.id, {
              type: 'session_snapshot',
              snapshot: {
                version: '0.8.0-fake', protocol: 19,
                focused_workspace_id: 'w1', focused_tab_id: 'w1:t1', focused_pane_id: 'w1:p1',
                workspaces: this.state.workspaces, tabs: this.state.tabs, panes: this.state.panes,
              },
            });
          } else if (req.method === 'agent.list') {
            this.#reply(sock, req.id, { type: 'agent_list', agents: this.state.agents });
          } else if (req.method === 'events.subscribe') {
            this.#reply(sock, req.id, { type: 'subscription_started' });
            this.#subscribers.add(sock);
            sock.on('close', () => this.#subscribers.delete(sock));
          } else {
            sock.write(JSON.stringify({ id: req.id, error: { code: 'invalid_request', message: req.method } }) + '\n');
          }
        }));
        sock.on('error', () => {});
      });
      this.#server.once('error', reject);
      this.#server.listen(this.socketPath, resolve);
    });
  }

  #reply(sock: net.Socket, id: string, result: unknown): void {
    sock.write(JSON.stringify({ id, result }) + '\n');
  }

  push(event: string, data: Record<string, unknown>): void {
    const line = JSON.stringify({ data: { ...data, type: event }, event }) + '\n';
    for (const sock of this.#subscribers) sock.write(line);
  }

  async close(): Promise<void> {
    for (const sock of this.#sockets) sock.destroy();
    this.#sockets.clear();
    this.#subscribers.clear();
    const server = this.#server;
    this.#server = null;
    if (!server) return; // 이미 닫힘 — 두 번째 close가 영원히 대기하지 않도록
    await new Promise<void>((resolve) => {
      const failsafe = setTimeout(resolve, 500); // 콜백 유실 시에도 teardown이 멈추지 않게
      server.close(() => {
        clearTimeout(failsafe);
        resolve();
      });
    });
  }
}

/** listener에 들어온 세계들을 모아 조건 매칭까지 기다리는 수집기. */
const worldCollector = () => {
  const worlds: World[] = [];
  const waiters: Array<{ pred: (w: World) => boolean; resolve: (w: World) => void }> = [];
  const listener = (world: World) => {
    worlds.push(world);
    for (const [i, waiter] of [...waiters.entries()].reverse()) {
      if (waiter.pred(world)) {
        waiters.splice(i, 1);
        waiter.resolve(world);
      }
    }
  };
  const waitFor = (pred: (w: World) => boolean, timeoutMs = 3000): Promise<World> => {
    const already = worlds.findLast(pred);
    if (already) return Promise.resolve(already);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('waitFor 타임아웃')), timeoutMs);
      waiters.push({ pred, resolve: (w) => { clearTimeout(timer); resolve(w); } });
    });
  };
  return { worlds, listener, waitFor };
};

const mkSocketPath = () =>
  path.join(os.tmpdir(), `hsp-test-${process.pid}-${Math.random().toString(36).slice(2, 8)}.sock`);

describe('LiveSource ↔ 가짜 herdr 소켓', () => {
  const cleanups: Array<() => Promise<void> | void> = [];
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });

  const setup = async (state: FakeState = initialFakeState()) => {
    const socketPath = mkSocketPath();
    const fake = new FakeHerdr(socketPath, state);
    await fake.listen();
    const source = new LiveSource({ socketPath, resyncDebounceMs: 20, reconnectDelayMs: 80, failsafeResyncMs: null });
    const collector = worldCollector();
    // pop 순서상 source.stop이 먼저 — 서버 teardown 중 재접속 시도를 막는다.
    cleanups.push(() => fake.close(), () => source.stop());
    return { fake, source, collector };
  };

  test('시작 시 session.snapshot + agent.list로 초기 세계를 만든다', async () => {
    const { fake, source, collector } = await setup();
    source.start(collector.listener);
    const world = await collector.waitFor((w) => w.connected);
    expect(world.agents).toHaveLength(1);
    expect(world.agents[0]).toMatchObject({ paneId: 'w1:p1', status: 'working', title: '작업중-w1:p1' });
    expect(world.herdr).toEqual({ version: '0.8.0-fake', protocol: 19 });
    expect(fake.requests).toContain('session.snapshot');
    expect(fake.requests).toContain('agent.list');
  });

  test('pane_updated 푸시는 resync 없이 캐시에 패치된다', async () => {
    const { fake, source, collector } = await setup();
    source.start(collector.listener);
    await collector.waitFor((w) => w.connected);
    const resyncsBefore = fake.requests.filter((m) => m === 'session.snapshot').length;

    fake.push('pane_updated', { pane: basePane('w1:p1', 'blocked') });
    const world = await collector.waitFor((w) => w.agents[0]?.status === 'blocked');

    expect(world.agents[0]?.status).toBe('blocked');
    expect(fake.requests.filter((m) => m === 'session.snapshot').length).toBe(resyncsBefore);
  });

  test('구조 이벤트(pane_created)는 디바운스 후 resync를 유발한다', async () => {
    const { fake, source, collector } = await setup();
    source.start(collector.listener);
    await collector.waitFor((w) => w.connected);

    fake.state.panes.push(basePane('w1:p2', 'working'));
    fake.state.agents.push(baseAgent('w1:p2', 'working'));
    fake.push('pane_created', { pane_id: 'w1:p2', workspace_id: 'w1' });

    const world = await collector.waitFor((w) => w.agents.length === 2);
    expect(world.agents.map((a) => a.paneId)).toEqual(['w1:p1', 'w1:p2']);
  });

  test('서버가 죽으면 connected:false로 알리고, 살아나면 재접속한다', async () => {
    const { fake, source, collector } = await setup();
    source.start(collector.listener);
    await collector.waitFor((w) => w.connected);

    await fake.close();
    const down = await collector.waitFor((w) => !w.connected);
    expect(down.agents).toHaveLength(1); // 마지막으로 본 상태는 유지

    const revived = new FakeHerdr(fake.socketPath, initialFakeState());
    await revived.listen();
    cleanups.push(() => revived.close());
    const up = await collector.waitFor((w) => w.connected);
    expect(up.agents).toHaveLength(1);
  });
});
