/**
 * 1:1 取景對話框（Radix Dialog＋react-easy-crop 的拖曳定位與縮放）。
 * 只應被 PhotoPicker 以動態 import 載入，讓裁切套件留在 Create／Edit 的 lazy chunk 內。
 */
import Cropper from 'react-easy-crop';
import type { PixelCrop, Size } from '../../utils/imageGeometry';

export interface PhotoCropDialogProps {
  /** 第幾張（給標題與按鈕名稱用）。 */
  ordinal: number;
  previewUrl: string;
  onConfirm: (crop: PixelCrop, naturalSize: Size) => void;
  onCancel: () => void;
}

export default function PhotoCropDialog(_props: PhotoCropDialogProps) {
  void Cropper;
  return null;
}
