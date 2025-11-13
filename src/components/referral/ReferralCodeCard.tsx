import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Alert, AlertDescription } from '../ui/alert';
import { Share2, Copy, Gift } from 'lucide-react';

interface ReferralCodeCardProps {
  referralCode?: string;
}

export function ReferralCodeCard({ referralCode }: ReferralCodeCardProps) {
  const [copiedCode, setCopiedCode] = useState(false);

  const copyReferralCode = () => {
    navigator.clipboard.writeText(referralCode || '');
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const shareReferralLink = () => {
    const referralLink = `https://uknow.app/register?ref=${referralCode}`;
    if (navigator.share) {
      navigator.share({
        title: 'Uknow 專業服務平台',
        text: '使用我的推薦碼加入 Uknow，一起享受專業服務！',
        url: referralLink
      });
    } else {
      navigator.clipboard.writeText(referralLink);
      alert('推薦連結已複製到剪貼簿！');
    }
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
            推薦獎金規則：您推薦的每位用戶成功訂閱服務提供者服務，您將獲得 $10 獎金。
            第一代下線的推薦成功，您也可獲得 $10 獎金。
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}