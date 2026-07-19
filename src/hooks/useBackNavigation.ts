import { useNavigate, useLocation } from 'react-router-dom';

/**
 * 路由層級映射表（父層導向）。
 *
 * 只列出 App.tsx 實際存在的路由——過去這裡殘留了一批不存在的路由
 * （/subscriptions、/referral-tree、/register/step-1..4、/register/payment…），
 * 那些 key 永遠不會被命中，只會誤導維護者以為有這些頁。
 *
 * 層級：
 *   第一層 /（首頁）
 *   第二層 /dashboard（會員中心）
 *   第三層 刊登/推薦/任務/獎勵管理
 *   第四層 建立/編輯等子頁
 */
const ROUTE_HIERARCHY: Record<string, string> = {
  // 第三層 → 會員中心
  '/service-providers': '/dashboard',
  '/referrals': '/dashboard',
  '/tasks': '/dashboard',
  '/rewards': '/dashboard',

  // 第四層 → 第三層
  '/service-providers/create': '/service-providers',
  '/service-providers/edit': '/service-providers', // 動態路由前綴

  // 登入 / 註冊 → 首頁
  '/login': '/',
  '/register': '/',

  // 會員中心 → 首頁
  '/dashboard': '/',
};

/**
 * 智能層級導航 Hook：依路由層級回上一層，而非瀏覽器歷史的上一頁。
 *
 * @returns handleBack - 導航到當前路由上一層的函式
 *
 * @example
 * ```tsx
 * const handleBack = useBackNavigation();
 * <Button onClick={handleBack}><ArrowLeft /> 返回</Button>
 * ```
 */
export function useBackNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    const currentPath = location.pathname;

    // 1. 精確匹配
    if (ROUTE_HIERARCHY[currentPath]) {
      navigate(ROUTE_HIERARCHY[currentPath]);
      return;
    }

    // 2. 前綴匹配：處理動態路由（如 /service-providers/:id、/service-providers/edit/:id）
    for (const [routePrefix, parentRoute] of Object.entries(ROUTE_HIERARCHY)) {
      if (currentPath.startsWith(routePrefix + '/')) {
        navigate(parentRoute);
        return;
      }
    }

    // 3. 沒有匹配 → 回首頁
    navigate('/');
  };

  return handleBack;
}
