// degraded 提示（T1-B auth-transient-resilience §4.1；文案 W4-15、登出鈕 W4-16）。
//
// 純呈現：不讀 context、不 import App。守衛外框傳 context 的 retryAuth，結帳頁傳自己的重讀。
// - 首次出現不搶焦點（ui-ux §9），靠 StatusCallout 內建的 role="status" 播報；重試又失敗時
//   說明換字（live region 內容變更，至少播報一次）。
// - 重試中鈕留在 DOM、換字並 aria-disabled（ui-ux §9），焦點不會掉；登出進行中同理。
// - Button 基底不給 aria-disabled 停用外觀（F1），灰化 class 自己補。
import { useRef, useState } from 'react';
import { Button } from './ui/button';
import { StatusCallout } from './ui/status-callout';

const BUSY_LOOK = 'aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

export interface AuthDegradedNoticeProps {
  onRetry: () => void;
  onSignOut: () => void | Promise<void>;
  isRetrying: boolean;
  /** 重試後仍失敗。 */
  failedAgain: boolean;
}

export function AuthDegradedNotice({
  onRetry,
  onSignOut,
  isRetrying,
  failedAgain,
}: AuthDegradedNoticeProps) {
  const [signingOut, setSigningOut] = useState(false);
  const signingOutRef = useRef(false);

  const handleRetry = () => {
    if (isRetrying || signingOutRef.current) return;
    onRetry();
  };

  const handleSignOut = () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    setSigningOut(true);
    void onSignOut();
  };

  return (
    <StatusCallout
      variant="warning"
      data-testid="auth-degraded"
      className="scroll-mt-20"
      titleAs="h2"
      title="網路不穩，正在重新連線"
      description={failedAgain ? '仍無法連線，請稍後按重試' : '請稍後按重試'}
      action={
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            tone="secondary"
            container="warning"
            aria-disabled={signingOut || undefined}
            className={BUSY_LOOK}
            onClick={handleSignOut}
          >
            登出
          </Button>
          <Button
            type="button"
            container="warning"
            aria-disabled={isRetrying || signingOut || undefined}
            className={BUSY_LOOK}
            onClick={handleRetry}
          >
            {isRetrying ? '重新連線中…' : '重試'}
          </Button>
        </div>
      }
    />
  );
}
