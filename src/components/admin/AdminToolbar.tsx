import { type ReactNode, useEffect, useId, useRef } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';

export interface AdminToolbarProps {
  /** 篩選欄位（狀態 Select、搜尋 form…）。吃掉工具列的剩餘寬度。 */
  filter?: ReactNode;
  onRefresh: () => void;
  isUpdating: boolean;
  statusText?: string;
  refreshDisabled?: boolean;
  exportDescribedBy?: string;
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
  refreshDisabled = false,
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
      <div data-slot="admin-toolbar" className="flex flex-nowrap items-center gap-2">
        <div className="min-w-0 flex-1">{filter}</div>
        <Button
          type="button"
          tone="secondary"
          size="icon"
          className={ICON_TO_LABELED}
          onClick={onRefresh}
          disabled={disabled || isUpdating || refreshDisabled}
        >
          <RefreshCw aria-hidden="true" />
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
          {isExporting ? '匯出中' : ''}
        </span>
      )}
    </>
  );
}
