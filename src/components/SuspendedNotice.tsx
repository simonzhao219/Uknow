import { Link } from 'react-router-dom';
import { Button } from './ui/button';
import { StatusCallout } from './ui/status-callout';

/**
 * 停權說明（規格書 §5.2）。會員區硬鎖（RequireMembershipRoute）與結帳頁（W5-5：停權者
 * 不得付款）共用同一份文案與出口——兩處各寫一份會分岔。停權是不可自助復原的狀態，
 * 出口只給「回首頁」；登出在頁首。
 */
export function SuspendedNotice() {
  return (
    <div className="space-y-3">
      <StatusCallout
        variant="destructive"
        title="帳號已停權"
        titleAs="h2"
        description="您的帳號目前處於停權狀態，會員功能、付款與刊登已暫停。 若有疑問請聯繫客服。"
      />
      <Button asChild tone="secondary" className="w-full">
        <Link to="/">回首頁</Link>
      </Button>
    </div>
  );
}
