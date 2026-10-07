import { StatusCallout } from '../ui/status-callout';
import { Button } from '../ui/button';

/**
 * 有舊資料時的「更新失敗／更新較久」提示，放在列表上方。
 *
 * 讀取失敗不上紅（規格書 §13 第 4 條），所以是 warning（§12.5 的第四種狀態併入 warning）。
 * - 失敗：以 alert 打斷一次；手動重新整理或重試觸發的失敗不帶 role——狀態文字已經播過
 *   「更新失敗」，不念第二次（`announce={false}`）。
 * - 逾時：不帶任何 live 角色，不打斷；有工具列的頁面靠重新整理鈕重試，沒有工具列的頁面
 *   （公告、證件審核）才給 `onRetry`。
 * N 用 `formatDataAge`：不到 1 分鐘寫「剛剛」。
 */
export interface AdminStaleNoticeProps {
  kind: 'failed' | 'slow';
  /** `formatDataAge` 的結果：「剛剛」或「N 分鐘前」。 */
  age: string;
  /** 失敗原因（後端原文）。 */
  reason?: string;
  /** 提領頁：「收款資訊已隱藏，重試後顯示」。 */
  hidden?: string;
  onRetry?: () => void;
  announce?: boolean;
}

export function AdminStaleNotice({
  kind,
  age,
  reason,
  hidden,
  onRetry,
  announce = true,
}: AdminStaleNoticeProps) {
  const when = age === '剛剛' ? '剛剛' : ` ${age}`;
  const title = `${kind === 'failed' ? '更新失敗' : '更新較久'}，以下是${when}的資料`;
  const details = [kind === 'failed' ? reason : undefined, hidden].filter(Boolean);
  return (
    <StatusCallout
      variant="warning"
      // StatusCallout 預設 role="status"；這裡只在失敗且該打斷時用 alert，其餘一律不帶。
      role={kind === 'failed' && announce ? 'alert' : undefined}
      title={title}
      description={details.length > 0 ? details.map((line) => <p key={line}>{line}</p>) : undefined}
      action={
        onRetry && (
          <Button tone="secondary" size="sm" onClick={onRetry}>
            重試
          </Button>
        )
      }
    />
  );
}
