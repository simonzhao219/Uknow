import type React from 'react';
import { useCallback, useRef, useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { RotateCcw, Check } from 'lucide-react';

interface SignaturePadProps {
  onSignatureChange: (signature: string | null) => void;
  disabled?: boolean;
}

export function SignaturePad({ onSignatureChange, disabled = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const [hasSigned, setHasSigned] = useState(false);

  // 原生（非 React）事件處理器在掛載時就被註冊，閉包會凍結當下的 props/state。
  // 用 ref 轉一手，讓它們永遠讀到最新值，否則 disabled 從 true 變 false 之後
  // 觸控仍然畫不動。
  const disabledRef = useRef(disabled);
  const onSignatureChangeRef = useRef(onSignatureChange);
  useEffect(() => {
    disabledRef.current = disabled;
    onSignatureChangeRef.current = onSignatureChange;
  });

  // 依實際 CSS 尺寸與螢幕像素密度設定畫布解析度。
  // 原本寫死 2x：iPhone 是 3x DPR，筆跡會糊；更麻煩的是尺寸只在掛載時算一次，
  // 轉螢幕後 CSS 寬度變了而 backing store 沒變，座標換算就會整個歪掉。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const configure = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const nextWidth = Math.round(rect.width * dpr);
      const nextHeight = Math.round(rect.height * dpr);
      if (canvas.width === nextWidth && canvas.height === nextHeight) return;

      // 改動 width/height 會清空畫布，先把既有筆跡拷到暫存 canvas 再貼回，
      // 使用者轉個螢幕不會白白丟掉簽到一半的字。
      let snapshot: HTMLCanvasElement | null = null;
      if (canvas.width > 0 && canvas.height > 0) {
        snapshot = document.createElement('canvas');
        snapshot.width = canvas.width;
        snapshot.height = canvas.height;
        snapshot.getContext('2d')?.drawImage(canvas, 0, 0);
      }

      canvas.width = nextWidth;
      canvas.height = nextHeight;

      // setTransform（而非 scale）：scale 會疊加，重算尺寸多跑幾次就愈縮愈小。
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (snapshot) {
        ctx.drawImage(snapshot, 0, 0, rect.width, rect.height);
      }
    };

    configure();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(configure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // 觸控事件必須用原生監聽器 + { passive: false } 掛上，不能走 React 的
  // onTouchStart / onTouchMove props。
  //
  // React 18 是把 touchstart / touchmove 委派到 root container 上、而且刻意註冊成
  // passive 監聽器，所以在 onTouchMove 裡呼叫 e.preventDefault() 完全沒有作用。
  // Android Chrome 光靠 CSS `touch-action: none` 就能擋掉捲動，所以在 Pixel 上
  // 一切正常；但 iOS Safari 的 `touch-action: none` 只擋得住元素自身捲動容器的
  // 平移，擋不掉文件層級的橡皮筋回彈 —— 於是每畫一筆，整頁就被拖動再彈回來，
  // 網址列跟著收合／展開、置中的彈窗上下亂跳，根本簽不了名（本次修的 bug）。
  // 唯一可靠解法就是在非 passive 的 touchmove 上 preventDefault。
  //
  // 順帶一提，在 touchstart 上 preventDefault 也會抑制瀏覽器事後補發的相容性
  // mouse 事件，所以下面的 onMouseDown 系列不會在觸控裝置上重複觸發。
  // 三個筆劃動作用 useCallback([]) 包起來：它們只碰 ref 與 setState（都是穩定的），
  // 所以身分永遠不變，可以安全列進下面 effect 的依賴陣列 —— effect 仍然只跑一次，
  // 但依賴是誠實列出的，不必用 lint 抑制註解把問題掃到地毯下。
  const beginStroke = useCallback((pos: { x: number; y: number }) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    isDrawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }, []);

  const extendStroke = useCallback((pos: { x: number; y: number }) => {
    if (!isDrawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }, []);

  const endStroke = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    setHasSigned(true);

    const canvas = canvasRef.current;
    if (canvas) {
      onSignatureChangeRef.current(canvas.toDataURL('image/png'));
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const positionOf = (touch: Touch) => {
      const rect = canvas.getBoundingClientRect();
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };

    const handleStart = (e: TouchEvent) => {
      e.preventDefault();
      if (disabledRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      beginStroke(positionOf(touch));
    };

    const handleMove = (e: TouchEvent) => {
      // 不論是否正在畫都要擋掉：手指落在畫布上就不該捲動頁面。
      e.preventDefault();
      if (disabledRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      extendStroke(positionOf(touch));
    };

    const handleEnd = (e: TouchEvent) => {
      e.preventDefault();
      endStroke();
    };

    canvas.addEventListener('touchstart', handleStart, { passive: false });
    canvas.addEventListener('touchmove', handleMove, { passive: false });
    canvas.addEventListener('touchend', handleEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleEnd, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', handleStart);
      canvas.removeEventListener('touchmove', handleMove);
      canvas.removeEventListener('touchend', handleEnd);
      canvas.removeEventListener('touchcancel', handleEnd);
    };
  }, [beginStroke, extendStroke, endStroke]);

  const mousePosition = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled) return;
    beginStroke(mousePosition(e));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (disabled) return;
    extendStroke(mousePosition(e));
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 目前的 transform 是 dpr 縮放，用 CSS 尺寸清才蓋得滿整塊畫布。
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width || canvas.width, rect.height || canvas.height);
    isDrawingRef.current = false;
    setHasSigned(false);
    onSignatureChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="relative border-2 border-dashed border-gray-300 rounded-lg bg-white">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={endStroke}
          onMouseLeave={endStroke}
          className={`w-full h-40 touch-none select-none ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-crosshair'}`}
          // touchAction 仍要留著（Android 靠它就夠）；另外關掉 iOS 長按時的
          // 選取放大鏡與「拷貝／查詢」浮動選單，簽名時按久一點才不會跳出來。
          style={{
            touchAction: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
          }}
        />
        {!hasSigned && !disabled && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-gray-400">請在此處簽名</p>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={clearSignature}
          disabled={!hasSigned || disabled}
        >
          <RotateCcw className="h-4 w-4 mr-1" />
          清除簽名
        </Button>

        {hasSigned && (
          <div className="flex items-center gap-1 text-green-600 text-sm">
            <Check className="h-4 w-4" />
            已完成簽名
          </div>
        )}
      </div>
    </div>
  );
}
