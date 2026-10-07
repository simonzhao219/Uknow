import { RefreshCw } from 'lucide-react';
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
 * - 更新中（重試或重新整理之後、遮罩還沒解開時；業主裁決 A）：標題寫「正在更新…」、不帶
 *   live 角色（狀態文字已在播「正在更新」）；重試鈕留在原位——焦點不掉到 body——但顯示
 *   進行中、按了不重送。
 * N 用 `formatDataAge`：不到 1 分鐘寫「剛剛」。
 */
export interface AdminStaleNoticeProps {
  kind: 'failed' | 'slow' | 'updating';
  /** `formatDataAge` 的結果：「剛剛」或「N 分鐘前」。 */
  age: string;
  /** 失敗原因（後端原文）；只在失敗時顯示。 */
  reason?: string;
  /** 提領頁的遮罩說明：「收款資訊已隱藏，重試後顯示」等。 */
  hidden?: string;
  onRetry?: () => void;
  announce?: boolean;
  announceUpdating?: boolean;
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
  const updating = kind === 'updating';
  const title = updating
    ? '正在更新…'
    : `${kind === 'failed' ? '更新失敗' : '更新較久'}，以下是${when}的資料`;
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
          <Button
            tone="secondary"
            size="sm"
            aria-disabled={updating || undefined}
            onClick={updating ? undefined : onRetry}
          >
            {updating && <RefreshCw aria-hidden="true" className="motion-safe:animate-spin" />}
            重試
          </Button>
        )
      }
    />
  );
}
