import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useAuth } from '../../contexts/AuthContext';
import { Search, RefreshCw } from 'lucide-react';
import { buildApiUrl } from '../../utils/apiClient';

/**
 * 推薦關係Debug工具
 * 用於檢查用戶的推薦關係數據是否正確建立
 */
export function ReferralDebugger() {
  const { user } = useAuth();
  const [userId, setUserId] = useState(user?.id || '');
  const [debugData, setDebugData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchDebugData = async (targetUserId: string) => {
    if (!targetUserId) {
      alert('請輸入用戶ID');
      return;
    }

    setIsLoading(true);
    console.log(`========== 🔍 開始Debug用戶: ${targetUserId} ==========`);

    try {
      const response = await fetch(
        buildApiUrl(`/referrals/debug/${targetUserId}`),
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('獲取Debug數據失敗');
      }

      const result = await response.json();
      console.log('Debug數據:', result);
      setDebugData(result.data);
    } catch (error) {
      console.error('Debug錯誤:', error);
      alert(`錯誤: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            推薦關係Debug工具
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="輸入用戶ID（留空使用當前用戶）"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
            <Button
              onClick={() => fetchDebugData(userId || user?.id || '')}
              disabled={isLoading}
            >
              {isLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>
          </div>

          {user && (
            <div className="text-sm text-muted-foreground">
              當前用戶ID: <code className="bg-muted px-2 py-1 rounded">{user.id}</code>
            </div>
          )}
        </CardContent>
      </Card>

      {debugData && (
        <div className="space-y-4">
          {/* 用戶資料 */}
          <Card>
            <CardHeader>
              <CardTitle>📋 用戶資料</CardTitle>
            </CardHeader>
            <CardContent>
              {debugData.profile ? (
                <div className="space-y-2 font-mono text-sm">
                  <div>
                    <span className="text-muted-foreground">姓名：</span>
                    <span className="font-medium">{debugData.profile.name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">我的推薦碼：</span>
                    <span className="font-medium">{debugData.profile.referralCode || '未生成'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">使用的推薦碼：</span>
                    <span className="font-medium">{debugData.profile.referredByCode || '無'}</span>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">無數據</p>
              )}
            </CardContent>
          </Card>

          {/* 推薦來源 */}
          <Card>
            <CardHeader>
              <CardTitle>🔗 推薦來源 (referred_by)</CardTitle>
            </CardHeader>
            <CardContent>
              {debugData.referredBy ? (
                <pre className="bg-muted p-4 rounded text-xs overflow-auto">
                  {JSON.stringify(debugData.referredBy, null, 2)}
                </pre>
              ) : (
                <p className="text-muted-foreground">無推薦來源（直接註冊或使用默認推薦碼）</p>
              )}
            </CardContent>
          </Card>

          {/* 推薦樹 */}
          <Card>
            <CardHeader>
              <CardTitle>🌲 推薦樹 (referral_tree)</CardTitle>
            </CardHeader>
            <CardContent>
              {debugData.referralTree ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-green-50 p-3 rounded">
                      <div className="text-2xl font-bold text-green-600">
                        {debugData.referralTree.firstGeneration?.length || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">一代</div>
                    </div>
                    <div className="bg-purple-50 p-3 rounded">
                      <div className="text-2xl font-bold text-purple-600">
                        {debugData.referralTree.secondGeneration?.length || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">二代</div>
                    </div>
                    <div className="bg-orange-50 p-3 rounded">
                      <div className="text-2xl font-bold text-orange-600">
                        {debugData.referralTree.thirdGeneration?.length || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">三代</div>
                    </div>
                  </div>

                  {debugData.referralTree.firstGeneration?.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">一代成員：</h4>
                      <div className="space-y-2">
                        {debugData.referralTree.firstGeneration.map((member: any, idx: number) => (
                          <div key={idx} className="bg-muted p-3 rounded text-sm">
                            <div>👤 {member.userName}</div>
                            <div className="text-muted-foreground text-xs">
                              用戶ID: {member.userId}
                            </div>
                            {member.listingName && (
                              <div className="text-muted-foreground text-xs">
                                刊登: {member.listingName}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <details>
                    <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                      查看完整JSON
                    </summary>
                    <pre className="bg-muted p-4 rounded text-xs overflow-auto mt-2">
                      {JSON.stringify(debugData.referralTree, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : (
                <p className="text-muted-foreground">無推薦樹數據</p>
              )}
            </CardContent>
          </Card>

          {/* 推薦統計 */}
          <Card>
            <CardHeader>
              <CardTitle>📊 推薦統計 (stats)</CardTitle>
            </CardHeader>
            <CardContent>
              {debugData.stats ? (
                <pre className="bg-muted p-4 rounded text-xs overflow-auto">
                  {JSON.stringify(debugData.stats, null, 2)}
                </pre>
              ) : (
                <p className="text-muted-foreground">無統計數據</p>
              )}
            </CardContent>
          </Card>

          {/* 推薦碼索引 */}
          <Card>
            <CardHeader>
              <CardTitle>🎫 推薦碼索引 (referral_code)</CardTitle>
            </CardHeader>
            <CardContent>
              {debugData.codeIndex ? (
                <pre className="bg-muted p-4 rounded text-xs overflow-auto">
                  {JSON.stringify(debugData.codeIndex, null, 2)}
                </pre>
              ) : (
                <p className="text-muted-foreground">無推薦碼索引</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
