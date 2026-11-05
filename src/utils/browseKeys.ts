// 階段 6 stub：只求型別過，行為留空（TDD 紅燈用）。
export interface BrowseKeyEvent {
  key: string;
  target: EventTarget | null;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  defaultPrevented?: boolean;
}

export function browseKeyDirection(_event: BrowseKeyEvent): 'prev' | 'next' | null {
  return null;
}
