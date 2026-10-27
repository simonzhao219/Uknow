// @vitest-environment jsdom
//
// 編輯刊登存檔後的 Storage 清理：先存後刪（存檔失敗不得動 Storage），
// 清理拿「載入時的 photos」與「存檔的 photos」做差；清理本身 best-effort，不影響成功訊息。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createContext } from 'react';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
HTMLElement.prototype.hasPointerCapture ??= () => false;
HTMLElement.prototype.releasePointerCapture ??= () => {};
HTMLElement.prototype.scrollIntoView ??= () => {};

const PHOTOS = [
  'https://p.supabase.co/storage/v1/object/public/make-5c6718b9-listings-photos/u1/1_a.jpg',
  'https://p.supabase.co/storage/v1/object/public/make-5c6718b9-listings-photos/u1/2_b.jpg',
  'https://p.supabase.co/storage/v1/object/public/make-5c6718b9-listings-photos/u1/3_c.jpg',
];

const h = vi.hoisted(() => ({
  updateResult: { error: null as null | { message: string } },
  updatePayloads: [] as Record<string, unknown>[],
  calls: [] as string[],
  cleanup: vi.fn(),
  showToast: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock('../contexts/DataCacheContext', () => ({
  useDataCache: () => ({ invalidate: h.invalidate }),
}));
vi.mock('../App', () => ({ UserContext: createContext<any>({ user: { id: 'u1' } }) }));
vi.mock('../hooks/useCustomCategories', () => ({
  useCustomCategories: () => ({ customCategories: [], loading: false, error: null }),
}));
vi.mock('./notifications/NotificationContext', () => ({
  useNotification: () => ({ showToast: h.showToast, showInfo: vi.fn() }),
}));
vi.mock('../utils/listingPhotosApi', () => ({
  cleanupRemovedPhotos: (...args: unknown[]) => {
    h.calls.push('cleanup');
    return h.cleanup(...args);
  },
  uploadListingPhoto: vi.fn(),
}));
vi.mock('../utils/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: {
                id: 'l1',
                user_id: 'u1',
                name: '測試刊登',
                category: '美髮',
                gender: '女',
                city: '台北市',
                districts: ['全區'],
                description: 'x',
                photos: PHOTOS,
                contacts: { instagram: 'ig', line: '', facebook: '' },
              },
              error: null,
            }),
        }),
      }),
      update: (payload: Record<string, unknown>) => {
        h.updatePayloads.push(payload);
        return {
          eq: () => ({
            eq: () => {
              h.calls.push('update');
              return Promise.resolve(h.updateResult);
            },
          }),
        };
      },
    }),
  }),
}));

const { EditServiceProvider } = await import('./EditServiceProvider');

function renderEdit() {
  return render(
    <MemoryRouter initialEntries={['/service-providers/l1/edit']}>
      <Routes>
        <Route path="/service-providers/:id/edit" element={<EditServiceProvider />} />
        <Route path="/service-providers" element={<div>列表頁</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.updateResult = { error: null };
  h.calls = [];
  h.updatePayloads = [];
  h.cleanup.mockReset().mockResolvedValue(undefined);
  h.showToast.mockReset();
  h.invalidate.mockReset();
});
afterEach(cleanup);

async function submit() {
  const save = await screen.findByRole('button', { name: /儲存變更/ });
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
  // jsdom 會做原生必填驗證而靜默擋下 click 送出；直接送 submit 事件走元件自己的 validate()。
  fireEvent.submit(save.closest('form')!);
}

describe('EditServiceProvider 存檔後清理 Storage', () => {
  it('存檔成功後才清理，且以載入時與存檔時的 photos 做差', async () => {
    renderEdit();
    await submit();
    await waitFor(() => expect(h.cleanup).toHaveBeenCalledTimes(1));
    expect(h.cleanup).toHaveBeenCalledWith(PHOTOS, PHOTOS);
    expect(h.calls).toEqual(['update', 'cleanup']);
  });

  it('存檔失敗時不呼叫清理（先存後刪，舊刊登不壞）', async () => {
    h.updateResult = { error: { message: '更新失敗' } };
    renderEdit();
    await submit();
    await waitFor(() => expect(h.showToast).toHaveBeenCalledWith('更新失敗', 'error'));
    expect(h.cleanup).not.toHaveBeenCalled();
  });

  it('清理本身失敗不影響存檔成功訊息', async () => {
    h.cleanup.mockRejectedValue(new Error('boom'));
    renderEdit();
    await submit();
    await waitFor(() => expect(h.showToast).toHaveBeenCalledWith('服務者資訊已更新！', 'success'));
  });
});

describe('EditServiceProvider 照片區', () => {
  it('顯示共用的照片列表，既有照片只有移除；標籤說明三張且第一張為封面', async () => {
    renderEdit();
    const list = await screen.findByRole('list', { name: '已選擇的照片' });
    expect(list.querySelectorAll('li')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /調整第/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /移除第/ })).toHaveLength(3);
    expect(screen.getByText(/第一張為封面/)).toBeTruthy();
  });

  it('存檔送出的 photos 是目前照片列表的 URL（依序）', async () => {
    renderEdit();
    await submit();
    await waitFor(() => expect(h.updatePayloads).toHaveLength(1));
    expect(h.updatePayloads[0].photos).toEqual(PHOTOS);
  });

  it('移除一張後不足三張，儲存鈕停用、不送出', async () => {
    renderEdit();
    await screen.findByRole('list', { name: '已選擇的照片' });
    fireEvent.click(screen.getByRole('button', { name: '移除第 2 張' }));
    const save = await screen.findByRole('button', { name: /儲存變更/ });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(true));
    expect(h.updatePayloads).toHaveLength(0);
  });
});
