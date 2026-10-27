/**
 * 刊登照片選取／狀態列表（Create／Edit 共用）。狀態機在 useListingPhotos，這裡只負責呈現與焦點。
 * 規劃：docs/plans/listing-photo-pipeline/plan.md §4。
 *
 * 取景對話框以 React.lazy 動態載入（react-easy-crop 留在 lazy chunk 內）；載入失敗＝顯示
 * 「重新載入裁切工具」，該張維持等待取景而不可送出——**不會**偷偷改用自動置中裁。
 */
import {
  Component,
  type ComponentType,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PhotoSlot, UseListingPhotosResult } from '../../hooks/useListingPhotos';
import { Button } from '../ui/button';
import type { PhotoCropDialogProps } from './PhotoCropDialog';

type DialogLoader = () => Promise<{ default: ComponentType<PhotoCropDialogProps> }>;

export interface PhotoPickerProps {
  photos: UseListingPhotosResult;
  maxCount: number;
  /** 載入裁切對話框的函式（測試注入失敗用）；預設動態 import。 */
  loadCropDialog?: DialogLoader;
}

const defaultLoader: DialogLoader = () => import('./PhotoCropDialog');
const RELOAD_MIN_PENDING_MS = 400;

const STATUS_TEXT: Partial<Record<PhotoSlot['state'], string>> = {
  preparing: '處理中…',
  awaiting_crop: '等待取景',
  uploading: '上傳中…',
};

/** 載入中（含重新載入進行中）：按鈕 aria-disabled 並用文字說明，防連點。 */
function CropToolPending() {
  return (
    <div className="rounded-md border p-3 text-sm" role="status">
      <p>正在載入裁切工具…</p>
      <Button type="button" tone="secondary" className="mt-2 min-h-11" aria-disabled="true">
        載入中…
      </Button>
    </div>
  );
}

class CropBoundary extends Component<
  { onReload: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        className="rounded-md border border-warning-border bg-warning-subtle p-3 text-sm"
        role="alert"
      >
        <p>裁切工具載入失敗，載入完成前無法送出。請重新載入，或移除這張照片。</p>
        <Button
          type="button"
          tone="secondary"
          className="mt-2 min-h-11"
          onClick={this.props.onReload}
        >
          重新載入裁切工具
        </Button>
      </div>
    );
  }
}

function SlotButtons({
  slot,
  n,
  photos,
  onRemove,
}: {
  slot: PhotoSlot;
  n: number;
  photos: UseListingPhotosResult;
  onRemove: () => void;
}) {
  const btn = 'min-h-11';
  const remove = (
    <Button
      type="button"
      tone="secondary"
      size="sm"
      className={btn}
      onClick={onRemove}
      aria-label={`移除第 ${n} 張`}
    >
      移除
    </Button>
  );
  switch (slot.state) {
    case 'failed':
      return (
        <>
          <Button
            type="button"
            tone="secondary"
            size="sm"
            className={btn}
            onClick={() => photos.retry(slot.id)}
            aria-label={`重試第 ${n} 張`}
          >
            重試
          </Button>
          {remove}
        </>
      );
    case 'done':
      return (
        <>
          {slot.kind === 'new' && (
            <Button
              type="button"
              tone="secondary"
              size="sm"
              className={btn}
              onClick={() => photos.adjust(slot.id)}
              aria-label={`調整第 ${n} 張範圍`}
            >
              調整範圍
            </Button>
          )}
          {remove}
        </>
      );
    case 'unprocessable':
    case 'awaiting_crop':
      return remove;
    default:
      return null;
  }
}

export function PhotoPicker({
  photos,
  maxCount,
  loadCropDialog = defaultLoader,
}: PhotoPickerProps) {
  const { slots, pendingCrop } = photos;
  const listRef = useRef<HTMLUListElement>(null);
  const focusAfterRemove = useRef<number | null>(null);
  const loaderRef = useRef(loadCropDialog);
  loaderRef.current = loadCropDialog;
  const [attempt, setAttempt] = useState(0);
  // 按下「重新載入」後至少顯示一下「載入中…」，否則失敗得太快會讓人以為按鈕沒反應。
  const [holding, setHolding] = useState(false);
  const reload = () => {
    setHolding(true);
    setAttempt((a) => a + 1);
    setTimeout(() => setHolding(false), RELOAD_MIN_PENDING_MS);
  };
  // attempt 變動＝重新建立 lazy 元件（React.lazy 會快取 rejected promise，不重建的話重試永遠失敗）。
  const CropDialog = useMemo(() => {
    void attempt;
    return lazy(() => loaderRef.current());
  }, [attempt]);

  // 移除後的焦點後備：下一格 → 上一格 → 列表容器（§9：焦點元素消失不可掉到 body）。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在 slots 變動後處理待落焦點
  useEffect(() => {
    const index = focusAfterRemove.current;
    if (index === null) return;
    focusAfterRemove.current = null;
    const items = Array.from(listRef.current?.querySelectorAll('li') ?? []);
    for (let i = Math.min(index, items.length - 1); i >= 0; i -= 1) {
      const target = items[i].querySelector<HTMLElement>('button');
      if (target) return target.focus();
    }
    listRef.current?.focus();
  }, [slots]);

  const full = slots.length >= maxCount;
  const waiting = slots.some((s) => s.state === 'awaiting_crop' || s.state === 'preparing');
  const hint = full
    ? `已選滿 ${maxCount} 張；要換照片請先移除一張`
    : waiting
      ? '請稍候，正在準備照片'
      : slots.length === 0
        ? `尚未選擇照片（需要 ${maxCount} 張）`
        : `還可以再選 ${maxCount - slots.length} 張`;

  return (
    <div className="space-y-3">
      <div role="status" aria-live="polite" className="sr-only">
        {photos.announcement}
      </div>

      <ul
        data-photo-list
        ref={listRef}
        tabIndex={-1}
        aria-label="已選擇的照片"
        className="grid grid-cols-3 gap-3 outline-none scroll-mt-20"
      >
        {slots.map((slot, i) => {
          const n = i + 1;
          const src = slot.previewUrl ?? slot.url;
          return (
            <li key={slot.id} className="space-y-2">
              <div className="aspect-square overflow-hidden rounded-md bg-muted">
                {src && (
                  <img src={src} alt={`第 ${n} 張照片`} className="h-full w-full object-cover" />
                )}
              </div>
              <p className="min-h-5 break-words text-xs text-muted-foreground">
                {slot.state === 'failed' || slot.state === 'unprocessable'
                  ? slot.message
                  : (STATUS_TEXT[slot.state] ?? (slot.downscaled ? '已自動縮小' : ''))}
              </p>
              <div className="flex flex-wrap gap-1">
                <SlotButtons
                  slot={slot}
                  n={n}
                  photos={photos}
                  onRemove={() => {
                    focusAfterRemove.current = i;
                    photos.remove(slot.id);
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <label className="inline-block">
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={full || waiting}
          className="peer sr-only"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length > 0) photos.addFiles(files);
          }}
        />
        <span className="inline-flex min-h-11 cursor-pointer items-center rounded-md border px-4 text-sm peer-focus-visible:ring-[3px] peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
          選取照片
        </span>
      </label>
      <p className="text-sm text-muted-foreground">{hint}</p>
      {photos.notice && <p className="text-sm text-warning">{photos.notice}</p>}

      {pendingCrop &&
        (holding ? (
          <CropToolPending />
        ) : (
          <CropBoundary key={attempt} onReload={reload}>
            <Suspense fallback={<CropToolPending />}>
              <CropDialog
                key={pendingCrop.slotId}
                ordinal={slots.findIndex((s) => s.id === pendingCrop.slotId) + 1}
                previewUrl={pendingCrop.previewUrl}
                onConfirm={(crop, natural) => photos.confirmCrop(pendingCrop.slotId, crop, natural)}
                onCancel={() => photos.cancelCrop(pendingCrop.slotId)}
              />
            </Suspense>
          </CropBoundary>
        ))}
    </div>
  );
}
