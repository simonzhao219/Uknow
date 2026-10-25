// @vitest-environment jsdom
//
// 推薦管理頁的推薦入口接線：標題列「我的 QR」三態（載入中、錯誤、有資料）都在，
// 推薦碼列是「推薦碼＋複製」＋「邀請好友／加入推薦計畫」，加入成功後重抓推薦網絡。
// 三顆入口有各自的測試（閘門、導向、分享、複製）；這裡只驗放在哪、接了什麼。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const { state, treeProps } = vi.hoisted(() => ({
  state: {
    referral: {} as Record<string, unknown>,
  },
  treeProps: { current: {} as Record<string, unknown> },
}));

vi.mock('../hooks/useReferralData', () => ({ useReferralData: () => state.referral }));
vi.mock('../hooks/useBackNavigation', () => ({ useBackNavigation: () => vi.fn() }));
vi.mock('../hooks/usePageRestoration', () => ({ usePageRestoration: () => {} }));
vi.mock('./referral/ReferralStats', () => ({ ReferralStats: () => null }));
vi.mock('./referral/ReferralTreeView', () => ({
  ReferralTreeView: (props: Record<string, unknown>) => {
    treeProps.current = props;
    return null;
  },
}));
vi.mock('./referral/MyQrButton', () => ({
  MyQrButton: () => <span data-testid="my-qr-button-entry" />,
}));
vi.mock('./referral/ReferralCodeWithCopy', () => ({
  ReferralCodeWithCopy: () => <span data-testid="referral-code-entry" />,
}));
vi.mock('./referral/InviteFriendButton', () => ({
  InviteFriendButton: ({ onJoined }: { onJoined?: () => void }) => (
    <button type="button" data-testid="invite-friend-entry" onClick={onJoined}>
      加入推薦計畫
    </button>
  ),
}));

import { ReferralManagement } from './ReferralManagement';

function setLoaded() {
  state.referral = {
    overview: { summary: { firstGenCount: 1, secondGenCount: 0, thirdGenCount: 0 } },
    loading: false,
    isValidating: false,
    error: null,
    refetch: vi.fn(),
    sort: 'recent',
    setSort: vi.fn(),
    loadChildren: vi.fn(),
    searchNetwork: vi.fn(),
    loadAttention: vi.fn(),
  };
}

/** 標題列：h1 所在那一列（返回鍵、標題、我的 QR）。 */
const titleRow = () =>
  screen.getByRole('heading', { name: '推薦管理' }).closest('div')?.parentElement as HTMLElement;

beforeEach(setLoaded);
afterEach(cleanup);

describe('ReferralManagement 推薦入口', () => {
  it('有資料時標題列有我的 QR，推薦碼列是推薦碼＋複製與邀請鈕', () => {
    render(<ReferralManagement />);
    expect(within(titleRow()).getByTestId('my-qr-button-entry')).toBeTruthy();
    const code = screen.getByTestId('referral-code-entry');
    const invite = screen.getByTestId('invite-friend-entry');
    expect(code.parentElement).toBe(invite.parentElement);
  });

  it('載入中與讀取失敗時標題列照樣有我的 QR（出示驗證碼不必等推薦網絡）', () => {
    state.referral = { ...state.referral, overview: null, loading: true };
    render(<ReferralManagement />);
    expect(within(titleRow()).getByTestId('my-qr-button-entry')).toBeTruthy();
    cleanup();

    state.referral = { ...state.referral, loading: false, error: '網路錯誤' };
    render(<ReferralManagement />);
    expect(within(titleRow()).getByTestId('my-qr-button-entry')).toBeTruthy();
  });

  it('加入推薦計畫成功後重抓推薦網絡', () => {
    render(<ReferralManagement />);
    fireEvent.click(screen.getByTestId('invite-friend-entry'));
    expect(state.referral.refetch).toHaveBeenCalledTimes(1);
  });
});

describe('ReferralManagement 一代即將到期的完整清單', () => {
  it('把 loadAttention 交給推薦樹（「全部 N 位 ›」用它分頁取）', () => {
    render(<ReferralManagement />);
    expect(treeProps.current.loadAttention).toBe(state.referral.loadAttention);
  });
});

// 整頁主內容讀取失敗＝LoadErrorCallout（黃框＋重新載入，ui-ux-guidelines §12.11）；
// 重試只重發請求，重試落地後焦點不能掉在 body（§9）。
describe('ReferralManagement 讀取失敗', () => {
  const failed = () => {
    state.referral = { ...state.referral, overview: null, loading: false, error: '網路錯誤' };
  };

  it('整頁讀取失敗顯示黃框、錯誤原因與重新載入，點了只重發推薦請求', () => {
    failed();
    render(<ReferralManagement />);

    expect(screen.getByText('暫時無法取得推薦資料')).toBeTruthy();
    expect(screen.getByText('網路錯誤')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重新載入' }));
    expect(state.referral.refetch).toHaveBeenCalledTimes(1);
  });

  it('重試成功後焦點落到頁面標題', () => {
    failed();
    const view = render(<ReferralManagement />);
    const retry = screen.getByRole('button', { name: '重新載入' });
    act(() => retry.focus());
    fireEvent.click(retry);

    state.referral = { ...state.referral, loading: true, error: null };
    view.rerender(<ReferralManagement />);
    setLoaded();
    view.rerender(<ReferralManagement />);

    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '推薦管理' }));
  });

  it('重試後仍失敗，焦點回到錯誤框', () => {
    failed();
    const view = render(<ReferralManagement />);
    const retry = screen.getByRole('button', { name: '重新載入' });
    act(() => retry.focus());
    fireEvent.click(retry);

    state.referral = { ...state.referral, loading: true, error: null };
    view.rerender(<ReferralManagement />);
    failed();
    view.rerender(<ReferralManagement />);

    const callout = document.querySelector('[data-slot="status-callout"]');
    expect(document.activeElement).toBe(callout?.parentElement);
  });
});
