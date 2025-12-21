/**
 * Cancellation Dialog
 * 
 * Confirmation dialog for subscription cancellation
 * Shows important information about consequences
 * 
 * @component CancellationDialog
 */

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { AlertTriangle } from 'lucide-react';

interface CancellationDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  daysRemaining: number;
}

export function CancellationDialog({ open, onClose, onConfirm, daysRemaining }: CancellationDialogProps) {
  const [understood, setUnderstood] = useState(false);
  
  const handleConfirm = () => {
    onConfirm();
    setUnderstood(false);
  };
  
  const handleClose = () => {
    setUnderstood(false);
    onClose();
  };
  
  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-yellow-600" />
            </div>
            <AlertDialogTitle>確定要取消續訂嗎？</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-900 font-medium mb-2">
                取消續訂後的影響：
              </p>
              <ul className="space-y-1 text-sm text-yellow-800 list-disc list-inside">
                <li>您仍可使用服務至訂閱期限結束（剩餘 {daysRemaining} 天）</li>
                <li>期限結束後將進入 60 天寬限期</li>
                <li>寬限期內推薦碼仍可使用，但無法創建新刊登</li>
                <li>寬限期結束後，帳號將永久失效</li>
                <li>失效後推薦碼將無法使用，點數將歸零</li>
              </ul>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900 font-medium mb-2">
                💡 您隨時可以：
              </p>
              <ul className="space-y-1 text-sm text-blue-800 list-disc list-inside">
                <li>在到期前重新啟用自動續訂</li>
                <li>在寬限期內補繳年費���接續原訂閱期限）</li>
              </ul>
            </div>
            
            <div className="flex items-start gap-2 mt-4">
              <Checkbox
                id="understand"
                checked={understood}
                onCheckedChange={(checked) => setUnderstood(checked as boolean)}
              />
              <Label
                htmlFor="understand"
                className="text-sm cursor-pointer"
              >
                我了解取消續訂的影響，並確定要繼續
              </Label>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleClose}>
            返回
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!understood}
            className="bg-yellow-600 hover:bg-yellow-700"
          >
            確認取消續訂
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
