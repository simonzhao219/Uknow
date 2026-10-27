/**
 * ImageIO 的瀏覽器實作（createImageBitmap＋canvas）。純邏輯在 imagePipeline.ts，
 * 這裡只是把瀏覽器 API 接上去；缺能力時 supported() 為 false，由上層顯示專屬文案。
 */
import type { ImageIO } from './imagePipeline';

export const browserImageIO: ImageIO = {
  supported: () => false,
  decode: () => Promise.reject(new Error('not implemented')),
  render: () => Promise.reject(new Error('not implemented')),
  encode: () => Promise.resolve(null),
};
