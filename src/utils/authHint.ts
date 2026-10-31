import type { FunnelNextKind } from './registrationFlow';

export const AUTH_HINT_KEY = 'uknow:auth-hint';

export type AuthHintKind = 'member' | 'funnel';

export interface AuthHint {
  v: 1;
  kind: AuthHintKind;
  initial: string;
  uid8: string;
  next: FunnelNextKind | null;
  at: number;
}

export type AuthHintInput = Pick<AuthHint, 'kind' | 'initial' | 'uid8' | 'next'>;

export function toUid8(_id: string | null | undefined): string {
  return '';
}

export function initialOf(_name: string | null | undefined): string {
  return '';
}

export function readAuthHint(_storage?: Storage | null): AuthHint | null {
  return null;
}

export function writeAuthHint(
  _input: AuthHintInput,
  _storage?: Storage | null,
  _now?: number,
): void {}

export function clearAuthHint(_storage?: Storage | null): void {}

export function loadAuthHint(_storage?: Storage | null): AuthHint | null {
  return null;
}
