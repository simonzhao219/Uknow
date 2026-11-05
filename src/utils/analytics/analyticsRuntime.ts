// entry 靜態引用的 analytics 單例：把 createAnalytics 接上真實環境。
// 只能靜態引用 analytics.ts／analyticsGate.ts（極小）；SDK 與設定走動態 import。
import { createAnalytics } from './analytics';

function safeLocal(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

// VITE_ANALYTICS_SAMPLE：0～1，預設全錄（W4-36）；無效值一律當全錄。
function parseSampleRate(raw: unknown): number | undefined {
  if (typeof raw !== 'string' || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : undefined;
}

const analytics = createAnalytics({
  key: import.meta.env?.VITE_POSTHOG_KEY as string | undefined,
  loadClient: () => import('./posthogClient').then((m) => m.createPosthogClient()),
  storage: safeLocal(),
  currentPathname: () => window.location.pathname,
  origin: () => window.location.origin,
  sampleRate: parseSampleRate(import.meta.env?.VITE_ANALYTICS_SAMPLE),
});

export function startAnalytics(): void {
  void analytics.start();
}

export function trackPageview(pathname: string): void {
  analytics.trackPageview(pathname);
}

export function resetAnalytics(): void {
  analytics.reset();
}
