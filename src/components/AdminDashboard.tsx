import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { WithdrawalManagement } from './admin/WithdrawalManagement';
import { MemberManagement } from './admin/MemberManagement';
import { DataMigrationTool } from './admin/DataMigrationTool';
import { DataRepairPanel } from './admin/DataRepairPanel';
import { AdminSetup } from './admin/AdminSetup';
import { ReferralChainDebugger } from './admin/ReferralChainDebugger';

export function AdminDashboard() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">平台管理</h1>
        <p className="text-muted-foreground">管理 Uknow 平台的所有功能</p>
      </div>

      <Tabs defaultValue="admin-setup" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="admin-setup">管理員設置</TabsTrigger>
          <TabsTrigger value="withdrawals">獎金提領管理</TabsTrigger>
          <TabsTrigger value="members">會員管理</TabsTrigger>
          <TabsTrigger value="repair">數據修復</TabsTrigger>
          <TabsTrigger value="referral-debug">推薦鏈調試</TabsTrigger>
          <TabsTrigger value="migration">數據遷移</TabsTrigger>
        </TabsList>

        <TabsContent value="admin-setup">
          <AdminSetup />
        </TabsContent>

        <TabsContent value="withdrawals">
          <WithdrawalManagement />
        </TabsContent>

        <TabsContent value="members">
          <MemberManagement />
        </TabsContent>

        <TabsContent value="repair">
          <DataRepairPanel />
        </TabsContent>

        <TabsContent value="referral-debug">
          <ReferralChainDebugger />
        </TabsContent>

        <TabsContent value="migration">
          <DataMigrationTool />
        </TabsContent>
      </Tabs>
    </div>
  );
}