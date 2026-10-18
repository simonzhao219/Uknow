// @vitest-environment jsdom
//
// 「推薦碼＋複製」的行為契約（會員資訊卡、推薦管理推薦碼列、我的 QR 頁共用這一顆）。
// 閘門吃 myQrTabsForUser：碼在付款成功時就已產生，但沒簽參加契約書之前不該拿出來用。
// 碼與狀態一律由元件自己從 UserContext 取，呼叫端沒有傳錯碼的機會。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { UserCtx, showToast } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  return {
    UserCtx: createContext<{ user: MyQrTabUser | null }>({ user: null }),
    showToast: vi.fn(),
  };
});

vi.mock('../../App', () => ({ UserContext: UserCtx }));
vi.mock('../notifications/NotificationContext', () => ({ useNotification: () => ({ showToast }) }));
vi.mock('../../utils/clipboard', () => ({ copyToClipboard: vi.fn(() => true) }));

import { ReferralCodeWithCopy } from './ReferralCodeWithCopy';
import { copyToClipboard } from '../../utils/clipboard';
import type { MyQrTabUser } from '../../utils/myQrTabPreference';

const JOINED = { referralProgramJoined: true, referralCode: '8048877' };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderCode(user: MyQrTabUser, layout?: 'field' | 'centered') {
  return render(
    <UserCtx.Provider value={{ user }}>
      <ReferralCodeWithCopy layout={layout} />
    </UserCtx.Provider>,
  );
}

describe('ReferralCodeWithCopy', () => {
  it('已加入時顯示「我的推薦碼」標籤、碼與複製鈕', () => {
    renderCode(JOINED);
    expect(screen.getByText('我的推薦碼')).toBeTruthy();
    expect(screen.getByTestId('my-referral-code').textContent).toBe('8048877');
    expect(screen.getByRole('button', { name: '複製推薦碼' })).toBeTruthy();
  });

  it('按複製鈕複製推薦碼並提示「推薦碼已複製！」', () => {
    renderCode(JOINED);
    fireEvent.click(screen.getByRole('button', { name: '複製推薦碼' }));
    expect(copyToClipboard).toHaveBeenCalledWith('8048877');
    expect(showToast).toHaveBeenCalledWith('推薦碼已複製！', 'success');
  });

  it('複製失敗時提示手動複製，不宣稱已複製', () => {
    vi.mocked(copyToClipboard).mockReturnValueOnce(false);
    renderCode(JOINED);
    fireEvent.click(screen.getByRole('button', { name: '複製推薦碼' }));
    expect(showToast).toHaveBeenCalledWith('複製失敗，請手動複製', 'error');
  });

  it('複製鈕是 icon-only，仍有可存取名稱', () => {
    renderCode(JOINED);
    expect(screen.getByRole('button', { name: '複製推薦碼' }).textContent).toBe('');
  });

  it('未加入推薦計畫時不露出推薦碼，改寫尚未加入且沒有複製鈕', () => {
    // 碼刻意給值：閘門是 referralProgramJoined，不是碼存不存在。
    renderCode({ referralProgramJoined: false, referralCode: '8048877' });
    expect(screen.queryByText('8048877')).toBeNull();
    expect(screen.getByText('我的推薦碼')).toBeTruthy();
    expect(screen.getByText('尚未加入推薦計畫')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '複製推薦碼' })).toBeNull();
  });

  it('已加入但推薦碼尚未產生時不露碼、寫尚未加入且沒有複製鈕', () => {
    renderCode({ referralProgramJoined: true, referralCode: null });
    expect(screen.queryByTestId('my-referral-code')).toBeNull();
    expect(screen.getByText('尚未加入推薦計畫')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '複製推薦碼' })).toBeNull();
  });

  it('置中版（我的 QR 頁）不帶標籤，未加入時整塊不渲染', () => {
    renderCode(JOINED, 'centered');
    expect(screen.queryByText('我的推薦碼')).toBeNull();
    expect(screen.getByTestId('my-referral-code').textContent).toBe('8048877');
    cleanup();

    const { container } = renderCode({ referralProgramJoined: false }, 'centered');
    expect(container.firstChild).toBeNull();
  });
});
