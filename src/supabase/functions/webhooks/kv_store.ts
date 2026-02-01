/**
 * KV Store 工具（Webhooks 專用）
 * 
 * 簡化版的 KV 操作，直接使用 Supabase Client
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

/**
 * 獲取 KV 值
 */
export async function get(key: string): Promise<any> {
  const { data, error } = await supabase
    .from('kv_store_5c6718b9')
    .select('value')
    .eq('key', key)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // 不存在
    }
    throw error;
  }

  return data?.value;
}

/**
 * 設置 KV 值
 */
export async function set(key: string, value: any): Promise<void> {
  const { error } = await supabase
    .from('kv_store_5c6718b9')
    .upsert({
      key,
      value,
      updated_at: new Date().toISOString()
    });

  if (error) {
    throw error;
  }
}
