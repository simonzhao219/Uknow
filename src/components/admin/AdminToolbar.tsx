import { type ReactNode, useEffect, useId, useRef } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';

export interface AdminToolbarProps {
  /** 篩選欄位（狀態 Select、搜尋 form…）。吃掉工具列的剩餘寬度；沒有篩選的頁面鈕靠右。 */
  filter?: ReactNode;
  /** 點擊一律交給頁面：更新途中要不要重送、狀態文字寫什麼，由 `useRefreshAnnouncer` 決定。 */
  onRefresh: () => void;
  /**
   * 首次載入或背景更新中（慢更新時為 false，放行重新整理）：鈕標 `aria-disabled`、圖示轉動，
   * 點擊照樣交出。不用原生 disabled——被按的鈕變停用，焦點會掉到 body。
   */
  isUpdating: boolean;
  /** 手動重新整理的結果（「正在更新」「已更新 09:05」…）；可見字即播報字。 */
  statusText?: string;
  /** 真停用、點了不呼叫 `onRefresh`：載入更多進行中（舊頁尾不得接到重設的列表上）。 */
  refreshDisabled?: boolean;
  /** CSV 停用的原因（狀態行或錯誤區的 id）。 */
  exportDescribedBy?: string;
  exportPaused?: boolean;
  exportPausedVisible?: boolean;
  /** 只有已具匯出邏輯的頁面才傳——沒傳就不渲染 CSV 鈕（規則見 ui-ux-guidelines §3）。 */
  onExport?: () => void;
  isExporting?: boolean;
  /** 有匯出能力但目前沒東西可匯（空清單、列表載入中）：鈕照樣在、只是按不下去，版面不跳。 */
  canExport?: boolean;
  /** 整列停用（匯出期間）：收集迴圈用的是按下當下的篩選，期間重新整理會讓檔案與畫面不一致。 */
  disabled?: boolean;
}

// icon 鈕：手機只有 icon（`size="icon"` 在觸控裝置撐到 44px），md 起帶文字。
// `md:pointer-coarse:w-auto`：`size="icon"` 的 `pointer-coarse:size-[44px]` 在觸控的
// md 以上（平板）會蓋掉 `md:w-auto`，帶文字的鈕被擠回 44px 寬。
const ICON_TO_LABELED = 'md:w-auto md:px-3 md:pointer-coarse:w-auto';

const EXPORT_NAME = '下載 CSV（含身分證與帳號）';
const EXPORTING_NAME = '匯出中…';

/**
 * 後台列表的工具列（S3 A2）：`[篩選（flex-1）][重新整理][CSV?]`，手機一行。
 *
 * 權重照使用頻率排：重新整理在前、CSV 在最右，兩者都是次要動作（§12.11）。
 * 純呈現——資料、狀態、動作全由呼叫端注入（同 AdminDashboard 的 props 注入慣例）。
 *
 * 名稱：重新整理只有一段字，放 `sr-only md:not-sr-only` 即可；CSV 鈕的名稱比可見字
 * 長（多了敏感資料提示），整串放一個節點由 aria-labelledby 指過去（§9 的寫法）。
 */
export function AdminToolbar({
  filter,
  onRefresh,
  isUpdating,
  statusText = '',
  refreshDisabled = false,
  exportDescribedBy,
  onExport,
  isExporting = false,
  canExport = true,
  disabled = false,
}: AdminToolbarProps) {
  const exportNameId = useId();
  const exportRef = useRef<HTMLButtonElement>(null);
  const wasExporting = useRef(isExporting);

  // 匯出中 CSV 鈕被停用，按它的人焦點掉到 body；結束時還回來。使用者已經把焦點
  // 移到別處（例如去改篩選）就不搶。
  useEffect(() => {
    if (wasExporting.current && !isExporting) {
      const active = document.activeElement;
      if (!active || active === document.body) exportRef.current?.focus();
    }
    wasExporting.current = isExporting;
  }, [isExporting]);

  return (
    <>
      <div
        data-slot="admin-toolbar"
        className={cn('flex flex-nowrap items-center gap-2', !filter && 'justify-end')}
      >
        {filter && <div className="min-w-0 flex-1">{filter}</div>}
        <Button
          type="button"
          tone="secondary"
          size="icon"
          // Button 基底只有 disabled: 的灰化；aria-disabled 的外觀在這裡補，但不擋 pointer。
          className={cn(
            ICON_TO_LABELED,
            'aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
          )}
          onClick={onRefresh}
          disabled={disabled || refreshDisabled}
          aria-disabled={isUpdating || undefined}
        >
          <RefreshCw
            aria-hidden="true"
            className={isUpdating ? 'motion-safe:animate-spin' : undefined}
          />
          <span className="sr-only md:not-sr-only">重新整理</span>
        </Button>
        {onExport && (
          <Button
            ref={exportRef}
            type="button"
            tone="secondary"
            size="icon"
            className={ICON_TO_LABELED}
            onClick={onExport}
            disabled={disabled || !canExport}
            loading={isExporting}
            aria-labelledby={exportNameId}
            aria-describedby={exportDescribedBy}
            // 桌機滑過時看得到「含敏感資料」；手機與報讀靠名稱裡的同一段字。
            title={EXPORT_NAME}
          >
            {/* loading 時 Button 自己插轉圈，這裡不再放 Download，免得兩個 icon。 */}
            {!isExporting && <Download aria-hidden="true" />}
            <span aria-hidden="true" className="hidden md:inline">
              {isExporting ? EXPORTING_NAME : '下載 CSV'}
            </span>
            <span id={exportNameId} className="sr-only">
              {isExporting ? EXPORTING_NAME : EXPORT_NAME}
            </span>
          </Button>
        )}
      </div>
      {/* 匯出可能要好幾秒（多頁收集）。live region 要在內容出現**之前**就掛在 DOM 上，
          播報才可靠——所以常駐、只切換文字。放在工具列那一行**外面**：sr-only 是
          absolute 定位，留在 flex 行裡會被版面量測當成第二行、也會攪亂按鈕間距。 */}
      {onExport && (
        <span role="status" className="sr-only">
          {isExporting ? '匯出中，完成前無法切換分頁' : ''}
        </span>
      )}
      {/* 手動重新整理的狀態文字：常駐（live region 要先在才念得出來）、只換文字；同樣
          放在工具列那一行外面。不用 role="status"——那是列表骨架的定位器。空字串時
          沒有高度也沒有外距，版面不跳。 */}
      <p aria-live="polite" className="mt-1 text-xs text-muted-foreground empty:mt-0">
        {statusText}
      </p>
    </>
  );
}
