/**
 * Supabase 連線目標的單一讀取點。
 *
 * 預設值來自自動產生的 `info.tsx`（正式專案）；建置/啟動時可用
 * `VITE_SUPABASE_PROJECT_ID` / `VITE_SUPABASE_ANON_KEY` 覆蓋——
 * journey E2E 測試靠這個把整個前端指向拋棄式的 Supabase 測試分支，
 * 正式建置不設這兩個變數，行為不變。
 */
import {
  projectId as generatedProjectId,
  publicAnonKey as generatedAnonKey,
} from './info';

export const projectId: string =
  (import.meta.env?.VITE_SUPABASE_PROJECT_ID as string | undefined) || generatedProjectId;

export const publicAnonKey: string =
  (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined) || generatedAnonKey;
