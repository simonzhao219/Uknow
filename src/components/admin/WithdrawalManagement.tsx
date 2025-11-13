import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Checkbox } from '../ui/checkbox';
import { mockWithdrawals, mockUsers } from '../../data/mockData';
import { CreditCard, Users, AlertCircle } from 'lucide-react';

export function WithdrawalManagement() {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [withdrawals, setWithdrawals] = useState(mockWithdrawals);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">待處理</Badge>;
      case 'processing':
        return <Badge variant="default">處理中</Badge>;
      case 'awaiting_confirmation':
        return <Badge className="bg-orange-500">待查收</Badge>;
      case 'completed':
        return <Badge variant="outline">已完成</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getUserName = (userId: string) => {
    const user = mockUsers.find(u => u.id === userId);
    return user?.name || '未知用戶';
  };

  const handleStatusChange = (withdrawalId: string, newStatus: string) => {
    setWithdrawals(prev => 
      prev.map(w => 
        w.id === withdrawalId 
          ? { ...w, status: newStatus, processedAt: newStatus === 'completed' ? new Date().toISOString() : w.processedAt }
          : w
      )
    );
  };

  const handleBatchStatusChange = (newStatus: string) => {
    setWithdrawals(prev => 
      prev.map(w => 
        selectedItems.includes(w.id)
          ? { ...w, status: newStatus, processedAt: newStatus === 'completed' ? new Date().toISOString() : w.processedAt }
          : w
      )
    );
    setSelectedItems([]);
  };

  const handleSelectItem = (withdrawalId: string, checked: boolean) => {
    if (checked) {
      setSelectedItems([...selectedItems, withdrawalId]);
    } else {
      setSelectedItems(selectedItems.filter(id => id !== withdrawalId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(withdrawals.map(w => w.id));
    } else {
      setSelectedItems([]);
    }
  };

  return (
    <div className="space-y-6">
      {/* 統計卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-blue-600" />
              待處理申請
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {withdrawals.filter(w => w.status === 'pending').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-orange-600" />
              處理中申請
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">
              {withdrawals.filter(w => w.status === 'processing').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertCircle className="h-5 w-5 text-purple-600" />
              待查收申請
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">
              {withdrawals.filter(w => w.status === 'awaiting_confirmation').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-green-600" />
              已完成申請
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {withdrawals.filter(w => w.status === 'completed').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 批次操作 */}
      {selectedItems.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <span className="text-sm">已選擇 {selectedItems.length} 項</span>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleBatchStatusChange('processing')}>
                  批次設為處理中
                </Button>
                <Button size="sm" onClick={() => handleBatchStatusChange('awaiting_confirmation')}>
                  批次設為待查收
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedItems([])}>
                  取消選擇
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 提領申請表格 */}
      <Card>
        <CardHeader>
          <CardTitle>獎金提領申請</CardTitle>
          <CardDescription>管理所有用戶的獎金提領申請</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedItems.length === withdrawals.length && withdrawals.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>會員</TableHead>
                <TableHead>金額</TableHead>
                <TableHead>實收金額</TableHead>
                <TableHead>申請時間</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {withdrawals.map((withdrawal) => (
                <TableRow key={withdrawal.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedItems.includes(withdrawal.id)}
                      onCheckedChange={(checked) => handleSelectItem(withdrawal.id, checked as boolean)}
                    />
                  </TableCell>
                  <TableCell>{getUserName(withdrawal.userId)}</TableCell>
                  <TableCell>${withdrawal.amount}</TableCell>
                  <TableCell>${withdrawal.actualAmount}</TableCell>
                  <TableCell>{new Date(withdrawal.appliedAt).toLocaleDateString('zh-TW')}</TableCell>
                  <TableCell>{getStatusBadge(withdrawal.status)}</TableCell>
                  <TableCell>
                    <Select
                      value={withdrawal.status}
                      onValueChange={(value) => handleStatusChange(withdrawal.id, value)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">待處理</SelectItem>
                        <SelectItem value="processing">處理中</SelectItem>
                        <SelectItem value="awaiting_confirmation">待查收</SelectItem>
                        <SelectItem value="completed" disabled={withdrawal.status !== 'awaiting_confirmation'}>
                          已完成
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}