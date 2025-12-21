/**
 * Referral Management V2
 * 
 * Member-based referral management page
 * Displays referral code and three-generation referral tree
 * 
 * @component ReferralManagementV2
 */

import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { ArrowLeft, Share2, Users } from 'lucide-react';
import { useBackNavigation } from '../hooks/useBackNavigation';
import { ReferralCodeDisplay } from './referral/ReferralCodeDisplay';
import { ReferralTreeView } from './referral/ReferralTreeView';

export function ReferralManagementV2() {
  const navigate = useBackNavigation();
  
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={navigate} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">推薦管理</h1>
          <p className="text-muted-foreground">管理您的推薦碼與推薦網絡</p>
        </div>
      </div>
      
      {/* Tabs */}
      <Tabs defaultValue="code" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="code" className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            推薦碼
          </TabsTrigger>
          <TabsTrigger value="tree" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            推薦網絡
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="code" className="space-y-6 mt-6">
          <ReferralCodeDisplay />
        </TabsContent>
        
        <TabsContent value="tree" className="space-y-6 mt-6">
          <ReferralTreeView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
