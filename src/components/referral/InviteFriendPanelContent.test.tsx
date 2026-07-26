// @vitest-environment jsdom
//
// 邀請好友面板內容的行為契約：
//   - 有推薦碼時，畫面顯示的可掃描/可複製連結必須是 `/register?ref=<code>`（帶碼直達
//     註冊），QR 容器帶可存取名稱（aria-label 含該連結），且分享鈕帶 e2e 依賴的 testid。
//   - 沒有推薦碼時整塊不渲染（gating 由呼叫端的按鈕負責，內容自身也防守一次）。
// 不斷言 canvas 像素（無意義且脆弱），以「顯示的連結＝帶碼註冊連結」為契約。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { InviteFriendPanelContent } from './InviteFriendPanelContent';
import { buildReferralLink } from '../../utils/referralInvite';

vi.mock('../notifications/NotificationContext', () => ({
  useNotification: () => ({ showToast: vi.fn() }),
}));

afterEach(cleanup);

describe('InviteFriendPanelContent', () => {
  it('顯示帶推薦碼的註冊連結、推薦碼與可存取的 QR（掃描/開啟即帶碼直達註冊）', () => {
    render(<InviteFriendPanelContent referralCode="abc123" memberName="小明" />);
    const expectedLink = buildReferralLink('abc123');
    expect(expectedLink).toContain('/register?ref=abc123');

    expect(screen.getByText(expectedLink)).toBeTruthy();
    expect(screen.getByText('abc123')).toBeTruthy();
    // 抬頭帶會員名（"拿給人掃"模式）；名字獨立成粗體 span，故分開斷言
    const nameEl = screen.getByText('小明');
    expect(nameEl.className).toContain('font-bold');
    expect(nameEl.parentElement?.textContent).toBe('小明 的推薦邀請');
    // QR 容器可存取名稱含連結
    const qr = screen.getByTestId('referral-qrcode');
    expect(qr.getAttribute('aria-label')).toContain(expectedLink);
    // e2e 依賴的分享鈕 testid 保留在真正觸發分享的按鈕上
    expect(screen.getByTestId('share-referral-button')).toBeTruthy();
  });

  it('沒有推薦碼時整塊不渲染', () => {
    const { container } = render(<InviteFriendPanelContent referralCode={null} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('referral-qrcode')).toBeNull();
  });
});
