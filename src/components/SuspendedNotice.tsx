import type React from 'react';
import { StatusCallout } from './ui/status-callout';

/**
 * 停權說明（規格書 §5.2）。會員區硬鎖（RequireMembershipRoute）與結帳頁（W5-5：停權者
 * 不得付款）共用同一份文案——兩處各寫一份會分岔。出口由呼叫端依情境放進 `action`
 * （結帳頁：首購者「登出」、續費者「回首頁」；會員區沿用原本不放按鈕）。
 */
export function SuspendedNotice({ action }: { action?: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <StatusCallout
        variant="destructive"
        title="帳號已停權"
        titleAs="h2"
        description="您的帳號目前處於停權狀態，會員功能、付款與刊登已暫停。 若有疑問請聯繫客服。"
      />
      {action}
    </div>
  );
}
