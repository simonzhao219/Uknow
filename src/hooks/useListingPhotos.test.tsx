// @vitest-environment jsdom
//
// 刊登照片每張狀態機與選圖佇列的契約：一張失敗其餘保留、可重試；取消只影響當張、
// 佇列接續；超量忽略；既有舊圖不重裁只能移除；完成才算數（送出前須恰好 N 張且全 done）。
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ImageIO } from '../utils/imagePipeline';
import { useListingPhotos, type UseListingPhotosOptions } from './useListingPhotos';

const fileOf = (name = 'a.jpg', bytes = 1000) =>
  ({ name, size: bytes, type: 'image/jpeg' }) as unknown as File;
const CROP = { x: 0, y: 0, width: 100, height: 100 };
const NATURAL = { width: 400, height: 300 };

function setup(over: Partial<UseListingPhotosOptions> = {}, ioOver: Partial<ImageIO> = {}) {
  let uploadCount = 0;
  const uploaded: Blob[] = [];
  const revoked: string[] = [];
  const discarded: string[] = [];
  const io: ImageIO = {
    supported: () => true,
    decode: () => Promise.resolve({ width: 320, height: 240, handle: 'bitmap' }),
    render: () => Promise.resolve('canvas'),
    encode: () => Promise.resolve(new Blob([new Uint8Array(1000)])),
    ...ioOver,
  };
  const options: UseListingPhotosOptions = {
    maxCount: 3,
    io,
    upload: (blob) => {
      uploaded.push(blob);
      uploadCount += 1;
      return Promise.resolve(`https://cdn.test/u/${uploadCount}_p.jpg`);
    },
    createPreviewUrl: (f) => `blob:preview-${(f as File).name ?? 'blob'}`,
    revokePreviewUrl: (u) => revoked.push(u),
    onDiscardUploaded: (u) => discarded.push(u),
    ...over,
  };
  const hook = renderHook(() => useListingPhotos(options));
  return { ...hook, uploaded, revoked, discarded };
}

const add = async (h: ReturnType<typeof setup>, files: File[]) => {
  await act(async () => {
    h.result.current.addFiles(files);
  });
};
const confirm = async (h: ReturnType<typeof setup>) => {
  const id = h.result.current.pendingCrop!.slotId;
  await act(async () => {
    h.result.current.confirmCrop(id, CROP, NATURAL);
  });
};

describe('useListingPhotos 選圖與取景', () => {
  it('選一張 → 解碼完成後等待取景，輪到它的取景並標示忙碌', async () => {
    const h = setup();
    await add(h, [fileOf('1.jpg')]);
    expect(h.result.current.slots).toHaveLength(1);
    expect(h.result.current.slots[0].state).toBe('awaiting_crop');
    expect(h.result.current.pendingCrop?.slotId).toBe(h.result.current.slots[0].id);
    expect(h.result.current.isBusy).toBe(true);
    expect(h.result.current.photoUrls).toEqual([]);
  });

  it('確認取景 → 上傳 → done，URL 進 photoUrls，預覽網址被釋放', async () => {
    const h = setup();
    await add(h, [fileOf('1.jpg')]);
    await confirm(h);
    await waitFor(() => expect(h.result.current.slots[0].state).toBe('done'));
    expect(h.result.current.photoUrls).toEqual(['https://cdn.test/u/1_p.jpg']);
    expect(h.uploaded).toHaveLength(1);
    expect(h.revoked).toContain('blob:preview-1.jpg');
    expect(h.result.current.slots[0].previewUrl).toBeUndefined();
    expect(h.result.current.isBusy).toBe(false);
  });

  it('一次選三張 → 一次只輪到一張取景，確認後換下一張（佇列）', async () => {
    const h = setup();
    await add(h, [fileOf('1.jpg'), fileOf('2.jpg'), fileOf('3.jpg')]);
    const ids = h.result.current.slots.map((s) => s.id);
    expect(h.result.current.pendingCrop?.slotId).toBe(ids[0]);
    await confirm(h);
    await waitFor(() => expect(h.result.current.pendingCrop?.slotId).toBe(ids[1]));
    await confirm(h);
    await waitFor(() => expect(h.result.current.pendingCrop?.slotId).toBe(ids[2]));
  });

  it('取消取景 → 該張消失、不上傳，佇列接續下一張', async () => {
    const h = setup();
    await add(h, [fileOf('1.jpg'), fileOf('2.jpg')]);
    const [first, second] = h.result.current.slots.map((s) => s.id);
    act(() => h.result.current.cancelCrop(first));
    expect(h.result.current.slots.map((s) => s.id)).toEqual([second]);
    expect(h.result.current.pendingCrop?.slotId).toBe(second);
    expect(h.uploaded).toHaveLength(0);
    expect(h.revoked).toContain('blob:preview-1.jpg');
  });

  it('已有 2 張再選 3 張 → 只收 1 張，其餘忽略並提示', async () => {
    const h = setup({ initialUrls: ['https://cdn.test/u/a.jpg', 'https://cdn.test/u/b.jpg'] });
    await add(h, [fileOf('1.jpg'), fileOf('2.jpg'), fileOf('3.jpg')]);
    expect(h.result.current.slots).toHaveLength(3);
    expect(h.result.current.notice).toContain('最多');
  });
});

describe('useListingPhotos 失敗與重試', () => {
  it('一張上傳失敗 → failed 並顯示後端原句，其餘照常完成', async () => {
    let n = 0;
    const h = setup({
      upload: () => {
        n += 1;
        return n === 1 ? Promise.reject(new Error('檔案不得超過 5MB')) : Promise.resolve(`u${n}`);
      },
    });
    await add(h, [fileOf('1.jpg'), fileOf('2.jpg')]);
    await confirm(h);
    await waitFor(() => expect(h.result.current.slots[0].state).toBe('failed'));
    expect(h.result.current.slots[0].message).toBe('檔案不得超過 5MB');
    await confirm(h);
    await waitFor(() => expect(h.result.current.slots[1].state).toBe('done'));
    expect(h.result.current.slots[0].state).toBe('failed');
    expect(h.result.current.photoUrls).toEqual(['u2']);
  });

  it('重試 → 用同一份已處理好的 blob 重新上傳，成功後轉 done', async () => {
    let n = 0;
    const blobs: Blob[] = [];
    const h = setup({
      upload: (b) => {
        blobs.push(b);
        n += 1;
        return n === 1
          ? Promise.reject(new Error('網絡請求失敗'))
          : Promise.resolve('https://x/ok');
      },
    });
    await add(h, [fileOf('1.jpg')]);
    await confirm(h);
    await waitFor(() => expect(h.result.current.slots[0].state).toBe('failed'));
    const id = h.result.current.slots[0].id;
    await act(async () => {
      h.result.current.retry(id);
    });
    await waitFor(() => expect(h.result.current.slots[0].state).toBe('done'));
    expect(blobs).toHaveLength(2);
    expect(blobs[1]).toBe(blobs[0]);
  });

  it('失敗的那張被移除後不足張數，canSubmit 為 false，須補足', async () => {
    const h = setup({ upload: () => Promise.reject(new Error('x')) });
    await add(h, [fileOf('1.jpg')]);
    await confirm(h);
    await waitFor(() => expect(h.result.current.slots[0].state).toBe('failed'));
    act(() => h.result.current.remove(h.result.current.slots[0].id));
    expect(h.result.current.slots).toHaveLength(0);
    expect(h.result.current.canSubmit).toBe(false);
  });
});

describe('useListingPhotos 無法處理的檔案', () => {
  it('瀏覽器缺能力 → unprocessable，文案指向換瀏覽器而不是換一張', async () => {
    const h = setup({}, { supported: () => false });
    await add(h, [fileOf('1.jpg')]);
    const slot = h.result.current.slots[0];
    expect(slot.state).toBe('unprocessable');
    expect(slot.errorCode).toBe('unsupported');
    expect(slot.message).toContain('瀏覽器');
    expect(h.result.current.pendingCrop).toBeNull();
  });

  it('格式無法讀取 → 指示換一張或截圖後再試，不上傳', async () => {
    const h = setup({}, { decode: () => Promise.reject(new Error('bad')) });
    await add(h, [fileOf('1.jpg')]);
    const slot = h.result.current.slots[0];
    expect(slot.state).toBe('unprocessable');
    expect(slot.message).toContain('格式無法讀取');
    expect(slot.message).toContain('截圖');
    expect(h.uploaded).toHaveLength(0);
  });

  it('記憶體不足與原檔過大各有自己的文案', async () => {
    const oom = setup({}, { decode: () => Promise.reject(new RangeError('allocation failed')) });
    await add(oom, [fileOf('1.jpg')]);
    expect(oom.result.current.slots[0].errorCode).toBe('out_of_memory');
    expect(oom.result.current.slots[0].message).toContain('記憶體');

    const big = setup();
    await add(big, [fileOf('huge.jpg', 21 * 1024 * 1024)]);
    expect(big.result.current.slots[0].errorCode).toBe('source_too_large');
    expect(big.result.current.slots[0].message).toContain('檔案過大');
  });

  it('編碼失敗 → unprocessable，不退回原檔上傳', async () => {
    const h = setup({}, { encode: () => Promise.resolve(null) });
    await add(h, [fileOf('1.jpg')]);
    await confirm(h);
    await waitFor(() => expect(h.result.current.slots[0].state).toBe('unprocessable'));
    expect(h.result.current.slots[0].errorCode).toBe('unprocessable');
    expect(h.uploaded).toHaveLength(0);
  });
});

describe('useListingPhotos 既有照片與移除', () => {
  const EXISTING = [
    'https://cdn.test/u/a.jpg',
    'https://cdn.test/u/b.jpg',
    'https://cdn.test/u/c.jpg',
  ];

  it('initialUrls 載入為 existing／done，三張時 canSubmit 為 true', () => {
    const h = setup({ initialUrls: EXISTING });
    expect(h.result.current.slots.map((s) => [s.kind, s.state])).toEqual([
      ['existing', 'done'],
      ['existing', 'done'],
      ['existing', 'done'],
    ]);
    expect(h.result.current.photoUrls).toEqual(EXISTING);
    expect(h.result.current.canSubmit).toBe(true);
    expect(h.result.current.pendingCrop).toBeNull();
  });

  it('移除既有照片不呼叫 onDiscardUploaded（等存檔後才由 Edit 的 diff 清理）', () => {
    const h = setup({ initialUrls: EXISTING });
    act(() => h.result.current.remove(h.result.current.slots[0].id));
    expect(h.discarded).toEqual([]);
    expect(h.result.current.canSubmit).toBe(false);
  });

  it('移除本次新上傳、尚未存檔的照片 → 呼叫 onDiscardUploaded(url)', async () => {
    const h = setup();
    await add(h, [fileOf('1.jpg')]);
    await confirm(h);
    await waitFor(() => expect(h.result.current.slots[0].state).toBe('done'));
    act(() => h.result.current.remove(h.result.current.slots[0].id));
    expect(h.discarded).toEqual(['https://cdn.test/u/1_p.jpg']);
  });

  it('還有處理中的照片時 canSubmit 為 false', async () => {
    const h = setup({ initialUrls: EXISTING.slice(0, 2) });
    await add(h, [fileOf('1.jpg')]);
    expect(h.result.current.slots).toHaveLength(3);
    expect(h.result.current.canSubmit).toBe(false);
    await confirm(h);
    await waitFor(() => expect(h.result.current.canSubmit).toBe(true));
  });
});

describe('useListingPhotos 播報', () => {
  it('完成與失敗會更新常駐 live region 的文字，含第幾張', async () => {
    const h = setup();
    await add(h, [fileOf('1.jpg')]);
    await confirm(h);
    await waitFor(() => expect(h.result.current.slots[0].state).toBe('done'));
    expect(h.result.current.announcement).toContain('第 1 張');
    expect(h.result.current.announcement).toContain('完成');
  });
});

describe('useListingPhotos 調整已完成的照片', () => {
  const doneNew = async (h: ReturnType<typeof setup>) => {
    await add(h, [fileOf('1.jpg')]);
    await confirm(h);
    await waitFor(() => expect(h.result.current.slots[0].state).toBe('done'));
  };

  it('調整 → 回到等待取景（重新解碼原檔），輪到它取景', async () => {
    const decode = vi.fn(() => Promise.resolve({ width: 320, height: 240, handle: 'bitmap' }));
    const h = setup({}, { decode });
    await doneNew(h);
    expect(decode).toHaveBeenCalledTimes(1);
    await act(async () => {
      h.result.current.adjust(h.result.current.slots[0].id);
    });
    expect(decode).toHaveBeenCalledTimes(2);
    expect(h.result.current.slots[0].state).toBe('awaiting_crop');
    expect(h.result.current.pendingCrop?.slotId).toBe(h.result.current.slots[0].id);
  });

  it('調整後確認 → 換上新檔，舊檔被清掉（onDiscardUploaded），張數不變', async () => {
    const h = setup();
    await doneNew(h);
    const oldUrl = h.result.current.slots[0].url;
    await act(async () => {
      h.result.current.adjust(h.result.current.slots[0].id);
    });
    await confirm(h);
    await waitFor(() => expect(h.result.current.slots[0].state).toBe('done'));
    expect(h.result.current.slots).toHaveLength(1);
    expect(h.result.current.slots[0].url).not.toBe(oldUrl);
    expect(h.discarded).toEqual([oldUrl]);
  });

  it('調整中途取消 → 還原成原本完成的那張，不是被移除', async () => {
    const h = setup();
    await doneNew(h);
    const { id, url } = h.result.current.slots[0];
    await act(async () => {
      h.result.current.adjust(id);
    });
    act(() => h.result.current.cancelCrop(id));
    expect(h.result.current.slots).toHaveLength(1);
    expect(h.result.current.slots[0]).toMatchObject({ id, state: 'done', url });
    expect(h.discarded).toEqual([]);
  });

  it('既有舊圖不能調整（不重裁）', () => {
    const h = setup({ initialUrls: ['https://cdn.test/u/a.jpg'] });
    act(() => h.result.current.adjust(h.result.current.slots[0].id));
    expect(h.result.current.slots[0].state).toBe('done');
    expect(h.result.current.pendingCrop).toBeNull();
  });
});

describe('useListingPhotos 載入既有照片', () => {
  it('loadExisting 把既有照片載入為 existing／done', () => {
    const h = setup();
    act(() =>
      h.result.current.loadExisting(['https://cdn.test/u/a.jpg', 'https://cdn.test/u/b.jpg']),
    );
    expect(h.result.current.slots.map((s) => [s.kind, s.state, s.url])).toEqual([
      ['existing', 'done', 'https://cdn.test/u/a.jpg'],
      ['existing', 'done', 'https://cdn.test/u/b.jpg'],
    ]);
    expect(h.result.current.photoUrls).toHaveLength(2);
  });

  it('再次載入時換掉舊的既有照片，但保留本次新選的', async () => {
    const h = setup();
    act(() => h.result.current.loadExisting(['https://cdn.test/u/a.jpg']));
    await add(h, [fileOf('1.jpg')]);
    act(() =>
      h.result.current.loadExisting(['https://cdn.test/u/x.jpg', 'https://cdn.test/u/y.jpg']),
    );
    const slots = h.result.current.slots;
    expect(slots.filter((s) => s.kind === 'existing').map((s) => s.url)).toEqual([
      'https://cdn.test/u/x.jpg',
      'https://cdn.test/u/y.jpg',
    ]);
    expect(slots.filter((s) => s.kind === 'new')).toHaveLength(1);
  });

  it('載入既有照片後可移除，且不呼叫 onDiscardUploaded', () => {
    const h = setup();
    act(() => h.result.current.loadExisting(['https://cdn.test/u/a.jpg']));
    act(() => h.result.current.remove(h.result.current.slots[0].id));
    expect(h.result.current.slots).toHaveLength(0);
    expect(h.discarded).toEqual([]);
  });
});

describe('useListingPhotos 防呆與釋放', () => {
  it('建立預覽網址丟例外（瀏覽器缺 URL.createObjectURL）→ 該張 unsupported，不往外拋', async () => {
    const h = setup({
      createPreviewUrl: () => {
        throw new TypeError('URL.createObjectURL is not a function');
      },
    });
    await add(h, [fileOf('1.jpg')]);
    expect(h.result.current.slots).toHaveLength(1);
    expect(h.result.current.slots[0]).toMatchObject({
      state: 'unprocessable',
      errorCode: 'unsupported',
    });
    expect(h.result.current.slots[0].message).toContain('瀏覽器');
  });

  it('確認取景後釋放解碼後的 bitmap', async () => {
    const release = vi.fn();
    const h = setup({}, { release });
    await add(h, [fileOf('1.jpg')]);
    await confirm(h);
    await waitFor(() => expect(h.result.current.slots[0].state).toBe('done'));
    expect(release).toHaveBeenCalledTimes(1);
    expect(release.mock.calls[0][0]).toMatchObject({ handle: 'bitmap' });
  });

  it('取消取景與移除等待取景的照片也釋放 bitmap；編碼失敗同樣釋放', async () => {
    const release = vi.fn();
    const h = setup({}, { release });
    await add(h, [fileOf('1.jpg'), fileOf('2.jpg')]);
    act(() => h.result.current.cancelCrop(h.result.current.slots[0].id));
    expect(release).toHaveBeenCalledTimes(1);
    act(() => h.result.current.remove(h.result.current.slots[0].id));
    expect(release).toHaveBeenCalledTimes(2);

    const fail = setup({}, { release, encode: () => Promise.resolve(null) });
    await add(fail, [fileOf('3.jpg')]);
    await confirm(fail);
    await waitFor(() => expect(fail.result.current.slots[0].state).toBe('unprocessable'));
    expect(release).toHaveBeenCalledTimes(3);
  });

  it('離開頁面（卸載）時釋放尚未用掉的預覽網址', async () => {
    const h = setup();
    await add(h, [fileOf('1.jpg')]);
    h.unmount();
    expect(h.revoked).toContain('blob:preview-1.jpg');
  });
});

describe('useListingPhotos 封面播報', () => {
  const EXISTING = [
    'https://cdn.test/u/a.jpg',
    'https://cdn.test/u/b.jpg',
    'https://cdn.test/u/c.jpg',
  ];

  it('移除第一張且還有其他照片 → 播報封面改為原第 2 張', () => {
    const h = setup({ initialUrls: EXISTING });
    act(() => h.result.current.remove(h.result.current.slots[0].id));
    expect(h.result.current.announcement).toContain('封面已改為原第 2 張');
  });

  it('移除非第一張，或移除後沒有照片 → 不播報封面變更', () => {
    const h = setup({ initialUrls: EXISTING });
    act(() => h.result.current.remove(h.result.current.slots[1].id));
    expect(h.result.current.announcement).not.toContain('封面');

    const one = setup({ initialUrls: [EXISTING[0]] });
    act(() => one.result.current.remove(one.result.current.slots[0].id));
    expect(one.result.current.announcement).not.toContain('封面');
  });
});

describe('useListingPhotos 送出提示', () => {
  const EXISTING = [
    'https://cdn.test/u/a.jpg',
    'https://cdn.test/u/b.jpg',
    'https://cdn.test/u/c.jpg',
  ];

  it('可送出時為空字串', () => {
    const h = setup({ initialUrls: EXISTING });
    expect(h.result.current.canSubmit).toBe(true);
    expect(h.result.current.submitHint).toBe('');
  });

  it('張數不足時說還需要幾張', () => {
    expect(setup().result.current.submitHint).toContain('還需要 3 張');
    const two = setup({ initialUrls: EXISTING.slice(0, 2) });
    expect(two.result.current.submitHint).toContain('還需要 1 張');
  });

  it('有照片處理中或等取景時，說明稍候', async () => {
    const h = setup({ initialUrls: EXISTING.slice(0, 2) });
    await add(h, [fileOf('1.jpg')]);
    expect(h.result.current.submitHint).toContain('處理中');
  });

  it('有照片失敗或無法處理時，說明重試或移除', async () => {
    const h = setup({
      initialUrls: EXISTING.slice(0, 2),
      upload: () => Promise.reject(new Error('x')),
    });
    await add(h, [fileOf('1.jpg')]);
    await confirm(h);
    await waitFor(() => expect(h.result.current.slots[2].state).toBe('failed'));
    expect(h.result.current.submitHint).toContain('重試或移除');
  });
});

describe('useListingPhotos 調整失敗與晚到的非同步結果', () => {
  it('調整時重新解碼失敗 → 還原成原本完成的那張，並同時更新常駐 live region', async () => {
    let fail = false;
    const h = setup(
      {},
      {
        decode: () =>
          fail
            ? Promise.reject(new Error('cannot decode'))
            : Promise.resolve({ width: 320, height: 240, handle: 'bitmap' }),
      },
    );
    await add(h, [fileOf('1.jpg')]);
    await confirm(h);
    await waitFor(() => expect(h.result.current.slots[0].state).toBe('done'));
    fail = true;
    await act(async () => {
      h.result.current.adjust(h.result.current.slots[0].id);
    });
    expect(h.result.current.slots[0].state).toBe('done');
    expect(h.result.current.announcement).toContain('第 1 張');
    expect(h.result.current.announcement).toContain(h.result.current.notice as string);
  });

  it('解碼回來時該張已被移除 → 仍釋放晚到的 bitmap', async () => {
    const release = vi.fn();
    let resolveDecode: (v: { width: number; height: number; handle: string }) => void = () => {};
    const h = setup(
      {},
      {
        release,
        decode: () =>
          new Promise((resolve) => {
            resolveDecode = resolve;
          }),
      },
    );
    await add(h, [fileOf('1.jpg')]);
    act(() => h.result.current.remove(h.result.current.slots[0].id));
    await act(async () => {
      resolveDecode({ width: 320, height: 240, handle: 'late' });
    });
    expect(release).toHaveBeenCalledTimes(1);
    expect(release.mock.calls[0][0]).toMatchObject({ handle: 'late' });
  });

  it('上傳完成時該張已被移除 → 晚到的檔案交給 onDiscardUploaded 清掉', async () => {
    let resolveUpload: (url: string) => void = () => {};
    const h = setup({
      upload: () =>
        new Promise<string>((resolve) => {
          resolveUpload = resolve;
        }),
    });
    await add(h, [fileOf('1.jpg')]);
    await confirm(h);
    act(() => h.result.current.remove(h.result.current.slots[0].id));
    await act(async () => {
      resolveUpload('https://cdn.test/u/late.jpg');
    });
    expect(h.discarded).toEqual(['https://cdn.test/u/late.jpg']);
  });
});
