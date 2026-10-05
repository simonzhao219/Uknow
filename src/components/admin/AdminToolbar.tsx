import type { ReactNode } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';

export interface AdminToolbarProps {
  /** 篩選欄位（狀態 Select、搜尋 form…）。吃掉工具列的剩餘寬度。 */
  filter: ReactNode;
  onRefresh: () => void;
  isRefreshing: boolean;
  /** 只有已具匯出邏輯的頁面才傳——沒傳就不渲染 CSV 鈕（匯出是功能，不是工具列附贈的）。 */
  onExport?: () => void;
  isExporting?: boolean;
  /** 整列停用（匯出期間）：收集迴圈用的是按下當下的篩選，期間重新整理會讓檔案與畫面不一致。 */
  disabled?: boolean;
}

// icon 鈕：手機只有 icon（`size="icon"` 在觸控裝置撐到 44px），md 起帶文字。
// 名稱一律由文字承擔——文字放在 `sr-only md:not-sr-only` 裡、不另設 aria-label：
// 手機與桌機的可及名稱同源，忙碌時換掉的文字（匯出中…）也會被念出來。
const ICON_TO_LABELED = 'md:w-auto md:px-3 md:pointer-coarse:w-auto';

/**
 * 後台列表的工具列（S3 A2）：`[篩選（flex-1）][重新整理][CSV?]`，手機一行。
 *
 * 權重照使用頻率排：重新整理在前、CSV 在最右，兩者都是次要動作（§12.11）。
 * 純呈現——資料、狀態、動作全由呼叫端注入（同 AdminDashboard 的 props 注入慣例）。
 */
export function AdminToolbar({
  filter,
  onRefresh,
  isRefreshing,
  onExport,
  isExporting = false,
  disabled = false,
}: AdminToolbarProps) {
  return (
    <div className="flex flex-nowrap items-center gap-2">
      <div className="min-w-0 flex-1">{filter}</div>
      <Button
        type="button"
        tone="secondary"
        size="icon"
        className={ICON_TO_LABELED}
        onClick={onRefresh}
        disabled={disabled || isRefreshing}
      >
        <RefreshCw aria-hidden="true" />
        <span className="sr-only md:not-sr-only">重新整理</span>
      </Button>
      {onExport && (
        <Button
          type="button"
          tone="secondary"
          size="icon"
          className={ICON_TO_LABELED}
          onClick={onExport}
          disabled={disabled}
          loading={isExporting}
          // 桌機滑過時看得到「含敏感資料」；手機與報讀靠名稱裡的同一段字。
          title="下載 CSV（含身分證與帳號）"
        >
          {/* loading 時 Button 自己插轉圈，這裡不再放 Download，免得兩個 icon。 */}
          {!isExporting && <Download aria-hidden="true" />}
          <span className="sr-only md:not-sr-only">
            {isExporting ? (
              '匯出中…'
            ) : (
              <>
                下載 CSV<span className="sr-only">（含身分證與帳號）</span>
              </>
            )}
          </span>
        </Button>
      )}
      {/* 匯出可能要好幾秒（多頁收集）。按鈕一 disabled 焦點就掉了，狀態另外宣告。 */}
      <span role="status" className="sr-only">
        {isExporting ? '匯出中' : ''}
      </span>
    </div>
  );
}
