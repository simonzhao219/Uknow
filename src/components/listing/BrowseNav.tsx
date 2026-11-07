import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import type { BrowseNeighbors } from '../../utils/browseContext';

export type BrowseVia = 'button' | 'key' | 'swipe';

/**
 * 詳情頁頁首列右側的「‹ 3/12 ›」。手機與桌機同一組，是不靠手勢的換篇入口（WCAG 2.5.1）。
 * 頭尾的鈕用 aria-disabled（不用 disabled）：Button 契約是 aria-disabled 仍收得到點擊，
 * 焦點不會因為鈕停用而掉到 body，點了由呼叫端播報「已是最後一篇」。
 * 位置文字視覺上寫「3/12」並 aria-hidden；報讀器聽的是 ServiceProviderDetailRoute 那一個 live 區，
 * 避免與輪播右上角的「1/3」各播一次。
 */
export function BrowseNav({
  neighbors,
  onGo,
  autoFocusDir,
}: {
  neighbors: BrowseNeighbors;
  onGo: (direction: 'prev' | 'next', via: BrowseVia) => void;
  /** 換篇後新實例掛載時，把焦點還給剛才按的那顆鈕。 */
  autoFocusDir?: 'prev' | 'next';
}) {
  const navRef = useRef<HTMLElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在掛載時還原一次焦點
  useEffect(() => {
    if (autoFocusDir) {
      navRef.current?.querySelector<HTMLElement>(`[data-nav-dir="${autoFocusDir}"]`)?.focus();
    }
  }, []);

  const buttonClass = 'aria-disabled:opacity-40';
  return (
    <nav ref={navRef} aria-label="換篇" className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon"
        aria-label="上一篇"
        aria-disabled={neighbors.prevId === null ? true : undefined}
        data-nav-dir="prev"
        className={buttonClass}
        onClick={() => onGo('prev', 'button')}
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <span
        aria-hidden="true"
        className="min-w-10 text-center text-sm tabular-nums text-muted-foreground"
      >
        {neighbors.index + 1}/{neighbors.total}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="下一篇"
        aria-disabled={neighbors.nextId === null ? true : undefined}
        data-nav-dir="next"
        className={buttonClass}
        onClick={() => onGo('next', 'button')}
      >
        <ChevronRight className="h-5 w-5" />
      </Button>
    </nav>
  );
}
