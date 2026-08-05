/**
 * UI 자동 발견 — `uis/<id>/` 폴더에 `ui.json` + `index.html`만 두면 갤러리에 등장한다.
 * 서버 재시작 없이 반영되도록 `/api/uis` 요청마다 다시 스캔한다(로컬이라 비용 무시 가능).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { UiManifestEntry, UiMeta } from './types.ts';

const isValidMeta = (value: unknown): value is UiMeta => {
  if (typeof value !== 'object' || value === null) return false;
  const meta = value as Record<string, unknown>;
  return (
    typeof meta['title'] === 'string' && meta['title'].length > 0 &&
    typeof meta['description'] === 'string' &&
    typeof meta['emoji'] === 'string' && meta['emoji'].length > 0 &&
    (meta['order'] === undefined || typeof meta['order'] === 'number')
  );
};

/** uis 디렉토리를 스캔해 매니페스트를 만든다. 깨진 항목은 조용히 건너뛰되 경고를 남긴다. */
export function scanUis(uisDir: string, warn: (message: string) => void = () => {}): UiManifestEntry[] {
  let dirs: string[];
  try {
    dirs = fs
      .readdirSync(uisDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }

  const entries = dirs.flatMap((id): UiManifestEntry[] => {
    const metaPath = path.join(uisDir, id, 'ui.json');
    const htmlPath = path.join(uisDir, id, 'index.html');
    if (!fs.existsSync(metaPath) || !fs.existsSync(htmlPath)) {
      warn(`uis/${id}: ui.json 또는 index.html이 없어 건너뜀`);
      return [];
    }
    try {
      const meta: unknown = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (!isValidMeta(meta)) {
        warn(`uis/${id}/ui.json: title/description/emoji 필드가 필요해 건너뜀`);
        return [];
      }
      return [{ ...meta, id, path: `/ui/${id}/` }];
    } catch (error) {
      warn(`uis/${id}/ui.json 파싱 실패: ${String(error)}`);
      return [];
    }
  });

  return entries.sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.id.localeCompare(b.id));
}
