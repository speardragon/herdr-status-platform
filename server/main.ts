/**
 * herdr-status-platform 서버 엔트리.
 *
 * 실행:
 *   bun run serve            # 실제 herdr에 연결 (live)
 *   bun run mock             # 시뮬레이터로 구동 (UI 개발·데모용)
 *   bun run serve --port 7788 --socket ~/.config/herdr/herdr.sock
 *
 * 라우트:
 *   GET  /                    갤러리 셸
 *   GET  /ws                  WebSocket — hello/update 푸시 (types.ts의 WireMessage)
 *   GET  /sdk.js              브라우저 SDK (부팅 시 in-memory 번들)
 *   GET  /api/snapshot        현재 스냅샷 (폴링 소비자·디버깅용)
 *   GET  /api/uis             UI 매니페스트 (uis/ 자동 발견)
 *   POST /api/actions/focus   {paneId} — herdr에서 해당 pane으로 점프
 *   GET  /ui/<id>/...         각 UI 정적 서빙
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { defaultSocketPath, focusPane } from './herdrClient.ts';
import { LiveSource } from './sources/live.ts';
import { MockSource } from './sources/mock.ts';
import type { StateSource } from './sources/source.ts';
import { StatusStore } from './store.ts';
import type { UpdateMessage, WireMessage } from './types.ts';
import { scanUis } from './uis.ts';

const ROOT = path.resolve(import.meta.dir, '..');
const UIS_DIR = path.join(ROOT, 'uis');
const WS_TOPIC = 'updates';

const log = (message: string): void => {
  console.log(`[hsp ${new Date().toISOString().slice(11, 19)}] ${message}`);
};

/* ───────── CLI 인자 ───────── */
interface CliOptions {
  readonly mock: boolean;
  readonly port: number;
  readonly socketPath: string;
  readonly seed: number;
  readonly tempoMs: number;
}

const parseArgs = (argv: readonly string[]): CliOptions => {
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const num = (name: string, fallback: number): number => {
    const raw = flag(name);
    const parsed = raw === undefined ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    mock: argv.includes('--mock'),
    port: num('port', Number(process.env['HSP_PORT']) || 7788),
    socketPath: flag('socket') ?? defaultSocketPath(),
    seed: num('seed', 42),
    tempoMs: num('tempo', 1200),
  };
};

const opts = parseArgs(process.argv.slice(2));

/* ───────── SDK 번들 ───────── */
const buildSdk = async (): Promise<string> => {
  const result = await Bun.build({
    entrypoints: [path.join(import.meta.dir, 'sdk', 'client.ts')],
    target: 'browser',
    format: 'esm',
  });
  if (!result.success || result.outputs.length === 0) {
    throw new Error(`SDK 번들 실패: ${result.logs.map((l) => l.message).join('; ')}`);
  }
  return result.outputs[0]!.text();
};
const sdkJs = await buildSdk();

/* ───────── 상태 파이프라인: source → store → WS 브로드캐스트 ───────── */
const store = new StatusStore({ source: opts.mock ? 'mock' : 'live' });
const source: StateSource = opts.mock
  ? new MockSource({ seed: opts.seed, tempoMs: opts.tempoMs })
  : new LiveSource({ socketPath: opts.socketPath, log });

/* ───────── HTTP 헬퍼 ───────── */
const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const serveFile = (filePath: string): Response => {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return new Response('not found', { status: 404 });
  }
  const mime = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  return new Response(Bun.file(filePath), { headers: { 'content-type': mime } });
};

/** `/ui/<id>/...` — uis/ 밖으로 나가는 경로를 차단하며 정적 서빙. */
const serveUiFile = (pathname: string): Response => {
  const rest = decodeURIComponent(pathname.slice('/ui/'.length));
  if (rest !== '' && !rest.endsWith('/') && path.extname(rest) === '') {
    // /ui/debug → /ui/debug/ — 상대 경로 에셋이 올바로 풀리게 한다.
    return Response.redirect(`${pathname}/`, 301);
  }
  const relative = rest === '' || rest.endsWith('/') ? path.join(rest, 'index.html') : rest;
  const resolved = path.resolve(UIS_DIR, relative);
  if (!resolved.startsWith(UIS_DIR + path.sep)) return new Response('forbidden', { status: 403 });
  return serveFile(resolved);
};

const handleFocus = async (request: Request): Promise<Response> => {
  if (opts.mock) {
    return json({ success: false, error: 'mock 모드에서는 herdr 포커스 액션을 사용할 수 없어요' });
  }
  try {
    const body = (await request.json()) as { paneId?: unknown };
    if (typeof body.paneId !== 'string' || body.paneId.length === 0) {
      return json({ success: false, error: 'paneId(string)가 필요해요' }, 400);
    }
    await focusPane(opts.socketPath, body.paneId);
    return json({ success: true });
  } catch (error) {
    return json({ success: false, error: `focus 실패: ${String(error)}` }, 502);
  }
};

/* ───────── 서버 ───────── */
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: opts.port,
  async fetch(request, srv) {
    const { pathname } = new URL(request.url);

    if (pathname === '/ws') {
      return srv.upgrade(request) ? undefined : new Response('websocket 업그레이드 실패', { status: 400 });
    }
    if (pathname === '/' || pathname === '/index.html') return serveFile(path.join(ROOT, 'index.html'));
    if (pathname === '/sdk.js') {
      return new Response(sdkJs, { headers: { 'content-type': 'text/javascript; charset=utf-8' } });
    }
    if (pathname === '/api/snapshot') return json({ success: true, data: store.snapshot });
    if (pathname === '/api/uis') return json({ success: true, data: scanUis(UIS_DIR, log) });
    if (pathname === '/api/actions/focus' && request.method === 'POST') return handleFocus(request);
    if (pathname.startsWith('/ui/')) return serveUiFile(pathname);
    return new Response('not found', { status: 404 });
  },
  websocket: {
    open(ws) {
      ws.subscribe(WS_TOPIC);
      const hello: WireMessage = { kind: 'hello', snapshot: store.snapshot };
      ws.send(JSON.stringify(hello));
    },
    message() {
      /* 클라이언트 → 서버 메시지는 없다. 액션은 POST /api/actions/*. */
    },
    close(ws) {
      ws.unsubscribe(WS_TOPIC);
    },
  },
});

source.start((world) => {
  const update = store.setWorld(world);
  if (!update) return;
  const message: UpdateMessage = { kind: 'update', snapshot: update.snapshot, events: update.events };
  server.publish(WS_TOPIC, JSON.stringify(message));
  for (const event of update.events) {
    const target = 'paneId' in event ? ` ${event.paneId}` : '';
    log(`이벤트: ${event.type}${target}`);
  }
});

const shutdown = (): void => {
  source.stop();
  server.stop(true);
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

log(`herdr-status-platform ${opts.mock ? '(mock)' : '(live)'} → http://127.0.0.1:${opts.port}`);
if (!opts.mock) log(`herdr 소켓: ${opts.socketPath}`);
