/**
 * ImageIO 的瀏覽器實作（createImageBitmap＋canvas）。純邏輯在 imagePipeline.ts，
 * 這裡只是把瀏覽器 API 接上去；缺能力時 supported() 為 false，由上層顯示專屬文案。
 */
import { fitWithin, type PixelCrop, type Size } from './imageGeometry';
import type { DecodedImage, ImageIO } from './imagePipeline';

/** 只讀圖片標頭取得（已套用 EXIF 方向的）原始尺寸，不把整張圖解成 bitmap。 */
function readNaturalSize(file: File): Promise<Size> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('無法讀取圖片尺寸'));
    };
    img.src = url;
  });
}

export const browserImageIO: ImageIO = {
  supported: () =>
    typeof createImageBitmap === 'function' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.toBlob === 'function',

  async decode(file: File, maxEdge: number): Promise<DecodedImage> {
    const natural = await readNaturalSize(file);
    const target = fitWithin(natural, maxEdge);
    const shrink = target.width < natural.width || target.height < natural.height;
    // 限邊解碼：48MP 不整張解進記憶體；沒超過上限就不縮放（createImageBitmap 的 resize 會放大）。
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
      ...(shrink ? { resizeWidth: target.width, resizeHeight: target.height } : {}),
    });
    return { width: target.width, height: target.height, handle: bitmap };
  },

  async render(image: DecodedImage, crop: PixelCrop, edge: number): Promise<unknown> {
    const canvas = document.createElement('canvas');
    canvas.width = edge;
    canvas.height = edge;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('無法取得繪圖環境');
    // 透明 PNG 轉 JPEG 預設會變黑底，先鋪白底。
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, edge, edge);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      image.handle as CanvasImageSource,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      edge,
      edge,
    );
    return canvas;
  },

  release(image: DecodedImage): void {
    (image.handle as { close?: () => void } | null)?.close?.();
  },

  encode(canvas: unknown, quality: number): Promise<Blob | null> {
    return new Promise((resolve) => {
      (canvas as HTMLCanvasElement).toBlob((blob) => resolve(blob), 'image/jpeg', quality);
    });
  },
};
