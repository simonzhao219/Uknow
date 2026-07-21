// @vitest-environment jsdom
//
// 推薦 QR Code 的行為契約：
//   - 有推薦碼時，畫面顯示的可掃描連結必須是 `/register?ref=<code>`（帶碼直達註冊），
//     這正是「掃了就轉跳註冊且帶推薦碼」的核心；QR 圖與此連結編碼同一份內容。
//   - 沒有推薦碼時，退回引導文案（尚未加入推薦計畫），不渲染 QR。
// 不直接斷言 canvas 像素（無意義且脆弱），改以「顯示的連結 = 帶碼註冊連結」作為契約。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ReferralQRCode } from './ReferralQRCode';
import { buildReferralLink } from '../../utils/referralInvite';

// 只需要一個不會爆的 showToast；QR 元件不在渲染期呼叫通知。
vi.mock('../notifications/NotificationContext', () => ({
  useNotification: () => ({ showToast: vi.fn() }),
}));

afterEach(cleanup);

describe('ReferralQRCode', () => {
  it('顯示帶推薦碼的註冊連結（掃描即帶碼直達註冊）', () => {
    render(<ReferralQRCode referralCode="abc123" />);
    const expectedLink = buildReferralLink('abc123');
    expect(expectedLink).toContain('/register?ref=abc123');
    expect(screen.getByText(expectedLink)).toBeTruthy();
    // 推薦碼本身也露出，方便對方手動輸入。
    expect(screen.getByText('abc123')).toBeTruthy();
    // QR 圖容器存在。
    expect(screen.getByTestId('referral-qrcode')).toBeTruthy();
  });

  it('沒有推薦碼時顯示引導文案、不渲染 QR', () => {
    render(<ReferralQRCode referralCode={null} />);
    expect(screen.queryByTestId('referral-qrcode')).toBeNull();
    expect(screen.getByText(/加入推薦計畫/)).toBeTruthy();
  });
});
