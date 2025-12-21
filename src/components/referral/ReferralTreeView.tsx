/**
 * Referral Tree View Component
 * 
 * Displays the three-generation referral tree
 * Shows statistics and member nodes
 * 
 * @component ReferralTreeView
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { 
  Users, 
  CheckCircle2, 
  XCircle, 
  TrendingUp,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { MemberNode } from './MemberNode';
import { useNotification } from '../notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { getAccessToken } from '../../utils/auth';

interface MemberNodeData {
  userId: string;
  realName: string;
  accountStatus: 'Active' | 'Canceled' | 'Grace' | 'Fail' | 'Pending';
  isActive: boolean;
  createdAt: string;
  referrer?: {
    userId: string;
    realName: string;
  };
}

interface ReferralTreeData {
  myInfo: {
    userId: string;
    realName: string;
    referralCode: string | null;
    accountStatus: string;
  };
  tree: {
    firstGeneration: MemberNodeData[];
    secondGeneration: MemberNodeData[];
    thirdGeneration: MemberNodeData[];
  };
  summary: {
    totalReferrals: number;
    activeCount: number;
    inactiveCount: number;
    gen1Count: number;
    gen2Count: number;
    gen3Count: number;
  };
}

export function ReferralTreeView() {
  const [data, setData] = useState<ReferralTreeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const { showToast } = useNotification();
  
  useEffect(() => {
    fetchTree();
  }, []);
  
  const fetchTree = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    
    try {
      const token = await getAccessToken();
      
      if (!token) {
        showToast('請先登入', 'error');
        return;
      }
      
      const result = await apiRequestJson<{
        success: boolean;
        data: ReferralTreeData;
        error?: { message: string };
      }>(buildApiUrl('/referrals-v2/my-tree'), {
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
      console.error('Failed to fetch referral tree:', error);
      showToast('載入推薦樹失敗', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };
  
  const handleRefresh = () => {
    fetchTree(true);
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
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          無法載入推薦樹
        </CardContent>
      </Card>
    );
  }
  
  const { tree, summary } = data;
  
  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Referrals */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-blue-600" />
              <span>總推薦人數</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {summary.totalReferrals}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              累計推薦會員
            </p>
          </CardContent>
        </Card>
        
        {/* Active Count */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span>有效會員</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {summary.activeCount}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              正在訂閱中
            </p>
          </CardContent>
        </Card>
        
        {/* Inactive Count */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <XCircle className="h-5 w-5 text-gray-600" />
              <span>失效會員</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-600">
              {summary.inactiveCount}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              已停止訂閱
            </p>
          </CardContent>
        </Card>
        
        {/* Conversion Rate */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-purple-600" />
              <span>活躍比例</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">
              {summary.totalReferrals > 0 
                ? Math.round((summary.activeCount / summary.totalReferrals) * 100)
                : 0}%
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              有效會員佔比
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Refresh Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleRefresh}
          disabled={isRefreshing}
          variant="outline"
          size="sm"
        >
          {isRefreshing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              更新中...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              重新整理
            </>
          )}
        </Button>
      </div>
      
      {/* Referral Tree */}
      <Card>
        <CardHeader>
          <CardTitle>我的推薦網絡</CardTitle>
          <CardDescription>
            顯示您的三代推薦會員，包含已失效的會員節點
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-8">
            {/* Generation 1 */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Badge className="bg-green-600 text-white">第一代</Badge>
                <span className="text-sm text-muted-foreground">
                  直接推薦（{summary.gen1Count} 位會員）
                </span>
              </div>
              
              {tree.firstGeneration.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground bg-gray-50 rounded-lg">
                  <Users className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <p>尚未推薦任何會員</p>
                  <p className="text-sm mt-1">分享您的推薦碼給朋友吧！</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tree.firstGeneration.map(member => (
                    <MemberNode
                      key={member.userId}
                      member={member}
                      generation={1}
                    />
                  ))}
                </div>
              )}
            </div>
            
            {/* Generation 2 */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Badge className="bg-purple-600 text-white">第二代</Badge>
                <span className="text-sm text-muted-foreground">
                  間接推薦（{summary.gen2Count} 位會員）
                </span>
              </div>
              
              {tree.secondGeneration.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground bg-gray-50 rounded-lg">
                  <p>尚未有第二代會員</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tree.secondGeneration.map(member => (
                    <MemberNode
                      key={member.userId}
                      member={member}
                      generation={2}
                      showReferrer={true}
                    />
                  ))}
                </div>
              )}
            </div>
            
            {/* Generation 3 */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Badge className="bg-orange-600 text-white">第三代</Badge>
                <span className="text-sm text-muted-foreground">
                  第三層推薦（{summary.gen3Count} 位會員）
                </span>
              </div>
              
              {tree.thirdGeneration.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground bg-gray-50 rounded-lg">
                  <p>尚未有第三代會員</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tree.thirdGeneration.map(member => (
                    <MemberNode
                      key={member.userId}
                      member={member}
                      generation={3}
                      showReferrer={true}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Users className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-medium mb-2">推薦系統說明</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>第一代：您直接推薦的會員</li>
                <li>第二代：您推薦的會員再推薦的會員</li>
                <li>第三代：第二代會員再推薦的會員</li>
                <li>失效會員：訂閱到期且未續訂的會員（節點保留）</li>
                <li>每位有效會員每月可為您帶來獎勵點數</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
