/**
 * 照片裁切／縮放的純數學（不碰 DOM）。座標一律是像素；裁切框是 `PixelCrop`
 * （與 react-easy-crop 的 croppedAreaPixels 同形）。規劃：docs/plans/listing-photo-pipeline/plan.md §2.3。
 */

export interface Size {
  width: number;
  height: number;
}

export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 等比縮到最長邊 ≤ maxEdge；不放大。 */
export function fitWithin(size: Size, maxEdge: number): Size {
  const scale = Math.min(1, maxEdge / Math.max(size.width, size.height));
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

/** 預設取景框：置中的最大正方形。 */
export function centeredSquare(source: Size): PixelCrop {
  const edge = Math.min(source.width, source.height);
  return {
    x: Math.floor((source.width - edge) / 2),
    y: Math.floor((source.height - edge) / 2),
    width: edge,
    height: edge,
  };
}

/** 把裁切框夾進來源範圍內並取整（至少 1px）。 */
export function clampCrop(crop: PixelCrop, source: Size): PixelCrop {
  const width = Math.min(source.width, Math.max(1, Math.round(crop.width)));
  const height = Math.min(source.height, Math.max(1, Math.round(crop.height)));
  return {
    x: Math.min(Math.max(0, Math.round(crop.x)), source.width - width),
    y: Math.min(Math.max(0, Math.round(crop.y)), source.height - height),
    width,
    height,
  };
}

/** 把「在 from 尺寸上量的裁切框」換算到 to 尺寸（解碼時被限邊縮小過的 bitmap）。 */
export function scaleCrop(crop: PixelCrop, from: Size, to: Size): PixelCrop {
  const rx = to.width / from.width;
  const ry = to.height / from.height;
  return {
    x: Math.round(crop.x * rx),
    y: Math.round(crop.y * ry),
    width: Math.max(1, Math.round(crop.width * rx)),
    height: Math.max(1, Math.round(crop.height * ry)),
  };
}

/** 輸出正方形的邊長：取裁切框較短邊，最長不超過 maxEdge，不放大。 */
export function outputEdge(crop: PixelCrop, maxEdge: number): number {
  return Math.max(1, Math.min(maxEdge, Math.round(Math.min(crop.width, crop.height))));
}
