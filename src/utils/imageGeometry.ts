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
export function fitWithin(_size: Size, _maxEdge: number): Size {
  return { width: -1, height: -1 };
}

/** 預設取景框：置中的最大正方形。 */
export function centeredSquare(_source: Size): PixelCrop {
  return { x: -1, y: -1, width: -1, height: -1 };
}

/** 把裁切框夾進來源範圍內並取整（至少 1px）。 */
export function clampCrop(_crop: PixelCrop, _source: Size): PixelCrop {
  return { x: -1, y: -1, width: -1, height: -1 };
}

/** 把「在 from 尺寸上量的裁切框」換算到 to 尺寸（解碼時被限邊縮小過的 bitmap）。 */
export function scaleCrop(_crop: PixelCrop, _from: Size, _to: Size): PixelCrop {
  return { x: -1, y: -1, width: -1, height: -1 };
}

/** 輸出正方形的邊長：裁切框的邊長，最長不超過 maxEdge，不放大。 */
export function outputEdge(_crop: PixelCrop, _maxEdge: number): number {
  return -1;
}
