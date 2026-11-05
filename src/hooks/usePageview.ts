// 路由變更時通知 analytics（layout effect：要趕在 rrweb 的 MutationObserver flush 前
// 讓錄影閘門生效，進入 /payment、/admin 的瞬間才不會被錄到）。
import { trackPageview } from '../utils/analytics/analyticsRuntime';

export function usePageview(): void {
  void trackPageview;
}
