// @vitest-environment jsdom
//
// 邀請卡片（Email 邀請 R2）的狀態契約——規劃書 §4 狀態表逐列：
//   A 未填 email：主鈕「快速分享」→ shareReferralInvite 並關卡。
//   B／C 已填：同意聲明出現（必勾），主鈕「用 Email 邀請」。
//   在途：主鈕 aria-disabled＋「寄送中…」，重複送出被擋。
//   受理：同一個常駐 live region 三句、完整回顯地址，email 與勾選清空。
//   寄不了：錯誤句都講到「快速分享」、主鈕換名；必敗的 code 收合 email 區。
//   欄位錯：email 欄 aria-invalid、描述指向同一個 live region。
// 文案一律依 error code，不讀後端 message；數字綁後端常數。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { findForbiddenWord } from '@recruitment-copy';
import { REFERRAL_INVITE_TOKEN_TTL_SECONDS } from '@referral-invite-payload';
import { readBackendConstant } from '../../test-utils/backendConstants';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const showToast = vi.fn();
vi.mock('../notifications/NotificationContext', () => ({ useNotification: () => ({ showToast }) }));
vi.mock('../../utils/referralInvite', () => ({ shareReferralInvite: vi.fn() }));
const apiRequestJson = vi.fn();
vi.mock('../../utils/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/apiClient')>()),
  apiRequestJson: (...args: unknown[]) => apiRequestJson(...args),
}));

const { InviteCardDialog } = await import('./InviteCard');
const { shareReferralInvite } = await import('../../utils/referralInvite');
const { ApiError } = await import('../../utils/apiClient');

const onOpenChange = vi.fn();

function renderCard(name = '王小明') {
  return render(
    <InviteCardDialog open onOpenChange={onOpenChange} code="8048877" memberName={name} />,
  );
}

const emailInput = () => screen.getByLabelText('對方的 Email（選填）') as HTMLInputElement;
const mainButton = () => screen.getByTestId('invite-card-submit');
const liveRegion = () => screen.getByTestId('invite-card-live');
const consentBox = () => screen.getByRole('checkbox');

function fillAndConsent(email = 'Friend@Example.com ') {
  fireEvent.change(emailInput(), { target: { value: email } });
  fireEvent.click(consentBox());
}

const apiError = (status: number, code?: string) => new ApiError('後端後備句', status, code);

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('InviteCard 版面與逐字', () => {
  it('標題、欄位名與說明逐字，說明掛在 email 欄的描述', () => {
    renderCard();
    expect(screen.getByRole('dialog', { name: '邀請好友' })).toBeTruthy();
    const desc = screen.getByText(
      '填寫 Email，由 Uknow 代寄邀請信給對方；留空則用 LINE 等 App 分享你的邀請連結',
    );
    expect(emailInput().getAttribute('aria-describedby')).toContain(desc.id);
  });

  it('live region 在任何動作之前就常駐', () => {
    renderCard();
    expect(liveRegion().getAttribute('aria-live')).toBe('polite');
    expect(liveRegion().textContent).toBe('');
  });

  it('email 欄關閉自動大寫、自動校正與拼字檢查', () => {
    renderCard();
    expect(emailInput().getAttribute('autocapitalize')).toBe('none');
    expect(emailInput().getAttribute('autocorrect')).toBe('off');
    expect(emailInput().getAttribute('spellcheck')).toBe('false');
  });
});

describe('InviteCard 狀態 A：未填 email', () => {
  it('主鈕為快速分享，按下呼叫 shareReferralInvite 並關卡', () => {
    renderCard();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(mainButton().textContent).toBe('快速分享');
    fireEvent.click(mainButton());
    expect(shareReferralInvite).toHaveBeenCalledWith('8048877', showToast, '王小明');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(apiRequestJson).not.toHaveBeenCalled();
  });

  it('只有空白時仍視為未填', () => {
    renderCard();
    fireEvent.change(emailInput(), { target: { value: '   ' } });
    expect(mainButton().textContent).toBe('快速分享');
  });
});

describe('InviteCard 狀態 B／C：已填 email', () => {
  it('出現含推薦人姓名的同意聲明，主鈕變用 Email 邀請', () => {
    renderCard();
    fireEvent.change(emailInput(), { target: { value: 'a@b.co' } });
    expect(screen.getByText(/信中會顯示我的姓名「王小明」/)).toBeTruthy();
    expect(mainButton().textContent).toBe('用 Email 邀請');
  });

  it('未勾同意聲明時不送出、勾選框標錯並把焦點移過去', () => {
    renderCard();
    fireEvent.change(emailInput(), { target: { value: 'a@b.co' } });
    fireEvent.click(mainButton());
    expect(apiRequestJson).not.toHaveBeenCalled();
    expect(consentBox().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(consentBox());
    expect(liveRegion().textContent).toBe('請先勾選同意聲明');
  });

  it('email 不合文法時不送出、標在 email 欄', () => {
    renderCard();
    fillAndConsent('not an email');
    fireEvent.click(mainButton());
    expect(apiRequestJson).not.toHaveBeenCalled();
    expect(liveRegion().textContent).toBe('Email 格式不正確');
    expect(emailInput().getAttribute('aria-invalid')).toBe('true');
  });
});

describe('InviteCard 送出', () => {
  it('受理時送正規化 email 與同意、回顯完整地址三句並清空輸入', async () => {
    apiRequestJson.mockResolvedValue({ accepted: true });
    renderCard();
    fillAndConsent();
    fireEvent.click(mainButton());
    await waitFor(() => expect(liveRegion().querySelectorAll('p')).toHaveLength(3));
    const [url, init] = apiRequestJson.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/referrals\/invites$/);
    expect(JSON.parse(String(init.body))).toEqual({ email: 'friend@example.com', consent: true });
    const texts = [...liveRegion().querySelectorAll('p')].map((p) => p.textContent);
    expect(texts[0]).toBe('已受理邀請（寄往 friend@example.com）。');
    expect(texts[2]).toBe('請提醒對方查看垃圾郵件匣。');
    expect(emailInput().value).toBe('');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(mainButton().textContent).toBe('快速分享');
  });

  it('在途時主鈕 aria-disabled 並擋重複送出', async () => {
    let release: (v: unknown) => void = () => {};
    apiRequestJson.mockReturnValue(new Promise((r) => (release = r)));
    renderCard();
    fillAndConsent();
    fireEvent.click(mainButton());
    expect(mainButton().getAttribute('aria-disabled')).toBe('true');
    expect(mainButton().textContent).toBe('寄送中…');
    expect(emailInput().readOnly).toBe(true);
    fireEvent.click(mainButton());
    expect(apiRequestJson).toHaveBeenCalledTimes(1);
    await act(async () => release({ accepted: true }));
  });

  it.each([
    ['rate_limited_hour', '每小時最多寄 5 封，請稍後再試，或改按下方『快速分享』'],
    ['rate_limited_day', '今天的邀請額度已用完，請明天再試或改按下方『快速分享』'],
    ['unavailable', '暫時無法寄送，可改按下方『快速分享』'],
  ])('%s 時顯示對應句、主鈕換快速分享並保留輸入', async (code, text) => {
    apiRequestJson.mockRejectedValue(apiError(code.startsWith('rate') ? 429 : 503, code));
    renderCard();
    fillAndConsent();
    fireEvent.click(mainButton());
    await waitFor(() => expect(liveRegion().textContent).toBe(text));
    expect(mainButton().textContent).toBe('快速分享');
    expect(emailInput().value).toBe('Friend@Example.com ');
    expect((consentBox() as HTMLButtonElement).getAttribute('aria-checked')).toBe('true');
  });

  it.each([
    ['disabled', 'Email 邀請暫停中，可改按下方『快速分享』'],
    ['restricted', '暫時無法寄送，可改按下方『快速分享』'],
    ['not_joined', '暫時無法寄送，可改按下方『快速分享』'],
  ])('%s 必敗時收合 email 區、主鈕固定快速分享', async (code, text) => {
    apiRequestJson.mockRejectedValue(apiError(403, code));
    renderCard();
    fillAndConsent();
    fireEvent.click(mainButton());
    await waitFor(() => expect(liveRegion().textContent).toBe(text));
    expect(screen.queryByLabelText('對方的 Email（選填）')).toBeNull();
    expect(mainButton().textContent).toBe('快速分享');
    fireEvent.click(mainButton());
    expect(shareReferralInvite).toHaveBeenCalled();
  });

  it.each([
    ['invalid_email', 'Email 格式不正確'],
    ['self_invite', '不能邀請自己'],
  ])('%s 時標在 email 欄、描述指向同一個 live region、焦點回 email', async (code, text) => {
    apiRequestJson.mockRejectedValue(apiError(400, code));
    renderCard();
    fillAndConsent('me@example.com');
    fireEvent.click(mainButton());
    await waitFor(() => expect(liveRegion().textContent).toBe(text));
    expect(emailInput().getAttribute('aria-invalid')).toBe('true');
    expect(emailInput().getAttribute('aria-describedby')).toContain(liveRegion().id);
    expect(document.activeElement).toBe(emailInput());
  });

  it('沒有 code 的失敗一律映到 unavailable 句、不顯示後端原文', async () => {
    apiRequestJson.mockRejectedValue(new ApiError('Network down', 0, 'NETWORK_ERROR'));
    renderCard();
    fillAndConsent();
    fireEvent.click(mainButton());
    await waitFor(() =>
      expect(liveRegion().textContent).toBe('暫時無法寄送，可改按下方『快速分享』'),
    );
    expect(screen.queryByText('Network down')).toBeNull();
  });

  it('email 改變時清錯誤、主鈕回用 Email 邀請、取消勾選並提示重勾', async () => {
    apiRequestJson.mockRejectedValue(apiError(503, 'unavailable'));
    renderCard();
    fillAndConsent();
    fireEvent.click(mainButton());
    await waitFor(() => expect(mainButton().textContent).toBe('快速分享'));
    fireEvent.change(emailInput(), { target: { value: 'other@example.com' } });
    expect(mainButton().textContent).toBe('用 Email 邀請');
    expect(consentBox().getAttribute('aria-checked')).toBe('false');
    expect(liveRegion().textContent).toBe('Email 已變更，請重新勾選同意聲明');
  });

  it('只改大小寫或前後空白不算變更', async () => {
    apiRequestJson.mockRejectedValue(apiError(503, 'unavailable'));
    renderCard();
    fillAndConsent('a@b.co');
    fireEvent.click(mainButton());
    await waitFor(() => expect(mainButton().textContent).toBe('快速分享'));
    fireEvent.change(emailInput(), { target: { value: ' A@B.CO' } });
    expect(consentBox().getAttribute('aria-checked')).toBe('true');
  });
});

describe('InviteCard 數字與用語', () => {
  it('每小時上限與窗口綁後端常數', () => {
    expect(readBackendConstant('REFERRAL_INVITE_RATE_MAX')).toBe(5);
    expect(readBackendConstant('REFERRAL_INVITE_RATE_WINDOW_SECONDS')).toBe(3600);
  });

  it('受理文案的 24 小時與 7 天綁後端常數', async () => {
    apiRequestJson.mockResolvedValue({ accepted: true });
    renderCard();
    fillAndConsent();
    fireEvent.click(mainButton());
    await waitFor(() => expect(liveRegion().querySelectorAll('p')).toHaveLength(3));
    const hours = readBackendConstant('REFERRAL_INVITE_TARGET_WINDOW_SECONDS') / 3600;
    const days = REFERRAL_INVITE_TOKEN_TTL_SECONDS / 86400;
    expect(liveRegion().textContent).toContain(`${hours} 小時內沒收過邀請`);
    expect(liveRegion().textContent).toContain(`連結 ${days} 天內有效`);
  });

  it('卡片全文不含招募禁用字樣', () => {
    renderCard();
    fireEvent.change(emailInput(), { target: { value: 'a@b.co' } });
    expect(findForbiddenWord(document.body.textContent ?? '')).toBeUndefined();
  });

  it('長姓名的同意聲明可斷行不撐版', () => {
    renderCard('非常非常非常非常非常非常非常長的姓名'.repeat(3));
    fireEvent.change(emailInput(), { target: { value: 'a@b.co' } });
    const label = screen.getByText(/信中會顯示我的姓名/);
    expect(label.className).toContain('wrap-anywhere');
    expect(label.className).toContain('min-w-0');
  });
});
