// @vitest-environment jsdom
//
// 照片選取列表與取景對話框的行為契約：各狀態該有的按鈕、入口邊界、焦點後備、
// 單一常駐 live region、取景確認／取消／Esc／返回鍵，以及裁切工具載入失敗＝重新載入且不可送出。
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhotoSlot, UseListingPhotosResult } from '../../hooks/useListingPhotos';

// 單純的 Cropper 替身：掛上時回報原圖尺寸與一個裁切結果，其餘互動由本檔以按鈕驗證。
vi.mock('react-easy-crop', async () => {
  const React = await import('react');
  return {
    default: (props: {
      onMediaLoaded?: (m: { naturalWidth: number; naturalHeight: number }) => void;
      onCropComplete?: (
        a: unknown,
        p: { x: number; y: number; width: number; height: number },
      ) => void;
    }) => {
      React.useEffect(() => {
        props.onMediaLoaded?.({ naturalWidth: 400, naturalHeight: 300 });
        props.onCropComplete?.({}, { x: 10, y: 20, width: 200, height: 200 });
      }, [props]);
      return React.createElement('div', { 'data-testid': 'cropper' });
    },
  };
});

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

import type { PhotoCropDialogProps } from './PhotoCropDialog';
import { PhotoPicker } from './PhotoPicker';

const slot = (over: Partial<PhotoSlot> & { id: string }): PhotoSlot => ({
  kind: 'new',
  state: 'done',
  url: `https://cdn.test/${over.id}.jpg`,
  ...over,
});

function makePhotos(
  slots: PhotoSlot[],
  over: Partial<UseListingPhotosResult> = {},
): UseListingPhotosResult {
  const first = slots.find((s) => s.state === 'awaiting_crop');
  return {
    slots,
    pendingCrop: first
      ? { slotId: first.id, file: { name: 'f.jpg' } as File, previewUrl: 'blob:preview' }
      : null,
    notice: null,
    addFiles: vi.fn(),
    confirmCrop: vi.fn(),
    cancelCrop: vi.fn(),
    retry: vi.fn(),
    remove: vi.fn(),
    adjust: vi.fn(),
    loadExisting: vi.fn(),
    photoUrls: slots.filter((s) => s.state === 'done').map((s) => s.url as string),
    isBusy: slots.some((s) => ['preparing', 'awaiting_crop', 'uploading'].includes(s.state)),
    canSubmit: false,
    announcement: '',
    ...over,
  };
}

afterEach(cleanup);

describe('PhotoPicker 入口與空態', () => {
  it('沒有照片：顯示空態提示，入口接受多張圖片並把選取的檔交給 addFiles', () => {
    const photos = makePhotos([]);
    render(<PhotoPicker photos={photos} maxCount={3} />);
    expect(screen.getByText(/尚未選擇照片/)).toBeTruthy();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('image/*');
    expect(input.multiple).toBe(true);
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(photos.addFiles).toHaveBeenCalledWith([file]);
  });

  it('已滿張數（含處理中與失敗格）：入口停用並用文字說明', () => {
    const photos = makePhotos([
      slot({ id: 'a' }),
      slot({ id: 'b', state: 'failed', message: 'x' }),
      slot({ id: 'c', state: 'unprocessable', message: 'y' }),
    ]);
    render(<PhotoPicker photos={photos} maxCount={3} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(screen.getByText(/已選滿 3 張/)).toBeTruthy();
  });

  it('有照片正在等取景或處理中時，入口停用（佇列處理中不可再選）', () => {
    const photos = makePhotos([slot({ id: 'a', state: 'preparing' })]);
    render(<PhotoPicker photos={photos} maxCount={3} />);
    expect((document.querySelector('input[type="file"]') as HTMLInputElement).disabled).toBe(true);
  });

  it('一次性提示（例如超量被略過）顯示出來', () => {
    render(
      <PhotoPicker
        photos={makePhotos([], { notice: '最多只能上傳 3 張照片，已略過多出的 1 張' })}
        maxCount={3}
      />,
    );
    expect(screen.getByText(/已略過多出的 1 張/)).toBeTruthy();
  });
});

describe('PhotoPicker 各狀態的按鈕與文字', () => {
  const buttonsOf = (li: HTMLElement) =>
    within(li)
      .queryAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent);

  it.each([
    ['failed', { state: 'failed', message: '網絡請求失敗' }, ['重試第 1 張', '移除第 1 張']],
    ['unprocessable', { state: 'unprocessable', message: '無法處理' }, ['移除第 1 張']],
    ['done（本次新增）', { state: 'done' }, ['調整第 1 張範圍', '移除第 1 張']],
    ['done（既有舊圖）', { state: 'done', kind: 'existing' }, ['移除第 1 張']],
    ['awaiting_crop', { state: 'awaiting_crop', previewUrl: 'blob:p' }, ['移除第 1 張']],
    ['preparing', { state: 'preparing', previewUrl: 'blob:p' }, []],
    ['uploading', { state: 'uploading', previewUrl: 'blob:p' }, []],
  ] as const)('%s', (_name, over, expected) => {
    const photos = makePhotos([slot({ id: 'a', ...(over as Partial<PhotoSlot>) })]);
    render(<PhotoPicker photos={photos} maxCount={3} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(buttonsOf(items[0])).toEqual(expected);
  });

  it('失敗與無法處理顯示原因文字；縮小過的照片顯示「已自動縮小」', () => {
    const photos = makePhotos([
      slot({ id: 'a', state: 'failed', message: '檔案不得超過 5MB' }),
      slot({ id: 'b', state: 'unprocessable', message: '這張照片的格式無法讀取' }),
      slot({ id: 'c', downscaled: true }),
    ]);
    render(<PhotoPicker photos={photos} maxCount={3} />);
    expect(screen.getByText(/檔案不得超過 5MB/)).toBeTruthy();
    expect(screen.getByText(/這張照片的格式無法讀取/)).toBeTruthy();
    expect(screen.getByText('已自動縮小')).toBeTruthy();
  });

  it('處理中與上傳中用文字標示，不只靠顏色', () => {
    const photos = makePhotos([
      slot({ id: 'a', state: 'preparing', previewUrl: 'blob:a' }),
      slot({ id: 'b', state: 'uploading', previewUrl: 'blob:b' }),
    ]);
    render(<PhotoPicker photos={photos} maxCount={3} />);
    expect(screen.getByText(/處理中/)).toBeTruthy();
    expect(screen.getByText(/上傳中/)).toBeTruthy();
  });

  it('按鈕動作交給對應的 hook 函式', () => {
    const photos = makePhotos([
      slot({ id: 'a', state: 'failed', message: 'x' }),
      slot({ id: 'b' }),
    ]);
    render(<PhotoPicker photos={photos} maxCount={3} />);
    fireEvent.click(screen.getByRole('button', { name: '重試第 1 張' }));
    expect(photos.retry).toHaveBeenCalledWith('a');
    fireEvent.click(screen.getByRole('button', { name: '調整第 2 張範圍' }));
    expect(photos.adjust).toHaveBeenCalledWith('b');
    fireEvent.click(screen.getByRole('button', { name: '移除第 2 張' }));
    expect(photos.remove).toHaveBeenCalledWith('b');
  });
});

describe('PhotoPicker 播報與焦點後備', () => {
  it('只有一個常駐 live region，內容是 hook 的播報文字', () => {
    render(
      <PhotoPicker photos={makePhotos([], { announcement: '第 1 張照片上傳完成' })} maxCount={3} />,
    );
    const regions = document.querySelectorAll('[aria-live]');
    expect(regions).toHaveLength(1);
    expect(regions[0].textContent).toBe('第 1 張照片上傳完成');
  });

  it('移除最後一張後焦點落到前一格的按鈕；移除唯一一張則落到列表容器', () => {
    const three = [slot({ id: 'a' }), slot({ id: 'b' }), slot({ id: 'c' })];
    const view = render(<PhotoPicker photos={makePhotos(three)} maxCount={3} />);
    fireEvent.click(screen.getByRole('button', { name: '移除第 3 張' }));
    view.rerender(<PhotoPicker photos={makePhotos(three.slice(0, 2))} maxCount={3} />);
    const items = screen.getAllByRole('listitem');
    expect(items[1].contains(document.activeElement)).toBe(true);
    view.unmount();

    const one = render(<PhotoPicker photos={makePhotos([slot({ id: 'z' })])} maxCount={3} />);
    const buttons = screen.getAllByRole('button', { name: '移除第 1 張' });
    fireEvent.click(buttons[buttons.length - 1]);
    one.rerender(<PhotoPicker photos={makePhotos([])} maxCount={3} />);
    const list = document.querySelector('[data-photo-list]') as HTMLElement;
    expect(list.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(list);
  });

  it('移除中間一張後焦點落到下一格', () => {
    const three = [slot({ id: 'a' }), slot({ id: 'b' }), slot({ id: 'c' })];
    const view = render(<PhotoPicker photos={makePhotos(three)} maxCount={3} />);
    fireEvent.click(screen.getByRole('button', { name: '移除第 2 張' }));
    view.rerender(<PhotoPicker photos={makePhotos([three[0], three[2]])} maxCount={3} />);
    expect(screen.getAllByRole('listitem')[1].contains(document.activeElement)).toBe(true);
  });
});

describe('PhotoPicker 取景對話框', () => {
  const awaiting = () =>
    makePhotos([slot({ id: 'a', state: 'awaiting_crop', previewUrl: 'blob:p' })]);

  it('輪到取景時開出對話框，標題指出第幾張；完成會把裁切框與原圖尺寸交給 confirmCrop', async () => {
    const photos = awaiting();
    render(<PhotoPicker photos={photos} maxCount={3} />);
    const dialog = await screen.findByRole('dialog', { name: /第 1 張/ });
    await waitFor(() => expect(within(dialog).getByTestId('cropper')).toBeTruthy());
    fireEvent.click(within(dialog).getByRole('button', { name: '完成' }));
    expect(photos.confirmCrop).toHaveBeenCalledWith(
      'a',
      { x: 10, y: 20, width: 200, height: 200 },
      { width: 400, height: 300 },
    );
  });

  it('連點完成只送出一次（防重入）', async () => {
    const photos = awaiting();
    render(<PhotoPicker photos={photos} maxCount={3} />);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => within(dialog).getByTestId('cropper'));
    const done = within(dialog).getByRole('button', { name: '完成' });
    fireEvent.click(done);
    fireEvent.click(done);
    expect(photos.confirmCrop).toHaveBeenCalledTimes(1);
  });

  it('取消與 Esc 都只取消當張', async () => {
    const photos = awaiting();
    render(<PhotoPicker photos={photos} maxCount={3} />);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(photos.cancelCrop).toHaveBeenCalledWith('a');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(photos.cancelCrop).toHaveBeenCalledTimes(2));
  });

  it('按返回鍵（popstate）關掉疊層而不離頁，等同取消當張', async () => {
    const photos = awaiting();
    render(<PhotoPicker photos={photos} maxCount={3} />);
    await screen.findByRole('dialog');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(photos.cancelCrop).toHaveBeenCalledWith('a');
  });

  it('提供縮放滑桿、重設，以及上下左右四顆微調按鈕', async () => {
    render(<PhotoPicker photos={awaiting()} maxCount={3} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('slider', { name: '縮放' })).toBeTruthy();
    for (const name of ['重設', '向上移動', '向下移動', '向左移動', '向右移動']) {
      expect(within(dialog).getByRole('button', { name })).toBeTruthy();
    }
  });
});

describe('PhotoPicker 裁切工具載入失敗', () => {
  let dialogModule: { default: ComponentType<PhotoCropDialogProps> };
  beforeEach(async () => {
    dialogModule = await import('./PhotoCropDialog');
  });

  const awaiting = () =>
    makePhotos([slot({ id: 'a', state: 'awaiting_crop', previewUrl: 'blob:p' })]);

  it('顯示重新載入裁切工具，並保留移除；不會偷偷改用自動置中裁', async () => {
    const photos = awaiting();
    render(
      <PhotoPicker
        photos={photos}
        maxCount={3}
        loadCropDialog={() => Promise.reject(new Error('chunk failed'))}
      />,
    );
    expect(await screen.findByText(/裁切工具載入失敗/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '重新載入裁切工具' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(photos.confirmCrop).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '移除第 1 張' })).toBeTruthy();
  });

  it('連續兩次重新載入失敗再成功：按下時 pending 且停用，成功後開出對話框', async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockResolvedValueOnce(dialogModule);
    render(<PhotoPicker photos={awaiting()} maxCount={3} loadCropDialog={loader} />);
    await screen.findByText(/裁切工具載入失敗/);

    fireEvent.click(screen.getByRole('button', { name: '重新載入裁切工具' }));
    const pending = await screen.findByRole('button', { name: /載入中/ });
    expect(pending.getAttribute('aria-disabled')).toBe('true');
    await screen.findByText(/裁切工具載入失敗/);

    fireEvent.click(screen.getByRole('button', { name: '重新載入裁切工具' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(loader).toHaveBeenCalledTimes(3);
  });
});
