// 動態 chunk：真正 import posthog-js 的唯一入口。
//
// 為什麼不用預設的 `posthog-js`：預設入口載入 AllExtensions，其中的 logs／conversations／
// product tours／surveys 等擴充會依 PostHog 專案端的遠端設定自行啟動（例如 logs 會攔截
// console 外送、conversations 小工具會收姓名與 Email），前端沒有選項能關。所以改用
// slim 入口，只掛錄影擴充（SessionReplayExtensions）。`__extensionClasses` 是 SDK 的
// 內部 API，因此 posthog-js 釘精確版本，並由 analyticsPrivacyWorstCase.test.ts 以
// 「最壞遠端設定」釘住行為——升版時這支測試會抓到回歸。
import type { PostHogConfig } from 'posthog-js/dist/module.slim';
import type { AnalyticsClient } from './analytics';

/**
 * extraOptions 只給測試覆寫傳輸層（api_transport、disable_compression 等）；
 * 正式呼叫不帶參數。
 */
export async function createPosthogClient(
  extraOptions: Record<string, unknown> = {},
): Promise<AnalyticsClient> {
  const [{ default: posthog }, { SessionReplayExtensions }] = await Promise.all([
    import('posthog-js/dist/module.slim'),
    import('posthog-js/dist/extension-bundles'),
  ]);
  return {
    init: (key, options) => {
      posthog.init(key, {
        ...options,
        __extensionClasses: { ...SessionReplayExtensions },
        ...extraOptions,
      } as Partial<PostHogConfig>);
    },
    capture: (event, properties) => {
      posthog.capture(event, properties);
    },
    reset: (resetDeviceId) => posthog.reset(resetDeviceId),
    startSessionRecording: () => posthog.startSessionRecording(),
    stopSessionRecording: () => posthog.stopSessionRecording(),
  };
}
