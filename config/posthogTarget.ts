/**
 * 建置目標的 PostHog 專案 key（分支感知）——純函式，由 vite.config.ts 呼叫。
 *
 * 規則與 `supabaseTarget.ts` 平行：只有 main 打正式站 project，其餘分支都指向
 * develop 的 project。`phc_` key 是 PostHog 設計上公開的寫入 key（會進 bundle），
 * 所以直接 commit 在這裡，不放 Pages 環境變數（儀表板設定不在 git、無人能 review）。
 *
 * **預設關閉（W5-35）**：兩把 key 先放佔位值；佔位值一律視為「未設定」→ key 為 null →
 * 不注入、執行期不載入 SDK、不送任何請求。業主在 eu.posthog.com 建好兩個 project 後，
 * 由主 session 轉交 key，到時才填入這裡。
 */

export const PLACEHOLDER_POSTHOG_KEY = 'phc_PLACEHOLDER_NOT_CONFIGURED';

/** 僅整合測試可用的假 key 前綴（見 resolvePosthogTarget 的覆寫規則）。 */
export const TEST_POSTHOG_KEY_PREFIX = 'phc_test_';

// 只有正式站一個 project（W5-68：PostHog 免費方案限 1 個 project）；develop 與預覽維持佔位＝不注入。
export const POSTHOG_KEYS = {
  production: 'phc_AXSCAsT58p4GmDAUHgFNgxncUsAipu9QEECg4z7oJEv3',
  develop: PLACEHOLDER_POSTHOG_KEY,
} as const;

export interface PosthogTargetEnv {
  /** Cloudflare Pages 建置時自動帶入的分支名；本機建置沒有這個變數 */
  CF_PAGES_BRANCH?: string;
  /** 只接受 `phc_test_` 前綴的假 key（整合測試用）；其他值一律忽略 */
  VITE_POSTHOG_KEY?: string;
  /** 'off' = 緊急關閉開關（Pages 環境變數，重新部署即生效） */
  VITE_ANALYTICS?: string;
  /**
   * 外部是否明確指定了 VITE_SUPABASE_PROJECT_ID（＝journey 把前端指向拋棄式分支）。
   * 必須在 vite.config.ts 用 supabase 目標覆寫 env 之前記下。
   */
  explicitSupabaseProject?: boolean;
}

export interface PosthogTarget {
  key: string | null;
}

export interface PosthogKeys {
  production: string;
  develop: string;
}

/** keys 參數只給測試注入；正式呼叫一律用 commit 在這裡的 POSTHOG_KEYS。 */
export function resolvePosthogTarget(
  env: PosthogTargetEnv,
  keys: PosthogKeys = POSTHOG_KEYS,
): PosthogTarget {
  // 緊急關閉與 journey（前端指向拋棄式分支）優先於一切，連假 key 也不例外。
  if (env.VITE_ANALYTICS === 'off') return { key: null };
  if (env.explicitSupabaseProject) return { key: null };

  const branch = env.CF_PAGES_BRANCH;
  if (!branch) {
    // 本機建置：預設關閉。只有 phc_test_ 前綴的假 key 能打開（整合測試用）。
    const override = env.VITE_POSTHOG_KEY;
    return { key: override?.startsWith(TEST_POSTHOG_KEY_PREFIX) ? override : null };
  }

  // Cloudflare Pages 建置：只認 git 裡的 key，VITE_POSTHOG_KEY 一律忽略
  // （避免有人把別的 key 誤設在 Pages 環境變數而繞過 main/develop 分流）。
  const key = branch === 'main' ? keys.production : keys.develop;
  return { key: key === PLACEHOLDER_POSTHOG_KEY ? null : key };
}
