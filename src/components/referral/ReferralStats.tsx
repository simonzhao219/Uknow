import React, { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Users, UserPlus } from 'lucide-react';

interface ReferralStatsProps {
  firstLevelCount: number;
  secondLevelCount: number;
  thirdLevelCount: number;
}

export function ReferralStats({ firstLevelCount, secondLevelCount, thirdLevelCount }: ReferralStatsProps) {
  const totalReferrals = firstLevelCount + secondLevelCount + thirdLevelCount;
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 组件挂载时重置滚动位置
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollLeft = 0;
    }
  }, []);
  
  // 监听窗口大小变化，在响应式切换时重置滚动
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && window.innerWidth >= 768) {
        // 平板/桌面版：重置滚动（因为变成 grid 布局不需要滚动）
        containerRef.current.scrollLeft = 0;
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div 
      ref={containerRef}
      className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory md:grid md:grid-cols-2 lg:grid-cols-4 md:overflow-x-visible"
    >
      <Card className="min-w-[168px] snap-start shrink-0 md:min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-blue-600 shrink-0" />
            <span>總推薦數</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-blue-600">{totalReferrals}</div>
          {/*<p className="text-sm text-muted-foreground mt-1">
            所有推薦
          </p>*/}
        </CardContent>
      </Card>

      <Card className="min-w-[168px] snap-start shrink-0 md:min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5 text-green-600 shrink-0" />
            <span>一代</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-green-600">{firstLevelCount}</div>
          {/*<p className="text-sm text-muted-foreground mt-1">
            直接推薦
          </p>*/}
        </CardContent>
      </Card>

      <Card className="min-w-[168px] snap-start shrink-0 md:min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5 text-purple-600 shrink-0" />
            <span>二代</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-purple-600">{secondLevelCount}</div>
          {/*<p className="text-sm text-muted-foreground mt-1">
            一代推薦
          </p>*/}
        </CardContent>
      </Card>

      <Card className="min-w-[168px] snap-start shrink-0 md:min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="h-5 w-5 text-orange-600 shrink-0" />
            <span>三代</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-orange-600">{thirdLevelCount}</div>
          {/*<p className="text-sm text-muted-foreground mt-1">
            二代推薦
          </p>*/}
        </CardContent>
      </Card>
    </div>
  );
}