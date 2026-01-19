import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ArrowLeft, Share2, Users, Loader2, Copy, Check, Bug } from 'lucide-react';
import { ReferralStats } from './referral/ReferralStats';
import { ReferralTreeView } from './referral/ReferralTreeView';
import { ReferralDebugger } from './debug/ReferralDebugger';
import { useNotification } from './notifications/NotificationContext';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { usePageRestoration } from '../hooks/usePageRestoration';
import { apiRequestJson, buildApiUrl, ApiError } from '../utils/apiClient';

/**
 * ✅ 推薦成員接口（以用戶為核心，包含推薦碼）
 */
interface ReferralMember {
  userId: string;
  userName: string;
  userReferralCode: string | null;  // ✅ 被推薦者的推薦碼
  listingId: string | null;        // 可能還沒創建刊登
  listingName: string | null;      // 可能還沒創建刊登
  serviceType: string | null;
  city: string | null;
  activeUntil: string | null;
  isActive: boolean;
  referrer?: {                     // 二代、三代的推薦人信息
    userId: string;
    userName: string;
    userReferralCode: string | null;  // ✅ 推薦人的推薦碼
    listingId: string | null;
    listingName: string | null;
  } | null;
  createdAt: string;
}

/**
 * ✅ 推薦樹接口（以用戶為根，不再有 myListing）
 */
interface ReferralTree {
  firstGeneration: ReferralMember[];
  secondGeneration: ReferralMember[];
  thirdGeneration: ReferralMember[];
}

interface ReferralSummary {
  totalReferrals: number;
  firstGenCount: number;
  secondGenCount: number;
  thirdGenCount: number;
}

/**
 * ✅ 推薦數據接口（移除 trees 數組）
 */
interface ReferralData {
  userReferralCode: string;     // 用戶的推薦碼
  referralTree: ReferralTree;   // 用戶的推薦樹（單一對象，不是數組）
  summary: ReferralSummary;
}

export function ReferralManagement() {
  const { showToast } = useNotification();
  const handleBack = useBackNavigation();
  usePageRestoration(); // ✅ 处理 Safari bfcache 页面恢复问题
  
  const [loading, setLoading] = useState(true);
  const [referralData, setReferralData] = useState<ReferralData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);  // ✅ 新增：追蹤複製狀態

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
        console.log('📊 推薦碼:', result.data.userReferralCode);
        console.log('📊 推薦樹:', {
          firstGen: result.data.referralTree?.firstGeneration?.length || 0,
          secondGen: result.data.referralTree?.secondGeneration?.length || 0,
          thirdGen: result.data.referralTree?.thirdGeneration?.length || 0
        });
        console.log('📊 一代成員:', result.data.referralTree?.firstGeneration || []);
        console.log('📊 統計:', result.data.summary);
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
      setCopied(true);
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
            {/* <p className="text-muted-foreground">管理您的推薦碼與推薦關係</p> */}
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
            {/* <p className="text-muted-foreground">管理您的推薦碼與推薦關係</p> */}
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
          {/* <p className="text-muted-foreground">管理您的推薦碼與推薦關係</p>*/}
        </div>
      </div>

      {/* 統計卡片 */}
      <ReferralStats 
        firstLevelCount={referralData?.summary.firstGenCount || 0}
        secondLevelCount={referralData?.summary.secondGenCount || 0}
        thirdLevelCount={referralData?.summary.thirdGenCount || 0}
      />

      {/* ✅ 會員推薦碼卡片 */}
      {/*{referralData?.userReferralCode && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-purple-600" />
              我的推薦碼
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 p-4 border border-purple-200 rounded-lg">
              <div className="flex-1">
                <p className="font-medium font-mono text-lg tracking-wider text-purple-600">
                  {referralData.userReferralCode}
                </p>
              </div>
              <Button
                onClick={() => {
                  copyReferralCode(referralData.userReferralCode);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="shrink-0"
                variant="ghost"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    已複製
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    複製推薦碼
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}*/}

      {/* 推薦樹狀圖 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            我的推薦網絡
          </CardTitle>
          {/* <CardDescription>
            查看透過您的推薦碼註冊的會員
          </CardDescription>*/}
        </CardHeader>
        <CardContent>
          {!referralData || 
           (referralData.referralTree.firstGeneration.length === 0 && 
            referralData.referralTree.secondGeneration.length === 0 && 
            referralData.referralTree.thirdGeneration.length === 0) ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">尚無推薦紀錄</p>
              <p className="text-sm text-muted-foreground mt-2">
                分享您的推薦碼，開始建立推薦網絡
              </p>
            </div>
          ) : (
            <ReferralTreeView
              referralTree={referralData.referralTree}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}