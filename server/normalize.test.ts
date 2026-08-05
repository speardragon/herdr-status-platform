import { describe, expect, test } from 'bun:test';
import { normalizeWorld, toAgentStatus, type RawWorldParts } from './normalize.ts';

/** probe로 실측한 herdr 0.8.0 session.snapshot/agent.list 페이로드의 축약 픽스처. */
const rawFixture: RawWorldParts = {
  connected: true,
  herdr: { version: '0.8.0', protocol: 19 },
  focus: { workspaceId: 'w1N', tabId: 'w1N:t1', paneId: 'w1N:p1' },
  workspaces: [
    {
      workspace_id: 'w16',
      number: 2,
      label: 'aidt-edu-core',
      focused: false,
      pane_count: 2,
      tab_count: 2,
      active_tab_id: 'w16:t6',
      agent_status: 'idle',
      worktree: {
        repo_name: 'aidt-edu-core',
        checkout_path: '/Users/goorm/Desktop/goorm/workspace/aidt-edu-core',
        is_linked_worktree: false,
      },
    },
    {
      workspace_id: 'w14',
      number: 1,
      label: 'ray-brain',
      focused: false,
      pane_count: 4,
      tab_count: 3,
      active_tab_id: 'w14:tH',
      agent_status: 'working',
    },
  ],
  tabs: [
    { tab_id: 'w14:tH', workspace_id: 'w14', number: 17, label: 'herdr-status-platform', focused: false, pane_count: 1, agent_status: 'working' },
    { tab_id: 'w14:t3', workspace_id: 'w14', number: 3, label: 'main', focused: false, pane_count: 2, agent_status: 'idle' },
  ],
  panes: [
    {
      pane_id: 'w14:p1F',
      workspace_id: 'w14',
      tab_id: 'w14:tH',
      focused: false,
      cwd: '/Users/goorm/Desktop/ray/workspace/herdr-status-platform',
      agent: 'claude',
      agent_status: 'working',
      terminal_title: '⠐ Claude Code',
      terminal_title_stripped: 'Claude Code',
    },
    {
      pane_id: 'w16:p2',
      workspace_id: 'w16',
      tab_id: 'w16:t1',
      focused: false,
      cwd: '/Users/goorm/Desktop/goorm/workspace/aidt-edu-core',
      terminal_title: 'goorm@RayKang:~/workspace',
    },
  ],
  agents: [
    {
      pane_id: 'w14:p1E',
      workspace_id: 'w14',
      tab_id: 'w14:tG',
      agent: 'codex',
      name: 'voxel-assets',
      agent_status: 'idle',
      terminal_title: 'ray-brain',
      terminal_title_stripped: 'ray-brain',
      cwd: '/Users/goorm/Desktop/goorm/workspace/ray-brain/dashboard',
      focused: false,
    },
    {
      pane_id: 'w14:p1F',
      workspace_id: 'w14',
      tab_id: 'w14:tH',
      agent: 'claude',
      agent_status: 'working',
      terminal_title: '⠐ Claude Code',
      terminal_title_stripped: 'Claude Code',
      cwd: '/Users/goorm/Desktop/ray/workspace/herdr-status-platform',
      focused: false,
    },
  ],
};

describe('toAgentStatus', () => {
  test('알려진 상태는 그대로, 모르는 문자열은 unknown, 없으면 null', () => {
    expect(toAgentStatus('working')).toBe('working');
    expect(toAgentStatus('done')).toBe('done');
    expect(toAgentStatus('grilling')).toBe('unknown');
    expect(toAgentStatus(undefined)).toBeNull();
    expect(toAgentStatus(null)).toBeNull();
  });
});

describe('normalizeWorld', () => {
  const world = normalizeWorld(rawFixture);

  test('워크스페이스는 number 순 정렬 + worktree 매핑', () => {
    expect(world.workspaces.map((w) => w.workspaceId)).toEqual(['w14', 'w16']);
    expect(world.workspaces[0]).toEqual({
      workspaceId: 'w14',
      number: 1,
      label: 'ray-brain',
      focused: false,
      tabCount: 3,
      paneCount: 4,
      activeTabId: 'w14:tH',
      agentStatus: 'working',
      worktree: null,
    });
    expect(world.workspaces[1]?.worktree).toEqual({
      repoName: 'aidt-edu-core',
      checkoutPath: '/Users/goorm/Desktop/goorm/workspace/aidt-edu-core',
      isLinkedWorktree: false,
    });
  });

  test('탭은 워크스페이스·번호순 정렬', () => {
    expect(world.tabs.map((t) => t.tabId)).toEqual(['w14:t3', 'w14:tH']);
  });

  test('pane은 스피너 제거 타이틀을 쓰고, 에이전트 없는 pane은 agentKind null', () => {
    const agentPane = world.panes.find((p) => p.paneId === 'w14:p1F');
    expect(agentPane?.title).toBe('Claude Code');
    expect(agentPane?.agentKind).toBe('claude');
    expect(agentPane?.agentStatus).toBe('working');

    const shellPane = world.panes.find((p) => p.paneId === 'w16:p2');
    expect(shellPane?.agentKind).toBeNull();
    expect(shellPane?.agentStatus).toBeNull();
    expect(shellPane?.title).toBe('goorm@RayKang:~/workspace');
  });

  test('에이전트는 paneId 정렬 + name 유무 매핑', () => {
    expect(world.agents.map((a) => a.paneId)).toEqual(['w14:p1E', 'w14:p1F']);
    expect(world.agents[0]?.name).toBe('voxel-assets');
    expect(world.agents[1]?.name).toBeNull();
    expect(world.agents[1]?.title).toBe('Claude Code');
  });
});
