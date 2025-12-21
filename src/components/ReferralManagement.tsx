import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ArrowLeft, Share2, Users, Loader2, Copy } from 'lucide-react';
import { ReferralStats } from './referral/ReferralStats';
import { ReferralTreeView } from './referral/ReferralTreeView';
import { useNotification } from './notifications/NotificationContext';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';

interface ReferralListing {
  id: string;
  title: string;
  serviceType: string;
  city: string;
  ownerName: string;
  userId: string;
  activeUntil: string;
  isActive: boolean;
  photos: string[];
}

interface MyListing {
  id: string;
  title: string;
  serviceType: string;
  city: string;
  referralCode: string;
  activeUntil: string;
  isActive: boolean;
}

interface ReferralTree {
  myListing: MyListing;
  firstGeneration: ReferralListing[];
  secondGeneration: ReferralListing[];
  thirdGeneration: ReferralListing[];
}

interface ReferralSummary {
  totalReferrals: number;
  firstGenCount: number;
  secondGenCount: number;
  thirdGenCount: number;
}

interface ReferralData {
  trees: ReferralTree[];
  summary: ReferralSummary;
}

export function ReferralManagement() {
  const { showToast } = useNotification();
  const handleBack = useBackNavigation();
  
  const [loading, setLoading] = useState(true);
  const [referralData, setReferralData] = useState<ReferralData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReferralData();
  }, []);

  const fetchReferralData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔍 開始獲取推薦數據...');
      
      // ✅ 使用統一的 API 請求工具
      const result = await apiRequestJson<{ success: boolean; data: ReferralData }>(
        buildApiUrl('/referrals/my-tree')
      );
      
      if (result.success) {
        console.log('✅ 推薦數據獲取成功:', result.data);
        setReferralData(result.data);
      } else {
        throw new Error('獲取推薦數據失敗');
      }
      
    } catch (err: any) {
      console.error('💥 獲取推薦數據錯誤:', err);
      
      if (err instanceof ApiError && err.status === 401) {
        setError('登入已過期，請重新登入');
        showToast('登入已過期，請重新登入', 'error');
      } else {
        setError(err.message || '載入失敗，請稍後再試');
        showToast(err.message || '載入推薦數據失敗', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const copyReferralCode = (code: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = code;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      showToast('推薦碼已複製到剪貼簿！', 'success');
    } catch (err) {
      console.error('複製失敗:', err);
      showToast('複製失敗', 'error');
    }
    document.body.removeChild(textArea);
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={handleBack}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">推薦管理</h1>
            <p className="text-muted-foreground">管理您的推薦碼與推薦關係</p>
          </div>
        </div>
        
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">載入推薦數據中...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={handleBack}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">推薦管理</h1>
            <p className="text-muted-foreground">管理您的推薦碼與推薦關係</p>
          </div>
        </div>
        
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={fetchReferralData}>重試</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={handleBack}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">推薦管理</h1>
          <p className="text-muted-foreground">管理您的推薦碼與推薦關係</p>
        </div>
      </div>

      {/* 統計卡片 */}
      <ReferralStats 
        firstLevelCount={referralData?.summary.firstGenCount || 0}
        secondLevelCount={referralData?.summary.secondGenCount || 0}
        thirdLevelCount={referralData?.summary.thirdGenCount || 0}
      />

      {/* 推薦碼管理 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            我的推薦碼
          </CardTitle>
          <CardDescription>
            每個刊登都有專屬的推薦碼，點選查看該推薦碼的推薦關係
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!referralData || referralData.trees.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">您還沒有刊登</p>
              <p className="text-sm text-muted-foreground mt-2">
                刊登服務後將自動生成推薦碼
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {referralData.trees.map((tree) => (
                <ReferralTreeView
                  key={tree.myListing.id}
                  tree={tree}
                  onCopyCode={copyReferralCode}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}