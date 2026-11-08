// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prefersReducedMotion } from './motionPreference';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('prefersReducedMotion', () => {
  it('偏好減少動態時回 true', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
    }));
    expect(prefersReducedMotion()).toBe(true);
  });

  it('沒有偏好時回 false', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(prefersReducedMotion()).toBe(false);
  });
});

// 收口守衛（W5-69 / #509 P2）：減少動態的 media query 字串只能出現在 motionPreference.ts，
// 其餘一律呼叫 prefersReducedMotion()——否則各處各自演化，某天行為不一致。
describe('減少動態判斷收口', () => {
  const SRC = path.resolve(__dirname, '..');
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
    });

  it('prefers-reduced-motion 字串只出現在 motionPreference.ts', () => {
    const offenders = walk(SRC)
      .filter((file) => fs.readFileSync(file, 'utf8').includes('prefers-reduced-motion'))
      .map((file) => path.relative(SRC, file))
      .filter((rel) => rel !== path.join('utils', 'motionPreference.ts'));
    expect(offenders).toEqual([]);
  });
});
