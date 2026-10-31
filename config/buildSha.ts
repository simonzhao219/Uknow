// 建置時埋進 index.html 的 commit sha（<meta name="build-sha">）。
//
// 存在理由（2026-10-28 事故）：Cloudflare Pages 的 main 建置在 clone 階段失敗，
// 正式站停在舊版 18 小時沒有任何訊號——GitHub 收不到 Cloudflare 的建置失敗事件，
// 而 deploy-smoke 只驗資產完整、不驗版本。線上頁面自己帶著 sha，
// scripts/check-deployed-assets.py 才有東西可與「預期的 main/develop HEAD」比對。
//
// 來源優先序：Cloudflare Pages 的 CF_PAGES_COMMIT_SHA → 本機／CI 的 git HEAD →
// 'unknown'（檢查端把 unknown 當「無法比對」而不是「相符」）。
export const BUILD_SHA_UNKNOWN = 'unknown';

const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

export function resolveBuildSha(
  env: Record<string, string | undefined>,
  gitHead: () => string | null,
): string {
  const fromPages = env.CF_PAGES_COMMIT_SHA?.trim();
  if (fromPages && SHA_PATTERN.test(fromPages)) return fromPages.toLowerCase();
  const fromGit = gitHead()?.trim();
  if (fromGit && SHA_PATTERN.test(fromGit)) return fromGit.toLowerCase();
  return BUILD_SHA_UNKNOWN;
}
