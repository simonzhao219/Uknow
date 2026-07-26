// @vitest-environment jsdom
//
// 「我的 QR」面板的分頁契約：
//   - 已加入推薦計畫：兩個分頁，「邀請好友」在左且預設選中（分享是主動、頻繁的
//     動作；核身碼多半是店家開口時才臨時要用）。
//   - 未加入推薦計畫：只有會員核身碼，連分頁列都不出現（單一分頁的頁籤沒有意義）。
//     加入入口在推薦碼欄位的 CTA，不在面板裡。
// 分頁偏好的「記住上次選擇」與「未加入時強制核身碼」的決策邏輯是純函式，
// 已由 myQrTabPreference.test.ts 覆蓋；這裡只驗面板實際渲染出來的形狀。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MyQrDialog } from './MyQrDialog';

// 兩個分頁內容各有自己的關注點（取碼輪替、canvas 繪圖），這裡替身掉，
// 只驗面板挑了哪些分頁、預設停在哪。
vi.mock('./MemberVerifyQrTab', () => ({
  MemberVerifyQrTab: () => <div data-testid="verify-content" />,
}));
vi.mock('./InviteFriendPanelContent', () => ({
  InviteFriendPanelContent: () => <div data-testid="invite-content" />,
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const baseProps = {
  open: true,
  onOpenChange: () => {},
  referralCode: 'abc123',
  memberName: '小明',
  accountStatus: 'active' as const,
};

describe('MyQrDialog', () => {
  it('已加入推薦計畫時兩個分頁都在，邀請好友在左且預設選中', () => {
    render(<MyQrDialog {...baseProps} joined />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].textContent).toContain('邀請好友');
    expect(tabs[1].textContent).toContain('會員核身碼');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('invite-content')).toBeTruthy();
  });

  it('未加入推薦計畫時只有核身碼，不出現分頁列與邀請分頁', () => {
    render(<MyQrDialog {...baseProps} joined={false} referralCode={null} />);

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByTestId('invite-tab')).toBeNull();
    expect(screen.queryByTestId('invite-content')).toBeNull();
    expect(screen.getByTestId('verify-content')).toBeTruthy();
  });

  it('記住的偏好是核身碼時，開啟就停在核身碼分頁', () => {
    localStorage.setItem('uknow:pref:my-qr-tab', 'verify');
    render(<MyQrDialog {...baseProps} joined />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('verify-content')).toBeTruthy();
  });
});
