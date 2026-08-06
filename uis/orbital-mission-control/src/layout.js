/**
 * 방위 레이아웃 — 워크스페이스 = 스코프의 방위 섹터, 에이전트 = 섹터 안의 고정 슬롯.
 *
 * 궤도를 실제로 "돌게" 하지 않는 이유: 관전 UI에서는 개체를 눈으로 계속 추적할 수 있어야 한다.
 * 그래서 각도는 워크스페이스 섹터 안에 고정하고, 상태별 진동(libration)으로만 살아 있게 만든다.
 */
import { TAU } from './util.js';

/** 12시 방향에서 시작해 시계 방향으로 섹터를 깐다. */
const START_ANGLE = -Math.PI / 2;
const MAX_SECTOR_GAP = 0.13;
const SECTOR_GAP_RATIO = 0.14;

const EMPTY_LAYOUT = Object.freeze({ sectors: [], slots: new Map() });

/**
 * @param {object|null} snapshot
 * @returns {{sectors: Array<object>, slots: Map<string, number>}}
 */
export const computeLayout = (snapshot) => {
  const agents = snapshot?.agents ?? [];
  if (agents.length === 0) return EMPTY_LAYOUT;

  const labelOf = new Map((snapshot?.workspaces ?? []).map((w) => [w.workspaceId, w.label]));
  const workspaceIds = [...new Set(agents.map((a) => a.workspaceId))].sort();
  const size = TAU / workspaceIds.length;
  const gap = Math.min(size * SECTOR_GAP_RATIO, MAX_SECTOR_GAP);

  const sectors = workspaceIds.map((workspaceId, index) => {
    const a0 = START_ANGLE + index * size;
    const members = agents
      .filter((a) => a.workspaceId === workspaceId)
      .slice()
      .sort((x, y) => x.paneId.localeCompare(y.paneId));
    return {
      workspaceId,
      label: labelOf.get(workspaceId) ?? workspaceId,
      a0,
      a1: a0 + size,
      mid: a0 + size / 2,
      members,
      blocked: members.filter((a) => a.status === 'blocked').length,
    };
  });

  const slots = new Map(
    sectors.flatMap((sector) => {
      const lo = sector.a0 + gap;
      const span = sector.a1 - gap - lo;
      const count = sector.members.length;
      return sector.members.map((agent, i) => [
        agent.paneId,
        count === 1 ? sector.mid : lo + ((i + 0.5) * span) / count,
      ]);
    }),
  );

  return { sectors, slots };
};
