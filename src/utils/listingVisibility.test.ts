// 刊登的可見性只有後端真有的兩種（規格書 §11）：會籍有效＝上架中、會籍失效＝已隱藏
// （has_active_subscription 即時決定，不存 isActive 欄位）。讀不到訂閱狀態時是「不知道」，
// 不能畫成上架中也不能畫成已隱藏（總綱 §0 原則 1：沒確認的狀態不畫成已知狀態）。
// 會員中心的刊登卡與刊登管理頁共用這一支，兩處不會在邊界互相矛盾。
import { describe, expect, it } from 'vitest';
import { listingVisibility } from './listingVisibility';

describe('listingVisibility', () => {
  it.each([
    [{ status: 'active' as const }, 'visible'],
    [{ status: 'expired' as const }, 'hidden'],
    [{}, 'unknown'],
    [null, 'unknown'],
    [undefined, 'unknown'],
  ])('%j → %s', (subscription, expected) => {
    expect(listingVisibility(subscription)).toBe(expected);
  });
});
