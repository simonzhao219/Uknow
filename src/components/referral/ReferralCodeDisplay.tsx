/**
 * Referral Code Display Component
 * 
 * Displays user's referral code with copy functionality
 * Shows usage statistics
 * 
 * @component ReferralCodeDisplay
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { 
  Copy, 
  Check, 
  Share2, 
  Users,
  Loader2
} from 'lucide-react';
import { useNotification } from '../notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { getAccessToken } from '../../utils/auth';

interface ReferralCodeData {
  code: string;
  createdAt: Date | string;
  usageCount: number;
  status: string;
}

export function ReferralCodeDisplay() {
  const [data, setData] = useState<ReferralCodeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  
  const { showToast } = useNotification();
  
  useEffect(() => {
    fetchCode();
  }, []);
  
  const fetchCode = async () => {
    setIsLoading(true);
    
    try {
      const token = await getAccessToken();
      
      if (!token) {
        showToast('請先登入', 'error');
        return;
      }
      
      const result = await apiRequestJson<{
        success: boolean;
        data: ReferralCodeData;
        error?: { message: string };
      }>(buildApiUrl('/referrals-v2/my-code'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (result.success) {
        setData(result.data);
      } else {
        showToast(result.error?.message || '載入失敗', 'error');
      }
    } catch (error) {
      console.error('Failed to fetch referral code:', error);
      showToast('載入推薦碼失敗', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleCopy = async () => {
    if (!data) return;
    
    try {
      await navigator.clipboard.writeText(data.code);
      setCopied(true);
      showToast('推薦碼已複製', 'success');
      
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      showToast('複製失敗', 'error');
    }
  };
  
  const handleShare = async () => {
    if (!data) return;
    
    const shareText = `加入 Uknow 平台！使用我的推薦碼：${data.code}`;
    const shareUrl = `${window.location.origin}/signup?referralCode=${data.code}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Uknow 推薦碼',
          text: shareText,
          url: shareUrl
        });
        showToast('分享成功', 'success');
      } catch (error) {
        // User cancelled or error occurred
        console.log('Share cancelled or failed:', error);
      }
    } else {
      // Fallback: Copy to clipboard
      try {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        showToast('分享連結已複製', 'success');
      } catch (error) {
        console.error('Failed to copy share text:', error);
        showToast('分享失敗', 'error');
      }
    }
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </CardContent>
      </Card>
    );
  }
  
  if (!data) {
    return (
      <Card className="border-orange-200 bg-orange-50">
        <CardContent className="py-12 text-center">
          <p className="text-orange-900 mb-2">您尚未獲得推薦碼</p>
          <p className="text-sm text-orange-700">
            完成訂閱後即可獲得專屬推薦碼
          </p>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-purple-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Share2 className="h-5 w-5 text-blue-600" />
          我的推薦碼
        </CardTitle>
        <CardDescription>
          分享給朋友，雙方都能獲得獎勵
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Referral Code Display */}
        <div className="bg-white rounded-lg p-6 border-2 border-blue-300">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">您的專屬推薦碼</p>
            <div className="text-4xl font-bold text-blue-600 tracking-wider mb-4 font-mono">
              {data.code}
            </div>
            
            <div className="flex gap-2 justify-center">
              <Button
                onClick={handleCopy}
                variant="outline"
                className="flex-1 max-w-[200px]"
              >
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4 text-green-600" />
                    已複製
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    複製推薦碼
                  </>
                )}
              </Button>
              
              <Button
                onClick={handleShare}
                className="flex-1 max-w-[200px]"
              >
                <Share2 className="mr-2 h-4 w-4" />
                分享
              </Button>
            </div>
          </div>
        </div>
        
        {/* Usage Statistics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-4 border">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">使用次數</span>
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {data.usageCount}
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border">
            <div className="flex items-center gap-2 mb-2">
              <Badge className={`
                ${data.status === 'Active' ? 'bg-green-600' : 'bg-gray-400'}
              `}>
                {data.status === 'Active' ? '有效' : '失效'}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              建立於 {new Date(data.createdAt).toLocaleDateString('zh-TW')}
            </div>
          </div>
        </div>
        
        {/* Info */}
        <div className="bg-blue-100 rounded-lg p-4 border border-blue-200">
          <p className="text-sm text-blue-900 font-medium mb-2">
            💡 推薦獎勵說明
          </p>
          <ul className="space-y-1 text-sm text-blue-800 list-disc list-inside">
            <li>朋友使用您的推薦碼註冊並完成付費</li>
            <li>您每月可獲得 10 點獎勵（持續 12 個月）</li>
            <li>三代推薦制：您的推薦人再推薦，您也有獎勵</li>
            <li>獎勵點數可用於平台功能或提領</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
