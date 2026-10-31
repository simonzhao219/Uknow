import type { AuthHint } from './authHint';

export type AuthState = 'unknown' | 'anonymous' | 'authenticated' | 'degraded';

export type AuthView = 'guest' | 'placeholder' | 'member-pending' | 'funnel' | 'member';

export interface AuthViewInput {
  authState: AuthState | undefined;
  isFunnel?: boolean;
  isAdmin?: boolean;
  isLoggedIn?: boolean;
  hint: Pick<AuthHint, 'kind'> | null | undefined;
  pathname: string;
}

export function resolveAuthView(_input: AuthViewInput): AuthView {
  return 'guest';
}
