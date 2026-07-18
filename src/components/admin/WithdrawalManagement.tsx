import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Download, Eye, Loader2, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { useNotification } from '../notifications/NotificationContext';
import { formatTwTimestamp, twDayOf } from '../../utils/twDate';
import type { AdminWithdrawalRecord, AdminWithdrawalsResponse } from '@contract';

// 提領生命週期（與後端 SQL 函數一致）：
//   pending（待處理）→ awaiting_collection（已匯款，待查收）
//                   → completed（用戶已確認查收）
//   pending → rejected（退件，點數自動退回）
const STATUS_LABEL: Record<string, string> = {
  pending:             '待處理',
  awaiting_collection: '待查收',
  completed:           '已完成',
  rejected:            '已退件',
};

function getStatusBadge(status: string) {
  switch (status) {
    case 'pending':             return <Badge variant="secondary">待處理</Badge>;
    case 'awaiting_collection': return <Badge className="bg-orange-500">待查收</Badge>;
    case 'completed':           return <Badge variant="outline">已完成</Badge>;
    case 'rejected':            return <Badge variant="destructive">已退件</Badge>;
    default:                    return <Badge variant="secondary">{status}</Badge>;
  }
}

interface IdCardDialogProps {
  record: AdminWithdrawalRecord;
  onClose: () => void;
}

function IdCardDialog({ record, onClose }: IdCardDialogProps) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>身分證照片查閱</DialogTitle>
          <DialogDescription>
            會員：{record.userName} | 身分證字號：{record.idNumber ?? '未設定'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">身分證正面</p>
            {record.idCardFrontUrl ? (
              <img src={record.idCardFrontUrl} alt="身分證正面" className="w-full h-auto rounded-lg border" />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center border rounded-lg">未上傳</p>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">身分證反面</p>
            {record.idCardBackUrl ? (
              <img src={record.idCardBackUrl} alt="身分證反面" className="w-full h-auto rounded-lg border" />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center border rounded-lg">未上傳</p>
            )}
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={onClose}>關閉</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function WithdrawalManagement() {
  const { showSuccess, showToast } = useNotification();

  const [withdrawals, setWithdrawals] = useState<AdminWithdrawalRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewRecord, setViewRecord] = useState<AdminWithdrawalRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminWithdrawalRecord | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchWithdrawals = useCallback(async () => {
    setIsLoading(true);
    try {
      const qs = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const result = await apiRequestJson<AdminWithdrawalsResponse>(
        buildApiUrl(`/admin/withdrawals${qs}`)
      );
      if (result.success) setWithdrawals(result.data.withdrawals);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '無法取得提領申請', 'error');
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    fetchWithdrawals();
  }, [fetchWithdrawals]);

  const updateStatus = async (record: AdminWithdrawalRecord, status: 'awaiting_collection' | 'rejected', note?: string) => {
    setProcessingId(record.id);
    try {
      const result = await apiRequestJson<{ success: boolean; error?: { message: string } }>(
        buildApiUrl(`/admin/withdrawals/${record.id}/status`),
        { method: 'POST', body: JSON.stringify({ status, note }) }
      );
      if (result.success) {
        showSuccess(
          status === 'awaiting_collection' ? '已標記匯款完成' : '已退件',
          status === 'awaiting_collection'
            ? `${record.userName} 的提領已轉為待查收`
            : `${record.userName} 的點數已退回`
        );
        await fetchWithdrawals();
      } else {
        showToast(result.error?.message ?? '狀態更新失敗', 'error');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '狀態更新失敗', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const downloadCSV = () => {
    const headers = ['會員', '提領金額', '手續費', '匯款金額', '收款銀行代號', '收款銀行帳號', '身分證字號', '申請時間', '狀態'];
    const rows = withdrawals.map((w) => [
      w.userName,
      String(w.amount + w.fee),
      String(w.fee),
      String(w.amount),
      w.bankCode ?? '未設定',
      w.bankAccount ?? '未設定',
      w.idNumber ?? '未設定',
      formatTwTimestamp(w.requestedAt),
      STATUS_LABEL[w.status] ?? w.status,
    ].join(','));

    const BOM = '﻿';
    const blob = new Blob([BOM + [headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `獎金提領申請_${twDayOf()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div className="space-y-6">
      {viewRecord && <IdCardDialog record={viewRecord} onClose={() => setViewRecord(null)} />}

      {rejectTarget && (
        <AlertDialog open onOpenChange={() => setRejectTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>確認退件？</AlertDialogTitle>
              <AlertDialogDescription>
                退件後，{rejectTarget.userName} 的 {rejectTarget.amount + rejectTarget.fee} P
                （含手續費）將自動退回其可提領點數。此操作無法復原。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const target = rejectTarget;
                  setRejectTarget(null);
                  if (target) updateStatus(target, 'rejected');
                }}
              >
                確認退件
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="全部狀態" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部狀態</SelectItem>
                  <SelectItem value="pending">待處理</SelectItem>
                  <SelectItem value="awaiting_collection">待查收</SelectItem>
                  <SelectItem value="completed">已完成</SelectItem>
                  <SelectItem value="rejected">已退件</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={fetchWithdrawals} disabled={isLoading}>
                <RefreshCw className="h-4 w-4 mr-2" />
                重新整理
              </Button>
              <Button variant="default" size="sm" onClick={downloadCSV} disabled={!withdrawals.length}>
                <Download className="h-4 w-4 mr-2" />
                下載CSV
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">共 {withdrawals.length} 筆申請</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>獎金提領申請</CardTitle>
          <CardDescription>
            匯款完成後標記「已匯款」，會員確認查收後自動轉為已完成；退件會自動退回點數
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : withdrawals.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">目前沒有提領申請</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>會員</TableHead>
                  <TableHead>扣點</TableHead>
                  <TableHead>匯款金額</TableHead>
                  <TableHead>收款銀行</TableHead>
                  <TableHead>收款帳號</TableHead>
                  <TableHead>申請時間</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>身分證照片</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withdrawals.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell>{w.userName}</TableCell>
                    <TableCell>{w.amount + w.fee} P</TableCell>
                    <TableCell>${w.amount}</TableCell>
                    <TableCell className="font-mono text-sm">{w.bankCode ?? '-'}</TableCell>
                    <TableCell className="font-mono text-sm">{w.bankAccount ?? '-'}</TableCell>
                    <TableCell className="text-sm">{formatTwTimestamp(w.requestedAt)}</TableCell>
                    <TableCell>{getStatusBadge(w.status)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => setViewRecord(w)}>
                        <Eye className="h-4 w-4 mr-1" />
                        查看
                      </Button>
                    </TableCell>
                    <TableCell>
                      {w.status === 'pending' ? (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => updateStatus(w, 'awaiting_collection')}
                            disabled={processingId === w.id}
                          >
                            已匯款
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setRejectTarget(w)}
                            disabled={processingId === w.id}
                          >
                            退件
                          </Button>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {w.status === 'awaiting_collection' ? '等待會員查收' : '—'}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
