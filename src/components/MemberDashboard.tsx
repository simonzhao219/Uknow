import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { UserContext } from '../App';
import { Users, Award, Settings, User, Home, CheckSquare, Gift, Edit } from 'lucide-react';
import { mockServiceProviders } from '../data/mockData';

export function MemberDashboard() {
  const { user } = useContext(UserContext);

  // 找出該用戶的服務者刊登
  const userServiceProviders = mockServiceProviders.filter(r => r.userId === user?.id);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">會員中心</h1>
          <p className="text-muted-foreground">歡迎回來，{user?.name}</p>
        </div>
        <Button asChild>
          <Link to="/">
            <Home className="h-4 w-4 mr-2" />
            回到首頁
          </Link>
        </Button>
      </div>

      {/* 會員基本資訊 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            會員資訊
          </CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link to="/profile/edit">
              <Edit className="h-4 w-4 mr-2" />
              編輯資訊
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">姓名</p>
            <p className="font-medium">{user?.name}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="font-medium">{user?.email}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">聯絡電話</p>
            <p className="font-medium">{user?.phone}</p>
          </div>
        </CardContent>
      </Card>

      {/* 快速操作區域 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings className="h-5 w-5 text-blue-600" />
              刊登管理
            </CardTitle>
            <CardDescription>
              管理已刊登的服務
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link to="/service-providers">查看管理</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-purple-600" />
              推薦管理
            </CardTitle>
            <CardDescription>
              推薦好友賺Point
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link to="/referrals">推薦管理</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckSquare className="h-5 w-5 text-green-600" />
              任務中心
            </CardTitle>
            <CardDescription>
              完成任務賺Point
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link to="/tasks">任務中心</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Gift className="h-5 w-5 text-orange-600" />
              獎勵回饋
            </CardTitle>
            <CardDescription>
              查看Point收益
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link to="/rewards">Point管理</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* 最近活動 */}
      <Card>
        <CardHeader>
          <CardTitle>最近活動</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b">
              <div>
                <p className="font-medium">歡迎加入 Uknow</p>
                <p className="text-sm text-muted-foreground">
                  {new Date().toLocaleDateString('zh-TW')}
                </p>
              </div>
              <Badge variant="outline">系統通知</Badge>
            </div>
            
            {userServiceProviders.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">尚未有服務刊登</p>
                <Button asChild className="mt-4">
                  <Link to="/service-providers/create">立即刊登第一個服務</Link>
                </Button>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-muted-foreground">您已刊登 {userServiceProviders.length} 個服務</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}