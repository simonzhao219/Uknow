import { RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';

/**
 * 沒有任何資料時的讀取失敗：說出錯在哪、給一顆重試。靜默的空表格會讓 admin 以為
 * 今天沒人申請，而不是「沒讀到」。
 *
 * 錯誤字用中性色：規格書 §13 第 4 條——區塊讀取失敗不上紅，紅字留給使用者造成的錯誤。
 * 重試鈕依 ui-ux §12.11：整區失敗時重試是唯一出路→流程鈕；同頁另有流程鈕（公告的
 * 「發布公告」）時→次要。錯誤字與鈕名由頁面傳入，沿用各頁現況的字。
 */
export interface AdminListErrorProps {
  message: string;
  retryLabel: string;
  tone: 'flow' | 'secondary';
  onRetry: () => void;
  /** 停用的匯出鈕在沒有資料時以 aria-describedby 指向這裡。 */
  id?: string;
  /**
   * 重試進行中（業主裁決 A）：區塊留在原位（焦點不掉到 body），寫「正在更新…」、不以 alert
   * 打斷（狀態文字已在播「正在更新」）；鈕顯示進行中、按了不重送。
   */
  retrying?: boolean;
  /**
   * 沒有工具列的頁面（公告、證件審核）傳 true：沒有狀態文字代念「正在更新」，重試中的這一區
   * 改帶 `role="status"` 自己播（業主 Q7）。有工具列的頁面不傳，避免念兩次。
   */
  announceUpdating?: boolean;
}

export function AdminListError({
  message,
  retryLabel,
  tone,
  onRetry,
  id,
  retrying = false,
  announceUpdating = false,
}: AdminListErrorProps) {
  const role = retrying ? (announceUpdating ? 'status' : undefined) : 'alert';
  return (
    <div id={id} role={role} className="space-y-3 py-12 text-center">
      <p className="text-muted-foreground">{retrying ? '正在更新…' : message}</p>
      <Button
        tone={tone}
        aria-disabled={retrying || undefined}
        onClick={retrying ? undefined : onRetry}
      >
        {retrying && <RefreshCw aria-hidden="true" className="motion-safe:animate-spin" />}
        {retryLabel}
      </Button>
    </div>
  );
}
