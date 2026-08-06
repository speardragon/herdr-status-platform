#!/usr/bin/env bun
/**
 * 2라운드 지정 미션 디스패처 — 이미 떠 있는 UI 제작 에이전트 5명에게
 * 동일한 "교실" 컨셉 스펙을 전달한다. 같은 미션이라 폴더명은 충돌 방지를 위해
 * 에이전트별로 지정한다. idle이 아닌 에이전트는 건너뛴다(재실행 안전).
 *
 * 실행: bun scripts/dispatch-classroom.ts   (herdr 안에서)
 */
import { $ } from 'bun';

const PARENT = process.env['HERDR_PANE_ID'];
if (process.env['HERDR_ENV'] !== '1' || !PARENT) {
  console.error('herdr 관리 pane 안에서 실행해야 해요');
  process.exit(1);
}

interface Mission {
  readonly name: string;
  readonly folder: string;
  readonly port: number;
}

const MISSIONS: readonly Mission[] = [
  { name: 'ui-fable', folder: 'classroom-fable', port: 7801 },
  { name: 'ui-opus', folder: 'classroom-opus', port: 7802 },
  { name: 'ui-sol-max', folder: 'classroom-sol-max', port: 7803 },
  { name: 'ui-sol-xhigh', folder: 'classroom-sol-xhigh', port: 7804 },
  { name: 'ui-terra', folder: 'classroom-terra', port: 7805 },
];

const buildPrompt = (m: Mission): string => `2라운드 지정 미션이다. 이번에는 자유 컨셉이 아니라 아래 스펙을 정확히 구현하라.

임무: uis/${m.folder}/ 에 "교실" 관전 UI를 완성하라. 폴더명은 반드시 ${m.folder} 를 그대로 써라 — 다른 제작자들도 같은 미션을 받아서 폴더명이 지정된다.

컨셉 스펙 (필수):
- 배경은 학교 교실. 각 에이전트는 학생이다. 선생님(사용자) 1인칭 시점 — 교탁 앞에서 학생들이 앉아 있는 교실 전체를 바라보는 구도.
- 상태 표현 매핑:
  · working = 책상에서 열심히 공부하는 모습
  · idle = 책상에 엎드려 있는 모습
  · blocked = 손을 번쩍 들고 질문하는 모습 — 교실에서 가장 눈에 띄어야 한다
  · done = 양손 엄지척(따봉)
- 각 학생이 지금 무슨 작업을 하는지(agent title)가 화면에서 보여야 한다 — 명찰·공책·말풍선 등 방식은 재량.
- 반응형 필수: 넓은 데스크톱과 좁은 화면 모두에서 레이아웃이 무너지지 않아야 한다.
- agent_status_changed 순간의 전이 연출 필수. 학생 클릭 → client.focusPane(paneId) 점프. snapshot.recentEvents 링버퍼 활용 권장.
- 아트 스타일(픽셀/벡터 등)과 교실 소품(칠판·급훈·시간표·창밖 풍경 등) 디테일은 전적으로 네 재량 — 스펙 안에서 최대한 재밌게 디벨롭하라.

읽을 것(1라운드에서 이미 읽었다면 생략 가능): server/types.ts · uis/debug/index.html · server/uis.ts

규칙(1라운드와 동일):
1. uis/${m.folder}/ 밖의 파일은 절대 만들거나 수정하지 마라.
2. git 커밋·푸시 금지 — 검수 후 별도 처리된다.
3. 외부 CDN·네트워크 의존성 금지, 빌드 없는 vanilla ESM.
4. bun run mock --port ${m.port} 를 띄워 http://127.0.0.1:${m.port}/ui/${m.folder}/ 로 동작을 검증하고, 끝나면 그 mock 서버 프로세스는 반드시 종료해라.
5. 완료될 때까지 스스로 구현하라 — 중간에 질문하거나 승인을 기다리지 말고, 막히면 스스로 결정하고 끝까지 완성하라.

완성 기준을 모두 충족하면, 마지막에 딱 한 번 아래 명령으로 보고하라:
herdr agent prompt ${PARENT} "[${m.name} done] ${m.folder} — <구현 특징 한 줄>"`;

const agentList = (await $`herdr agent list`.quiet().json()) as {
  result: { agents: Array<{ name?: string; pane_id: string; agent_status: string }> };
};
const liveAgents = new Map(agentList.result.agents.filter((a) => a.name).map((a) => [a.name!, a]));

let failed = 0;
for (const mission of MISSIONS) {
  const agent = liveAgents.get(mission.name);
  if (!agent) {
    console.log(`⚠️ ${mission.name} — 살아있는 에이전트가 없음 (spawn-ui-agents.ts로 먼저 띄울 것)`);
    failed += 1;
    continue;
  }
  if (agent.agent_status === 'working') {
    console.log(`↻ ${mission.name} (${agent.pane_id}) — 이미 working, 건너뜀`);
    continue;
  }
  try {
    await $`herdr agent prompt ${mission.name} ${buildPrompt(mission)} --wait --until working --timeout 20000`.quiet();
    console.log(`✅ ${mission.name} (${agent.pane_id}) → ${mission.folder} 미션 시작 확인`);
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString().trim();
    console.log(`⚠️ ${mission.name} — ${(stderr || String(error)).slice(0, 250)}`);
    failed += 1;
  }
}

console.log(`\n요약: ${MISSIONS.length - failed}/${MISSIONS.length} 디스패치 성공`);
if (failed > 0) process.exit(1);
