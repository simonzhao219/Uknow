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
}

export function AdminListError({ message, retryLabel, tone, onRetry, id }: AdminListErrorProps) {
  return (
    <div id={id} role="alert" className="space-y-3 py-12 text-center">
      <p className="text-muted-foreground">{message}</p>
      <Button tone={tone} onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}
