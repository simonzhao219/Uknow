// 首頁刊登清單的 route 外快取 —— 解「從詳情頁返回首頁閃骨架、順序跳動」。
//
// 根因：清單與定位結果只活在 HomePage 的元件 state，路由切走就卸載，返回等於全新
// 掛載：先閃 6–9 格骨架、等清單回來，再等 getCurrentPosition 回來把順序從
// created_at 倒序重排成由近到遠。快取放在模組層（存活到分頁重整），第二次掛載
// 先用它即時渲染，背景再靜默重驗（stale-while-revalidate）。
//
// 邊界：業主 2026-10-30 要求「重新整理可以閃、返回不可以閃」，所以不做 storage 備援；
// 派工限制只放公開刊登資料——使用者座標屬個資，只留記憶體，重整即消失。

import type { PublicListingRow } from '../types/listing';
import type { DistrictSelectionByCity } from './districtSelection';

export type Coords = { lat: number; lng: number };

let listings: PublicListingRow[] | null = null;
let coords: Coords | null = null;
let scrollY = 0;

// 搜尋字詞與篩選條件（業主 2026-10-30 W2-10）：返回時條件與結果都要還原。
export type HomeFilters = {
  searchQuery: string;
  category: string;
  genders: string[];
  districtsByCity: DistrictSelectionByCity;
};
export const DEFAULT_HOME_FILTERS: HomeFilters = {
  searchQuery: '',
  category: '',
  genders: [],
  districtsByCity: {},
};
let filters: HomeFilters = DEFAULT_HOME_FILTERS;

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

/** 上次離開首頁時畫面用的排序：返回（POP）沿用，不因離開期間才到的座標而重排。 */
export type HomeOrderMode = 'distance' | 'latest';
let orderMode: HomeOrderMode | null = null;
export const getOrderMode = () => orderMode;
export const setOrderMode = (next: HomeOrderMode) => {
  orderMode = next;
};

export const getCachedFilters = () => filters;
export const setCachedFilters = (next: HomeFilters) => {
  filters = next;
};

// 換篇脈絡（W5-26）：首頁點卡片的當下凍結畫面上的有序 id，詳情頁換篇只看這份——座標晚到、
// 背景重驗都不會讓進行中的瀏覽順序在使用者手下重排。版本＝模組載入時的隨機 nonce＋遞增計數：
// history.state 會跨重新整理保留，只用計數的話重整後歸零，舊條目的 ctx 可能碰巧吻合新凍結。
export type BrowseContextSnapshot = { ids: string[]; entryId: string; version: string };

const versionNonce =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
let versionCounter = 0;
let browseContext: BrowseContextSnapshot | null = null;
// 換過篇之後最後看的那一篇：返回首頁時把它捲到畫面中央（W5-28）。
let lastViewedId: string | null = null;

/** 凍結目前畫面順序；回傳要放進 history.state 的 ctx 版本。 */
export function freezeBrowseContext(ids: string[], entryId: string): string {
  versionCounter += 1;
  const version = `${versionNonce}-${versionCounter}`;
  browseContext = { ids: [...ids], entryId, version };
  lastViewedId = null;
  return version;
}
export const getBrowseContext = () => browseContext;
export const getLastViewedId = () => lastViewedId;
export const setLastViewedId = (id: string | null) => {
  lastViewedId = id;
};

export const getSavedScrollY = () => scrollY;
export const saveScrollY = (y: number) => {
  scrollY = y;
};

/**
 * 清掉「這一次造訪的檢視狀態」（搜尋／篩選、捲動位置），保留清單與座標。
 * 非返回（PUSH／REPLACE）進首頁時呼叫：要乾淨首頁，但清單快取留著——
 * 詳情頁共用它（getCachedListing），也避免又閃骨架。
 */
export function resetHomeView() {
  filters = DEFAULT_HOME_FILTERS;
  scrollY = 0;
  lastViewedId = null;
  orderMode = null;
}

/** 回到冷啟動狀態：登出時由 App 呼叫（換帳號不沿用前一人的檢視狀態），測試也用它重置。 */
export function resetHomeListingsCache() {
  listings = null;
  coords = null;
  scrollY = 0;
  filters = DEFAULT_HOME_FILTERS;
  browseContext = null;
  lastViewedId = null;
  orderMode = null;
}
