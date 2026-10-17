// @vitest-environment jsdom
//
// 邀請好友面板內容的行為契約：
//   - 有推薦碼時，可掃描/可複製的連結必須是 `/register?ref=<code>`（帶碼直達註冊），
//     QR 容器帶可存取名稱（aria-label 含該連結），且分享鈕帶 e2e 依賴的 testid。
//   - 邀請連結是唯讀欄位：點進去整段全選、旁邊一顆鈕複製（不跳鍵盤、不換行）。
//   - 推薦碼＋複製是共用元件 ReferralCodeWithCopy（從 UserContext 取碼與閘門）。
//   - 沒有推薦碼時整塊不渲染（gating 由呼叫端的分頁負責，內容自身也防守一次）。
// QR 元件替身成帶顏色屬性的 canvas：不斷言像素，只斷言畫什麼、用什麼色。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { UserCtx, showToast } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  return {
    UserCtx: createContext<any>({ user: null, refreshUser: async () => null }),
    showToast: vi.fn(),
  };
});

vi.mock('../../App', () => ({ UserContext: UserCtx }));
vi.mock('../notifications/NotificationContext', () => ({ useNotification: () => ({ showToast }) }));
vi.mock('../../utils/clipboard', () => ({ copyToClipboard: vi.fn(() => true) }));
vi.mock('qrcode.react', () => ({
  QRCodeCanvas: ({ fgColor, bgColor }: { fgColor?: string; bgColor?: string }) => (
    <canvas data-testid="qr-canvas" data-fg={fgColor} data-bg={bgColor} />
  ),
}));

import { InviteFriendPanelContent } from './InviteFriendPanelContent';
import { buildReferralLink } from '../../utils/referralInvite';
import { copyToClipboard } from '../../utils/clipboard';
import { PIXEL_INK, PIXEL_PAPER } from '../../utils/pixelColors';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPanel(code: string | null = 'abc123') {
  return render(
    <UserCtx.Provider value={{ user: { referralProgramJoined: true, referralCode: code } }}>
      <InviteFriendPanelContent referralCode={code} memberName="小明" />
    </UserCtx.Provider>,
  );
}

describe('InviteFriendPanelContent', () => {
  it('顯示帶推薦碼的註冊連結、推薦碼與可存取的 QR（掃描/開啟即帶碼直達註冊）', () => {
    renderPanel();
    const expectedLink = buildReferralLink('abc123');
    expect(expectedLink).toContain('/register?ref=abc123');

    expect((screen.getByLabelText('邀請連結') as HTMLInputElement).value).toBe(expectedLink);
    expect(screen.getByTestId('my-referral-code').textContent).toBe('abc123');
    // 抬頭帶會員名（"拿給人掃"模式）；名字獨立成粗體 span，故分開斷言
    const nameEl = screen.getByText('小明');
    expect(nameEl.className).toContain('font-bold');
    expect(nameEl.parentElement?.textContent).toBe('小明 的Uknow邀請');
    // QR 容器可存取名稱含連結
    const qr = screen.getByTestId('referral-qrcode');
    expect(qr.getAttribute('aria-label')).toContain(expectedLink);
    // e2e 依賴的分享鈕 testid 保留在真正觸發分享的按鈕上
    expect(screen.getByTestId('share-referral-button')).toBeTruthy();
  });

  it('分享仍拆成「分享 QR Code」與「邀請好友」兩顆，邀請好友只送文字', () => {
    renderPanel();
    // 兩顆各司其職：圖片一顆、文字一顆。合併成一顆（text+files 混送）會讓多數
    // Android 分享目標把文字丟掉，推薦連結與推薦碼就消失了——這條守住不回頭。
    expect(screen.getByRole('button', { name: /分享 QR Code/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /邀請好友/ })).toBeTruthy();
    // 送出文字的那顆才是 e2e 分享情境依賴的按鈕（複製 fallback 會複製整段邀請訊息）。
    expect(screen.getByTestId('share-referral-button').textContent).toContain('邀請好友');
  });

  it('邀請連結是唯讀欄位，點進去整段全選', () => {
    renderPanel();
    const field = screen.getByLabelText('邀請連結') as HTMLInputElement;
    // readonly：手機點進去不跳鍵盤，也改不到連結。
    expect(field.readOnly).toBe(true);
    expect(field.className).toContain('font-mono');
    fireEvent.focus(field);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(field.value.length);
  });

  it('旁邊的複製鈕複製整段邀請連結並提示', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: '複製邀請連結' }));
    expect(copyToClipboard).toHaveBeenCalledWith(buildReferralLink('abc123'));
    expect(showToast).toHaveBeenCalledWith('邀請連結已複製！', 'success');
  });

  it('複製推薦碼是 icon-only 按鈕，仍有可存取名稱', () => {
    renderPanel();
    const copyBtn = screen.getByRole('button', { name: '複製推薦碼' });
    // icon-only：按鈕內不該再有「複製推薦碼」這串可見文字（碼就在左邊，標籤多餘）。
    expect(copyBtn.textContent).toBe('');
  });

  it('QR 以現行墨色畫在白底上（不再是非色票的 #111111）', () => {
    renderPanel();
    const canvas = screen.getByTestId('qr-canvas');
    expect(canvas.getAttribute('data-fg')).toBe(PIXEL_INK);
    expect(canvas.getAttribute('data-bg')).toBe(PIXEL_PAPER);
  });

  it('沒有推薦碼時整塊不渲染', () => {
    const { container } = renderPanel(null);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('referral-qrcode')).toBeNull();
  });
});
