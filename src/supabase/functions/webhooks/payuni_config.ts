// ========================================
// PayUni 配置管理
// ========================================

/**
 * 配置模式
 * - test: 測試環境
 * - production: 正式環境
 * 
 * ⚠️ 切換環境只需修改這一行
 */
const MODE: 'test' | 'production' = 'test';

interface PayUniConfig {
  mode: 'test' | 'production';
  merID: string;
  hashKey: string;
  hashIV: string;
  apiUrl: string;
}

/**
 * 獲取 PayUni 配置
 * 根據 MODE 自動選擇測試或正式環境的配置
 */
export function getPayUniConfig(): PayUniConfig {
  if (MODE === 'production') {
    // 正式環境配置
    return {
      mode: 'production',
      merID: Deno.env.get('PAYUNI_MER_ID')!,
      hashKey: Deno.env.get('PAYUNI_HASH_KEY')!,
      hashIV: Deno.env.get('PAYUNI_HASH_IV')!,
      apiUrl: Deno.env.get('PAYUNI_API_URL') || 'https://api.payuni.com.tw/api/period'
    };
  } else {
    // 測試環境配置
    return {
      mode: 'test',
      merID: Deno.env.get('PAYUNI_TEST_MER_ID') || Deno.env.get('PAYUNI_MER_ID')!,
      hashKey: Deno.env.get('PAYUNI_TEST_HASH_KEY') || Deno.env.get('PAYUNI_HASH_KEY')!,
      hashIV: Deno.env.get('PAYUNI_TEST_HASH_IV') || Deno.env.get('PAYUNI_HASH_IV')!,
      apiUrl: 'https://sandbox-api.payuni.com.tw/api/period'
    };
  }
}
