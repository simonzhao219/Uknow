// 刊登方案頁的用語（業主 2026-10-23）：使用者看得到的文案一律「推薦人」，不出現
// 「傳銷商／直銷」，也不用「上線／下線」。律師定案的四份內容頁維持原文、不在此檢查。
import { describe, expect, it } from 'vitest';
import { listingPlansContent } from './listingPlans';

describe('listingPlansContent', () => {
  it.each(['傳銷商', '直銷', '下線'])('刊登方案頁不出現「%s」', (word) => {
    expect(listingPlansContent).not.toContain(word);
  });

  it('三代分潤寫成「您推薦的會員（及他們再推薦的會員）」', () => {
    expect(listingPlansContent).toContain(
      '只要您推薦的會員（及他們再推薦的會員）成功加入刊登或續約',
    );
  });
});
