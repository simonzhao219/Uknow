import { useNavigate, useLocation } from 'react-router-dom';

/**
 * 路由层级映射表
 * 
 * 层级结构：
 * - 第一层：/（首页）
 * - 第二层：/dashboard（会员中心）
 * - 第三层：刊登管理、推荐管理、任务管理、奖励回馈、订阅管理
 * - 第四层及以上：详情页、编辑页等
 */
const ROUTE_HIERARCHY: Record<string, string> = {
  // 第三层 → 第二层（会员中心）
  '/service-providers': '/dashboard',  // 刊登管理
  '/referrals': '/dashboard',          // 推荐管理
  '/tasks': '/dashboard',              // 任务管理
  '/rewards': '/dashboard',            // 奖励回馈
  '/subscriptions': '/dashboard',      // 订阅管理
  
  // 第四层 → 第三层
  '/service-providers/create': '/service-providers',
  '/service-providers/edit': '/service-providers',  // 动态路由前缀
  '/referral-tree': '/referrals',
  
  // 注册流程 → 首页
  '/register': '/',
  '/register/step-1': '/',
  '/register/step-2': '/',
  '/register/step-3': '/',
  '/register/step-4': '/',
  '/register/payment': '/',
  '/register/payment-success': '/',
  
  // 登录 → 首页
  '/login': '/',
  
  // 第二层（会员中心）→ 第一层（首页）
  '/dashboard': '/',
};

/**
 * 智能层级导航 Hook
 * 
 * 根据路由层级结构返回上一层，而非浏览器历史记录的上一页
 * 
 * @returns handleBack - 返回函数，导航到当前路由的上一层
 * 
 * @example
 * ```tsx
 * const handleBack = useBackNavigation();
 * 
 * <Button onClick={handleBack}>
 *   <ArrowLeft /> 返回上一层
 * </Button>
 * ```
 */
export function useBackNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    const currentPath = location.pathname;
    
    // 1. 精确匹配：直接查找当前路径
    if (ROUTE_HIERARCHY[currentPath]) {
      console.log(`[层级导航] 精确匹配: ${currentPath} → ${ROUTE_HIERARCHY[currentPath]}`);
      navigate(ROUTE_HIERARCHY[currentPath]);
      return;
    }
    
    // 2. 前缀匹配：处理动态路由（如 /service-providers/:id）
    for (const [routePrefix, parentRoute] of Object.entries(ROUTE_HIERARCHY)) {
      if (currentPath.startsWith(routePrefix + '/')) {
        console.log(`[层级导航] 前缀匹配: ${currentPath} → ${parentRoute} (via ${routePrefix})`);
        navigate(parentRoute);
        return;
      }
    }
    
    // 3. 默认行为：如果没有匹配到任何规则，返回首页
    console.log(`[层级导航] 无匹配规则，返回首页: ${currentPath} → /`);
    navigate('/');
  };

  return handleBack;
}

/**
 * 获取当前路由的面包屑路径
 * 
 * @returns 面包屑数组，例如：[{ name: '首页', path: '/' }, { name: '会员中心', path: '/dashboard' }]
 * 
 * @example
 * ```tsx
 * const breadcrumbs = useBreadcrumbs();
 * // 在 /service-provider-management 页面：
 * // [{ name: '首页', path: '/' }, { name: '会员中心', path: '/dashboard' }, { name: '刊登管理', path: '/service-provider-management' }]
 * ```
 */
export function useBreadcrumbs() {
  const location = useLocation();
  
  const routeNames: Record<string, string> = {
    '/': '首页',
    '/dashboard': '会员中心',
    '/service-providers': '刊登管理',
    '/referrals': '推荐管理',
    '/tasks': '任务管理',
    '/rewards': '奖励回馈',
    '/subscriptions': '订阅管理',
    '/service-providers/create': '建立刊登',
    '/register': '注册',
    '/login': '登入',
  };
  
  const breadcrumbs: { name: string; path: string }[] = [];
  let currentPath = location.pathname;
  
  // 反向追踪路径
  while (currentPath) {
    const routeName = routeNames[currentPath] || getCurrentRouteName(currentPath);
    breadcrumbs.unshift({ name: routeName, path: currentPath });
    
    // 查找父级路由
    const parentPath = ROUTE_HIERARCHY[currentPath] || findParentByPrefix(currentPath);
    if (!parentPath || parentPath === currentPath) break;
    currentPath = parentPath;
  }
  
  return breadcrumbs;
}

/**
 * 根据当前路径获取路由名称（处理动态路由）
 */
function getCurrentRouteName(path: string): string {
  if (path.startsWith('/service-providers/edit/')) return '编辑刊登';
  if (path.startsWith('/service-providers/') && path !== '/service-providers/create') return '刊登详情';
  if (path.startsWith('/referral-tree')) return '推荐树';
  
  // 默认返回路径最后一段
  const segments = path.split('/').filter(Boolean);
  return segments[segments.length - 1] || '未知页面';
}

/**
 * 通过前缀匹配查找父级路由
 */
function findParentByPrefix(path: string): string | null {
  for (const [routePrefix, parentRoute] of Object.entries(ROUTE_HIERARCHY)) {
    if (path.startsWith(routePrefix + '/')) {
      return parentRoute;
    }
  }
  return null;
}