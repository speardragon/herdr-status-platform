/**
 * 상태 소스 계약 — LiveSource(실제 herdr)와 MockSource(시뮬레이터)가 같은 모양으로
 * 정규화 세계(World)를 밀어주고, diff·이벤트 파생은 전적으로 StatusStore가 맡는다.
 */
import type { World } from '../normalize.ts';

export type WorldListener = (world: World) => void;

export interface StateSource {
  /** 소스를 시작하고, 세계가 바뀔 때마다 listener를 부른다. 시작 직후 1회는 반드시 호출. */
  start(listener: WorldListener): void;
  stop(): void;
}
