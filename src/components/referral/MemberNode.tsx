/**
 * Member Node Component
 * 
 * Displays a member in the referral tree
 * Shows member status (Active/Inactive) with visual indicators
 * 
 * @component MemberNode
 */

import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { User, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

interface MemberNodeProps {
  member: {
    userId: string;
    realName: string;
    accountStatus: 'Active' | 'Canceled' | 'Grace' | 'Fail' | 'Pending';
    isActive: boolean;
    createdAt: string;
    referrer?: {
      userId: string;
      realName: string;
    };
  };
  generation: 1 | 2 | 3;
  showReferrer?: boolean;
}

export function MemberNode({ member, generation, showReferrer = false }: MemberNodeProps) {
  // Status configuration
  const statusConfig = {
    Active: {
      color: 'bg-green-100 text-green-800 border-green-300',
      icon: CheckCircle2,
      iconColor: 'text-green-600',
      label: '訂閱中'
    },
    Canceled: {
      color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      icon: AlertCircle,
      iconColor: 'text-yellow-600',
      label: '已取消'
    },
    Grace: {
      color: 'bg-orange-100 text-orange-800 border-orange-300',
      icon: AlertCircle,
      iconColor: 'text-orange-600',
      label: '寬限期'
    },
    Fail: {
      color: 'bg-red-100 text-red-800 border-red-300',
      icon: XCircle,
      iconColor: 'text-red-600',
      label: '已失效'
    },
    Pending: {
      color: 'bg-gray-100 text-gray-800 border-gray-300',
      icon: AlertCircle,
      iconColor: 'text-gray-600',
      label: '待完成'
    }
  };
  
  const config = statusConfig[member.accountStatus] || statusConfig.Pending;
  const Icon = config.icon;
  
  // Generation color
  const generationColors = {
    1: 'border-l-green-600',
    2: 'border-l-purple-600',
    3: 'border-l-orange-600'
  };
  
  return (
    <Card className={`
      border-l-4 ${generationColors[generation]}
      ${!member.isActive ? 'opacity-60' : ''}
      transition-all hover:shadow-md
    `}>
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className={`
            w-10 h-10 rounded-full flex items-center justify-center shrink-0
            ${member.isActive ? 'bg-blue-100' : 'bg-gray-100'}
          `}>
            <User className={`h-5 w-5 ${member.isActive ? 'text-blue-600' : 'text-gray-400'}`} />
          </div>
          
          {/* Info */}
          <div className="flex-1 min-w-0">
            {/* Name */}
            <div className="flex items-center gap-2 mb-1">
              <p className="font-medium truncate">
                {member.realName}
              </p>
              {!member.isActive && (
                <Badge variant="outline" className="text-xs bg-gray-100">
                  失效
                </Badge>
              )}
            </div>
            
            {/* Status */}
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`h-3.5 w-3.5 ${config.iconColor}`} />
              <span className="text-sm text-muted-foreground">
                {config.label}
              </span>
            </div>
            
            {/* Referrer (for Gen 2 & 3) */}
            {showReferrer && member.referrer && (
              <div className="text-sm text-muted-foreground mt-2 pt-2 border-t">
                <span className="text-xs">推薦人：</span>
                <span className="font-medium ml-1">{member.referrer.realName}</span>
              </div>
            )}
            
            {/* Join Date */}
            <p className="text-xs text-muted-foreground mt-1">
              加入時間：{new Date(member.createdAt).toLocaleDateString('zh-TW')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
