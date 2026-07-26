/**
 * 建置目標的 Supabase 專案（分支感知）——純函式，由 vite.config.ts 呼叫。
 *
 * 在此之前，**所有** Cloudflare Pages 建置（develop、feature 預覽、claude/*
 * 預覽）都沿用 `src/utils/supabase/info.tsx` 裡寫死的正式專案 id，也就是
 * 預覽站讀寫的是正式站資料庫。除了看不到未晉升的 migration（新前端 × 舊
 * 後端，2026-07-25 的獎勵分類就是這樣炸出來的），更嚴重的是在預覽站做的
 * 任何動作（付款、領獎、提領）都寫進正式站。
 *
 * 規則：**只有 main 打正式站**，其餘分支一律指向 develop 的 Supabase 分支 DB。
 *
 * anon key 是設計上公開的值（會進 bundle，info.tsx 也早已 commit 正式站那把），
 * 所以 develop 這把直接寫在這裡，不需要 Cloudflare 儀表板設定——儀表板設定
 * 不在 git 裡，沒有人能 review，也沒有測試擋得住它被改錯。
 */

export const DEVELOP_SUPABASE = {
  projectId: 'ijcxnxhrziehdtkwausy',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqY3hueGhyemllaGR0a3dhdXN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5NDAzNjQsImV4cCI6MjEwMDUxNjM2NH0.voVigSnjitxcx2W6j3qNTlr5-4wGrvjFn3gyuKUr26U',
} as const;

export interface SupabaseTargetEnv {
  /** 明確指定的專案 id（journey e2e 用它指向拋棄式測試分支） */
  VITE_SUPABASE_PROJECT_ID?: string;
  /** Cloudflare Pages 建置時自動帶入的分支名；本機建置沒有這個變數 */
  CF_PAGES_BRANCH?: string;
}

export interface SupabaseTarget {
  projectId: string;
  anonKey: string;
}

/**
 * 回傳「這次建置要注入的 Supabase 目標」，null = 不注入（沿用 info.tsx 的正式站）。
 *
 * 覆蓋順序：明確指定的 VITE_SUPABASE_PROJECT_ID > 分支推導 > info.tsx。
 * 第一順位是給 journey e2e 的——它把前端指向拋棄式分支，絕不能被這裡蓋掉。
 */
export function resolveSupabaseTarget(env: SupabaseTargetEnv): SupabaseTarget | null {
  if (env.VITE_SUPABASE_PROJECT_ID) return null;
  const branch = env.CF_PAGES_BRANCH;
  if (!branch || branch === 'main') return null;
  return { ...DEVELOP_SUPABASE };
}
