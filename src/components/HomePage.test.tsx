// @vitest-environment jsdom
//
// 首頁的載入態、讀取失敗與「重新載入」的焦點落點。列表、搜尋、篩選與排序的行為由
// e2e（home_listings.feature）與 utils 的純函式測試守；這裡只釘 e2e 量不到的兩件事：
// 按下重新載入後焦點去哪（ui-ux-guidelines §9 焦點後備落點），以及載入中與讀取失敗時
// 面板主鈕不寫「查看 0 位」。
import { createContext } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PublicListingRow } from '../types/listing';

type ListResult = {
  data: PublicListingRow[] | null;
  error: { code: string; message: string } | null;
};

const { order } = vi.hoisted(() => ({ order: vi.fn<() => Promise<ListResult>>() }));

vi.mock('../App', () => ({
  UserContext: createContext({ isLoggedIn: false }),
}));
vi.mock('../hooks/useCustomCategories', () => ({
  useCustomCategories: () => ({ customCategories: [], loading: false }),
}));
vi.mock('../utils/supabase/client', () => ({
  createClient: () => ({ from: () => ({ select: () => ({ order }) }) }),
}));

import { HomePage } from './HomePage';

const listing: PublicListingRow = {
  id: '11111111-1111-1111-1111-111111111111',
  user_id: 'u1',
  name: 'Alice 美髮師',
  category: '美髮',
  city: '台北市',
  districts: ['全區'],
  gender: '女',
  photos: ['https://example.com/1.jpg'],
  contacts: { line: 'alice' },
  description: '剪髮染髮',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

function deferred() {
  let resolve!: (r: ListResult) => void;
  const promise = new Promise<ListResult>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

const failure: ListResult = { data: null, error: { code: '500', message: 'boom' } };

beforeEach(() => {
  order.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('HomePage', () => {
  it('讀取失敗時不寫「找到 0 位服務者」', async () => {
    order.mockResolvedValueOnce(failure);
    renderHome();

    expect(await screen.findByRole('button', { name: '重新載入' })).toBeTruthy();
    expect(screen.queryByText(/找到 0 位服務者/)).toBeNull();
  });

  it('首次載入不搶焦點', async () => {
    order.mockResolvedValueOnce({ data: [listing], error: null });
    renderHome();

    await screen.findByText(/找到 1 位服務者/);
    expect(document.activeElement).toBe(document.body);
  });

  it('按重新載入後焦點交給骨架，再次失敗時落在錯誤框', async () => {
    const retry = deferred();
    order.mockResolvedValueOnce(failure).mockReturnValueOnce(retry.promise);
    renderHome();

    const button = await screen.findByRole('button', { name: '重新載入' });
    button.focus();
    fireEvent.click(button);
    expect(document.activeElement).toBe(screen.getByRole('status', { name: '載入服務者資料中' }));

    await act(async () => retry.resolve(failure));
    const callout = screen.getByText('載入失敗');
    expect(document.activeElement?.contains(callout)).toBe(true);
  });

  it('按重新載入成功後焦點落在頁面標題', async () => {
    order.mockResolvedValueOnce(failure).mockResolvedValueOnce({ data: [listing], error: null });
    renderHome();

    const button = await screen.findByRole('button', { name: '重新載入' });
    button.focus();
    fireEvent.click(button);

    await screen.findByText(/找到 1 位服務者/);
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { level: 1, name: '找到你需要的專業服務' }),
    );
  });

  it('讀取失敗時篩選面板主鈕寫「查看結果」，不寫「查看 0 位」', async () => {
    order.mockResolvedValueOnce(failure);
    renderHome();
    await screen.findByRole('button', { name: '重新載入' });

    fireEvent.click(screen.getByRole('button', { name: '展開搜尋與篩選' }));
    fireEvent.click(screen.getByRole('button', { name: '篩選' }));

    expect(await screen.findByRole('button', { name: '查看結果' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /查看 0 位服務者/ })).toBeNull();
  });
});
