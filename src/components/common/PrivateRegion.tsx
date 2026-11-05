// 整頁／整區 block 的容器：display:contents，不產生 box，所以不影響版面。
// 只用在路由層（付款頁、後台）；欄位群組請直接用 privateClass() 併進既有容器。
import type { ReactNode } from 'react';
import { privateClass } from '../../utils/analytics/privacy';

export function PrivateRegion({ children }: { children: ReactNode }) {
  return <div className={privateClass('contents')}>{children}</div>;
}
