import type { AuthHint } from '../utils/authHint';
import type { AuthState } from '../utils/authView';
import type { ProfileFetchResult, FetchProfileOptions } from '../utils/fetchProfile';

type Session = { access_token?: string; user?: { id?: string } } | null;

export interface AuthBootstrapSupabase {
  auth: {
    getSession(): Promise<{ data: { session: Session } }>;
    onAuthStateChange(cb: (event: string, session: Session) => void): {
      data: { subscription: { unsubscribe(): void } };
    };
    signOut(): Promise<unknown>;
  };
}

export interface AuthBootstrapDeps {
  supabase: AuthBootstrapSupabase;
  fetchProfile: (token: string, opts: FetchProfileOptions) => Promise<ProfileFetchResult>;
  clearInflight: () => void;
  onSignedOut: () => void;
  onIncompleteProfile: () => void;
  getPathname?: () => string;
  storage?: Storage | null;
}

export type AuthOutcome = 'none' | 'ok' | 'transient' | 'signedOut';

export interface AuthBootstrap {
  user: any;
  setUser: (user: any) => void;
  authState: AuthState;
  outcome: AuthOutcome;
  funnelProfile: any;
  isFunnel: boolean;
  nextFunnelRoute: string | null;
  hint: AuthHint | null;
  isLoadingUser: boolean;
  refreshUser: () => Promise<any | null>;
  ingestProfile: (profile: any) => void;
}

export function useAuthBootstrap(_deps: AuthBootstrapDeps): AuthBootstrap {
  return {
    user: null,
    setUser: () => {},
    authState: 'unknown',
    outcome: 'none',
    funnelProfile: null,
    isFunnel: false,
    nextFunnelRoute: null,
    hint: null,
    isLoadingUser: true,
    refreshUser: async () => null,
    ingestProfile: () => {},
  };
}
