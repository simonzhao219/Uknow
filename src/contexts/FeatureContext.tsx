import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

// 定義功能類型
export interface Features {
  serviceProviderManagement: boolean; // 刊登管理
  referralManagement: boolean; // 推薦官管理
  taskCenter: boolean; // 任務中心
  rewardSystem: boolean; // 獎勵回饋
}

interface FeatureContextType {
  features: Features | null;
  isFeatureEnabled: (featureKey: keyof Features) => boolean;
  refreshFeatures: () => void;
  isLoading: boolean;
}

const FeatureContext = createContext<FeatureContextType | undefined>(undefined);

// 預設值：只有刊登管理開啟
const defaultFeatures: Features = {
  serviceProviderManagement: true,
  referralManagement: false,
  taskCenter: false,
  rewardSystem: false,
};

export function FeatureProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState<Features | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 從後端獲取功能狀態
  const fetchFeatures = useCallback(async () => {
    try {
      console.log('🔄 FeatureContext: 獲取功能開關狀態...');
      
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-5c6718b9/admin/features`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ FeatureContext: 成功獲取功能開關', data.features);
      
      setFeatures(data.features);
    } catch (error) {
      console.error('❌ FeatureContext: 獲取功能開關失敗，使用預設值', error);
      
      // 降級到默認狀態
      setFeatures(defaultFeatures);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 組件掛載時獲取功能狀態
  useEffect(() => {
    fetchFeatures();
  }, [fetchFeatures]);

  // 刷新功能狀態（供管理員更新後使用）
  const refreshFeatures = useCallback(() => {
    console.log('🔄 FeatureContext: 手動刷新功能開關...');
    setIsLoading(true);
    fetchFeatures();
  }, [fetchFeatures]);

  const isFeatureEnabled = useCallback((featureKey: keyof Features) => {
    if (!features) return false;
    return features[featureKey];
  }, [features]);

  // Loading 狀態
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground">載入中...</p>
        </div>
      </div>
    );
  }

  return (
    <FeatureContext.Provider 
      value={{ 
        features, 
        isFeatureEnabled,
        refreshFeatures,
        isLoading
      }}
    >
      {children}
    </FeatureContext.Provider>
  );
}

export function useFeatures() {
  const context = useContext(FeatureContext);
  if (context === undefined) {
    throw new Error('useFeatures must be used within a FeatureProvider');
  }
  return context;
}
