// @vitest-environment jsdom
//
// 「邀請好友／加入推薦計畫」同一個位置的行為契約（會員中心推薦格、推薦管理推薦碼列）。
// 閘門吃 myQrTabsForUser（與我的 QR 頁的邀請分頁同一條規則）——3967f69 的事故就是
// 同一條規則被複製成兩份、只改了一邊。
//   - 未加入（或碼還沒產生）：加入推薦計畫引導鈕；同頁有續訂鈕時讓位成次要。
//   - 已加入：邀請好友次要鈕，按下走 shareReferralInvite——與我的 QR 頁的「邀請好友」
//     同一支（先系統分享面板、再所在 App、最後複製；順位矩陣在 referralInvite.test.ts）。
// JoinReferralProgramDialog 替身掉：簽名板與 API 有自己的關注點。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

const { UserCtx, showToast } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  return {
    UserCtx: createContext<{ user: MyQrTabUser | null; refreshUser: () => Promise<unknown> }>({
      user: null,
      refreshUser: async () => null,
    }),
    showToast: vi.fn(),
  };
});

vi.mock('../../App', () => ({ UserContext: UserCtx }));
vi.mock('../notifications/NotificationContext', () => ({ useNotification: () => ({ showToast }) }));
vi.mock('../../utils/referralInvite', () => ({ shareReferralInvite: vi.fn() }));
vi.mock('./JoinReferralProgramDialog', () => ({
  JoinReferralProgramDialog: ({
    open,
    onSuccess,
  }: {
    open: boolean;
    onSuccess: (referralCode: string, joinedAt: string) => void;
  }) =>
    open ? (
      <button
        type="button"
        data-testid="join-dialog-submit"
        onClick={() => onSuccess('8048877', '2026-10-17T00:00:00.000Z')}
      >
        送出加入
      </button>
    ) : null,
}));

import { InviteFriendButton } from './InviteFriendButton';
import { shareReferralInvite } from '../../utils/referralInvite';
import type { MyQrTabUser } from '../../utils/myQrTabPreference';

const JOINED = { name: '王小明', referralProgramJoined: true, referralCode: '8048877' };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderButton(
  user: MyQrTabUser,
  props: { yieldsGuide?: boolean; onJoined?: () => void } = {},
  refreshUser: () => Promise<unknown> = vi.fn().mockResolvedValue(user),
) {
  render(
    <UserCtx.Provider value={{ user, refreshUser }}>
      <InviteFriendButton {...props} />
    </UserCtx.Provider>,
  );
}

describe('InviteFriendButton 未加入推薦計畫', () => {
  it('未加入時是加入推薦計畫引導鈕，不是邀請好友', () => {
    // 碼刻意給值：碼在付款成功時就已產生，閘門是 referralProgramJoined。
    renderButton({ referralProgramJoined: false, referralCode: '8048877' });
    const join = screen.getByTestId('join-referral-button');
    expect(join.textContent).toContain('加入推薦計畫');
    expect(join.classList.contains('bg-brand')).toBe(true);
    expect(screen.queryByRole('button', { name: /邀請好友/ })).toBeNull();
  });

  it('同頁有續訂鈕而讓位時，加入推薦計畫改成次要外框', () => {
    renderButton({ referralProgramJoined: false }, { yieldsGuide: true });
    const join = screen.getByTestId('join-referral-button');
    expect(join.classList.contains('bg-brand')).toBe(false);
    expect(join.classList.contains('bg-card')).toBe(true);
  });

  it('已加入但推薦碼尚未產生時仍是加入鈕，不給一顆分享不出東西的邀請鈕', () => {
    renderButton({ referralProgramJoined: true, referralCode: null });
    expect(screen.getByTestId('join-referral-button')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /邀請好友/ })).toBeNull();
  });

  it('按加入推薦計畫開出加入流程', () => {
    renderButton({ referralProgramJoined: false });
    fireEvent.click(screen.getByTestId('join-referral-button'));
    expect(screen.getByTestId('join-dialog-submit')).toBeTruthy();
  });

  it('簽完後重抓會員資料、通知呼叫端，鈕立刻變成邀請好友', async () => {
    const onJoined = vi.fn();
    function Harness() {
      const [user, setUser] = useState<MyQrTabUser>({
        referralProgramJoined: false,
        referralCode: null,
      });
      const refreshUser = vi.fn(async () => {
        setUser(JOINED);
        return JOINED;
      });
      return (
        <UserCtx.Provider value={{ user, refreshUser }}>
          <InviteFriendButton onJoined={onJoined} />
        </UserCtx.Provider>
      );
    }
    render(<Harness />);

    fireEvent.click(screen.getByTestId('join-referral-button'));
    fireEvent.click(screen.getByTestId('join-dialog-submit'));

    await vi.waitFor(() => expect(onJoined).toHaveBeenCalledTimes(1));
    const invite = screen.getByRole('button', { name: /邀請好友/ });
    expect(screen.queryByTestId('join-referral-button')).toBeNull();
    // 加入鈕卸載後焦點交給同一位置的新鈕，不掉到 body（§9）。
    expect(document.activeElement).toBe(invite);
  });
});

describe('InviteFriendButton 已加入推薦計畫', () => {
  it('是白底框線的次要鈕，不是品牌色引導鈕', () => {
    renderButton(JOINED);
    const invite = screen.getByRole('button', { name: /邀請好友/ });
    expect(invite.classList.contains('bg-card')).toBe(true);
    expect(invite.classList.contains('bg-brand')).toBe(false);
    expect(screen.queryByTestId('join-referral-button')).toBeNull();
  });

  it('按下走與我的 QR 頁同一支分享，帶自己的推薦碼', () => {
    renderButton(JOINED);
    fireEvent.click(screen.getByRole('button', { name: /邀請好友/ }));
    expect(shareReferralInvite).toHaveBeenCalledWith('8048877', showToast);
    // 開了分享面板或 LINE 不等於送出了：元件自己不給任何成功提示。
    expect(showToast).not.toHaveBeenCalled();
  });
});
