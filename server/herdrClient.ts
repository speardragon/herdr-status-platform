/**
 * herdr 소켓 API 프리미티브 (NDJSON over unix socket).
 *
 * 실측으로 확인한 프로토콜 특성(herdr 0.8.0, protocol 19):
 * - 한 연결은 정확히 한 요청만 처리한다. 두 번째 요청은 무시되거나 연결이 끊긴다.
 *   → 일반 요청은 연결→요청→응답→종료의 one-shot으로 처리한다.
 * - `events.subscribe`는 ack(`subscription_started`) 후 같은 연결로 이벤트를
 *   `{"data":{...},"event":"pane_updated"}` 형태로 밀어준다. 이 연결에는 아무것도
 *   추가로 쓰면 안 된다. 구독 집합을 바꾸려면 새 연결을 열고 옛 연결을 닫는다.
 */
import * as net from 'node:net';

export class HerdrApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'HerdrApiError';
  }
}

export const defaultSocketPath = (): string =>
  `${process.env.HOME}/.config/herdr/herdr.sock`;

/** NDJSON 스트림 분할기 — 청크를 먹여주면 완성된 줄마다 콜백. */
export const ndjsonSplitter = (onLine: (line: string) => void) => {
  let buffer = '';
  return (chunk: Buffer | string): void => {
    buffer += chunk.toString();
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) onLine(line);
    }
  };
};

let requestCounter = 0;

/** one-shot 요청: 연결 → 요청 1개 → 응답 1줄 → 종료. */
export function request<T = Record<string, unknown>>(
  socketPath: string,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 4000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(socketPath);
    const id = `hsp_${++requestCounter}`;
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.destroy();
      fn();
    };
    const timer = setTimeout(
      () => finish(() => reject(new HerdrApiError('timeout', `${method}: ${timeoutMs}ms 내 응답 없음`))),
      timeoutMs,
    );
    sock.on('connect', () => sock.write(JSON.stringify({ id, method, params }) + '\n'));
    sock.on('data', ndjsonSplitter((line) => {
      try {
        const msg = JSON.parse(line) as { result?: T; error?: { code?: string; message?: string } };
        if (msg.error) {
          finish(() => reject(new HerdrApiError(msg.error?.code ?? 'error', msg.error?.message ?? method)));
        } else {
          finish(() => resolve(msg.result as T));
        }
      } catch (error) {
        finish(() => reject(new HerdrApiError('bad_json', `${method}: 응답 파싱 실패 — ${String(error)}`)));
      }
    }));
    sock.on('error', (e) => finish(() => reject(new HerdrApiError('socket_error', e.message))));
    sock.on('close', () => finish(() => reject(new HerdrApiError('closed', `${method}: 응답 전에 연결 종료`))));
  });
}

export interface PushedEvent {
  readonly event: string;
  readonly data: Record<string, unknown>;
}

export interface SubscribeHandlers {
  readonly onEvent: (event: PushedEvent) => void;
  readonly onReady?: () => void;
  /** 구독 연결이 (close()가 아닌 이유로) 끊기면 호출. */
  readonly onClose: (error: Error | null) => void;
}

export interface SubscriptionHandle {
  close(): void;
}

/** 구독 전용 연결: events.subscribe 1회 → ack → 푸시 스트림. */
export function subscribe(
  socketPath: string,
  subscriptions: ReadonlyArray<Record<string, unknown>>,
  handlers: SubscribeHandlers,
): SubscriptionHandle {
  const sock = net.createConnection(socketPath);
  let closedByUs = false;
  let ready = false;
  let lastError: Error | null = null;

  sock.on('connect', () => {
    sock.write(JSON.stringify({ id: 'hsp_sub', method: 'events.subscribe', params: { subscriptions } }) + '\n');
  });
  sock.on('data', ndjsonSplitter((line) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!ready) {
      const result = msg['result'] as { type?: string } | undefined;
      const error = msg['error'] as { code?: string; message?: string } | undefined;
      if (result?.type === 'subscription_started') {
        ready = true;
        handlers.onReady?.();
      } else {
        closedByUs = true;
        sock.destroy();
        handlers.onClose(new HerdrApiError(error?.code ?? 'subscribe_failed', error?.message ?? '구독 시작 실패'));
      }
      return;
    }
    if (typeof msg['event'] === 'string') {
      handlers.onEvent({ event: msg['event'], data: (msg['data'] as Record<string, unknown>) ?? {} });
    }
  }));
  sock.on('error', (error) => {
    lastError = error; // close에서 일괄 전달
  });
  sock.on('close', () => {
    if (!closedByUs) handlers.onClose(lastError);
  });

  return {
    close() {
      closedByUs = true;
      sock.destroy();
    },
  };
}

/**
 * pane 포커스 액션 — 에이전트가 있는 pane이면 agent.focus(“done을 본 것으로 표시”까지
 * 해줌)를 쓰고, 아니면 pane.focus로 폴백한다.
 */
export async function focusPane(socketPath: string, paneId: string): Promise<void> {
  try {
    await request(socketPath, 'agent.focus', { pane_id: paneId });
  } catch {
    await request(socketPath, 'pane.focus', { pane_id: paneId });
  }
}
