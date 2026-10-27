// 邀請連結「設定密碼」的送出流程（v3：accept 一步完成設密碼＋驗證 email）。
//
//   POST /auth/invite/accept { token, password }
//     → 200：以剛設的密碼 signInWithPassword（email 取自連結 payload）
//            → routeAfterVerifiedSession 依 registrationStep 導向
//     → 錯誤：只回 code；文案由呼叫端依 code 決定，不讀後端 message
//            （那是後端後備句或 GoTrue 英文原文）
//
// 公開端點，沿用 AuthPage 的 fetch(buildApiUrl(...))，不走會在 401 時登出的 apiClient。
import { useCallback, useState } from 'react';
import type { ReferralInviteAcceptErrorCode } from '@contract';
import { buildApiUrl, extractApiErrorCode } from '../utils/apiClient';
import { clearPendingInviteToken } from '../utils/referralInvite';
import {
  type RouteAfterVerifiedSessionDeps,
  routeAfterVerifiedSession,
} from '../utils/routeAfterVerifiedSession';

/** 後端設密碼最壞約 10 秒（GoTrue 逾時）；再留網路餘裕。 */
const ACCEPT_TIMEOUT_MS = 25_000;

export type InviteAcceptResult =
  /** 密碼已設、已登入並導向下一步。 */
  | { kind: 'signed_in' }
  /** 密碼已設、email 已驗證，但以剛設的密碼登入失敗（轉登入步驟讓人自己登入）。 */
  | { kind: 'accepted_login_failed' }
  /** accept 失敗；code 為 undefined 代表網路失敗或回應不是錯誤信封。 */
  | { kind: 'failed'; code: ReferralInviteAcceptErrorCode | (string & {}) | undefined };

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

export function useInviteAccept({ supabase, fetchImpl, navigate, showToast }: UseInviteAcceptDeps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = useCallback(
    async ({ token, email, password }: InviteAcceptInput): Promise<InviteAcceptResult> => {
      const doFetch = fetchImpl ?? fetch;
      setIsSubmitting(true);
      try {
        let response: Response;
        // 網路掛住時不讓按鈕永遠轉圈：逾時即中止，當成無 code 的暫時性失敗（留在原步驟可重試）。
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ACCEPT_TIMEOUT_MS);
        try {
          response = await doFetch(buildApiUrl('/auth/invite/accept'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password }),
            signal: controller.signal,
          });
        } catch {
          return { kind: 'failed', code: undefined };
        } finally {
          clearTimeout(timer);
        }

        if (!response.ok) {
          let code: string | undefined;
          try {
            code = extractApiErrorCode(await response.json());
          } catch {
            code = undefined;
          }
          return { kind: 'failed', code };
        }

        // 密碼已設、email 已驗證：這個連結的任務完成，之後再點會是 409。
        clearPendingInviteToken();

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error || !data.session) return { kind: 'accepted_login_failed' };

        await routeAfterVerifiedSession(data.session, {
          fetchProfile: (accessToken) =>
            doFetch(buildApiUrl('/auth/profile'), {
              headers: { Authorization: `Bearer ${accessToken}` },
            }),
          navigate,
          showToast,
        });
        return { kind: 'signed_in' };
      } catch {
        return { kind: 'accepted_login_failed' };
      } finally {
        setIsSubmitting(false);
      }
    },
    [supabase, fetchImpl, navigate, showToast],
  );

  return { submit, isSubmitting };
}
