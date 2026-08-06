/**
 * classroom3d-opus 엔트리 — 씬 조립 + /sdk.js 배선 + 렌더 루프.
 *
 * 데이터 흐름: /ws(스냅샷) → classroom.sync → 좌석 배치·라벨,
 *             agent_status_changed → classroom.punctuate → 포즈 전이 + 링/컨페티.
 */
import * as THREE from '../three.module.js';
import { connect } from '/sdk.js';

import { drawBoard, drawClock } from './chalkboard.mjs';
import { createClassroom } from './classroom.mjs';
import { createDust, createEffectPool } from './effects.mjs';
import { ROOM } from './layout.mjs';
import { createLighting } from './lighting.mjs';
import { createOverlay } from './overlay.mjs';
import { createPicker } from './picking.mjs';
import { createProps } from './props.mjs';
import { createRoom } from './room.mjs';
import { createStage } from './stage.mjs';

const LOADING_TIMEOUT_MS = 3000;

function boot() {
  const container = document.getElementById('stage');
  const loading = document.getElementById('loading');
  if (!container) throw new Error('#stage 컨테이너가 없어요 — index.html이 손상됐습니다');

  const overlay = createOverlay(document);
  const hideLoading = () => loading?.classList.add('gone');
  // 서버가 조용해도 교실은 보여준다(연결 상태는 상단 바가 알려준다).
  window.setTimeout(hideLoading, LOADING_TIMEOUT_MS);

  /* ───────── 씬 조립 ───────── */
  const stage = createStage(THREE, container);
  createRoom(THREE, stage.scene);
  const props = createProps(THREE, stage.scene);
  const lighting = createLighting(THREE, stage.scene);
  const effects = createEffectPool(THREE, stage.scene);
  const dust = createDust(THREE, stage.scene, {
    minX: -ROOM.halfWidth + 0.4, maxX: 1.5, minZ: ROOM.backZ + 1, maxZ: ROOM.frontZ - 1,
  });
  const classroom = createClassroom(THREE, stage.scene, effects, stage.camera);

  drawBoard(props.board, null);
  drawClock(props.clock);

  /* ───────── SDK + 인터랙션 배선 ───────── */
  const client = connect();
  let boardDirty = true;
  let lastSnapshot = null;

  const picker = createPicker(THREE, {
    renderer: stage.renderer,
    camera: stage.camera,
    classroom,
    onHover: (occupant, at) => overlay.showTooltip(occupant, at),
    onPick: async (occupant) => {
      try {
        const ok = await client.focusPane(occupant.paneId);
        overlay.toast(
          ok
            ? `${occupant.name ?? occupant.paneId} 자리로 점프했어요`
            : '점프 실패 — mock 모드거나 herdr가 응답하지 않아요',
          ok,
        );
      } catch (error) {
        console.error('focusPane 요청 실패:', error);
        overlay.toast('점프 요청 중 오류가 났어요', false);
      }
    },
  });

  client.onTransport((up) => overlay.setTransport(up));

  client.onUpdate(({ snapshot, events }) => {
    lastSnapshot = snapshot;
    overlay.renderSnapshot(snapshot, classroom.sync(snapshot));
    boardDirty = true;
    for (const event of events) overlay.pushEvent(event);
    hideLoading();
    picker.invalidate();
  });

  client.onEvent('agent_status_changed', (event) => {
    classroom.punctuate(event.paneId, event.to, event.to === 'done');
  });
  client.onEvent('agent_appeared', (event) => {
    classroom.punctuate(event.paneId, event.status, false);
  });

  // 늦게 접속했어도 최근 활동이 보이도록 링버퍼를 한 번 흘려준다.
  const primeFeed = (attempt = 0) => {
    const snapshot = client.snapshot;
    if (!snapshot) {
      if (attempt < 40) window.setTimeout(() => primeFeed(attempt + 1), 120);
      return;
    }
    for (const event of snapshot.recentEvents.slice(-6)) overlay.pushEvent(event);
  };
  primeFeed();

  /* ───────── 루프 ───────── */
  const clock = new THREE.Clock();
  let clockRedrawAt = 0;
  let boardRedrawAt = 0;

  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;

    stage.update(elapsed, dt);
    lighting.focusSpotlights(classroom.update(elapsed, dt), Math.sin(elapsed * 6) * 0.5 + 0.5);
    effects.update(dt);
    dust.update(elapsed, dt);
    picker.update();

    if (elapsed - clockRedrawAt > 1) {
      clockRedrawAt = elapsed;
      drawClock(props.clock);
      picker.invalidate(); // 카메라가 미세하게 흔들리므로 호버 상태를 주기적으로 재검사
    }
    if (boardDirty && elapsed - boardRedrawAt > 0.5) {
      boardRedrawAt = elapsed;
      boardDirty = false;
      drawBoard(props.board, lastSnapshot);
    }

    stage.render();
    window.requestAnimationFrame(frame);
  };

  window.requestAnimationFrame(frame);
}

try {
  boot();
} catch (error) {
  console.error('교실 초기화 실패:', error);
  const loading = document.getElementById('loading');
  if (loading) {
    loading.classList.remove('gone');
    loading.textContent = `교실을 열 수 없어요 — WebGL을 지원하는 브라우저가 필요합니다 (${String(error)})`;
  }
}
