// 動態 chunk：真正 import posthog-js 的唯一入口。
import type { PostHogConfig } from 'posthog-js';
import type { AnalyticsClient } from './analytics';

/**
 * extraOptions 只給測試覆寫傳輸層（api_transport、disable_compression 等）；
 * 正式呼叫不帶參數。
 */
export async function createPosthogClient(
  extraOptions: Record<string, unknown> = {},
): Promise<AnalyticsClient> {
  const { default: posthog } = await import('posthog-js');
  return {
    init: (key, options) => {
      posthog.init(key, { ...options, ...extraOptions } as Partial<PostHogConfig>);
    },
    capture: (event, properties) => {
      posthog.capture(event, properties);
    },
    reset: (resetDeviceId) => posthog.reset(resetDeviceId),
    startSessionRecording: () => posthog.startSessionRecording(),
    stopSessionRecording: () => posthog.stopSessionRecording(),
  };
}
