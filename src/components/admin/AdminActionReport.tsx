import { type AriaRole, useEffect, useRef } from 'react';
import { StatusCallout } from '../ui/status-callout';
import { Button } from '../ui/button';

/**
 * 提領頁的動作回報（工具列正下方）。刻意**留在畫面上**而不是彈個 toast 就消失：admin 做完
 * 一筆會切去網銀，回來時 toast 早就沒了，於是不確定剛才那下到底送出去沒有。
 *
 * 兩個兄弟節點，不巢狀：
 * - 狀態容器：常駐（live region 要先在才念得出來）、空時不佔高、`role="status"`。裡面的
 *   StatusCallout 以 `NO_LIVE_ROLE` 覆寫掉它預設的 status——可見字與播報字是同一個
 *   節點，文字在 DOM 裡只出現一次（e2e 與 journey 以文字找它，重複就 strict mode violation）。
 *   成功用 success；「列表已更新，請重新勾選」是批次被取消的警示，用 warning。
 * - 失敗容器：只在有失敗時渲染、`role="alert"`。**剛按下的**動作失敗時捲進視線並取得焦點，
 *   晚到的不搶焦點（`focusFailure` 由頁面判斷）。
 * 兩者都帶 `scroll-mt-20`：導覽列是 sticky、高 64px，不加就會被蓋住。
 */
// StatusCallout 預設帶 role="status"；放進容器裡時要覆寫成沒有 role，可見字與播報字才是同一個節點。
const NO_LIVE_ROLE: AriaRole | undefined = undefined;

export interface AdminActionReportProps {
  status: { tone: 'success' | 'warning'; text: string } | null;
  failure: string | null;
  focusFailure?: boolean;
  /** 「知道了」：收起回報（焦點去哪由頁面決定）。 */
  onDismiss: () => void;
}

export function AdminActionReport({
  status,
  failure,
  focusFailure = false,
  onDismiss,
}: AdminActionReportProps) {
  const failureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!failure || !focusFailure) return;
    failureRef.current?.scrollIntoView({ block: 'nearest' });
    failureRef.current?.focus();
  }, [failure, focusFailure]);

  return (
    <>
      <div role="status" className="scroll-mt-20">
        {status && (
          <div className="mt-3 flex items-center gap-2">
            <StatusCallout
              variant={status.tone}
              role={NO_LIVE_ROLE}
              title={status.text}
              className="flex-1 py-2"
            />
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              知道了
            </Button>
          </div>
        )}
      </div>
      {failure && (
        <div ref={failureRef} role="alert" tabIndex={-1} className="mt-3 scroll-mt-20">
          <div className="flex items-center gap-2">
            <StatusCallout
              variant="destructive"
              role={NO_LIVE_ROLE}
              title={failure}
              className="flex-1 py-2"
            />
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              知道了
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
