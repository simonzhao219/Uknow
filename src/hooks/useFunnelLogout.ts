export interface FunnelLogout {
  logout: () => Promise<void>;
  isLoggingOut: boolean;
}

export function useFunnelLogout(): FunnelLogout {
  return { logout: async () => {}, isLoggingOut: false };
}
