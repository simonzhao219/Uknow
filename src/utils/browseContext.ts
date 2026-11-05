// 階段 4 stub：只求型別過，行為留空（TDD 紅燈用）。
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

export function getNeighbors(_ids: string[], _currentId: string): BrowseNeighbors | null {
  return null;
}

export function resolveBrowseContext(
  _state: unknown,
  _currentId: string | undefined,
  _frozen: FrozenBrowseContext | null,
): BrowseNeighbors | null {
  return null;
}
