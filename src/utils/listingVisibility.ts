export type ListingVisibility = 'visible' | 'hidden' | 'unknown';

/**
 * 刊登的可見性（規格書 §11）：只有後端真有的兩種——會籍有效＝上架中、會籍失效＝已隱藏
 * （`has_active_subscription` 即時決定，不存 isActive 欄位；公開的 public_listings view 以它
 * 過濾）。UI 的「上架中／已隱藏」徽章讀的是 useSubscription 的 status，不是刊登自己的欄位。
 *
 * 讀不到訂閱狀態（還在載入、請求失敗）是 `unknown`：沒確認的狀態不畫成已知狀態（總綱 §0
 * 原則 1）——既不能畫上架中，也不能畫已隱藏。會員中心的刊登卡與刊登管理頁共用這一支，
 * 兩處不會在邊界互相矛盾。停權也會讓刊登下架，但停權帳號被 RequireMembershipRoute 擋在會員區
 * 外，進不到這兩頁，所以不另判。
 */
export function listingVisibility(
  subscription: { status?: 'active' | 'expired' } | null | undefined,
): ListingVisibility {
  if (subscription?.status === 'active') return 'visible';
  if (subscription?.status === 'expired') return 'hidden';
  return 'unknown';
}
