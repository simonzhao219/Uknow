/**
 * 刊登照片選取／狀態列表（Create／Edit 共用）。狀態機在 useListingPhotos，這裡只負責呈現與焦點。
 * 規格：規格書 §11；UI 準則見 ui-ux-guidelines §4。
 *
 * 取景對話框以 React.lazy 動態載入（react-easy-crop 留在 lazy chunk 內）；載入失敗＝顯示
 * 「請重新整理頁面」，該張維持等待取景而不可送出——**不會**偷偷改用自動置中裁。
 * 失敗的動態 import 會被瀏覽器依規格快取（同 URL 再 import 立刻失敗），所以不原地重試，
 * 也不自動重載（會丟掉已填表單）：由使用者按鈕主動整頁重新整理。
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
} from 'react';
import { X } from 'lucide-react';
import type { PhotoSlot, UseListingPhotosResult } from '../../hooks/useListingPhotos';
import { Button } from '../ui/button';
import type { PhotoCropDialogProps } from './PhotoCropDialog';

type DialogLoader = () => Promise<{ default: ComponentType<PhotoCropDialogProps> }>;

export interface PhotoPickerProps {
  photos: UseListingPhotosResult;
  maxCount: number;
  /** 載入裁切對話框的函式（測試注入失敗用）；預設動態 import。 */
  loadCropDialog?: DialogLoader;
  /** 整頁重新整理（測試注入用）；預設 window.location.reload。 */
  reloadPage?: () => void;
}

const defaultLoader: DialogLoader = () => import('./PhotoCropDialog');
const defaultReload = () => window.location.reload();

const STATUS_TEXT: Partial<Record<PhotoSlot['state'], string>> = {
  preparing: '處理中…',
  awaiting_crop: '等待取景',
  uploading: '上傳中…',
};

/** 首次載入中：按鈕 aria-disabled 並用文字說明，防連點。 */
function CropToolPending() {
  return (
    <div className="rounded-md border p-3 text-sm">
      <p>正在載入裁切工具…</p>
      <Button type="button" tone="secondary" className="mt-2 min-h-11" aria-disabled="true">
        載入中…
      </Button>
    </div>
  );
}

class CropBoundary extends Component<
  { onReload: () => void; onFailed: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailed();
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        className="rounded-md border border-warning-border bg-warning-subtle p-3 text-sm"
        role="alert"
      >
        <p>裁切工具載入失敗，需要重新整理頁面才能繼續；重新整理後已填寫的內容會清空。</p>
        <Button
          type="button"
          tone="secondary"
          className="mt-2 min-h-11"
          onClick={this.props.onReload}
          aria-label="重新整理頁面"
        >
          重新整理頁面
        </Button>
      </div>
    );
  }
}

/** 縮圖右上角的叉叉：視覺小圓鈕，觸控面積靠 padding 擴到 44px。 */
function RemoveButton({ n, onRemove }: { n: number; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`移除第 ${n} 張`}
      className="absolute top-0 right-0 flex size-11 items-start justify-end p-1.5 outline-none focus-visible:ring-[3px]"
    >
      <span className="flex size-6 items-center justify-center rounded-full bg-background/90 shadow">
        <X className="size-4" aria-hidden="true" />
      </span>
    </button>
  );
}

/** 失敗格才有文字鈕「重試」；其餘動作都在縮圖上（點縮圖＝調整、叉叉＝移除）。 */
function RetryButton({ slot, n, onRetry }: { slot: PhotoSlot; n: number; onRetry: () => void }) {
  if (slot.state !== 'failed') return null;
  return (
    <Button
      type="button"
      tone="secondary"
      size="sm"
      className="min-h-11"
      onClick={onRetry}
      aria-label={`重試第 ${n} 張`}
    >
      重試
    </Button>
  );
}

export function PhotoPicker({
  photos,
  maxCount,
  loadCropDialog = defaultLoader,
  reloadPage = defaultReload,
}: PhotoPickerProps) {
  const { slots, pendingCrop } = photos;
  const listRef = useRef<HTMLUListElement>(null);
  const focusAfterRemove = useRef<number | null>(null);
  const focusAfterRetry = useRef<string | null>(null);
  const loaderRef = useRef(loadCropDialog);
  loaderRef.current = loadCropDialog;
  const CropDialog = useMemo(() => lazy(() => loaderRef.current()), []);
  const prevCropId = useRef<string | null>(null);

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

  // 按「重試」後該格按鈕會卸載（failed → uploading），焦點交給該格的 li（tabIndex=-1）。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在 slots 變動後處理待落焦點
  useEffect(() => {
    const id = focusAfterRetry.current;
    if (id === null) return;
    const slot = slots.find((s) => s.id === id);
    if (slot?.state === 'failed') return;
    focusAfterRetry.current = null;
    listRef.current?.querySelector<HTMLElement>(`li[data-slot-id="${id}"]`)?.focus();
  }, [slots]);

  // 取景對話框整個佇列期間常駐；真的關閉（pendingCrop 清空）時，Radix 沒有觸發元件可還焦點，
  // 這裡把焦點交回剛處理完那一格的按鈕（沒有就列表容器），不掉到 body。
  const cropId = pendingCrop?.slotId ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在 pendingCrop 清空時處理
  useEffect(() => {
    const closed = prevCropId.current;
    prevCropId.current = cropId;
    if (closed === null || cropId !== null) return;
    const index = Math.max(
      0,
      slots.findIndex((s) => s.id === closed),
    );
    const items = Array.from(listRef.current?.querySelectorAll('li') ?? []);
    const target = items[Math.min(index, items.length - 1)]?.querySelector<HTMLElement>('button');
    (target ?? listRef.current)?.focus();
  }, [cropId]);

  const full = slots.length >= maxCount;
  const waiting = slots.some((s) => s.state === 'awaiting_crop' || s.state === 'preparing');
  const hint = photos.cropToolFailed
    ? '裁切工具載入失敗，需要重新整理頁面才能繼續'
    : full
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
            <li
              key={slot.id}
              data-slot-id={slot.id}
              tabIndex={-1}
              className="space-y-2 outline-none"
            >
              <div data-photo-thumb className="relative aspect-square">
                {slot.state === 'done' && slot.kind === 'new' ? (
                  <button
                    type="button"
                    onClick={() => photos.adjust(slot.id)}
                    aria-label={`調整第 ${n} 張範圍`}
                    className="block size-full overflow-hidden rounded-md bg-muted outline-none focus-visible:ring-[3px]"
                  >
                    {src && <img src={src} alt="" className="h-full w-full object-cover" />}
                  </button>
                ) : (
                  <div className="size-full overflow-hidden rounded-md bg-muted">
                    {src && (
                      <img
                        src={src}
                        alt={`第 ${n} 張照片`}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                )}
                {['failed', 'unprocessable', 'awaiting_crop', 'done'].includes(slot.state) && (
                  <RemoveButton
                    n={n}
                    onRemove={() => {
                      focusAfterRemove.current = i;
                      photos.remove(slot.id);
                    }}
                  />
                )}
              </div>
              <p className="min-h-5 break-words text-xs text-muted-foreground">
                {slot.state === 'failed' || slot.state === 'unprocessable'
                  ? slot.message
                  : slot.state === 'done' && slot.kind === 'existing'
                    ? '既有照片不能重新取景'
                    : (STATUS_TEXT[slot.state] ?? (slot.downscaled ? '已自動縮小' : ''))}
              </p>
              <RetryButton
                slot={slot}
                n={n}
                onRetry={() => {
                  focusAfterRetry.current = slot.id;
                  photos.retry(slot.id);
                }}
              />
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
            photos.addFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <span className="inline-flex min-h-11 cursor-pointer items-center rounded-md border px-4 text-sm peer-focus-visible:ring-[3px] peer-disabled:cursor-not-allowed peer-disabled:opacity-50">
          選取照片
        </span>
      </label>
      <p className="text-sm text-muted-foreground">{hint}</p>
      {photos.notice && <p className="text-sm text-warning">{photos.notice}</p>}

      {pendingCrop && (
        <CropBoundary onReload={reloadPage} onFailed={photos.reportCropToolFailed}>
          <Suspense fallback={<CropToolPending />}>
            <CropDialog
              ordinal={slots.findIndex((s) => s.id === pendingCrop.slotId) + 1}
              previewUrl={pendingCrop.previewUrl}
              onConfirm={(crop, natural) => photos.confirmCrop(pendingCrop.slotId, crop, natural)}
              onCancel={() => photos.cancelCrop(pendingCrop.slotId)}
            />
          </Suspense>
        </CropBoundary>
      )}
    </div>
  );
}
