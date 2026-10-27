import { useCallback, useState } from 'react';
import type { RouteAfterVerifiedSessionDeps } from '../utils/routeAfterVerifiedSession';

export type InviteAcceptResult =
  /** 密碼已設、已登入並導向下一步。 */
  | { kind: 'signed_in' }
  /** 密碼已設、email 已驗證，但以剛設的密碼登入失敗（轉登入步驟讓人自己登入）。 */
  | { kind: 'accepted_login_failed' }
  /** accept 失敗；code 為 undefined 代表網路失敗或回應不是錯誤信封。 */
  | { kind: 'failed'; code: string | undefined };

export interface UseInviteAcceptDeps {
  supabase: {
    auth: {
      signInWithPassword: (credentials: { email: string; password: string }) => Promise<{
        data: { session: { access_token: string } | null };
        error: unknown;
      }>;
    };
  };
  fetchImpl?: typeof fetch;
  navigate: RouteAfterVerifiedSessionDeps['navigate'];
  showToast: RouteAfterVerifiedSessionDeps['showToast'];
}

export interface InviteAcceptInput {
  token: string;
  email: string;
  password: string;
}

export function useInviteAccept(_deps: UseInviteAcceptDeps) {
  const [isSubmitting] = useState(false);
  const submit = useCallback(
    async (_input: InviteAcceptInput): Promise<InviteAcceptResult> => ({
      kind: 'failed',
      code: undefined,
    }),
    [],
  );
  return { submit, isSubmitting };
}
