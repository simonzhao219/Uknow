// 「複製＋提示」只寫一份：推薦碼、邀請連結的複製鈕（useCopyToast）與邀請好友的最後
// 一順位（referralInvite）都呼叫這一支。clipboard.ts 維持不碰 toast。
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./clipboard', () => ({ copyToClipboard: vi.fn(() => true) }));

import { copyToClipboard } from './clipboard';
import { copyWithToast } from './copyWithToast';

afterEach(() => {
  vi.clearAllMocks();
});

describe('copyWithToast', () => {
  it('複製成功時給成功提示並回傳 true', () => {
    const showToast = vi.fn();
    expect(copyWithToast('8048877', '推薦碼已複製！', showToast)).toBe(true);
    expect(copyToClipboard).toHaveBeenCalledWith('8048877');
    expect(showToast).toHaveBeenCalledWith('推薦碼已複製！', 'success');
  });

  it('複製失敗時預設提示手動複製並回傳 false', () => {
    vi.mocked(copyToClipboard).mockReturnValueOnce(false);
    const showToast = vi.fn();
    expect(copyWithToast('8048877', '推薦碼已複製！', showToast)).toBe(false);
    expect(showToast).toHaveBeenCalledWith('複製失敗，請手動複製', 'error');
  });

  it('呼叫端可指定失敗提示（例如指向能手動複製的地方）', () => {
    vi.mocked(copyToClipboard).mockReturnValueOnce(false);
    const showToast = vi.fn();
    copyWithToast('訊息', '已複製', showToast, '複製失敗，請到別處複製');
    expect(showToast).toHaveBeenCalledWith('複製失敗，請到別處複製', 'error');
  });
});
