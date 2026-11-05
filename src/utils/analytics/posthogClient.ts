// 動態 chunk：真正 import posthog-js 與 analyticsConfig 的唯一入口。
import type { AnalyticsClient } from './analytics';

/**
 * extraOptions 只給測試覆寫傳輸層（api_transport、disable_compression 等）；
 * 正式呼叫不帶參數。
 */
export async function createPosthogClient(
  _extraOptions: Record<string, unknown> = {},
): Promise<AnalyticsClient> {
  const { default: posthog } = await import('posthog-js');
  void posthog;
  throw new Error('not implemented');
}
