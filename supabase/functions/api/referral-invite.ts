// ============================================================
// Email 邀請（R2）：POST /referrals/invites 與 POST /auth/invite/accept 的處理函式。
//
// 依賴方向：本檔**不得 import ./index.ts**（反向匯入會把整個 Hono app 拖進單元
// 測試，也是循環匯入）。限流常數留在 index.ts（兩支 regex 守衛讀那裡），由路由
// 註冊處組 deps 傳進來。
// ============================================================

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export type InviteEligibility =
  | { ok: true; code: string; name: string }
  | { ok: false; reason: 'not_joined' | 'restricted' | 'unavailable' };

/**
 * 推薦人能不能寄邀請（業主 Q2-13：已加入推薦計畫且未停權即可，不另查會籍）。
 * 停權先判：停權者不該被引導去「加入推薦計畫」。有效推薦碼是寄信的前提（連結
 * 帶碼），沒有 active 碼視同受限。任一讀取失敗 fail-closed 回 unavailable——
 * 讀不到不是「沒資格」。停權判準同 validate_referral_code（suspended_at is null）。
 */
export async function checkInviteEligibility(
  sb: SupabaseClient,
  userId: string,
): Promise<InviteEligibility> {
  try {
    const { data: profile, error: profileErr } = await sb
      .from('profiles')
      .select('name, referral_program_joined, suspended_at')
      .eq('id', userId)
      .maybeSingle();
    if (profileErr || !profile) return { ok: false, reason: 'unavailable' };
    if (profile.suspended_at) return { ok: false, reason: 'restricted' };
    if (!profile.referral_program_joined) return { ok: false, reason: 'not_joined' };

    const { data: codes, error: codeErr } = await sb
      .from('referral_codes')
      .select('code')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1);
    if (codeErr) return { ok: false, reason: 'unavailable' };
    const code = codes?.[0]?.code;
    if (!code) return { ok: false, reason: 'restricted' };
    return { ok: true, code, name: profile.name ?? '' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
