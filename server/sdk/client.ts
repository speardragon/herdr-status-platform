/**
 * 브라우저용 클라이언트 SDK — 서버가 부팅 시 번들해 `/sdk.js`로 서빙한다.
 *
 * UI 쪽 사용법 (빌드 개념 없음):
 * ```html
 * <script type="module">
 *   import { connect } from '/sdk.js';
 *   const client = connect();
 *   client.onUpdate(({ snapshot }) => render(snapshot));
 *   client.onEvent('agent_status_changed', (event) => burstConfetti(event));
 * </script>
 * ```
 * 재접속·구독 관리는 SDK가 알아서 한다. 스냅샷은 항상 전체 상태라 diff가 필요 없다.
 */
import type { PlatformEvent, PlatformEventType, Snapshot, UpdateMessage, WireMessage } from '../types.ts';

export type UpdateListener = (message: UpdateMessage) => void;
export type EventListener = (event: PlatformEvent, snapshot: Snapshot) => void;
export type TransportListener = (up: boolean) => void;

export interface ConnectOptions {
  /** 기본값: 현재 오리진의 `/ws`. */
  readonly url?: string;
  /** 재접속 최대 대기(ms). 기본 5000. */
  readonly maxBackoffMs?: number;
}

export interface HerdrStatusClient {
  /** 마지막으로 받은 스냅샷 (아직 없으면 null). */
  readonly snapshot: Snapshot | null;
  /** WebSocket 전송 계층이 살아 있는지. (herdr 연결 여부는 snapshot.connected) */
  readonly transportUp: boolean;
  /** 모든 스냅샷 갱신 구독. 해제 함수를 돌려준다. */
  onUpdate(listener: UpdateListener): () => void;
  /** 특정 타입(또는 '*')의 도메인 이벤트 구독. 해제 함수를 돌려준다. */
  onEvent(type: PlatformEventType | '*', listener: EventListener): () => void;
  /** 전송 계층 상태 변화 구독. */
  onTransport(listener: TransportListener): () => void;
  /** herdr에서 해당 pane으로 점프. 성공 여부를 돌려준다. */
  focusPane(paneId: string): Promise<boolean>;
  close(): void;
}

interface FocusResponse {
  readonly success: boolean;
  readonly error?: string;
}

export function connect(options: ConnectOptions = {}): HerdrStatusClient {
  const wsUrl = options.url ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const maxBackoffMs = options.maxBackoffMs ?? 5000;

  let socket: WebSocket | null = null;
  let snapshot: Snapshot | null = null;
  let transportUp = false;
  let closed = false;
  let backoffMs = 500;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const updateListeners = new Set<UpdateListener>();
  const eventListeners = new Map<string, Set<EventListener>>();
  const transportListeners = new Set<TransportListener>();

  const setTransport = (up: boolean): void => {
    if (transportUp === up) return;
    transportUp = up;
    for (const listener of transportListeners) listener(up);
  };

  const dispatchEvents = (events: readonly PlatformEvent[], snap: Snapshot): void => {
    for (const event of events) {
      for (const key of [event.type, '*']) {
        const listeners = eventListeners.get(key);
        if (listeners) for (const listener of listeners) listener(event, snap);
      }
    }
  };

  const handleMessage = (raw: string): void => {
    let message: WireMessage;
    try {
      message = JSON.parse(raw) as WireMessage;
    } catch {
      return;
    }
    snapshot = message.snapshot;
    const events = message.kind === 'update' ? message.events : [];
    const update: UpdateMessage = { kind: 'update', snapshot: message.snapshot, events };
    for (const listener of updateListeners) listener(update);
    dispatchEvents(events, message.snapshot);
  };

  const open = (): void => {
    if (closed) return;
    socket = new WebSocket(wsUrl);
    socket.onopen = () => {
      backoffMs = 500;
      setTransport(true);
    };
    socket.onmessage = (event) => handleMessage(String(event.data));
    socket.onclose = () => {
      setTransport(false);
      if (closed) return;
      retryTimer = setTimeout(open, backoffMs);
      backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
    };
    socket.onerror = () => socket?.close();
  };

  open();

  return {
    get snapshot() {
      return snapshot;
    },
    get transportUp() {
      return transportUp;
    },
    onUpdate(listener) {
      updateListeners.add(listener);
      return () => updateListeners.delete(listener);
    },
    onEvent(type, listener) {
      const listeners = eventListeners.get(type) ?? new Set<EventListener>();
      listeners.add(listener);
      eventListeners.set(type, listeners);
      return () => listeners.delete(listener);
    },
    onTransport(listener) {
      transportListeners.add(listener);
      return () => transportListeners.delete(listener);
    },
    async focusPane(paneId) {
      try {
        const response = await fetch('/api/actions/focus', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ paneId }),
        });
        const body = (await response.json()) as FocusResponse;
        return body.success === true;
      } catch {
        return false;
      }
    },
    close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    },
  };
}
