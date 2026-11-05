import { analyticsEnabled, recordingAllowed } from './analyticsGate';

// 懶載入 facade：entry 唯一會靜態引用的 analytics 模組（連同 analyticsGate）。
// 絕不靜態 import posthog-js 或 analyticsConfig——它們屬於動態 chunk（見 posthogClient.ts）。

export interface AnalyticsClient {
  init(key: string, options: Record<string, unknown>): void;
  capture(event: string, properties?: Record<string, unknown>): void;
  reset(resetDeviceId: boolean): void;
  startSessionRecording(): void;
  stopSessionRecording(): void;
}

export interface AnalyticsDeps {
  /** 建置期注入的 key（import.meta.env.VITE_POSTHOG_KEY）；沒有或佔位值 = 停用。 */
  key: string | undefined;
  loadClient: () => Promise<AnalyticsClient>;
  storage: Pick<Storage, 'removeItem'> | null;
  currentPathname: () => string;
  origin: () => string;
  sampleRate?: number;
}

export interface Analytics {
  /** 啟動（載入 SDK、init）。停用或載入失敗回 false，絕不拋錯。 */
  start(): Promise<boolean>;
  trackPageview(pathname: string): void;
  /** 登出／換帳號／無效 session：reset(true)；SDK 尚未載入時改記待重置旗標。 */
  reset(): void;
}

export function createAnalytics(deps: AnalyticsDeps): Analytics {
  const enabled = analyticsEnabled(deps.key);
  let client: AnalyticsClient | null = null;
  let starting: Promise<boolean> | null = null;
  let pendingReset = false;
  // SDK 就緒前最後一次路由；就緒後補送一次 pageview（首屏 pageview 不會被吞）。
  let lastPath: string | null = null;
  let recording = false;

  const sendPageview = (c: AnalyticsClient, path: string) =>
    c.capture('$pageview', { $current_url: `${deps.origin()}${path}` });

  // 起點必須在 recordingAllowed 判斷之後：init 時 disable_session_recording 為 true，
  // 這裡才依當下路徑決定要不要開錄（不帶參數，避免繞過 sampleRate）。
  const applyRecording = (c: AnalyticsClient, path: string) => {
    const allowed = recordingAllowed(path);
    if (allowed && !recording) {
      c.startSessionRecording();
      recording = true;
    } else if (!allowed && recording) {
      c.stopSessionRecording();
      recording = false;
    }
  };

  const doStart = async (): Promise<boolean> => {
    try {
      // analyticsConfig 與 SDK 同屬動態 chunk；這裡動態載入，entry 不含它。
      const [c, { buildPosthogOptions }] = await Promise.all([
        deps.loadClient(),
        import('./analyticsConfig'),
      ]);
      c.init(deps.key as string, buildPosthogOptions({ sampleRate: deps.sampleRate }));
      client = c;
      if (pendingReset) {
        pendingReset = false;
        c.reset(true);
      }
      applyRecording(c, lastPath ?? deps.currentPathname());
      if (lastPath !== null) sendPageview(c, lastPath);
      return true;
    } catch {
      // 監控壞了不能影響產品：靜默失敗。
      return false;
    }
  };

  return {
    start() {
      if (!enabled) return Promise.resolve(false);
      starting ??= doStart();
      return starting;
    },
    trackPageview(pathname) {
      if (!enabled) return;
      lastPath = pathname;
      if (!client) return;
      // 先處理錄影閘門再送 pageview；呼叫端應在 layout effect 內呼叫以趕在 rrweb flush 前。
      applyRecording(client, pathname);
      sendPageview(client, pathname);
    },
    reset() {
      if (!enabled) return;
      if (client) {
        client.reset(true);
        return;
      }
      // SDK 尚未載入：PostHog 的身分可能已在 localStorage，載入後會沿用舊 id。
      // 先移除鍵並記旗標，載入完成後立即 reset(true)。
      pendingReset = true;
      try {
        deps.storage?.removeItem(`ph_${deps.key}_posthog`);
      } catch {
        // storage 不可用（隱私模式）時無妨
      }
    },
  };
}
