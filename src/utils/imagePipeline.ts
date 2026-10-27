/**
 * 照片處理管線：解碼（限邊）→ 裁切成 1:1 → 重新編碼成 JPEG（剝 EXIF）。
 * 重新編碼即剝除 EXIF 是需求：所以**編碼失敗不退回原檔上傳**。
 * 瀏覽器 API 都經注入的 ImageIO，純邏輯可在 node 測試。
 */
import {
  MAX_PHOTO_SIZE,
  MAX_PHOTO_SOURCE_SIZE,
  PHOTO_MAX_EDGE,
  PHOTO_QUALITY_STEPS,
  PHOTO_TARGET_BYTES,
} from './constants';
import { clampCrop, outputEdge, type PixelCrop, scaleCrop, type Size } from './imageGeometry';

/** 解碼時的限邊：留 2 倍輸出邊長的餘裕讓取景精度夠，又不至於把 48MP 全幅解進記憶體。 */
const DECODE_MAX_EDGE = PHOTO_MAX_EDGE * 2;

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
  /** 釋放解碼後的 bitmap（沒有此能力的實作可省略）。 */
  release?: (image: DecodedImage) => void;
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
export function classifyDecodeError(err: unknown): 'out_of_memory' | 'unreadable' {
  if (err instanceof RangeError) return 'out_of_memory';
  const message = err instanceof Error ? err.message : '';
  return /memory|allocation/i.test(message) ? 'out_of_memory' : 'unreadable';
}

export interface LoadedPhoto {
  image: DecodedImage;
  /** 原檔解碼前的尺寸基準（= 解碼後 bitmap 尺寸，因為限邊縮小是等比）。 */
  file: File;
}

export async function loadPhoto(io: ImageIO, file: File): Promise<PhotoResult<LoadedPhoto>> {
  if (!io.supported()) return { ok: false, error: 'unsupported' };
  if (file.size > MAX_PHOTO_SOURCE_SIZE) return { ok: false, error: 'source_too_large' };
  try {
    const image = await io.decode(file, DECODE_MAX_EDGE);
    return { ok: true, value: { image, file } };
  } catch (err) {
    return { ok: false, error: classifyDecodeError(err) };
  }
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
  io: ImageIO,
  photo: LoadedPhoto,
  crop: PixelCrop,
  sourceSize: Size,
): Promise<PhotoResult<ExportedPhoto>> {
  try {
    const scaled = clampCrop(scaleCrop(crop, sourceSize, photo.image), photo.image);
    const canvas = await io.render(photo.image, scaled, outputEdge(scaled, PHOTO_MAX_EDGE));
    let last: { blob: Blob; quality: number } | null = null;
    for (const quality of PHOTO_QUALITY_STEPS) {
      const blob = await io.encode(canvas, quality);
      if (!blob) return { ok: false, error: 'unprocessable' };
      last = { blob, quality };
      if (blob.size <= PHOTO_TARGET_BYTES) break;
    }
    if (!last || last.blob.size > MAX_PHOTO_SIZE) return { ok: false, error: 'unprocessable' };
    return {
      ok: true,
      value: { ...last, downscaled: photo.file.size > MAX_PHOTO_SIZE },
    };
  } catch {
    return { ok: false, error: 'unprocessable' };
  }
}
