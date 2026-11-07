// 刊登詳情頁「換篇」的脈絡判定（純函式）。
//
// 首頁點卡片時，會把當下畫面上的有序 id 凍結在模組層（見 homeListingsCache），並在
// history.state 帶 { browseFrom: 'home', ctx: 凍結版本 }。詳情頁只有三個條件都成立才顯示
// 換篇：旗標是 home、ctx 與目前凍結版本相同、目前這篇在凍結清單內。重新整理（模組消失）、
// 返回首頁後 Forward 回舊條目（版本不同）、從推薦網絡／後台進來（沒有旗標）都落在「無脈絡」。
export interface BrowseNeighbors {
  index: number;
  total: number;
  prevId: string | null;
  nextId: string | null;
}

export interface BrowseRouteState {
  browseFrom?: string;
  ctx?: string;
}

export interface FrozenBrowseContext {
  ids: string[];
  version: string;
}

export function getNeighbors(ids: string[], currentId: string): BrowseNeighbors | null {
  const index = ids.indexOf(currentId);
  if (index < 0) return null;
  return {
    index,
    total: ids.length,
    prevId: index > 0 ? ids[index - 1] : null,
    nextId: index < ids.length - 1 ? ids[index + 1] : null,
  };
}

export function resolveBrowseContext(
  state: unknown,
  currentId: string | undefined,
  frozen: FrozenBrowseContext | null,
): BrowseNeighbors | null {
  if (!currentId || !frozen) return null;
  const routeState = state as BrowseRouteState | null | undefined;
  if (routeState?.browseFrom !== 'home' || routeState.ctx !== frozen.version) return null;
  return getNeighbors(frozen.ids, currentId);
}
