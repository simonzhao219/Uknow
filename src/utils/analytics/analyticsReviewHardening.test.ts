import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPosthogOptions } from './analyticsConfig';
import { SENSITIVE_PORTALS } from './sensitiveFields';

const SRC = resolve(__dirname, '..', '..');

describe('buildPosthogOptions 腳本版本', () => {
  it('錄影元件只載入釘版本的路徑，不退回未釘版的最新檔', () => {
    const o = buildPosthogOptions() as Record<string, unknown>;
    expect(o.strict_script_versioning).toBe(true);
  });
});

describe('SENSITIVE_PORTALS', () => {
  for (const p of SENSITIVE_PORTALS) {
    it(`${p.file} 的 ${p.anchor} 在 portal 內，必須自己帶 block class`, () => {
      const lines = readFileSync(join(SRC, p.file), 'utf8')
        .split('\n')
        .filter((l) => l.includes(p.anchor));
      expect(lines.length, '找不到錨點').toBe(1);
      expect(lines[0]).toMatch(/privateClass\(|ph-no-capture/);
    });
  }
});
