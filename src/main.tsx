import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles/globals.css';
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
