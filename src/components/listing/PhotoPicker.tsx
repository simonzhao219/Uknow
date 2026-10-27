/**
 * 刊登照片選取／狀態列表（Create／Edit 共用）。狀態機在 useListingPhotos，這裡只負責呈現與焦點。
 * 規劃：docs/plans/listing-photo-pipeline/plan.md §4。
 */
import type { ComponentType } from 'react';
import type { UseListingPhotosResult } from '../../hooks/useListingPhotos';
import type { PhotoCropDialogProps } from './PhotoCropDialog';

export interface PhotoPickerProps {
  photos: UseListingPhotosResult;
  maxCount: number;
  /** 載入裁切對話框的函式（測試注入失敗用）；預設動態 import。 */
  loadCropDialog?: () => Promise<{ default: ComponentType<PhotoCropDialogProps> }>;
}

export function PhotoPicker(_props: PhotoPickerProps) {
  return null;
}
