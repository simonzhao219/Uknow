import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Reuse the app's Vite config (react-swc plugin + path aliases) so unit tests
// transform TS/TSX exactly like the app does. Tests are pure-function only, so
// the default `node` environment is enough — no jsdom / testing-library.
//
// Scope strictly to src/** so this never picks up the Deno test suite under
// supabase/functions/**/*.test.ts (a different runtime entirely).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      // src/** 是產品程式碼；config/** 是建置期設定（分支 → Supabase 目標），
      // 兩者都跑在 node 上。刻意逐一列出而非放寬成 '**'：supabase/** 是另一個
      // runtime（Deno），絕不能被收進來。
      include: ['src/**/*.test.{ts,tsx}', 'config/**/*.test.ts'],
      exclude: ['node_modules', 'build', 'e2e', 'supabase'],
      coverage: {
        provider: 'v8',
        // json-summary 給 CI 產 job summary；text 給人在終端看；
        // html 只在本機有用，CI 不留（沒人會去下載 artifact 翻覆蓋率）。
        reporter: ['text-summary', 'json-summary'],
        reportsDirectory: 'coverage',
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/**/*.test.{ts,tsx}',
          // 第三方產生 / 外部來源，不是我們維護的行為
          'src/components/ui/**',
          'src/components/figma/**',
          'src/assets/**',
          'src/content/**',
          'src/vite-env.d.ts',
          'src/main.tsx',
        ],
        // 棘輪（不是目標）：門檻設在 2026-07 實測值之下一點點，
        // 用途是擋「覆蓋率往下掉」，不是宣稱現在夠好。
        //
        // 為什麼 lines 只有 ~18% 卻仍然有意義：src/components 的 90 個
        // 元件主要由 e2e 覆蓋而非 vitest，它們整份算進分母。所以這個
        // 數字量的是「單元測試面」的變化量，不是整體品質——別把它
        // 當成「這專案只測了 18%」來讀。branches 82% 才是純函式那層
        // 的真實密度。
        //
        // ⚠️ 調整規則：只准往上。PR 讓覆蓋率上升時，順手把門檻提到
        // 新的實測值減 1；**不准為了讓紅燈變綠而調低**——那等於這道
        // 閘門不存在。真的需要調低必須在 PR 內寫明理由。
        thresholds: {
          // 2026-08-08（platform-admin-rwd rebase 後）實測：
          // lines/statements 51.54、branches 82.28、functions 66.92。
          // 前一次校準是 45.65/82.86/68.83。
          // 依「只准往上」的棘輪規則提到實測值減約 2（沿用本檔既有的緩衝慣例）；
          // branches 與 functions 減 2 後都落在現行值以下，維持不動——調低是
          // 禁止的，算出來低於現值就照現值留著。
          //
          // ⚠️ functions 這次是**降**的（68.83 → 66.92），因為 admin RWD 拆出
          // 的元件（CardOverflowMenu / WithdrawalFundingFields / 兩個 CardList）
          // 主要由 e2e 版面測試覆蓋，不進 vitest 的函式分母以外。仍在 66 之上，
          // 但緩衝只剩 0.92——下一個動 admin 元件的 PR 要留意這格。
          //
          // lines/statements 從 20 一口氣跳到 39（07-26）、再到 43、49，是持續
          // 償還累積的鬆弛。棘輪的價值全在「貼著實測值」，落後的棘輪等於沒有。
          lines: 49,
          statements: 49,
          functions: 66,
          branches: 80,
        },
      },
    },
  }),
);
