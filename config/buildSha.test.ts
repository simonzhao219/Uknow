import { describe, expect, it } from 'vitest';
import { BUILD_SHA_UNKNOWN, resolveBuildSha } from './buildSha';

const PAGES_SHA = '52039ca1b2c3d4e5f60718293a4b5c6d7e8f9012';
const GIT_SHA = 'abcdef0123456789abcdef0123456789abcdef01';

describe('resolveBuildSha', () => {
  it('Cloudflare Pages 建置優先用 CF_PAGES_COMMIT_SHA', () => {
    expect(resolveBuildSha({ CF_PAGES_COMMIT_SHA: PAGES_SHA }, () => GIT_SHA)).toBe(PAGES_SHA);
  });

  it('沒有 Pages 變數時退回 git HEAD（本機／CI）', () => {
    expect(resolveBuildSha({}, () => GIT_SHA)).toBe(GIT_SHA);
  });

  it('兩者都沒有（或 git 不可用）寫 unknown', () => {
    expect(resolveBuildSha({}, () => null)).toBe(BUILD_SHA_UNKNOWN);
  });

  it('格式不對的值不得寫進頁面（避免注入）', () => {
    expect(resolveBuildSha({ CF_PAGES_COMMIT_SHA: '"><script>' }, () => 'oops')).toBe(
      BUILD_SHA_UNKNOWN,
    );
  });
});
