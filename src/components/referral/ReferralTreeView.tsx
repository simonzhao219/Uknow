import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Users, TrendingUp } from 'lucide-react';

interface ReferralTreeViewProps {
  firstLevelReferrals: any[];
  secondLevelReferrals: any[];
  thirdLevelReferrals: any[];
}

// 為不同推薦人分配顏色主題
const getReferrerColorTheme = (referralCode: string, isActive: boolean = true) => {
  const themes = [
    { border: 'border-l-blue-500', bg: 'bg-blue-50', textColor: 'text-blue-700' },
    { border: 'border-l-green-500', bg: 'bg-green-50', textColor: 'text-green-700' },
    { border: 'border-l-purple-500', bg: 'bg-purple-50', textColor: 'text-purple-700' },
    { border: 'border-l-orange-500', bg: 'bg-orange-50', textColor: 'text-orange-700' },
    { border: 'border-l-pink-500', bg: 'bg-pink-50', textColor: 'text-pink-700' },
    { border: 'border-l-indigo-500', bg: 'bg-indigo-50', textColor: 'text-indigo-700' },
    { border: 'border-l-red-500', bg: 'bg-red-50', textColor: 'text-red-700' },
    { border: 'border-l-teal-500', bg: 'bg-teal-50', textColor: 'text-teal-700' },
  ];
  
  // 根據推薦碼生成固定的主題索引
  const themeIndex = referralCode.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % themes.length;
  const theme = themes[themeIndex];
  
  if (!isActive) {
    // 非激活狀態使用反灰效果
    return {
      border: 'border-l-gray-300',
      bg: 'bg-gray-50',
      textColor: 'text-gray-400',
      opacity: 'opacity-50'
    };
  }
  
  return theme;
};

// 模擬推薦人激活狀態
const isReferrerActive = (referralCode: string) => {
  // 模擬某些推薦人處於非激活狀態
  const inactiveReferrers = ['CHEN2024', 'WANG2024'];
  return !inactiveReferrers.includes(referralCode);
};

export function ReferralTreeView({ firstLevelReferrals, secondLevelReferrals, thirdLevelReferrals }: ReferralTreeViewProps) {
  
  // 為了演示，我們需要給每個推薦用戶添加推薦碼和狀態
  const enhanceReferralData = (referrals: any[], level: number) => {
    return referrals.map((referral, index) => ({
      ...referral,
      referralCode: `${['MING', 'CHEN', 'WANG', 'LIU', 'HUANG'][index % 5]}2024`,
      joinDate: new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toLocaleDateString('zh-TW')
    }));
  };

  const enhancedFirstLevel = enhanceReferralData(firstLevelReferrals, 1);
  const enhancedSecondLevel = enhanceReferralData(secondLevelReferrals, 2);
  const enhancedThirdLevel = enhanceReferralData(thirdLevelReferrals, 3);

  const renderReferralCard = (referral: any, index: number) => {
    const isActive = isReferrerActive(referral.referralCode);
    const colorTheme = getReferrerColorTheme(referral.referralCode, isActive);
    
    return (
      <div 
        key={index} 
        className={`flex items-center justify-between p-4 border rounded-lg transition-all duration-200 ${colorTheme.border} ${colorTheme.bg} ${colorTheme.opacity || ''}`}
      >
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <p className={`font-medium ${isActive ? '' : 'text-gray-400'}`}>
              {referral?.name}
            </p>
            <div 
              className={`px-2 py-1 rounded-full text-xs font-medium ${colorTheme.bg} ${colorTheme.textColor} border ${colorTheme.border.replace('border-l-', 'border-')}`}
            >
              {referral.referralCode}
            </div>
          </div>
          <p className={`text-sm ${isActive ? 'text-muted-foreground' : 'text-gray-400'}`}>
            加入時間：{referral.joinDate}
          </p>
        </div>
        
        {!isActive && (
          <div className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
            非激活
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 一等親 */}
      <Card>
        <CardHeader>
          <CardTitle>一等親 ({enhancedFirstLevel.length})</CardTitle>
          <CardDescription>您直接推薦的用戶</CardDescription>
        </CardHeader>
        <CardContent>
          {enhancedFirstLevel.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">尚未有第一代下線</p>
              <p className="text-sm text-muted-foreground mt-2">
                開始分享您的推薦碼吧！
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {enhancedFirstLevel.map((referral, index) => renderReferralCard(referral, index))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 二等親 */}
      <Card>
        <CardHeader>
          <CardTitle>二等親 ({enhancedSecondLevel.length})</CardTitle>
          <CardDescription>一等親推薦的用戶</CardDescription>
        </CardHeader>
        <CardContent>
          {enhancedSecondLevel.length === 0 ? (
            <div className="text-center py-8">
              <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">尚未有二等親</p>
              <p className="text-sm text-muted-foreground mt-2">
                當您的一等親開始推薦時，這裡會顯示他們的推薦人
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {enhancedSecondLevel.map((referral, index) => renderReferralCard(referral, index))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 三等親 */}
      <Card>
        <CardHeader>
          <CardTitle>三等親 ({enhancedThirdLevel.length})</CardTitle>
          <CardDescription>二等親推薦的用戶</CardDescription>
        </CardHeader>
        <CardContent>
          {enhancedThirdLevel.length === 0 ? (
            <div className="text-center py-8">
              <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">尚未有三等親</p>
              <p className="text-sm text-muted-foreground mt-2">
                當您的二等親開始推薦時，這裡會顯示他們的推薦人
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {enhancedThirdLevel.map((referral, index) => renderReferralCard(referral, index))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}