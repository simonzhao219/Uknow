import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { WithdrawalManagement } from './admin/WithdrawalManagement';
import { MemberManagement } from './admin/MemberManagement';
import { SystemNotifications } from './admin/SystemNotifications';
import { SystemAlerts } from './admin/SystemAlerts';
import { AdminSetup } from './admin/AdminSetup';

export function AdminDashboard() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">平台管理</h1>
        <p className="text-muted-foreground">管理 Uknow 平台的所有功能</p>
      </div>

      <Tabs defaultValue="withdrawals" className="w-full">
        {/* grid-cols-5 的欄是 minmax(0,1fr)，會把五個中文標籤壓到比文字還窄
            （375px 下每格僅約 69px，最長的「獎金提領管理」需要約 100px）。
            桌面寬度夠、等寬排列好看，所以只在 md 以上維持 grid；手機交回
            TabsList 的 flex + 橫向捲動，標籤保持完整可讀。 */}
        <TabsList className="w-full md:grid md:grid-cols-5">
          <TabsTrigger value="withdrawals">獎金提領管理</TabsTrigger>
          <TabsTrigger value="members">會員管理</TabsTrigger>
          <TabsTrigger value="announcements">公告管理</TabsTrigger>
          <TabsTrigger value="system-alerts">系統告警</TabsTrigger>
          <TabsTrigger value="admin-setup">管理員設置</TabsTrigger>
        </TabsList>

        <TabsContent value="withdrawals">
          <WithdrawalManagement />
        </TabsContent>

        <TabsContent value="members">
          <MemberManagement />
        </TabsContent>

        <TabsContent value="announcements">
          <SystemNotifications />
        </TabsContent>

        <TabsContent value="system-alerts">
          <SystemAlerts />
        </TabsContent>

        <TabsContent value="admin-setup">
          <AdminSetup />
        </TabsContent>
      </Tabs>
    </div>
  );
}
