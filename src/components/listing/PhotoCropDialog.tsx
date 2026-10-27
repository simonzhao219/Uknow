/**
 * 1:1 取景對話框（Radix Dialog＋react-easy-crop 的拖曳定位與縮放）。
 * 只應被 PhotoPicker 以動態 import 載入，讓裁切套件留在 Create／Edit 的 lazy chunk 內。
 *
 * react-easy-crop 沒有鍵盤操作，所以微調由本檔自刻：縮放滑桿＋上下左右四顆 44px 按鈕。
 * Esc、關閉鈕、取消鈕、Android 返回鍵都等同「取消當張」；「完成」有防重入。
 * 佇列有多張時對話框**常駐**（返回鍵歷史項只在整個佇列開始／結束時各一次），
 * 換張只重置內部取景區（CropBody 以 previewUrl 為 key），避免卸載重掛造成的 history.back 時序問題。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Cropper from 'react-easy-crop';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useOverlayBackClose } from '../../hooks/useOverlayBackClose';
import type { PixelCrop, Size } from '../../utils/imageGeometry';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

export interface PhotoCropDialogProps {
  /** 第幾張（給標題與按鈕名稱用）。 */
  ordinal: number;
  previewUrl: string;
  onConfirm: (crop: PixelCrop, naturalSize: Size) => void;
  onCancel: () => void;
}

/** 微調一次移動幾 px（react-easy-crop 的 crop 是媒體相對取景框的位移）。 */
const NUDGE_STEP = 10;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

export default function PhotoCropDialog({
  ordinal,
  previewUrl,
  onConfirm,
  onCancel,
}: PhotoCropDialogProps) {
  useBodyScrollLock(true);
  useOverlayBackClose(true, onCancel);

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        className="max-h-[100dvh] overflow-y-auto sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>調整第 {ordinal} 張照片範圍</DialogTitle>
          <DialogDescription>
            拖曳照片調整取景，用滑桿放大縮小；正方形框內就是公開顯示的範圍。
          </DialogDescription>
        </DialogHeader>
        <CropBody
          key={previewUrl}
          previewUrl={previewUrl}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      </DialogContent>
    </Dialog>
  );
}

function CropBody({
  previewUrl,
  onConfirm,
  onCancel,
}: Pick<PhotoCropDialogProps, 'previewUrl' | 'onConfirm' | 'onCancel'>) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [ready, setReady] = useState(false);
  const area = useRef<PixelCrop | null>(null);
  const natural = useRef<Size | null>(null);
  const confirmed = useRef(false);
  const frame = useRef<HTMLDivElement>(null);
  // 取景框＝整個方框：量容器邊長交給 Cropper，不讓它依「媒體 contain 後的尺寸」自己算
  // （直式照片會變成左右留灰邊、上下溢出框外）。
  const [side, setSide] = useState<number | null>(null);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      if (width > 0) setSide(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const nudge = (dx: number, dy: number) => setCrop((c) => ({ x: c.x + dx, y: c.y + dy }));

  const confirm = useCallback(() => {
    if (confirmed.current || !area.current || !natural.current) return;
    confirmed.current = true;
    onConfirm(area.current, natural.current);
  }, [onConfirm]);

  return (
    <>
      <div
        ref={frame}
        className="relative mx-auto aspect-square w-[min(100%,45dvh)] overflow-hidden rounded-md bg-muted"
      >
        <Cropper
          image={previewUrl}
          crop={crop}
          zoom={zoom}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          aspect={1}
          objectFit="cover"
          cropSize={side ? { width: side, height: side } : undefined}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onMediaLoaded={(m) => {
            natural.current = { width: m.naturalWidth, height: m.naturalHeight };
          }}
          onCropComplete={(_percent, pixels) => {
            area.current = pixels;
            setReady(true);
          }}
          style={{ containerStyle: { touchAction: 'none' } }}
        />
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-3 text-sm">
          <span className="shrink-0">縮放</span>
          <input
            type="range"
            aria-label="縮放"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-11 w-full"
          />
        </label>
        <div className="grid grid-cols-4 gap-2">
          <Button
            type="button"
            tone="secondary"
            className="min-h-11"
            onClick={() => nudge(0, -NUDGE_STEP)}
            aria-label="向上移動"
          >
            ↑
          </Button>
          <Button
            type="button"
            tone="secondary"
            className="min-h-11"
            onClick={() => nudge(0, NUDGE_STEP)}
            aria-label="向下移動"
          >
            ↓
          </Button>
          <Button
            type="button"
            tone="secondary"
            className="min-h-11"
            onClick={() => nudge(-NUDGE_STEP, 0)}
            aria-label="向左移動"
          >
            ←
          </Button>
          <Button
            type="button"
            tone="secondary"
            className="min-h-11"
            onClick={() => nudge(NUDGE_STEP, 0)}
            aria-label="向右移動"
          >
            →
          </Button>
        </div>
      </div>

      <div className="sticky bottom-0 -mx-1 flex flex-wrap gap-2 bg-background px-1 pt-2 pb-[env(safe-area-inset-bottom)]">
        <Button
          type="button"
          tone="secondary"
          className="min-h-11"
          onClick={() => {
            setCrop({ x: 0, y: 0 });
            setZoom(MIN_ZOOM);
          }}
        >
          重設
        </Button>
        <Button type="button" tone="secondary" className="min-h-11 flex-1" onClick={onCancel}>
          取消
        </Button>
        <Button type="button" className="min-h-11 flex-1" onClick={confirm} disabled={!ready}>
          完成
        </Button>
      </div>
    </>
  );
}
