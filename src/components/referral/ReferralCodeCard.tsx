import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Alert, AlertDescription } from '../ui/alert';
import { Share2, Copy, Gift } from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import { shareReferralInvite } from '../../utils/referralInvite';

interface ReferralCodeCardProps {
  referralCode?: string;
}

export function ReferralCodeCard({ referralCode }: ReferralCodeCardProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const { showToast } = useNotification();

  const copyReferralCode = () => {
    // 使用傳統的 execCommand 方法（更可靠，不受 Clipboard API 權限限制）
    const textArea = document.createElement('textarea');
    textArea.value = referralCode || '';
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (err) {
      console.error('複製失敗:', err);
    }
    document.body.removeChild(textArea);
  };

  const shareReferralLink = () => {
    shareReferralInvite(referralCode || '', showToast);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Share2 className="h-5 w-5" />
          我的推薦碼
        </CardTitle>
        <CardDescription>
          分享您的專屬推薦碼，每成功推薦一人即可獲得 $10 獎金
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <Input
            value={referralCode || ''}
            readOnly
            className="font-mono text-lg text-center"
          />
          <Button onClick={copyReferralCode} variant="outline">
            <Copy className="h-4 w-4 mr-2" />
            {copiedCode ? '已複製' : '複製'}
          </Button>
          <Button onClick={shareReferralLink}>
            <Share2 className="h-4 w-4 mr-2" />
            分享
          </Button>
        </div>

        <Alert>
          <Gift className="h-4 w-4" />
          <AlertDescription>
            推薦獎金規則：您推薦的每位用戶成功訂閱服務者服務，您將獲得 $10 獎金。
            第一代下線的推薦成功，您也可獲得 $10 獎金。
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}