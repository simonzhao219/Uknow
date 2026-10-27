import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { FOCUS_RING_GAP } from '../ui/focusRing';
import { cn } from '../ui/utils';

interface PhotoCarouselProps {
  photos: string[];
  name: string;
}

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * 刊登詳情頁的照片輪播，照 Instagram 貼文的樣子：全寬正方形、手指左右滑（原生 CSS
 * scroll-snap，不引入輪播套件）、右上角半透明「1/3」計數、正方形下方一列圓點。桌機（lg 起）
 * 另有左右箭頭，首尾停住不循環；手機不顯示箭頭。
 *
 * 刊登照片在上傳時已裁成 1:1，所以框就是正方形、圖用 object-cover 填滿——舊的非正方形照片
 * 被裁邊而不是留灰邊（「顯示就用正方形」）。只有一張時不畫圓點、計數與箭頭。
 *
 * 根節點的子區塊順序是 [正方形, 圓點列]，`DetailSkeleton` 與 e2e
 * `test_public_skeleton_layout.py` 的結構探針都依這個順序比位置。
 */
export function PhotoCarousel({ photos, name }: PhotoCarouselProps) {
  const total = photos.length;
  // 0 張：沿用 ImageWithFallback 原本對空 src 的行為（舊版也是 src={undefined}），不另發明空狀態。
  const slides: (string | undefined)[] = total === 0 ? [undefined] : photos;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const [index, setIndex] = useState(0);

  // 以 rAF 去抖：滑動中 scroll 事件每幀多次，只在每幀結尾算一次目前是第幾張。
  const handleScroll = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = scrollerRef.current;
      if (!el || el.clientWidth === 0) return;
      setIndex(Math.max(0, Math.min(total - 1, Math.round(el.scrollLeft / el.clientWidth))));
    });
  }, [total]);

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const goTo = (target: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({
      left: target * el.clientWidth,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };

  const multiple = total > 1;
  const arrowClass = cn(
    'absolute top-1/2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full',
    'bg-black/60 text-white transition-opacity hover:bg-black/75 disabled:pointer-events-none disabled:opacity-0 lg:flex',
    FOCUS_RING_GAP,
  );

  return (
    <section aria-roledescription="輪播" aria-label={`${name} 的照片`}>
      {/* bg-muted：骨架退場時照片可能還在下載，沒有底色會是「灰骨架→白框→照片」 */}
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        <div
          ref={scrollerRef}
          data-carousel-scroller=""
          onScroll={handleScroll}
          tabIndex={multiple ? 0 : undefined}
          className={cn(
            'flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain',
            '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            'focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring',
          )}
        >
          {slides.map((photo, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: 照片網址可能重複，順序即身分
              key={i}
              role="group"
              aria-roledescription="投影片"
              aria-label={`第 ${i + 1} 張，共 ${total} 張`}
              className="aspect-square h-full w-full shrink-0 snap-center"
            >
              <ImageWithFallback
                src={photo}
                alt={`${name} - 圖片 ${i + 1}`}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>

        {multiple && (
          <>
            <span
              aria-live="polite"
              className="absolute top-3 right-3 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white"
            >
              {`${index + 1}/${total}`}
            </span>
            <button
              type="button"
              aria-label="上一張"
              disabled={index === 0}
              onClick={() => goTo(index - 1)}
              className={cn(arrowClass, 'left-2')}
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              aria-label="下一張"
              disabled={index === total - 1}
              onClick={() => goTo(index + 1)}
              className={cn(arrowClass, 'right-2')}
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>

      {multiple && (
        // 固定 h-6（觸控 h-11）：骨架在同位置放一塊同高的空白，資料到位時版面不跳。
        <div className="flex h-6 pointer-coarse:h-11 items-center justify-center">
          {photos.map((photo, i) => (
            // 名稱寫在按鈕上，不取自圖片：圖片載入失敗時 ImageWithFallback 會把 alt 換成
            // 「Error loading image」，圓點就全變成同一個名字。滑鼠下按鈕 24×24（WCAG 2.5.8），觸控下 44×44，圓點本身是裡面的 6px。
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: 同上
              key={i}
              type="button"
              aria-label={`第 ${i + 1} 張`}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => goTo(i)}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full',
                // 觸控裝置熱區 ≥44px（§1）：整列撐到 h-11（骨架空白同步），不用偽元素往外延伸
                // ——溢出掃描會把它當成 10px 垂直溢出。
                'pointer-coarse:h-11 pointer-coarse:w-11',
                FOCUS_RING_GAP,
              )}
            >
              <span
                className={cn(
                  'size-1.5 rounded-full transition-colors',
                  i === index ? 'bg-sel' : 'bg-muted-foreground/40',
                )}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
