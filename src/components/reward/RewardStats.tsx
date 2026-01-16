import React, { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Award, Wallet, TrendingUp, Clock } from 'lucide-react';

interface RewardStatsProps {
  totalRewards: number;
  availableRewards: number;
  pendingRewards: number;
  withdrawnRewards: number;
}

export function RewardStats({
  totalRewards,
  availableRewards,
  pendingRewards,
  withdrawnRewards
}: RewardStatsProps) {
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
        <CardHeader className="pb-2 md:pb-3">
          <CardTitle className="flex items-center gap-1.5 md:gap-2 text-sm md:text-lg">
            <Award className="h-4 w-4 md:h-5 md:w-5 text-orange-600 shrink-0" />
            <span className="truncate">總累積</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl md:text-3xl font-bold text-orange-600">{totalRewards}P</div>
        </CardContent>
      </Card>

      <Card className="min-w-[168px] snap-start shrink-0 md:min-w-0">
        <CardHeader className="pb-2 md:pb-3">
          <CardTitle className="flex items-center gap-1.5 md:gap-2 text-sm md:text-lg">
            <Wallet className="h-4 w-4 md:h-5 md:w-5 text-green-600 shrink-0" />
            <span className="truncate">可提領</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl md:text-3xl font-bold text-green-600">{availableRewards}P</div>
        </CardContent>
      </Card>

      <Card className="min-w-[168px] snap-start shrink-0 md:min-w-0">
        <CardHeader className="pb-2 md:pb-3">
          <CardTitle className="flex items-center gap-1.5 md:gap-2 text-sm md:text-lg">
            <Clock className="h-4 w-4 md:h-5 md:w-5 text-blue-600 shrink-0" />
            <span className="truncate">處理中</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl md:text-3xl font-bold text-blue-600">{pendingRewards}P</div>
        </CardContent>
      </Card>

      <Card className="min-w-[168px] snap-start shrink-0 md:min-w-0">
        <CardHeader className="pb-2 md:pb-3">
          <CardTitle className="flex items-center gap-1.5 md:gap-2 text-sm md:text-lg">
            <TrendingUp className="h-4 w-4 md:h-5 md:w-5 text-purple-600 shrink-0" />
            <span className="truncate">已提領</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl md:text-3xl font-bold text-purple-600">{withdrawnRewards}P</div>
        </CardContent>
      </Card>
    </div>
  );
}