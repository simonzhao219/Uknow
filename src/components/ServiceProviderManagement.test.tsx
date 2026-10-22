// @vitest-environment jsdom
//
// 刊登管理頁（S7a）的資訊層次：主狀態是「刊登狀態」——會籍有效＝「上架中」＋會籍至日期；
// 會籍失效＝「已隱藏」（規格書 §11 只有這兩種）。失效會員平常進不了本頁（路由守衛導去結帳），
// 失效分支是頁面開著時剛好到期的邊界防線。訂閱狀態讀取失敗是「不知道」，不畫徽章。
// 查看／編輯／刪除是圖示＋文字，刪除不緊鄰編輯（手機誤觸）；整頁讀取失敗＝LoadErrorCallout。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { UserCtx, state } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  return {
    UserCtx: createContext<any>(null),
    state: { listing: {} as any, subscription: {} as any },
  };
});

vi.mock('../App', () => ({ UserContext: UserCtx }));
vi.mock('../hooks/useBackNavigation', () => ({ useBackNavigation: () => vi.fn() }));
vi.mock('../hooks/useUserListing', () => ({ useUserListing: () => state.listing }));
vi.mock('../hooks/useSubscription', () => ({ useSubscription: () => state.subscription }));
vi.mock('./notifications/NotificationContext', () => ({
  useNotification: () => ({ showToast: vi.fn(), showError: vi.fn() }),
}));
vi.mock('../utils/supabase/client', () => ({ createClient: () => ({}) }));

import { ServiceProviderManagement } from './ServiceProviderManagement';

const LISTING = {
  id: 'l1',
  name: '專業美髮師 Amy',
  category: '美髮',
  city: '台北市',
  districts: ['大安區'],
  description: '十年剪染經驗',
  photos: ['https://example.com/a.jpg'],
};

function setLoaded() {
  state.listing = {
    listing: LISTING,
    loading: false,
    error: null,
    refetch: vi.fn(),
  };
  state.subscription = {
    subscriptionData: {
      hasSubscription: true,
      status: 'active',
      activeUntil: '2027-01-01T04:00:00.000Z',
    },
    isLoading: false,
  };
}

function tree() {
  return (
    <UserCtx.Provider value={{ user: { id: 'u1' } }}>
      <MemoryRouter>
        <ServiceProviderManagement />
      </MemoryRouter>
    </UserCtx.Provider>
  );
}

beforeEach(setLoaded);
afterEach(cleanup);

describe('ServiceProviderManagement 刊登狀態', () => {
  it('會籍有效：上架中徽章與會籍至日期，沒有已隱藏', () => {
    render(tree());
    const badge = screen.getByText('上架中');
    expect(badge.classList.contains('bg-success-subtle')).toBe(true);
    expect(screen.getByText('會籍至 2027/01/01')).toBeTruthy();
    expect(screen.queryByText('已隱藏')).toBeNull();
    expect(screen.queryByRole('link', { name: '續訂' })).toBeNull();
  });

  it('頁面開著時會籍剛好失效：已隱藏徽章、黃框說明與續訂，不再寫上架中', () => {
    state.subscription = {
      subscriptionData: {
        hasSubscription: false,
        status: 'expired',
        activeUntil: '2026-09-01T04:00:00.000Z',
      },
      isLoading: false,
    };
    render(tree());
    const badge = screen.getByText('已隱藏');
    expect(badge.classList.contains('bg-warning-subtle')).toBe(true);
    expect(screen.queryByText('上架中')).toBeNull();
    expect(screen.getByText('刊登已隱藏')).toBeTruthy();
    const renew = screen.getByRole('link', { name: '續訂' });
    expect(renew.getAttribute('href')).toBe('/payment/checkout');
    expect(renew.classList.contains('bg-warning')).toBe(true);
  });

  it('訂閱狀態讀取失敗時是「不知道」：刊登卡照顯示，不畫上架中也不畫已隱藏', () => {
    state.subscription = { subscriptionData: null, isLoading: false, lastFetchFailed: true };
    render(tree());
    expect(screen.getByText('專業美髮師 Amy')).toBeTruthy();
    expect(screen.queryByText('上架中')).toBeNull();
    expect(screen.queryByText('已隱藏')).toBeNull();
    expect(screen.queryByText('刊登已隱藏')).toBeNull();
  });

  it('訂閱狀態還在載入時不先畫徽章', () => {
    state.subscription = { subscriptionData: null, isLoading: true };
    render(tree());
    expect(screen.queryByText('上架中')).toBeNull();
  });

  it('還沒有刊登：空態與刊登新服務（次要鈕），沒有狀態徽章', () => {
    state.listing = { listing: null, loading: false, error: null, refetch: vi.fn() };
    render(tree());
    expect(screen.getByText('尚未刊登服務者')).toBeTruthy();
    expect(screen.getByRole('link', { name: '刊登新服務' })).toBeTruthy();
    expect(screen.queryByText('上架中')).toBeNull();
  });
});

describe('ServiceProviderManagement 動作列', () => {
  it('查看、編輯、刪除是圖示加文字，不只剩圖示', () => {
    render(tree());
    const view = screen.getByRole('link', { name: '查看刊登' });
    const edit = screen.getByRole('link', { name: '編輯刊登' });
    const del = screen.getByRole('button', { name: '刪除刊登' });
    expect(view.textContent).toContain('查看');
    expect(edit.textContent).toContain('編輯');
    expect(del.textContent).toContain('刪除');
    expect(view.querySelector('svg')).toBeTruthy();
    expect(del.querySelector('svg')).toBeTruthy();
    expect(view.getAttribute('href')).toBe('/service-providers/l1');
    expect(edit.getAttribute('href')).toBe('/service-providers/edit/l1');
  });

  it('刪除是紅框字，不緊鄰編輯（手機誤觸）：分在動作列的另一端', () => {
    render(tree());
    const edit = screen.getByRole('link', { name: '編輯刊登' });
    const del = screen.getByRole('button', { name: '刪除刊登' });
    expect(del.classList.contains('text-destructive-subtle-foreground')).toBe(true);
    expect(edit.parentElement?.contains(del)).toBe(false);
    const row = del.closest('[class*="justify-between"]') as HTMLElement;
    expect(row).toBeTruthy();
    expect(row.contains(edit)).toBe(true);
  });

  it('頁面沒有實心鈕：查看、編輯是次要外框', () => {
    render(tree());
    for (const name of ['查看刊登', '編輯刊登']) {
      const el = screen.getByRole('link', { name });
      expect(el.classList.contains('bg-primary')).toBe(false);
      expect(el.classList.contains('bg-brand')).toBe(false);
    }
  });

  it('點刪除先跳確認框，確認鈕才是紅實心', () => {
    render(tree());
    fireEvent.click(screen.getByRole('button', { name: '刪除刊登' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('確認刪除刊登？')).toBeTruthy();
    expect(
      within(dialog).getByRole('button', { name: '確認刪除' }).classList.contains('bg-destructive'),
    ).toBe(true);
  });
});

describe('ServiceProviderManagement 讀取失敗', () => {
  const failed = () => {
    state.listing = { ...state.listing, listing: null, loading: false, error: '連線逾時' };
  };

  it('顯示黃框、原因與重新載入，沒有「刊登新服務」，點了只重發請求', () => {
    failed();
    render(tree());
    expect(screen.getByText('暫時無法取得刊登狀態')).toBeTruthy();
    expect(screen.getByText('連線逾時')).toBeTruthy();
    const callout = document.querySelector('[data-slot="status-callout"]');
    expect(callout?.classList.contains('bg-warning-subtle')).toBe(true);
    expect(screen.queryByRole('link', { name: '刊登新服務' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '重新載入' }));
    expect(state.listing.refetch).toHaveBeenCalledTimes(1);
  });

  it('重試成功後焦點落到頁面標題', () => {
    failed();
    const view = render(tree());
    const retry = screen.getByRole('button', { name: '重新載入' });
    act(() => retry.focus());
    fireEvent.click(retry);

    state.listing = { ...state.listing, loading: true, error: null };
    view.rerender(tree());
    setLoaded();
    view.rerender(tree());

    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '刊登管理' }));
  });

  it('載入中顯示載入說明', () => {
    state.listing = { listing: null, loading: true, error: null, refetch: vi.fn() };
    render(tree());
    expect(screen.getByText('載入中...')).toBeTruthy();
  });
});
