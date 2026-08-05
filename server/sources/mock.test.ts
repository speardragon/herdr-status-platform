import { describe, expect, test } from 'bun:test';
import { normalizeWorld } from '../normalize.ts';
import type { AgentStatus } from '../types.ts';
import { advanceMockWorld, createMockWorldState, mockStateToRawParts } from './mock.ts';

const LEGAL: Readonly<Record<AgentStatus, readonly AgentStatus[]>> = {
  working: ['idle', 'done', 'blocked'],
  idle: ['working'],
  blocked: ['working'],
  done: ['working'],
  unknown: ['working'],
};

describe('MockSource 시뮬레이터', () => {
  test('같은 seed면 전개가 완전히 같다 (결정성)', () => {
    const run = (seed: number) => {
      let s = createMockWorldState(seed);
      const frames: string[] = [];
      for (let i = 0; i < 30; i++) {
        s = advanceMockWorld(s);
        frames.push(JSON.stringify(mockStateToRawParts(s)));
      }
      return frames;
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });

  test('상태 전이는 항상 허용된 그래프를 따른다', () => {
    let s = createMockWorldState(1);
    let prev = new Map(s.agents.map((a) => [a.paneId, a.status]));
    for (let i = 0; i < 300; i++) {
      s = advanceMockWorld(s);
      for (const a of s.agents) {
        const before = prev.get(a.paneId);
        if (before !== undefined && before !== a.status) {
          expect(LEGAL[before]).toContain(a.status);
        }
      }
      prev = new Map(s.agents.map((a) => [a.paneId, a.status]));
    }
  });

  test('세계는 내부적으로 일관된다 — 에이전트 pane 존재, 수 집계, 마릿수 범위', () => {
    let s = createMockWorldState(3);
    for (let i = 0; i < 200; i++) {
      s = advanceMockWorld(s, { min: 3, max: 9 });
      const raw = mockStateToRawParts(s);
      expect(s.agents.length).toBeGreaterThanOrEqual(3);
      expect(s.agents.length).toBeLessThanOrEqual(9);
      const paneIds = new Set(raw.panes.map((p) => p.pane_id));
      for (const a of raw.agents) expect(paneIds.has(a.pane_id)).toBe(true);
      for (const w of raw.workspaces) {
        expect(w.pane_count).toBe(raw.panes.filter((p) => p.workspace_id === w.workspace_id).length);
      }
    }
  });

  test('정규화 경로를 그대로 통과한다 (live와 같은 계약)', () => {
    const world = normalizeWorld(mockStateToRawParts(createMockWorldState(42)));
    expect(world.agents.length).toBeGreaterThan(0);
    for (const a of world.agents) {
      expect(['working', 'idle', 'blocked', 'done', 'unknown']).toContain(a.status);
      expect(a.title.length).toBeGreaterThan(0);
    }
    expect(world.connected).toBe(true);
  });
});
