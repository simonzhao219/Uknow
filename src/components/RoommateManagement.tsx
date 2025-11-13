import React, { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { UserContext } from '../App';
import { Plus, Edit, Eye, Calendar, MapPin } from 'lucide-react';
import { mockRoommates } from '../data/mockData';
import { ImageWithFallback } from './figma/ImageWithFallback';

export function RoommateManagement() {
  const { user } = useContext(UserContext);
  const [roommates, setRoommates] = useState(mockRoommates.filter(r => r.userId === user?.id));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">服務管理</h1>
          <p className="text-muted-foreground">管理您的專業服務刊登</p>
        </div>
        <Button asChild>
          <Link to="/roommates/create">
            <Plus className="h-4 w-4 mr-2" />
            新增室友
          </Link>
        </Button>
      </div>

      {/* 室友統計 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">總刊登數</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{roommates.length}</div>
            <p className="text-sm text-muted-foreground">已刊登的室友</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">今日瀏覽數</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{roommates.length * 12}</div>
            <p className="text-sm text-muted-foreground">累計瀏覽次數</p>
          </CardContent>
        </Card>
      </div>

      {/* 室友列表 */}
      {roommates.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <h3 className="text-lg font-medium mb-2">尚未刊登任何室友</h3>
            <p className="text-muted-foreground mb-6">
              開始刊登您的專業服務，讓更多人找到您
            </p>
            <Button asChild>
              <Link to="/roommates/create">
                <Plus className="h-4 w-4 mr-2" />
                刊登第一個室友
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {roommates.map((roommate) => (
            <Card key={roommate.id}>
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row gap-6">
                  {/* 圖片 */}
                  <div className="w-full md:w-48 aspect-video rounded-lg overflow-hidden">
                    <ImageWithFallback
                      src={roommate.photos[0]}
                      alt={roommate.name}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* 內容 */}
                  <div className="flex-1 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-xl font-semibold">{roommate.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="default">{roommate.category}</Badge>
                          <Badge variant="secondary">活躍中</Badge>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/roommate/${roommate.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/roommates/edit/${roommate.id}`}>
                            <Edit className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        <span>{roommate.city} {roommate.district}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>刊登日期：{new Date(roommate.createdAt).toLocaleDateString('zh-TW')}</span>
                      </div>
                    </div>

                    <p className="text-muted-foreground line-clamp-2">
                      {roommate.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 管理提醒 */}
      <Alert>
        <Calendar className="h-4 w-4" />
        <AlertDescription>
          室友內容管理專注於服務資訊的編輯與更新。如需管理訂閱方案、付款方式或停用服務，請前往「訂閱管理」頁面。
        </AlertDescription>
      </Alert>
    </div>
  );
}