/**
 * Reward Management V2
 * 
 * Main page for reward management
 * Displays reward dashboard with schedules and history
 * 
 * @component RewardManagementV2
 */

import { Button } from './ui/button';
import { ArrowLeft } from 'lucide-react';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { RewardDashboard } from './reward/RewardDashboard';

export function RewardManagementV2() {
  const navigate = useBackNavigation();
  
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={navigate} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">獎勵管理</h1>
          <p className="text-muted-foreground">查看您的獎勵點數與發放排程</p>
        </div>
      </div>
      
      {/* Dashboard */}
      <RewardDashboard />
    </div>
  );
}
