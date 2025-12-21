/**
 * Task Progress Card Component
 * 
 * Displays individual task progress with visual indicators
 * 
 * @component TaskProgressCard
 */

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Trophy, TrendingUp, Calendar } from 'lucide-react';

interface TaskProgressCardProps {
  title: string;
  description: string;
  currentCount: number;
  targetCount: number;
  completedCount: number;
  progress: number;
  status: string;
  reward: number;
  icon: 'trophy' | 'trending';
  color: 'blue' | 'purple' | 'green';
}

export function TaskProgressCard({
  title,
  description,
  currentCount,
  targetCount,
  completedCount,
  progress,
  status,
  reward,
  icon,
  color
}: TaskProgressCardProps) {
  const colorConfig = {
    blue: {
      bg: 'bg-blue-100',
      text: 'text-blue-600',
      border: 'border-blue-300',
      progressBg: 'bg-blue-600'
    },
    purple: {
      bg: 'bg-purple-100',
      text: 'text-purple-600',
      border: 'border-purple-300',
      progressBg: 'bg-purple-600'
    },
    green: {
      bg: 'bg-green-100',
      text: 'text-green-600',
      border: 'border-green-300',
      progressBg: 'bg-green-600'
    }
  };
  
  const config = colorConfig[color];
  const Icon = icon === 'trophy' ? Trophy : TrendingUp;
  
  return (
    <Card className={`border-l-4 ${config.border}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <div className={`w-10 h-10 rounded-full ${config.bg} flex items-center justify-center`}>
              <Icon className={`h-5 w-5 ${config.text}`} />
            </div>
            <span>{title}</span>
          </CardTitle>
          {status === 'Inactive' && (
            <Badge variant="outline" className="bg-gray-100 text-gray-600">
              已暫停
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          {description}
        </p>
      </CardHeader>
      
      <CardContent>
        {/* Progress Bar */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">進度</span>
            <span className={`font-medium ${config.text}`}>
              {currentCount} / {targetCount}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
        
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">目前進度</p>
            <p className={`text-2xl font-bold ${config.text}`}>
              {currentCount}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">已達成次數</p>
            <p className="text-2xl font-bold text-green-600">
              {completedCount}
            </p>
          </div>
        </div>
        
        {/* Reward Info */}
        <div className={`mt-4 p-3 rounded-lg ${config.bg}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">獎勵</span>
            <span className={`text-lg font-bold ${config.text}`}>
              {reward} 點
            </span>
          </div>
        </div>
        
        {/* Completed Times */}
        {completedCount > 0 && (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>已獲得 {completedCount * reward} 點獎勵</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
