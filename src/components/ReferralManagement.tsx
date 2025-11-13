import React, { useContext, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { UserContext } from '../App';
import { Users, Copy, Share2, UserPlus, TrendingUp, Gift, ChevronDown, ChevronRight } from 'lucide-react';
import { mockUsers, mockReferrals, mockRoommates } from '../data/mockData';
import { ReferralStats } from './referral/ReferralStats';


export function ReferralManagement() {
  const { user } = useContext(UserContext);
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());

  // 根據用戶的服務提供者生成推薦碼組
  const userRoommates = mockRoommates.filter(r => r.userId === user?.id);
  
  // 為每個服務提供者生成推薦碼（格式：用戶名縮寫 + 服務提供者ID + 年份）
  const referralCodes = userRoommates.map(roommate => {
    const userNameAbbr = user?.name ? user.name.charAt(0).toUpperCase() : 'U';
    return {
      code: `${userNameAbbr}${roommate.id}2024`,
      roommateId: roommate.id,
      roommateName: roommate.name,
      category: roommate.category,
      createdAt: roommate.createdAt
    };
  });

  // 模擬每個推薦碼的下線資料
  const getReferralsForCode = (referralCode: string) => {
    // 模擬資料：為不同推薦碼分配不同的下線
    const mockReferralsByCode: { [key: string]: any[] } = {
      [`${user?.name?.charAt(0) || 'U'}12024`]: [
        { id: 'user2', name: '陳美華', joinDate: '2024-02-15', level: 1, isActive: true },
        { id: 'user3', name: '王大同', joinDate: '2024-03-01', level: 1, isActive: false },
        { id: 'user4', name: '劉小芳', joinDate: '2024-03-15', level: 2, isActive: true, referrer: '陳美華' },
        { id: 'user5', name: '黃志偉', joinDate: '2024-04-01', level: 3, isActive: true, referrer: '劉小芳' }
      ],
      [`${user?.name?.charAt(0) || 'U'}22024`]: [
        { id: 'user6', name: '林淑芬', joinDate: '2024-01-20', level: 1, isActive: true },
        { id: 'user7', name: '張建國', joinDate: '2024-02-10', level: 2, isActive: true, referrer: '林淑芬' }
      ],
      [`${user?.name?.charAt(0) || 'U'}32024`]: [
        { id: 'user8', name: '吳雅婷', joinDate: '2024-03-05', level: 1, isActive: true },
        { id: 'user9', name: '蔡志明', joinDate: '2024-03-20', level: 1, isActive: false },
        { id: 'user10', name: '郭美玲', joinDate: '2024-04-15', level: 2, isActive: true, referrer: '吳雅婷' },
        { id: 'user11', name: '謝宗翰', joinDate: '2024-05-01', level: 2, isActive: true, referrer: '蔡志明' },
        { id: 'user12', name: '朱佩君', joinDate: '2024-05-15', level: 3, isActive: true, referrer: '郭美玲' }
      ]
    };

    return mockReferralsByCode[referralCode] || [];
  };

  // 計算每個推薦碼的統計資料
  const getCodeStats = (referralCode: string) => {
    const referrals = getReferralsForCode(referralCode);
    const firstLevel = referrals.filter(r => r.level === 1);
    const secondLevel = referrals.filter(r => r.level === 2);
    const thirdLevel = referrals.filter(r => r.level === 3);
    
    return {
      firstLevelCount: firstLevel.length,
      secondLevelCount: secondLevel.length,
      thirdLevelCount: thirdLevel.length,
      totalCount: referrals.length,
      activeCount: referrals.filter(r => r.isActive).length
    };
  };

  // 計算總體統計
  const totalStats = referralCodes.reduce((acc, codeInfo) => {
    const stats = getCodeStats(codeInfo.code);
    return {
      firstLevelCount: acc.firstLevelCount + stats.firstLevelCount,
      secondLevelCount: acc.secondLevelCount + stats.secondLevelCount,
      thirdLevelCount: acc.thirdLevelCount + stats.thirdLevelCount
    };
  }, { firstLevelCount: 0, secondLevelCount: 0, thirdLevelCount: 0 });

  const toggleCodeExpansion = (code: string) => {
    const newExpanded = new Set(expandedCodes);
    if (newExpanded.has(code)) {
      newExpanded.delete(code);
    } else {
      newExpanded.add(code);
    }
    setExpandedCodes(newExpanded);
  };

  const renderReferralCard = (referral: any, level: number) => {
    const levelColors = {
      1: 'border-l-blue-500 bg-blue-50',
      2: 'border-l-green-500 bg-green-50', 
      3: 'border-l-purple-500 bg-purple-50'
    };

    return (
      <div 
        key={referral.id}
        className={`flex items-center justify-between p-3 border rounded-lg transition-all duration-200 ${levelColors[level as keyof typeof levelColors]} ${!referral.isActive ? 'opacity-50' : ''}`}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className={`font-medium ${!referral.isActive ? 'text-gray-400' : ''}`}>
              {referral.name}
            </p>
            <Badge variant={level === 1 ? 'default' : level === 2 ? 'secondary' : 'outline'} className="text-xs">
              {level === 1 ? '一等親' : level === 2 ? '二等親' : '三等親'}
            </Badge>
          </div>
          {referral.referrer && (
            <p className="text-xs text-muted-foreground mb-1">
              推薦人：{referral.referrer}
            </p>
          )}
          <p className={`text-sm ${!referral.isActive ? 'text-gray-400' : 'text-muted-foreground'}`}>
            加入時間：{referral.joinDate}
          </p>
        </div>
        
        {!referral.isActive && (
          <div className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
            非激活
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">推薦管理</h1>
        <p className="text-muted-foreground">管理您的推薦碼與推薦關係</p>
      </div>

      <ReferralStats 
        firstLevelCount={totalStats.firstLevelCount}
        secondLevelCount={totalStats.secondLevelCount}
        thirdLevelCount={totalStats.thirdLevelCount}
      />

      {/* 推薦碼管理 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            我的推薦碼
          </CardTitle>
          <CardDescription>
            每個服務提供者都有專屬的推薦碼，點選查看該推薦碼的推薦關係
          </CardDescription>
        </CardHeader>
        <CardContent>
          {referralCodes.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">您還沒有服務提供者</p>
              <p className="text-sm text-muted-foreground mt-2">
                刊登服務提供者後將自動生成推薦碼
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {referralCodes.map((codeInfo) => {
                const stats = getCodeStats(codeInfo.code);
                const isExpanded = expandedCodes.has(codeInfo.code);
                const referrals = getReferralsForCode(codeInfo.code);

                return (
                  <div key={codeInfo.code} className="border rounded-lg">
                    {/* 推薦碼標題區 */}
                    <div 
                      className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleCodeExpansion(codeInfo.code)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium">{codeInfo.roommateName}</h3>
                              <Badge variant="outline">{codeInfo.category}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              推薦碼：{codeInfo.code}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm font-medium">
                              總計 {stats.totalCount} 人
                            </p>
                            <p className="text-xs text-muted-foreground">
                              激活 {stats.activeCount} 人
                            </p>
                          </div>
                          <div className="flex gap-1">
                            {stats.firstLevelCount > 0 && (
                              <Badge variant="default" className="text-xs">
                                一等親 {stats.firstLevelCount}
                              </Badge>
                            )}
                            {stats.secondLevelCount > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                二等親 {stats.secondLevelCount}
                              </Badge>
                            )}
                            {stats.thirdLevelCount > 0 && (
                              <Badge variant="outline" className="text-xs">
                                三等親 {stats.thirdLevelCount}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 展開的推薦關係 */}
                    {isExpanded && (
                      <div className="border-t bg-muted/20 p-4">
                        {referrals.length === 0 ? (
                          <div className="text-center py-6">
                            <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                            <p className="text-muted-foreground">此推薦碼尚未有推薦人</p>
                            <p className="text-sm text-muted-foreground mt-1">
                              分享推薦碼 {codeInfo.code} 給好友吧！
                            </p>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="mt-3"
                              onClick={() => navigator.clipboard.writeText(codeInfo.code)}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              複製推薦碼
                            </Button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {/* 一等親 */}
                            <div>
                              <h4 className="font-medium mb-3 flex items-center gap-2">
                                <Badge variant="default" className="text-xs">一等親</Badge>
                                ({referrals.filter(r => r.level === 1).length})
                              </h4>
                              <div className="space-y-2">
                                {referrals.filter(r => r.level === 1).map(referral => 
                                  renderReferralCard(referral, 1)
                                )}
                              </div>
                            </div>

                            {/* 二等親 */}
                            <div>
                              <h4 className="font-medium mb-3 flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs">二等親</Badge>
                                ({referrals.filter(r => r.level === 2).length})
                              </h4>
                              <div className="space-y-2">
                                {referrals.filter(r => r.level === 2).map(referral => 
                                  renderReferralCard(referral, 2)
                                )}
                              </div>
                            </div>

                            {/* 三等親 */}
                            <div>
                              <h4 className="font-medium mb-3 flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">三等親</Badge>
                                ({referrals.filter(r => r.level === 3).length})
                              </h4>
                              <div className="space-y-2">
                                {referrals.filter(r => r.level === 3).map(referral => 
                                  renderReferralCard(referral, 3)
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}