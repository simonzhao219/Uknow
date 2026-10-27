/**
 * 刊登照片的每張狀態機與選圖佇列（Create／Edit 共用）。
 * 規劃：docs/plans/listing-photo-pipeline/plan.md §2.3／§4。
 * 瀏覽器相依（解碼、上傳、預覽 URL）都經注入，方便測試。
 */
import type { PixelCrop, Size } from '../utils/imageGeometry';
import type { ImageIO, PhotoErrorCode } from '../utils/imagePipeline';

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

export function useListingPhotos(_options: UseListingPhotosOptions): UseListingPhotosResult {
  return {
    slots: [],
    pendingCrop: null,
    notice: null,
    addFiles: () => {},
    confirmCrop: () => {},
    cancelCrop: () => {},
    retry: () => {},
    remove: () => {},
    photoUrls: [],
    isBusy: false,
    canSubmit: false,
    announcement: '',
  };
}
