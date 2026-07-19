import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSupabaseUrl, getSupabaseAnonKey } from '../../config';

const supabaseUrl = getSupabaseUrl();

// <any>：本專案沒有產生 Database schema 型別；不加泛型時 supabase-js v2
// 會把未知資料表的列型別推成 never（.insert/.select 全部報錯）。
let supabaseClient: ReturnType<typeof createSupabaseClient<any>> | null = null;

/**
 * 獲取 Supabase Client 單例
 * 確保整個應用程式只有一個 Supabase Client 實例
 */
export function createClient() {
  if (!supabaseClient) {
    supabaseClient = createSupabaseClient<any>(supabaseUrl, getSupabaseAnonKey(), {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        // 原本打成 detectSessionUrl（拼錯，選項被靜默忽略）——tsc 基線
        // 建立時抓到的真實 bug。
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined
      }
    });
  }
  return supabaseClient;
}
