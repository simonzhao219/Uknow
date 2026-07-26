// @vitest-environment jsdom
//
// 「推薦碼／我的 QR」單一入口的行為契約。這支測試同時保護會員中心與推薦管理
// 兩頁——兩頁都只渲染 <MyQrEntry />，沒有第二份 JSX 可以走偏。
//
// 它守的是本次修的 bug：推薦管理頁曾經在「尚未加入推薦計畫」時就把推薦碼印出來
// （會員中心有 gate、推薦管理沒有，因為當初的共用元件在一側被換掉了）。
//
// MyQrDialog / JoinReferralProgramDialog 都替身掉：它們各有自己的關注點
// （Radix portal、簽名板、API 呼叫），這裡只驗 MyQrEntry 自己的狀態與接線。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// vi.hoisted 的內容會被提到所有 import 之前執行，所以 React 要在區塊內自己
// import——用檔案頂端那個 binding 會踩到 TDZ（同 BottomNav.test.tsx）。
const { UserCtx } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  return {
    // MyQrEntry 從 '../../App' 取 UserContext；在這裡替身掉，測試才不用把
    // 整個 App 模組（含所有路由與 provider）拉進來。
    UserCtx: createContext<any>({ user: null, refreshUser: async () => null }),
  };
});

vi.mock('../../App', () => ({ UserContext: UserCtx }));

// 替身只需暴露「開著沒」，其餘內容不是本單元的責任。
// （面板內原本還有一個「加入推薦計畫」引導，現已移除——未加入時面板只剩會員
// 核身碼，加入入口統一在推薦碼欄位的 CTA，見 MyQrDialog 的分頁規則。）
vi.mock('./MyQrDialog', () => ({
  MyQrDialog: ({ open, accountStatus }: any) =>
    open ? <div data-testid="my-qr-dialog" data-account-status={accountStatus} /> : null,
}));
vi.mock('./JoinReferralProgramDialog', () => ({
  JoinReferralProgramDialog: ({ open, onSuccess }: any) =>
    open ? (
      <button type="button" data-testid="join-dialog-submit" onClick={() => onSuccess('abc123456')}>
        送出加入
      </button>
    ) : null,
}));

import { MyQrEntry } from './MyQrEntry';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderEntry(user: any, extra: { refreshUser?: any; onJoined?: () => void } = {}) {
  const refreshUser = extra.refreshUser ?? vi.fn().mockResolvedValue(user);
  render(
    <UserCtx.Provider value={{ user, refreshUser }}>
      <MyQrEntry onJoined={extra.onJoined} />
    </UserCtx.Provider>,
  );
  return { refreshUser };
}

describe('MyQrEntry', () => {
  it('未加入推薦計畫時不顯示推薦碼，改顯示加入 CTA', () => {
    // referralCode 刻意給值：碼在付款成功時就已產生，閘門是 referralProgramJoined。
    renderEntry({ name: '王小明', referralProgramJoined: false, referralCode: 'zld310438' });

    expect(screen.queryByText('zld310438')).toBeNull();
    expect(screen.queryByTestId('my-referral-code')).toBeNull();
    expect(screen.getByTestId('join-referral-button')).toBeTruthy();
  });

  it('已加入且有推薦碼時顯示碼，不顯示加入 CTA', () => {
    renderEntry({ name: '王小明', referralProgramJoined: true, referralCode: 'zld310438' });

    expect(screen.getByTestId('my-referral-code').textContent).toBe('zld310438');
    expect(screen.queryByTestId('join-referral-button')).toBeNull();
  });

  it('已加入但推薦碼尚未產生時退回加入 CTA，不顯示假碼', () => {
    renderEntry({ name: '王小明', referralProgramJoined: true, referralCode: null });

    expect(screen.queryByTestId('my-referral-code')).toBeNull();
    expect(screen.getByTestId('join-referral-button')).toBeTruthy();
  });

  it('未加入與已加入都看得到「我的 QR」入口', () => {
    renderEntry({ referralProgramJoined: false, referralCode: null });
    expect(screen.getByTestId('my-qr-button')).toBeTruthy();
    cleanup();

    renderEntry({ referralProgramJoined: true, referralCode: 'zld310438' });
    expect(screen.getByTestId('my-qr-button')).toBeTruthy();
  });

  it('點「我的 QR」開啟面板', () => {
    renderEntry({ referralProgramJoined: true, referralCode: 'zld310438' });

    expect(screen.queryByTestId('my-qr-dialog')).toBeNull();
    fireEvent.click(screen.getByTestId('my-qr-button'));
    expect(screen.getByTestId('my-qr-dialog')).toBeTruthy();
  });

  it('會籍狀態取自 user.accountStatus，不另外掛 useSubscription', () => {
    // 掛第二個 useSubscription 會讓 dedupe 餓死會員中心那一份（見該 hook 檔頭）。
    renderEntry({
      referralProgramJoined: true,
      referralCode: 'zld310438',
      accountStatus: 'active',
    });

    fireEvent.click(screen.getByTestId('my-qr-button'));
    expect(screen.getByTestId('my-qr-dialog').getAttribute('data-account-status')).toBe('active');
  });

  it('由推薦碼欄位的 CTA 開加入流程時同時關掉面板', () => {
    renderEntry({ referralProgramJoined: false, referralCode: null });

    fireEvent.click(screen.getByTestId('join-referral-button'));

    // 兩者是不同層的遮罩（Radix portal vs 手刻 fixed），疊在一起會吃掉點擊，
    // 使用者按不到簽名與同意條款——所以開加入流程前一律先關掉面板。
    expect(screen.queryByTestId('my-qr-dialog')).toBeNull();
    expect(screen.getByTestId('join-dialog-submit')).toBeTruthy();
  });

  it('加入成功後重抓會員資料並通知呼叫端', async () => {
    const onJoined = vi.fn();
    const refreshUser = vi.fn().mockResolvedValue({ referralProgramJoined: true });
    renderEntry({ referralProgramJoined: false, referralCode: null }, { refreshUser, onJoined });

    fireEvent.click(screen.getByTestId('join-referral-button'));
    fireEvent.click(screen.getByTestId('join-dialog-submit'));

    await vi.waitFor(() => expect(refreshUser).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(onJoined).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('join-dialog-submit')).toBeNull();
  });
});
