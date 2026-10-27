/**
 * 照片處理管線：解碼（限邊）→ 裁切成 1:1 → 重新編碼成 JPEG（剝 EXIF）。
 * 重新編碼即剝除 EXIF 是需求：所以**編碼失敗不退回原檔上傳**。
 * 瀏覽器 API 都經注入的 ImageIO，純邏輯可在 node 測試。
 */
import type { PixelCrop, Size } from './imageGeometry';

export interface DecodedImage extends Size {
  /** ImageIO 自己的不透明把手（例如 ImageBitmap）。 */
  handle: unknown;
}

export interface ImageIO {
  /** 缺 createImageBitmap／canvas.toBlob 這類能力時為 false。 */
  supported: () => boolean;
  /** 套用 EXIF 方向並限邊解碼；失敗要 throw。 */
  decode: (file: File, maxEdge: number) => Promise<DecodedImage>;
  /** 把 crop（以 decoded 的尺寸計）畫成 edge×edge 的正方形；透明處鋪白底。 */
  render: (image: DecodedImage, crop: PixelCrop, edge: number) => Promise<unknown>;
  /** 編成 JPEG；失敗回 null。 */
  encode: (canvas: unknown, quality: number) => Promise<Blob | null>;
}

export type PhotoErrorCode =
  | 'unsupported'
  | 'source_too_large'
  | 'unreadable'
  | 'out_of_memory'
  | 'unprocessable';

export type PhotoResult<T> = { ok: true; value: T } | { ok: false; error: PhotoErrorCode };

/** 解碼階段的錯誤分流：記憶體不足與格式無法讀取要給不同的出路。 */
export function classifyDecodeError(_err: unknown): 'out_of_memory' | 'unreadable' {
  return 'unreadable';
}

export interface LoadedPhoto {
  image: DecodedImage;
  /** 原檔解碼前的尺寸基準（= 解碼後 bitmap 尺寸，因為限邊縮小是等比）。 */
  file: File;
}

export async function loadPhoto(_io: ImageIO, _file: File): Promise<PhotoResult<LoadedPhoto>> {
  return { ok: false, error: 'unreadable' };
}

export interface ExportedPhoto {
  blob: Blob;
  quality: number;
  /** 原檔超過 5MB 才顯示「已自動縮小」。 */
  downscaled: boolean;
}

/**
 * 以 sourceSize 為基準的 crop（react-easy-crop 回報的是它顯示的原圖像素）畫出 JPEG：
 * 品質階梯由高到低重編，第一個 ≤ 目標大小的就收；走完仍超標但 ≤ 5MB 照收；>5MB 或任何失敗 → unprocessable。
 */
export async function exportPhoto(
  _io: ImageIO,
  _photo: LoadedPhoto,
  _crop: PixelCrop,
  _sourceSize: Size,
): Promise<PhotoResult<ExportedPhoto>> {
  return { ok: false, error: 'unprocessable' };
}
