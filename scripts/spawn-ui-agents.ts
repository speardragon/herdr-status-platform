#!/usr/bin/env bun
/**
 * UI 제작 에이전트 편대 발사기.
 *
 * 현재 herdr 워크스페이스에 에이전트별 탭을 만들고, 지정 모델로 auto 모드 시작한 뒤
 * 제작 프롬프트를 전달-검증(--wait --until working)까지 한다. 실패한 에이전트는
 * 건너뛰고 마지막에 결과를 요약하므로, 문제 난 것만 골라 수동 조치하면 된다.
 *
 * 실행: bun scripts/spawn-ui-agents.ts   (herdr 안에서)
 * 재사용: AGENTS 배열에 항목 추가/수정 후 다시 실행 (이름이 살아있으면 충돌하니
 *         기존 에이전트를 먼저 정리하거나 이름을 바꿀 것)
 */
import { $ } from 'bun';
import * as path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const WORKSPACE = process.env['HERDR_WORKSPACE_ID'];
const PARENT = process.env['HERDR_PANE_ID'];

if (process.env['HERDR_ENV'] !== '1' || !WORKSPACE || !PARENT) {
  console.error('herdr 관리 pane 안에서 실행해야 해요 (HERDR_ENV=1, HERDR_WORKSPACE_ID, HERDR_PANE_ID 필요)');
  process.exit(1);
}

interface AgentSpec {
  readonly name: string;
  readonly kind: 'claude' | 'codex';
  readonly args: readonly string[];
  readonly seed: string;
  readonly port: number;
}

const CLAUDE_AUTO = ['--permission-mode', 'bypassPermissions'] as const;
const CODEX_AUTO = [
  '-s', 'workspace-write',
  '-a', 'on-request',
  '-c', 'sandbox_workspace_write.network_access=true', // mock 서버 구동·curl 검증용
] as const;

const AGENTS: readonly AgentSpec[] = [
  {
    name: 'ui-fable',
    kind: 'claude',
    args: [...CLAUDE_AUTO, '--model', 'claude-fable-5'],
    seed: '자연/생태계 — 동식물·목장·바다·정원 같은 살아있는 세계',
    port: 7801,
  },
  {
    name: 'ui-opus',
    kind: 'claude',
    args: [...CLAUDE_AUTO, '--model', 'claude-opus-5'],
    seed: '우주/관제 — 미션 컨트롤·관제탑·레이더·우주선',
    port: 7802,
  },
  {
    name: 'ui-sol-max',
    kind: 'codex',
    args: [...CODEX_AUTO, '-m', 'gpt-5.6-sol', '-c', 'model_reasoning_effort=max'],
    seed: '스포츠/경쟁 — 레이스·리그·토너먼트·전광판',
    port: 7803,
  },
  {
    name: 'ui-sol-xhigh',
    kind: 'codex',
    args: [...CODEX_AUTO, '-m', 'gpt-5.6-sol', '-c', 'model_reasoning_effort=xhigh'],
    seed: '도시/인프라 — 교통·지하철 노선도·항만·전력망',
    port: 7804,
  },
  {
    name: 'ui-terra',
    kind: 'codex',
    args: [...CODEX_AUTO, '-m', 'gpt-5.6-terra', '-c', 'model_reasoning_effort=max'],
    seed: '레트로 아케이드 — 8비트 게임·픽셀아트·CRT 감성',
    port: 7805,
  },
];

const buildPrompt = (a: AgentSpec): string => `너는 herdr-status-platform의 UI 제작자다. 이 저장소는 병렬 코딩 에이전트들의 상태를 재밌고 가시성 있게 관전하는 웹 플랫폼이다.

임무: uis/ 아래에 새 관전 UI 하나를 완성하라.
영감 방향: ${a.seed}. 이 방향 안에서 구체 컨셉·연출·폴더명은 전적으로 네 재량으로 디벨롭하라. 폴더명은 kebab-case로 짓되 기존 uis/ 폴더와 겹치지 않게.

먼저 읽어라 — 계약의 원천은 코드다:
- server/types.ts : Snapshot·PlatformEvent·WireMessage 계약 전부
- uis/debug/index.html : /sdk.js 사용 예제 (connect, onUpdate, onEvent, focusPane)
- server/uis.ts : ui.json 규약 (title/description/emoji/order)

규칙:
1. uis/<네폴더>/ 밖의 파일은 절대 만들거나 수정하지 마라. ui.json + index.html + 같은 폴더 안의 에셋만.
2. git 커밋·푸시 금지 — 검수 후 별도 처리된다.
3. 외부 CDN·네트워크 의존성 금지. 빌드 없는 vanilla ESM. 3D가 꼭 필요하면 legacy/vendor/three.module.js 를 네 폴더로 복사해서 써라.
4. 동작 검증: bun run mock --port ${a.port} 를 백그라운드로 띄우고 http://127.0.0.1:${a.port}/ui/<네폴더>/ 가 200으로 뜨는지, JS 문법 오류가 없는지 가능한 수단으로 확인하라. 검증이 끝나면 그 mock 서버 프로세스는 반드시 종료해라.
5. 표현 요건: 상태 4종(working/idle/blocked/done)이 첫눈에 구분될 것. agent_status_changed 순간의 전이 연출 필수. blocked가 가장 눈에 띄어야 한다. 요소 클릭 → client.focusPane(paneId) 점프 포함. snapshot.recentEvents 링버퍼도 활용하면 좋다.
6. 이 작업은 pane ${PARENT}의 에이전트가 시작시킨 자율 작업이다. 완료될 때까지 스스로 구현하라 — 중간에 질문하거나 승인을 기다리지 말고, 막히면 스스로 결정하고 끝까지 완성하라.
7. 완성 기준을 모두 충족하면, 마지막에 딱 한 번 아래 명령으로 보고하라:
   herdr agent prompt ${PARENT} "[${a.name} done] <폴더명> — <컨셉 한 줄 소개>"`;

interface LaunchResult {
  readonly name: string;
  readonly pane: string | null;
  readonly ok: boolean;
  readonly note: string;
}

const errText = (error: unknown): string => {
  const stderr = (error as { stderr?: Buffer }).stderr?.toString().trim();
  return (stderr || String(error instanceof Error ? error.message : error)).slice(0, 300);
};

/** 재실행 대비 현황 수집 — 살아있는 에이전트(name→상태)와 에이전트 이름 라벨의 기존 탭. */
const agentList = (await $`herdr agent list`.quiet().json()) as {
  result: { agents: Array<{ name?: string; pane_id: string; agent_status: string }> };
};
const liveAgents = new Map(
  agentList.result.agents.filter((a) => a.name).map((a) => [a.name!, a]),
);
const tabList = (await $`herdr tab list --workspace ${WORKSPACE}`.quiet().json()) as {
  result: { tabs: Array<{ tab_id: string; label: string }> };
};
const paneList = (await $`herdr pane list`.quiet().json()) as {
  result: { panes: Array<{ pane_id: string; tab_id: string }> };
};
const tabRootPane = (label: string): string | null => {
  const tab = tabList.result.tabs.find((t) => t.label === label);
  return tab ? (paneList.result.panes.find((p) => p.tab_id === tab.tab_id)?.pane_id ?? null) : null;
};

const results: LaunchResult[] = [];

for (const agent of AGENTS) {
  let pane: string | null = null;
  try {
    const existing = liveAgents.get(agent.name);

    if (existing) {
      pane = existing.pane_id;
      if (existing.agent_status !== 'idle') {
        // 이미 프롬프트를 받고 도는 중 — 건드리지 않는다.
        results.push({ name: agent.name, pane, ok: true, note: `이미 ${existing.agent_status} — 건너뜀` });
        console.log(`↻ ${agent.name} (${pane}) — 이미 ${existing.agent_status}, 건너뜀`);
        continue;
      }
    } else {
      pane = tabRootPane(agent.name);
      if (!pane) {
        const tab = (await $`herdr tab create --workspace ${WORKSPACE} --cwd ${ROOT} --label ${agent.name} --no-focus`.quiet().json()) as {
          result: { root_pane: { pane_id: string } };
        };
        pane = tab.result.root_pane.pane_id;
        // 갓 만든 pane은 셸 초기화가 끝나기 전이라 즉시 start하면 실패한다.
        await Bun.sleep(1500);
      }
      await $`herdr agent start ${agent.name} --kind ${agent.kind} --pane ${pane} -- ${agent.args}`.quiet();
    }

    await $`herdr agent prompt ${agent.name} ${buildPrompt(agent)} --wait --until working --timeout 20000`.quiet();
    results.push({ name: agent.name, pane, ok: true, note: '작업 시작 확인됨' });
    console.log(`✅ ${agent.name} (${pane}) — 작업 시작 확인`);
  } catch (error) {
    const note = errText(error);
    results.push({ name: agent.name, pane, ok: false, note });
    console.log(`⚠️ ${agent.name} (${pane ?? '탭 생성 실패'}) — ${note}`);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n요약: ${results.length - failed.length}/${results.length} 발사 성공`);
if (failed.length > 0) {
  console.log('실패 목록 — pane 화면을 읽고 수동 조치 필요:');
  for (const f of failed) console.log(`  - ${f.name} (${f.pane ?? '-'}): ${f.note}`);
  process.exit(1);
}
