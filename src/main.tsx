import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles/globals.css';
import { scheduleAnalytics } from './utils/analytics/scheduleAnalytics';
import { startAnalytics } from './utils/analytics/analyticsRuntime';
import { canonicalRedirectUrl } from './utils/canonicalHost';

// 全域最後防線：fire-and-forget 的 async handler（輪詢、背景 revalidate、
// 事件回呼）拋出的 rejection 不會經過任何元件層錯誤處理，沒有這個
// 監聽就只會無聲消失在 console，維運端完全不可見。這裡統一記錄，
// 日後接上錯誤回報服務（Sentry 類）也只需改這一處。
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

// Pages 根網址連正式站後端卻過不了 CORS：導向正式網域，且不 render（避免閃一下再跳）
const canonicalUrl = canonicalRedirectUrl(window.location);
if (canonicalUrl) {
  window.location.replace(canonicalUrl);
} else {
  createRoot(document.getElementById('root')!).render(<App />);
}

// 監控（PostHog）：window load 之後再等 idle 才動態載入 SDK，不進 entry、不搶首屏。
// key 為佔位值或未注入時 startAnalytics 什麼都不做（W5-35 預設關閉）。
scheduleAnalytics({
  isRedirecting: canonicalUrl !== null,
  whenLoaded: (cb) => {
    if (document.readyState === 'complete') cb();
    else window.addEventListener('load', () => cb(), { once: true });
  },
  idle: (cb) => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(() => cb(), { timeout: 5000 });
    else setTimeout(cb, 2000);
  },
  start: startAnalytics,
});
