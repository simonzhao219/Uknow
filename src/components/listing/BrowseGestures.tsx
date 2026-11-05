// 階段 6 stub：只求型別過，行為留空（TDD 紅燈用）。
export interface BrowseGesturesProps {
  containerRef: React.RefObject<HTMLElement | null>;
  onNavigate: (direction: 'prev' | 'next', via: 'key' | 'swipe') => void;
}

export default function BrowseGestures(_props: BrowseGesturesProps) {
  return null;
}
