// 使用者主動登出（頁首會員登出、註冊中登出）與無效 session 清理共用的登出。
//
// global 登出要打網路：回錯誤、擲例外、或卡住超過逾時，都補一次 `scope:'local'`。
// supabase-js 在網路錯誤時不清本機 session——不補的話導 /login 後 AuthPage 偵測到
// 殘留 session 又把人拉回去；卡住不設上限的話登出鈕停在進行中，畫面像凍結。

/** global 登出等待上限；之後改走本機登出（不打網路）。 */
export const SIGN_OUT_TIMEOUT_MS = 5_000;

type SignOutAuth = {
  signOut: (opts?: { scope?: 'global' | 'local' | 'others' }) => Promise<unknown>;
};

export async function signOutWithFallback(auth: SignOutAuth): Promise<{ localOnly: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), SIGN_OUT_TIMEOUT_MS);
  });

  let ok = false;
  try {
    const result = await Promise.race([auth.signOut(), timedOut]);
    ok = result !== 'timeout' && !(result as { error?: unknown } | undefined)?.error;
  } catch {
    ok = false;
  } finally {
    clearTimeout(timer);
  }
  if (ok) return { localOnly: false };

  try {
    await auth.signOut({ scope: 'local' });
  } catch {
    // 本機清除不走網路；真的失敗也照樣讓呼叫端清狀態、導頁。
  }
  return { localOnly: true };
}
