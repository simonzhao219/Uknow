/**
 * 刊登照片的每張狀態機與選圖佇列（Create／Edit 共用）。
 * 規劃：docs/plans/listing-photo-pipeline/plan.md §2.3／§4。
 * 瀏覽器相依（解碼、上傳、預覽 URL）都經注入，方便測試。
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { PixelCrop, Size } from '../utils/imageGeometry';
import {
  exportPhoto,
  type ImageIO,
  type LoadedPhoto,
  loadPhoto,
  type PhotoErrorCode,
} from '../utils/imagePipeline';

export type PhotoSlotState =
  | 'preparing' // 解碼中／編碼中
  | 'awaiting_crop' // 解碼完成，等待（或排隊等待）使用者確認取景
  | 'uploading'
  | 'failed' // 上傳失敗，可重試
  | 'unprocessable' // 無法處理，只能移除
  | 'done';

export interface PhotoSlot {
  id: string;
  /** existing＝編輯時載入的既有照片（不重裁，只能移除）；new＝本次選的。 */
  kind: 'existing' | 'new';
  state: PhotoSlotState;
  /** 已完成的 public URL（done 才有）。 */
  url?: string;
  previewUrl?: string;
  /** 給使用者看的原因（failed／unprocessable）。 */
  message?: string;
  errorCode?: PhotoErrorCode;
  /** 原檔超過 5MB 被自動縮小。 */
  downscaled?: boolean;
}

export interface PendingCrop {
  slotId: string;
  file: File;
  previewUrl: string;
}

export interface UseListingPhotosOptions {
  initialUrls?: string[];
  maxCount: number;
  io: ImageIO;
  upload: (blob: Blob) => Promise<string>;
  createPreviewUrl: (file: File | Blob) => string;
  revokePreviewUrl: (url: string) => void;
  /** 本次新上傳、尚未存檔就被移除的照片（best-effort 清 Storage）。 */
  onDiscardUploaded?: (url: string) => void;
}

export interface UseListingPhotosResult {
  slots: PhotoSlot[];
  /** 目前輪到的取景（佇列的第一張）；沒有則 null。 */
  pendingCrop: PendingCrop | null;
  /** 超量被忽略、能力不足等一次性提示。 */
  notice: string | null;
  addFiles: (files: File[]) => void;
  confirmCrop: (slotId: string, crop: PixelCrop, naturalSize: Size) => void;
  cancelCrop: (slotId: string) => void;
  retry: (slotId: string) => void;
  remove: (slotId: string) => void;
  /** 已完成照片的 URL（依 slots 順序）。 */
  photoUrls: string[];
  /** 處理中（解碼／等取景／編碼／上傳）——送出鈕要 aria-disabled。 */
  isBusy: boolean;
  /** 恰好 maxCount 張且全部 done。 */
  canSubmit: boolean;
  /** 常駐 live region 的播報文字。 */
  announcement: string;
}

/** 各種無法處理的原因 → 給使用者看的文案與出路。 */
const ERROR_MESSAGES: Record<PhotoErrorCode, string> = {
  unsupported: '此瀏覽器無法處理照片，請改用其他瀏覽器開啟',
  source_too_large: '檔案過大，請換一張（單張不超過 20MB）',
  unreadable: '這張照片的格式無法讀取，請換一張，或截圖後再試',
  out_of_memory: '這張照片太大，裝置記憶體不足，請換一張較小的照片',
  unprocessable: '這張照片無法處理，請換一張',
};

interface SlotData {
  file?: File;
  loaded?: LoadedPhoto;
  blob?: Blob;
}

export function useListingPhotos(options: UseListingPhotosOptions): UseListingPhotosResult {
  const { maxCount, io, upload, createPreviewUrl, revokePreviewUrl, onDiscardUploaded } = options;
  const [slots, setSlotsState] = useState<PhotoSlot[]>(() =>
    (options.initialUrls ?? []).map((url, i) => ({
      id: `existing-${i}`,
      kind: 'existing',
      state: 'done',
      url,
    })),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  // slotsRef 與 state 同步更新，讓連續的非同步回呼讀到的是最新的清單。
  const slotsRef = useRef(slots);
  const data = useRef(new Map<string, SlotData>());
  const counter = useRef(0);

  const update = useCallback((fn: (prev: PhotoSlot[]) => PhotoSlot[]) => {
    slotsRef.current = fn(slotsRef.current);
    setSlotsState(slotsRef.current);
  }, []);

  const patch = useCallback(
    (id: string, changes: Partial<PhotoSlot>) =>
      update((prev) => prev.map((s) => (s.id === id ? { ...s, ...changes } : s))),
    [update],
  );

  const exists = useCallback((id: string) => slotsRef.current.some((s) => s.id === id), []);
  const ordinal = useCallback(
    (id: string) => slotsRef.current.findIndex((s) => s.id === id) + 1,
    [],
  );

  const release = useCallback(
    (id: string) => {
      const slot = slotsRef.current.find((s) => s.id === id);
      if (slot?.previewUrl) revokePreviewUrl(slot.previewUrl);
    },
    [revokePreviewUrl],
  );

  const markUnprocessable = useCallback(
    (id: string, code: PhotoErrorCode) => {
      if (!exists(id)) return;
      release(id);
      patch(id, {
        state: 'unprocessable',
        errorCode: code,
        message: ERROR_MESSAGES[code],
        previewUrl: undefined,
      });
      setAnnouncement(`第 ${ordinal(id)} 張照片無法處理：${ERROR_MESSAGES[code]}`);
    },
    [patch, release, ordinal, exists],
  );

  const runUpload = useCallback(
    (id: string, blob: Blob) => {
      patch(id, { state: 'uploading', message: undefined });
      upload(blob).then(
        (url) => {
          if (!exists(id)) return;
          release(id);
          patch(id, { state: 'done', url, previewUrl: undefined, message: undefined });
          setAnnouncement(`第 ${ordinal(id)} 張照片上傳完成`);
        },
        (err: unknown) => {
          if (!exists(id)) return;
          const message = err instanceof Error && err.message ? err.message : '上傳失敗';
          patch(id, { state: 'failed', message });
          setAnnouncement(`第 ${ordinal(id)} 張照片上傳失敗：${message}`);
        },
      );
    },
    [patch, release, upload, ordinal, exists],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const capacity = Math.max(0, maxCount - slotsRef.current.length);
      const accepted = files.slice(0, capacity);
      const skipped = files.length - accepted.length;
      setNotice(skipped > 0 ? `最多只能上傳 ${maxCount} 張照片，已略過多出的 ${skipped} 張` : null);
      for (const file of accepted) {
        counter.current += 1;
        const id = `photo-${counter.current}`;
        data.current.set(id, { file });
        update((prev) => [
          ...prev,
          { id, kind: 'new', state: 'preparing', previewUrl: createPreviewUrl(file) },
        ]);
        loadPhoto(io, file).then((result) => {
          if (!exists(id)) return;
          if ('error' in result) return markUnprocessable(id, result.error);
          data.current.set(id, { file, loaded: result.value });
          patch(id, { state: 'awaiting_crop' });
        });
      }
    },
    [createPreviewUrl, io, markUnprocessable, maxCount, patch, update, exists],
  );

  const confirmCrop = useCallback(
    (id: string, crop: PixelCrop, naturalSize: Size) => {
      const entry = data.current.get(id);
      const slot = slotsRef.current.find((s) => s.id === id);
      if (!entry?.loaded || slot?.state !== 'awaiting_crop') return;
      patch(id, { state: 'preparing' });
      exportPhoto(io, entry.loaded, crop, naturalSize).then((result) => {
        if (!exists(id)) return;
        if ('error' in result) return markUnprocessable(id, result.error);
        entry.blob = result.value.blob;
        entry.loaded = undefined; // 釋放解碼後的 bitmap；File 引用留到移除
        patch(id, { downscaled: result.value.downscaled });
        runUpload(id, result.value.blob);
      });
    },
    [io, markUnprocessable, patch, runUpload, exists],
  );

  const remove = useCallback(
    (id: string) => {
      const slot = slotsRef.current.find((s) => s.id === id);
      if (!slot) return;
      release(id);
      if (slot.kind === 'new' && slot.state === 'done' && slot.url) onDiscardUploaded?.(slot.url);
      data.current.delete(id);
      update((prev) => prev.filter((s) => s.id !== id));
    },
    [onDiscardUploaded, release, update],
  );

  const retry = useCallback(
    (id: string) => {
      const blob = data.current.get(id)?.blob;
      const slot = slotsRef.current.find((s) => s.id === id);
      if (!blob || slot?.state !== 'failed') return;
      runUpload(id, blob);
    },
    [runUpload],
  );

  const pendingCrop = useMemo<PendingCrop | null>(() => {
    const slot = slots.find((s) => s.state === 'awaiting_crop');
    const file = slot && data.current.get(slot.id)?.file;
    return slot && file && slot.previewUrl
      ? { slotId: slot.id, file, previewUrl: slot.previewUrl }
      : null;
  }, [slots]);

  return {
    slots,
    pendingCrop,
    notice,
    addFiles,
    confirmCrop,
    cancelCrop: remove,
    retry,
    remove,
    photoUrls: slots.filter((s) => s.state === 'done' && s.url).map((s) => s.url as string),
    isBusy: slots.some((s) => ['preparing', 'awaiting_crop', 'uploading'].includes(s.state)),
    canSubmit: slots.length === maxCount && slots.every((s) => s.state === 'done'),
    announcement,
  };
}
