import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Checkbox } from '../ui/checkbox';
import { Download, Settings, Eye } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

// 定義可選擇的欄位
interface ColumnConfig {
  id: string;
  label: string;
  enabled: boolean;
}

// 身分證照片查看 Dialog
interface IdCardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  idNumber: string;
  frontImage: string;
  backImage: string;
}

function IdCardDialog({ isOpen, onClose, userName, idNumber, frontImage, backImage }: IdCardDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>身分證照片查閱</DialogTitle>
          <DialogDescription>
            會員：{userName} | 身分證字號：{idNumber}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">身分證正面</p>
            <img 
              src={frontImage} 
              alt="身分證正面" 
              className="w-full h-auto rounded-lg border"
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">身分證反面</p>
            <img 
              src={backImage} 
              alt="身分證反面" 
              className="w-full h-auto rounded-lg border"
            />
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
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [idCardDialog, setIdCardDialog] = useState<{
    isOpen: boolean;
    userId: string | null;
  }>({ isOpen: false, userId: null });
  
  // 欄位選擇狀態
  const [columns, setColumns] = useState<ColumnConfig[]>([
    { id: 'member', label: '會員', enabled: true },
    { id: 'amount', label: '金額', enabled: true },
    { id: 'actualAmount', label: '實收金額', enabled: true },
    { id: 'bankCode', label: '收款銀行代號', enabled: true },
    { id: 'bankAccount', label: '收款銀行帳號', enabled: true },
    { id: 'idNumber', label: '身分證字號', enabled: true },
    { id: 'appliedAt', label: '申請時間', enabled: true },
    { id: 'status', label: '狀態', enabled: true },
  ]);

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
    // TODO: Replace with actual API call to get user data
    return '用戶';
  };

  // 獲取用戶資訊
  const getUserInfo = (userId: string) => {
    // TODO: Replace with actual API call to get user data
    return null;
  };

  // 獲取狀態文字
  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return '待處理';
      case 'processing':
        return '處理中';
      case 'awaiting_confirmation':
        return '待查收';
      case 'completed':
        return '已完成';
      default:
        return status;
    }
  };

  // 切換欄位顯示
  const toggleColumn = (columnId: string) => {
    setColumns(prev =>
      prev.map(col =>
        col.id === columnId ? { ...col, enabled: !col.enabled } : col
      )
    );
  };

  // 開啟身分證照片查看
  const openIdCardDialog = (userId: string) => {
    setIdCardDialog({ isOpen: true, userId });
  };

  // 關閉身分證照片查看
  const closeIdCardDialog = () => {
    setIdCardDialog({ isOpen: false, userId: null });
  };

  // 下載CSV
  const downloadCSV = () => {
    // 建立CSV標題
    const headers = columns
      .filter(col => col.enabled)
      .map(col => col.label)
      .join(',');

    // 建立CSV內容
    const rows = withdrawals.map(withdrawal => {
      const rowData: string[] = [];
      const userInfo = getUserInfo(withdrawal.userId);
      
      columns.forEach(col => {
        if (!col.enabled) return;
        
        switch (col.id) {
          case 'member':
            rowData.push(getUserName(withdrawal.userId));
            break;
          case 'amount':
            rowData.push(withdrawal.amount.toString());
            break;
          case 'actualAmount':
            rowData.push(withdrawal.actualAmount.toString());
            break;
          case 'bankCode':
            rowData.push(userInfo?.bankCode || '未設定');
            break;
          case 'bankAccount':
            rowData.push(userInfo?.bankAccount || '未設定');
            break;
          case 'idNumber':
            rowData.push(userInfo?.idNumber || '未設定');
            break;
          case 'appliedAt':
            rowData.push(new Date(withdrawal.appliedAt).toLocaleDateString('zh-TW'));
            break;
          case 'status':
            rowData.push(getStatusText(withdrawal.status));
            break;
        }
      });
      
      return rowData.join(',');
    });

    // 組合CSV內容
    const csv = [headers, ...rows].join('\n');

    // 建立BOM以支援中文
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    
    // 下載檔案
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `獎金提領申請_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

  // 取得當前查看的用戶資訊
  const currentViewUser = idCardDialog.userId ? getUserInfo(idCardDialog.userId) : null;

  return (
    <div className="space-y-6">
      {/* 身分證照片查看 Dialog */}
      {currentViewUser && (
        <IdCardDialog
          isOpen={idCardDialog.isOpen}
          onClose={closeIdCardDialog}
          userName={currentViewUser.name}
          idNumber={currentViewUser.idNumber}
          frontImage={currentViewUser.idCardFrontImage || ''}
          backImage={currentViewUser.idCardBackImage || ''}
        />
      )}

      {/* 批次操作和匯出功能 */}
      {selectedItems.length > 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm">已選擇 {selectedItems.length} 項</span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleBatchStatusChange('processing')}>
                    批次設為處理中
                  </Button>
                  <Button size="sm" onClick={() => handleBatchStatusChange('awaiting_confirmation')}>
                    批次設為待查收
                  </Button>
                  <Button size="sm" onClick={() => handleBatchStatusChange('completed')}>
                    批次設為已完成
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSelectedItems([])}>
                    取消選擇
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      選擇欄位
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56" align="start">
                    <div className="space-y-2">
                      <p className="text-sm font-medium mb-3">選擇要顯示的欄位</p>
                      {columns.map(col => (
                        <div key={col.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={col.id}
                            checked={col.enabled}
                            onCheckedChange={() => toggleColumn(col.id)}
                          />
                          <label
                            htmlFor={col.id}
                            className="text-sm cursor-pointer"
                          >
                            {col.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <Button variant="default" size="sm" onClick={downloadCSV}>
                  <Download className="h-4 w-4 mr-2" />
                  下載CSV
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                共 {withdrawals.length} 筆申請
              </p>
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
                {columns.find(c => c.id === 'member')?.enabled && <TableHead>會員</TableHead>}
                {columns.find(c => c.id === 'amount')?.enabled && <TableHead>金額</TableHead>}
                {columns.find(c => c.id === 'actualAmount')?.enabled && <TableHead>實收金額</TableHead>}
                {columns.find(c => c.id === 'bankCode')?.enabled && <TableHead>收款銀行代號</TableHead>}
                {columns.find(c => c.id === 'bankAccount')?.enabled && <TableHead>收款銀行帳號</TableHead>}
                {columns.find(c => c.id === 'idNumber')?.enabled && <TableHead>身分證字號</TableHead>}
                {columns.find(c => c.id === 'appliedAt')?.enabled && <TableHead>申請時間</TableHead>}
                {columns.find(c => c.id === 'status')?.enabled && <TableHead>狀態</TableHead>}
                <TableHead>身分證照片</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {withdrawals.map((withdrawal) => {
                const userInfo = getUserInfo(withdrawal.userId);
                return (
                  <TableRow key={withdrawal.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedItems.includes(withdrawal.id)}
                        onCheckedChange={(checked) => handleSelectItem(withdrawal.id, checked as boolean)}
                      />
                    </TableCell>
                    {columns.find(c => c.id === 'member')?.enabled && (
                      <TableCell>{getUserName(withdrawal.userId)}</TableCell>
                    )}
                    {columns.find(c => c.id === 'amount')?.enabled && (
                      <TableCell>${withdrawal.amount}</TableCell>
                    )}
                    {columns.find(c => c.id === 'actualAmount')?.enabled && (
                      <TableCell>${withdrawal.actualAmount}</TableCell>
                    )}
                    {columns.find(c => c.id === 'bankCode')?.enabled && (
                      <TableCell className="font-mono text-sm">{userInfo?.bankCode || '-'}</TableCell>
                    )}
                    {columns.find(c => c.id === 'bankAccount')?.enabled && (
                      <TableCell className="font-mono text-sm">{userInfo?.bankAccount || '-'}</TableCell>
                    )}
                    {columns.find(c => c.id === 'idNumber')?.enabled && (
                      <TableCell className="font-mono text-sm">{userInfo?.idNumber || '-'}</TableCell>
                    )}
                    {columns.find(c => c.id === 'appliedAt')?.enabled && (
                      <TableCell>{new Date(withdrawal.appliedAt).toLocaleDateString('zh-TW')}</TableCell>
                    )}
                    {columns.find(c => c.id === 'status')?.enabled && (
                      <TableCell>{getStatusBadge(withdrawal.status)}</TableCell>
                    )}
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openIdCardDialog(withdrawal.userId)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        查看
                      </Button>
                    </TableCell>
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
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}