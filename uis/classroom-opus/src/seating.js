/**
 * 자리 배치 — 워크스페이스 = 분단(seating group), pane = 학생 한 명.
 *
 * 교탁에서 보는 1인칭이라 앞줄이 화면 아래·크게, 뒷줄이 위쪽·작게(원근) 앉는다.
 * 좌석은 컨테이너 크기에 맞춰 매번 다시 계산하므로 화면이 좁아져도 학생이 서로 겹치지 않는다.
 */
import { clamp, lerp } from './util.js';

/** 한 분단은 최대 3줄까지만 깊게 앉힌다 — 넘치면 옆으로 짝꿍을 붙여 교실처럼 퍼뜨린다. */
const MAX_ROWS_PER_GROUP = 3;
const FRONT_Y = 0.97;
const BACK_Y = 0.18;
const NEAR_SCALE = 1;
const FAR_SCALE = 0.62;
const AISLE_SLOTS = 0.5;
const KID_W = 100;
const KID_H = 132;

const groupAgents = (agents, workspaces) => {
  const order = new Map((workspaces ?? []).map((w, index) => [w.workspaceId, index]));
  const ids = [...new Set(agents.map((a) => a.workspaceId))].sort(
    (a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999) || a.localeCompare(b),
  );
  const labelOf = new Map((workspaces ?? []).map((w) => [w.workspaceId, w.label]));
  return ids.map((workspaceId) => ({
    workspaceId,
    label: labelOf.get(workspaceId) ?? workspaceId,
    members: agents
      .filter((a) => a.workspaceId === workspaceId)
      .slice()
      .sort((x, y) => x.paneId.localeCompare(y.paneId)),
  }));
};

/**
 * @param {readonly object[]} agents
 * @param {readonly object[]} workspaces
 * @param {{width: number, height: number}} box 학생 레이어의 픽셀 크기
 * @returns {{seats: Map<string, object>, groups: object[], rows: number}}
 */
export const computeSeating = (agents, workspaces, box) => {
  const groups = groupAgents(agents, workspaces);
  if (groups.length === 0) return { seats: new Map(), groups, rows: 0 };

  const shaped = groups.map((group) => {
    const cols = Math.max(1, Math.ceil(group.members.length / MAX_ROWS_PER_GROUP));
    return { ...group, cols, rows: Math.ceil(group.members.length / cols) };
  });

  const rows = Math.max(1, ...shaped.map((group) => group.rows));
  const totalCols = shaped.reduce((sum, group) => sum + group.cols, 0);
  const totalSlots = totalCols + (shaped.length - 1) * AISLE_SLOTS;

  // 가로(슬롯 폭)와 세로(줄 간격) 양쪽에 맞춰 학생 크기를 정한다.
  // 뒷줄이 앞줄에 조금 가리는 건 교실에서 자연스러우므로 세로는 넉넉히 잡는다.
  const byWidth = clamp((box.width / totalSlots) * 0.94, 44, 156) / KID_W;
  const rowBand = (FRONT_Y - BACK_Y) / Math.max(1, rows - 0.15);
  const byHeight = clamp(box.height * rowBand * 1.85, 58, 210) / KID_H;
  const base = Math.min(byWidth, byHeight);

  const entries = shaped.flatMap((group, groupIndex) => {
    const startCol = shaped.slice(0, groupIndex).reduce((sum, g) => sum + g.cols, 0);
    return group.members.map((agent, index) => {
      const row = Math.floor(index / group.cols);
      const col = index % group.cols;
      const depth = rows === 1 ? 0.3 : row / (rows - 1);
      const perspective = lerp(NEAR_SCALE, FAR_SCALE, depth);
      const slot = startCol + col + groupIndex * AISLE_SLOTS;
      const ratio = (slot + 0.5) / totalSlots;
      return [
        agent.paneId,
        {
          x: (0.5 + (ratio - 0.5) * lerp(1, 0.7, depth)) * 100,
          y: lerp(FRONT_Y, BACK_Y, depth) * 100,
          scale: base * perspective,
          z: 100 - row * 6 + col,
          row,
          group: group.label,
        },
      ];
    });
  });

  return { seats: new Map(entries), groups: shaped, rows };
};
