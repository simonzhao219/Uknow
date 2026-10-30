// 首頁刊登清單的 route 外快取 —— 解「從詳情頁返回首頁閃骨架、順序跳動」。
//
// 根因：清單與定位結果只活在 HomePage 的元件 state，路由切走就卸載，返回等於全新
// 掛載：先閃 6–9 格骨架、等清單回來，再等 getCurrentPosition 回來把順序從
// created_at 倒序重排成由近到遠。快取放在模組層（存活到分頁重整），第二次掛載
// 先用它即時渲染，背景再靜默重驗（stale-while-revalidate）。
//
// 邊界（業主 2026-10-30 裁決）：
//   - 只放公開刊登資料。使用者座標屬個資：只留記憶體，不寫 storage，重整即消失。
//   - 重新整理允許閃；返回不允許。所以不做 storage 備援。

import type { PublicListingRow } from '../types/listing';

export type Coords = { lat: number; lng: number };

let listings: PublicListingRow[] | null = null;
let coords: Coords | null = null;
let scrollY = 0;

export const getCachedListings = () => listings;
export const setCachedListings = (rows: PublicListingRow[]) => {
  listings = rows;
};
export const getCachedListing = (id: string | undefined): PublicListingRow | null =>
  (id && listings?.find((l) => l.id === id)) || null;

export const getCachedCoords = () => coords;
export const setCachedCoords = (next: Coords) => {
  coords = next;
};

export const getSavedScrollY = () => scrollY;
export const saveScrollY = (y: number) => {
  scrollY = y;
};

/** 測試用：回到冷啟動狀態。 */
export function resetHomeListingsCache() {
  listings = null;
  coords = null;
  scrollY = 0;
}
