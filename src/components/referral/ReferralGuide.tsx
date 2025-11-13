import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export function ReferralGuide() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>如何推薦好友？</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-primary font-bold">1</span>
            </div>
            <h4 className="font-medium mb-2">分享推薦碼</h4>
            <p className="text-sm text-muted-foreground">
              複製您的專屬推薦碼，分享給親朋好友
            </p>
          </div>
          
          <div className="text-center">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-primary font-bold">2</span>
            </div>
            <h4 className="font-medium mb-2">好友註冊</h4>
            <p className="text-sm text-muted-foreground">
              好友使用您的推薦碼成功訂閱
            </p>
          </div>
          
          <div className="text-center">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-primary font-bold">3</span>
            </div>
            <h4 className="font-medium mb-2">獲得獎金</h4>
            <p className="text-sm text-muted-foreground">
              好友成功訂閱服務後，您即可獲得 $10 獎金
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}