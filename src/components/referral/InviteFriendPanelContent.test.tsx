// @vitest-environment jsdom
//
// 邀請好友面板內容的行為契約：
//   - 有推薦碼時，可掃描/可複製的連結必須是 `/register?ref=<code>`（帶碼直達註冊），
//     QR 容器帶可存取名稱（aria-label 含該連結），且分享鈕帶 e2e 依賴的 testid。
//   - 邀請連結是唯讀欄位：點進去整段全選、旁邊一顆鈕複製（不跳鍵盤、不換行）。
//   - 推薦碼、會員名與閘門只有一個來源：UserContext（myQrTabsForUser），面板與其中的
//     ReferralCodeWithCopy 讀同一份，不再由呼叫端另傳一份碼。
//   - 沒加入或沒有碼時整塊不渲染（gating 由呼叫端的分頁負責，內容自身也防守一次）。
//   - 「分享 QR Code」與「邀請好友」同一套取消語意：分享面板按取消就停。
//   - 「邀請好友」送出的訊息以推薦人揭露句收尾，名字取自同一份 UserContext。
// QR 元件替身成帶顏色屬性的 canvas：不斷言像素，只斷言畫什麼、用什麼色。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { UserCtx, showToast } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  return {
    UserCtx: createContext<{ user: PanelUser | null }>({ user: null }),
    showToast: vi.fn(),
  };
});

vi.mock('../../App', () => ({ UserContext: UserCtx }));
vi.mock('../notifications/NotificationContext', () => ({ useNotification: () => ({ showToast }) }));
vi.mock('../../utils/clipboard', () => ({ copyToClipboard: vi.fn(() => true) }));
vi.mock('./InviteCard', () => ({
  InviteCardDialog: ({ open, code }: { open: boolean; code: string }) =>
    open ? <div role="dialog" aria-label="邀請好友" data-code={code} /> : null,
}));
vi.mock('qrcode.react', () => ({
  QRCodeCanvas: ({ fgColor, bgColor }: { fgColor?: string; bgColor?: string }) => (
    <canvas data-testid="qr-canvas" data-fg={fgColor} data-bg={bgColor} />
  ),
}));

import { InviteFriendPanelContent } from './InviteFriendPanelContent';
import { buildReferralLink } from '../../utils/referralInvite';
import { copyToClipboard } from '../../utils/clipboard';
import { PIXEL_INK, PIXEL_PAPER } from '../../utils/pixelColors';
import type { MyQrTabUser } from '../../utils/myQrTabPreference';

type PanelUser = MyQrTabUser & { name?: string | null };

const JOINED: PanelUser = { name: '小明', referralProgramJoined: true, referralCode: 'abc123' };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function renderPanel(user: PanelUser = JOINED) {
  return render(
    <UserCtx.Provider value={{ user }}>
      <InviteFriendPanelContent />
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
    const { container } = renderPanel({ ...JOINED, referralCode: null });
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('referral-qrcode')).toBeNull();
  });

  it('未加入推薦計畫時整塊不渲染，即使碼已產生', () => {
    const { container } = renderPanel({ ...JOINED, referralProgramJoined: false });
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText('abc123')).toBeNull();
  });
});

describe('InviteFriendPanelContent 分享 QR Code', () => {
  /** jsdom 沒有 canvas 輸出：toBlob 給一個空 PNG、toDataURL 給空字串，下載的 <a>.click 不導頁。 */
  function stubCanvasAndShare(share: () => Promise<void>) {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => {
      cb(new Blob([], { type: 'image/png' }));
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    // 只在真的 navigator 上補 share／canShare（jsdom 沒有這兩支）；整個換掉會丟失
    // userAgent 這類 getter，detectInAppBrowser 就讀不到了。
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
  }

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'share');
    Reflect.deleteProperty(navigator, 'canShare');
  });

  /** 瀏覽器拒絕 share() 時丟的是 DOMException，name 區分原因。 */
  const rejectWith = (name: string) => () => Promise.reject(new DOMException(name, name));

  it('分享面板按取消就停，不落回下載', async () => {
    const share = vi.fn(rejectWith('AbortError'));
    stubCanvasAndShare(share);
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /分享 QR Code/ }));
    await vi.waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(showToast).not.toHaveBeenCalled();
  });

  it('面板還開著又按一下（InvalidStateError）就停，不落回下載', async () => {
    const share = vi.fn(rejectWith('InvalidStateError'));
    stubCanvasAndShare(share);
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /分享 QR Code/ }));
    await vi.waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(showToast).not.toHaveBeenCalled();
  });

  it('分享面板用不了時落回下載邀請卡', async () => {
    stubCanvasAndShare(rejectWith('NotAllowedError'));
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /分享 QR Code/ }));
    await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith('邀請卡已下載！', 'success'));
  });

  it('不支援檔案分享而改下載時，邀請卡上畫出帶會員名的揭露句', async () => {
    // 卡片這條路的名字由面板交給 drawInviteCard；版面另有 inviteCardImage.test.ts 管，
    // 這裡只釘「面板有把名字交過去」。jsdom 沒有 2D context，換成只記錄字串的假 context。
    const drawn: string[] = [];
    const ctx = {
      font: '',
      fillStyle: '',
      textAlign: 'left',
      imageSmoothingEnabled: true,
      fillRect: () => {},
      drawImage: () => {},
      fillText: (text: string) => drawn.push(text),
      measureText: (text: string) => ({ width: text.length * 10 }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    const share = vi.fn().mockResolvedValue(undefined);
    stubCanvasAndShare(share);
    Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /分享 QR Code/ }));
    await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith('邀請卡已下載！', 'success'));
    expect(share).not.toHaveBeenCalled();
    expect(drawn).toContain('本邀請由 Uknow 推薦人 小明 發送');
  });
});

describe('InviteFriendPanelContent 邀請好友', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'share');
  });

  it('送出的邀請訊息以「本邀請由 Uknow 推薦人 小明 發送」收尾', () => {
    // 只在真的 navigator 上補 share（jsdom 沒有）；shareReferralInvite 立刻接 .catch，
    // 所以替身要回 Promise。
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    renderPanel();
    fireEvent.click(screen.getByTestId('share-referral-button'));
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0][0].text).toMatch(/本邀請由 Uknow 推薦人 小明 發送$/);
  });
});

describe('InviteFriendPanelContent Email 邀請旗標', () => {
  it('旗標開啟時邀請好友開邀請卡、不叫系統分享', () => {
    vi.stubEnv('VITE_REFERRAL_EMAIL_INVITE', 'true');
    const share = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, share });
    renderPanel();
    fireEvent.click(screen.getByTestId('share-referral-button'));
    expect(screen.getByRole('dialog', { name: '邀請好友' }).getAttribute('data-code')).toBe(
      'abc123',
    );
    expect(share).not.toHaveBeenCalled();
  });

  it('旗標關閉時邀請好友不開卡', () => {
    vi.stubEnv('VITE_REFERRAL_EMAIL_INVITE', 'false');
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    renderPanel();
    fireEvent.click(screen.getByTestId('share-referral-button'));
    expect(screen.queryByRole('dialog', { name: '邀請好友' })).toBeNull();
    expect(share).toHaveBeenCalled();
    Reflect.deleteProperty(navigator, 'share');
  });
});
