import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Bell, Send, Users } from 'lucide-react';

export function SystemNotifications() {
  const [notification, setNotification] = useState({
    title: '',
    message: '',
    target: 'all',
    type: 'info'
  });

  const [sentNotifications] = useState([
    {
      id: '1',
      title: '系統維護通知',
      message: '系統將於今晚 23:00 進行維護，預計 2 小時完成。',
      target: 'all',
      type: 'warning',
      sentAt: '2024-02-01'
    },
    {
      id: '2',
      title: '新功能上線',
      message: '推薦系統已優化，推薦獎金計算更精確。',
      target: 'all',
      type: 'info',
      sentAt: '2024-01-25'
    }
  ]);

  const handleSendNotification = () => {
    if (!notification.title || !notification.message) {
      alert('請填寫完整的通知內容');
      return;
    }

    alert(`通知已發送給：${notification.target === 'all' ? '所有會員' : '特定會員'}`);
    setNotification({
      title: '',
      message: '',
      target: 'all',
      type: 'info'
    });
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'info':
        return <Badge variant="default">資訊</Badge>;
      case 'warning':
        return <Badge className="bg-orange-500">警告</Badge>;
      case 'error':
        return <Badge variant="destructive">錯誤</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* 發送通知 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            發送系統通知
          </CardTitle>
          <CardDescription>
            向平台會員發送重要通知或公告
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">通知標題</Label>
              <Input
                id="title"
                value={notification.title}
                onChange={(e) => setNotification({...notification, title: e.target.value})}
                placeholder="請輸入通知標題"
              />
            </div>

            <div className="space-y-2">
              <Label>通知類型</Label>
              <Select 
                value={notification.type} 
                onValueChange={(value) => setNotification({...notification, type: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">資訊</SelectItem>
                  <SelectItem value="warning">警告</SelectItem>
                  <SelectItem value="error">錯誤</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">通知內容</Label>
            <Textarea
              id="message"
              value={notification.message}
              onChange={(e) => setNotification({...notification, message: e.target.value})}
              placeholder="請輸入通知內容..."
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label>發送對象</Label>
            <Select 
              value={notification.target} 
              onValueChange={(value) => setNotification({...notification, target: value})}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有會員</SelectItem>
                <SelectItem value="active">活躍會員</SelectItem>
                <SelectItem value="premium">付費會員</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleSendNotification} className="w-full">
            <Send className="h-4 w-4 mr-2" />
            發送通知
          </Button>
        </CardContent>
      </Card>

      {/* 通知歷史 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            通知歷史
          </CardTitle>
          <CardDescription>
            查看已發送的系統通知記錄
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {sentNotifications.map((notif) => (
              <div key={notif.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium">{notif.title}</h4>
                  <div className="flex items-center gap-2">
                    {getTypeBadge(notif.type)}
                    <Badge variant="outline">
                      {notif.target === 'all' ? '所有會員' : '特定會員'}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{notif.message}</p>
                <p className="text-xs text-muted-foreground">
                  發送時間：{new Date(notif.sentAt).toLocaleDateString('zh-TW')}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}