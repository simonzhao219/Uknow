// ========================================
// PayUni 續期收款配置
// ========================================
// 切換測試/正式環境：只需修改下面這一行
// ========================================

const MODE: 'test' | 'production' = 'test';  // 👈 修改這裡即可切換

// ========================================
// 配置定義
// ========================================

export interface PayUniConfig {
  merID: string;
  hashKey: string;
  hashIV: string;
  apiUrl: string;
  mode: 'test' | 'production';
}

const PayUniConfigs = {
  test: {
    merID: Deno.env.get('PAYUNI_MER_ID')!,
    hashKey: Deno.env.get('PAYUNI_HASH_KEY')!,
    hashIV: Deno.env.get('PAYUNI_HASH_IV')!,
    apiUrl: 'https://sandbox-api.payuni.com.tw/api/period/Page',
    mode: 'test' as const
  },
  production: {
    merID: Deno.env.get('PAYUNI_MER_ID')!,
    hashKey: Deno.env.get('PAYUNI_HASH_KEY')!,
    hashIV: Deno.env.get('PAYUNI_HASH_IV')!,
    apiUrl: 'https://api.payuni.com.tw/api/period/Page',
    mode: 'production' as const
  }
};

/**
 * 獲取當前 PayUni 配置
 * 根據 MODE 常數自動返回測試或正式環境配置
 */
export function getPayUniConfig(): PayUniConfig {
  const config = PayUniConfigs[MODE];
  
  if (!config.merID || !config.hashKey || !config.hashIV) {
    throw new Error(`PayUni 配置錯誤：請設置環境變數 PAYUNI_MER_ID, PAYUNI_HASH_KEY, PAYUNI_HASH_IV`);
  }
  
  console.log(`[PayUni Config] 當前模式：${MODE}`);
  return config;
}
