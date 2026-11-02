// 後端 API 網址組裝——零依賴（只依賴專案設定）。
//
// 從 apiClient 抽出（T1-B）：fetchProfile 從這裡取網址，apiClient 才能反向 import
// fetchProfile 做 401 兩層確認而不形成循環。apiClient 仍 re-export，既有 import 不變。
import { projectId } from './supabase/projectConfig';

/**
 * 構建後端 API URL
 *
 * @param path - API 路徑（例如：'/rewards', '/tasks'）
 * @returns 完整的 API URL，例如 https://{projectId}.supabase.co/functions/v1/api/rewards
 */
export function buildApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `https://${projectId}.supabase.co/functions/v1/api${cleanPath}`;
}
