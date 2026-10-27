// ============================================================
// Email 邀請（R2）的接線守衛（不碰資料庫）：
//   (A) referralInviteDeps().limits 的六組上限與窗口逐一對到 index.ts 的常數。
//       spec-drift 只驗「規格書 ↔ 常數」，常數到行為的接線沒有人驗——兩個 key
//       對調時規格書與 DB 測試都不會紅。
//   (B) referral-invite.ts 不反向 import ./index.ts（依賴只經 deps 注入）。
// ============================================================
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { ensureEdgeFunctionEnv } from './test-helpers.ts';

ensureEdgeFunctionEnv();
Deno.env.set('PAYUNI_MER_ID', 'TESTMER');
Deno.env.set('PAYUNI_HASH_KEY', '0123456789abcdef0123456789abcdef');
Deno.env.set('PAYUNI_HASH_IV', '0123456789ab');
Deno.env.set('PAYUNI_SANDBOX', 'false');
Deno.env.set('FRONTEND_URL', 'https://frontend.test');

const index = await import('./index.ts');

Deno.test('referralInviteDeps：六組限流的上限與窗口逐一接到對應常數', () => {
  assertEquals(index.referralInviteDeps().limits, {
    perUserHour: {
      max: index.REFERRAL_INVITE_RATE_MAX,
      windowSeconds: index.REFERRAL_INVITE_RATE_WINDOW_SECONDS,
    },
    perUserDay: {
      max: index.REFERRAL_INVITE_DAILY_MAX,
      windowSeconds: index.REFERRAL_INVITE_DAILY_WINDOW_SECONDS,
    },
    target: {
      max: index.REFERRAL_INVITE_TARGET_MAX,
      windowSeconds: index.REFERRAL_INVITE_TARGET_WINDOW_SECONDS,
    },
    globalHour: {
      max: index.REFERRAL_INVITE_GLOBAL_HOUR_MAX,
      windowSeconds: index.REFERRAL_INVITE_GLOBAL_HOUR_WINDOW_SECONDS,
    },
    globalDay: {
      max: index.REFERRAL_INVITE_GLOBAL_DAY_MAX,
      windowSeconds: index.REFERRAL_INVITE_GLOBAL_DAY_WINDOW_SECONDS,
    },
    accept: {
      max: index.INVITE_ACCEPT_RATE_MAX,
      windowSeconds: index.INVITE_ACCEPT_RATE_WINDOW_SECONDS,
    },
  });
});

Deno.test('referral-invite.ts：不 import ./index.ts（依賴只經 deps 注入）', async () => {
  const source = await Deno.readTextFile(new URL('./referral-invite.ts', import.meta.url));
  assert(!/from\s+['"]\.\/index\.ts['"]/.test(source), '反向匯入會把整個 Hono app 拖進來');
});
