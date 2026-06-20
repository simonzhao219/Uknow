import React, { createContext, useContext, useCallback, ReactNode } from 'react';

export interface Features {
  serviceProviderManagement: boolean;
  referralManagement: boolean;
  taskCenter: boolean;
  rewardSystem: boolean;
}

interface FeatureContextType {
  features: Features | null;
  isFeatureEnabled: (featureKey: keyof Features) => boolean;
  refreshFeatures: () => void;
  isLoading: boolean;
}

const FeatureContext = createContext<FeatureContextType | undefined>(undefined);

const ALL_FEATURES: Features = {
  serviceProviderManagement: true,
  referralManagement:        true,
  taskCenter:                true,
  rewardSystem:              true,
};

export function FeatureProvider({ children }: { children: ReactNode }) {
  const isFeatureEnabled = useCallback(
    (featureKey: keyof Features) => ALL_FEATURES[featureKey],
    []
  );

  const refreshFeatures = useCallback(() => {}, []);

  return (
    <FeatureContext.Provider
      value={{ features: ALL_FEATURES, isFeatureEnabled, refreshFeatures, isLoading: false }}
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
