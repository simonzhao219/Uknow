import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';

const supabaseUrl = `https://${projectId}.supabase.co`;

let supabaseClient: ReturnType<typeof createSupabaseClient> | null = null;

/**
 * 獲取 Supabase Client 單例
 * 確保整個應用程式只有一個 Supabase Client 實例
 */
export function createClient() {
  if (!supabaseClient) {
    supabaseClient = createSupabaseClient(supabaseUrl, publicAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionUrl: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined
      }
    });
  }
  return supabaseClient;
}
