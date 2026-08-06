#!/usr/bin/env bun
/**
 * 3라운드 지정 미션 디스패처 — three.js 실사풍 3D 교실.
 * 2라운드 평면 교실이 반려되어, 같은 컨셉을 진짜 3D 씬으로 재도전한다.
 * 에이전트 세션이 초기화된 상태를 전제로 프롬프트는 완전 자립형이다.
 *
 * 실행: bun scripts/dispatch-classroom3d.ts   (herdr 안에서)
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
  { name: 'ui-fable', folder: 'classroom3d-fable', port: 7801 },
  { name: 'ui-opus', folder: 'classroom3d-opus', port: 7802 },
  { name: 'ui-sol-max', folder: 'classroom3d-sol-max', port: 7803 },
  { name: 'ui-sol-xhigh', folder: 'classroom3d-sol-xhigh', port: 7804 },
  { name: 'ui-terra', folder: 'classroom3d-terra', port: 7805 },
];

const buildPrompt = (m: Mission): string => `지정 미션이다. 아래 스펙을 정확히 구현하라. (이전 대화 기억이 없어도 이 프롬프트만으로 완결된다.)

배경: 이 저장소(herdr-status-platform)는 병렬 코딩 에이전트들의 상태를 관전하는 웹 플랫폼이다. uis/<폴더>/에 ui.json + index.html을 두면 갤러리에 자동 등록되고, 각 UI는 /sdk.js로 상태를 구독한다. 이전 라운드에서 2D 평면 교실 UI 5종이 만들어졌지만(uis/classroom-*) 입체감이 없어 반려됐다. 이번 미션은 같은 컨셉을 진짜 3D로 만드는 것이다.

임무: uis/${m.folder}/ 에 three.js 기반 "실사풍 3D 교실" 관전 UI를 완성하라. 폴더명은 반드시 ${m.folder}.

3D 필수 요건:
- three.js는 이 저장소에 벤더로 있다: legacy/vendor/three.module.js (r170). 이 파일을 네 폴더 안으로 복사해서 상대경로로 import해라. 서버는 /ui/<폴더>/ 밖의 파일을 서빙하지 않으므로 복사 없이는 로드가 안 된다. CDN·npm·react-three-fiber는 금지(빌드가 없는 플랫폼이다). addons(OrbitControls 등)도 벤더에 없으니 필요하면 직접 짜라.
- 참고 예제: legacy/office3d.mjs 가 같은 벤더 three로 만든 기존 3D 씬이다 — 조명·그림자·CanvasTexture 라벨·Raycaster 클릭 패턴을 참고해도 좋다 (단, 데이터 스키마는 구식이니 코드 구조만 참고).
- 씬: 원근 카메라 = 교탁 앞 선생님 1인칭 시점. 바닥·벽·창문·칠판이 있는 교실, 책상들이 원근감 있게 줄지어 있고, 각 책상에 3D 학생 캐릭터가 앉아 있다. 조명(자연광+실내등)과 그림자로 입체감을 살려라. 마우스 움직임에 따른 미세한 카메라 시차(parallax)나 부드러운 idle 모션이 있으면 "살아있는" 느낌이 커진다.
- 상태 = 3D 포즈 + 애니메이션:
  · working: 책상 앞에 앉아 필기하는 모션(팔이 움직임)
  · idle: 책상에 엎드림
  · blocked: 팔을 번쩍 들고 흔듦 — 교실에서 가장 눈에 띄게(스포트라이트·경광 링 등 추가 연출 재량)
  · done: 양손 엄지척 포즈
- 각 학생이 무슨 작업(title)을 하는지 씬 안에서 보여야 한다 — 머리 위 빌보드/CanvasTexture 라벨 등 방식 재량.
- agent_status_changed 순간 3D 전이 연출(포즈 전환 + 이펙트). Raycaster로 학생 클릭 → client.focusPane(paneId).
- HTML 오버레이(스탯 바·이벤트 피드)는 보조로 허용하되 주인공은 3D 씬이다.
- 반응형: 리사이즈 대응(카메라 aspect·renderer 크기 갱신), renderer.setPixelRatio는 2로 캡, 에이전트 12명 기준 부드러운 프레임 유지.

데이터 계약 (코드가 원천):
- server/types.ts : Snapshot·PlatformEvent 전체 계약
- uis/debug/index.html : /sdk.js 사용 예제 — import { connect } from '/sdk.js'; client.onUpdate(({snapshot})=>...); client.onEvent('agent_status_changed', e=>...); client.focusPane(paneId)
- server/uis.ts : ui.json 규약 (title/description/emoji/order)

규칙:
1. uis/${m.folder}/ 밖의 파일은 절대 만들거나 수정하지 마라.
2. git 커밋·푸시 금지 — 검수 후 별도 처리된다.
3. rm 명령은 권한 규칙에 걸려 멈춘다 — 임시 파일은 덮어쓰거나 그냥 두고 진행해라.
4. 동작 검증: bun run mock --port ${m.port} 를 띄워 http://127.0.0.1:${m.port}/ui/${m.folder}/ 를 확인하고(WebGL 에러·콘솔 에러 없어야 함), 끝나면 그 mock 서버 프로세스는 반드시 종료해라.
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
