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

export function createAnalytics(_deps: AnalyticsDeps): Analytics {
  return {
    start: async () => false,
    trackPageview: () => {},
    reset: () => {},
  };
}
