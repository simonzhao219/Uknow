import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useNotification } from '../notifications/NotificationContext';
import { apiRequestJson, buildApiUrl } from '../../utils/apiClient';
import { Loader2, Search, ArrowRight, User, Mail, Hash, ChevronRight } from 'lucide-react';

interface ReferredByInfo {
  userId: string;
  userName: string;
  referralCode: string;
}

interface ReferralTreeStats {
  firstGen: number;
  secondGen: number;
  thirdGen: number;
}

interface ChainNode {
  depth: number;
  userId: string;
  userName: string;
  email: string;
  referralCode: string;
  referredByCode: string | null;
  referredBy: ReferredByInfo | null;
  referralTreeStats: ReferralTreeStats | null;
}

interface DebugChainResponse {
  success: boolean;
  data?: {
    startUserId: string;
    chainLength: number;
    chain: ChainNode[];
  };
  error?: {
    message: string;
  };
}

interface FixChainResponse {
  success: boolean;
  message?: string;
  data?: {
    userId: string;
    userName: string;
    oldReferrer: {
      userId: string;
      userName: string;
      code: string;
    };
    newReferrer: {
      userId: string;
      userName: string;
      code: string;
    };
  };
  error?: {
    message: string;
  };
}

export function ReferralChainDebugger() {
  const { showToast, showSuccess, showError } = useNotification();
  
  // 江梓豪的用戶ID（固定）
  const JIANG_USER_ID = '6597c99d-5905-4132-99e2-be7b98787315';
  
  const [isLoading, setIsLoading] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [chain, setChain] = useState<ChainNode[]>([]);
  const [selectedNewReferrer, setSelectedNewReferrer] = useState<ChainNode | null>(null);
  
  // 查詢推薦鏈條
  const handleDebugChain = async () => {
    setIsLoading(true);
    
    try {
      const result = await apiRequestJson<DebugChainResponse>(
        buildApiUrl(`/data-repair/debug-referral-chain/${JIANG_USER_ID}`)
      );
      
      if (result.success && result.data) {
        setChain(result.data.chain);
        showSuccess(
          '查詢成功',
          `找到 ${result.data.chainLength} 層推薦關係`
        );
      } else {
        throw new Error(result.error?.message || '查詢失敗');
      }
    } catch (err: any) {
      console.error('查詢推薦鏈條錯誤:', err);
      showError('查詢失敗', err.message || '無法查詢推薦鏈條');
    } finally {
      setIsLoading(false);
    }
  };
  
  // 修正推薦關係
  const handleFixChain = async () => {
    if (!selectedNewReferrer) {
      showToast('請先選擇新的推薦人', 'warning');
      return;
    }
    
    // 確認選擇的不是江梓豪本人
    if (selectedNewReferrer.userId === JIANG_USER_ID) {
      showToast('不能選擇江梓豪本人作為推薦人', 'error');
      return;
    }
    
    setIsFixing(true);
    
    try {
      const result = await apiRequestJson<FixChainResponse>(
        buildApiUrl('/data-repair/fix-referral-chain-jiang'),
        {
          method: 'POST',
          body: JSON.stringify({
            newReferrerUserId: selectedNewReferrer.userId,
            newReferrerCode: selectedNewReferrer.referralCode
          })
        }
      );
      
      if (result.success && result.data) {
        showSuccess(
          '修正完成！',
          `江梓豪已從「${result.data.oldReferrer.userName}」移至「${result.data.newReferrer.userName}」`,
          [
            `舊推薦人：${result.data.oldReferrer.userName}`,
            `新推薦人：${result.data.newReferrer.userName}`,
            `新推薦碼：${result.data.newReferrer.code}`
          ]
        );
        
        // 重新查詢以顯示更新後的數據
        setTimeout(() => {
          handleDebugChain();
        }, 1000);
        
        setSelectedNewReferrer(null);
      } else {
        throw new Error(result.error?.message || '修正失敗');
      }
    } catch (err: any) {
      console.error('修正推薦關係錯誤:', err);
      showError('修正失敗', err.message || '無法修正推薦關係');
    } finally {
      setIsFixing(false);
    }
  };
  
  return (
    <div className="space-y-6">
      {/* 標題卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-blue-600" />
            推薦鏈條調試工具
          </CardTitle>
          <CardDescription>
            查詢並修正江梓豪的推薦關係鏈條
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded">
            <p className="text-sm">
              <strong>用戶：</strong>江梓豪
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>用戶ID：</strong>{JIANG_USER_ID}
            </p>
          </div>
          
          <Button 
            onClick={handleDebugChain} 
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                查詢中...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                查詢推薦鏈條
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      
      {/* 推薦鏈條顯示 */}
      {chain.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>推薦鏈條（共 {chain.length} 層）</CardTitle>
            <CardDescription>
              往上追溯江梓豪的推薦關係
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {chain.map((node, index) => (
                <div key={node.userId}>
                  {/* 連接箭頭 */}
                  {index > 0 && (
                    <div className="flex justify-center my-2">
                      <ChevronRight className="h-5 w-5 text-muted-foreground rotate-90" />
                    </div>
                  )}
                  
                  {/* 用戶卡片 */}
                  <div 
                    className={`p-4 border rounded-lg transition-all ${
                      selectedNewReferrer?.userId === node.userId
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-blue-300'
                    } ${
                      node.userId === JIANG_USER_ID
                        ? 'bg-yellow-50 border-yellow-400'
                        : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded">
                            層級 {node.depth}
                          </span>
                          {node.userId === JIANG_USER_ID && (
                            <span className="bg-yellow-600 text-white text-xs px-2 py-0.5 rounded">
                              江梓豪
                            </span>
                          )}
                        </div>
                        
                        <h3 className="font-semibold text-lg flex items-center gap-2">
                          <User className="h-4 w-4 text-blue-600" />
                          {node.userName}
                        </h3>
                        
                        <div className="space-y-1 mt-2 text-sm text-muted-foreground">
                          <p className="flex items-center gap-2">
                            <Mail className="h-3 w-3" />
                            {node.email}
                          </p>
                          <p className="flex items-center gap-2">
                            <Hash className="h-3 w-3" />
                            推薦碼：<span className="font-mono">{node.referralCode}</span>
                          </p>
                          {node.referredByCode && (
                            <p className="flex items-center gap-2">
                              <Hash className="h-3 w-3" />
                              被推薦碼：<span className="font-mono">{node.referredByCode}</span>
                            </p>
                          )}
                        </div>
                      </div>
                      
                      {/* 選擇按鈕（江梓豪除外） */}
                      {node.userId !== JIANG_USER_ID && (
                        <Button
                          size="sm"
                          variant={selectedNewReferrer?.userId === node.userId ? "default" : "outline"}
                          onClick={() => setSelectedNewReferrer(node)}
                        >
                          {selectedNewReferrer?.userId === node.userId ? '已選擇' : '選為新推薦人'}
                        </Button>
                      )}
                    </div>
                    
                    {/* 推薦人信息 */}
                    {node.referredBy && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-sm text-muted-foreground">
                          <strong>推薦人：</strong>
                          {node.referredBy.userName} ({node.referredBy.referralCode})
                        </p>
                      </div>
                    )}
                    
                    {/* 推薦樹統計 */}
                    {node.referralTreeStats && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-sm text-muted-foreground mb-2">
                          <strong>推薦統計：</strong>
                        </p>
                        <div className="flex gap-4 text-xs">
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                            1代：{node.referralTreeStats.firstGen}
                          </span>
                          <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
                            2代：{node.referralTreeStats.secondGen}
                          </span>
                          <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded">
                            3代：{node.referralTreeStats.thirdGen}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* 修正操作卡片 */}
      {selectedNewReferrer && (
        <Card className="border-green-500 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-700">確認修正推薦關係</CardTitle>
            <CardDescription>
              將江梓豪的推薦人從「黎仁傑」改為「{selectedNewReferrer.userName}」
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-white p-4 rounded border">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">江梓豪</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm line-through text-red-600">黎仁傑（舊）</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">江梓豪</span>
                  <ArrowRight className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-700">
                    {selectedNewReferrer.userName}（新）
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => setSelectedNewReferrer(null)}
                className="flex-1"
              >
                取消
              </Button>
              <Button 
                onClick={handleFixChain}
                disabled={isFixing}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                {isFixing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    修正中...
                  </>
                ) : (
                  '確認修正'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* 說明卡片 */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle className="text-sm">使用說明</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. 點擊「查詢推薦鏈條」按鈕查看江梓豪及其往上的推薦關係</p>
          <p>2. 在推薦鏈條中選擇一個用戶作為江梓豪的新推薦人</p>
          <p>3. 點擊「確認修正」執行修正操作</p>
          <p className="text-yellow-700 font-medium">
            ⚠️ 修正操作將更新江梓豪的推薦關係，並自動更新相關的推薦樹和統計數據
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
