/**
 * Subscription Management V2
 * 
 * New subscription management page using PostgreSQL
 * Displays account status and subscription lifecycle
 * 
 * @component SubscriptionManagementV2
 */

import { Button } from './ui/button';
import { ArrowLeft } from 'lucide-react';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { SubscriptionDashboard } from './subscription/SubscriptionDashboard';

export function SubscriptionManagementV2() {
  const navigate = useBackNavigation();
  
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={navigate} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">訂閱管理</h1>
          <p className="text-muted-foreground">管理您的年費訂閱與帳號狀態</p>
        </div>
      </div>
      
      {/* Subscription Dashboard */}
      <SubscriptionDashboard />
    </div>
  );
}
