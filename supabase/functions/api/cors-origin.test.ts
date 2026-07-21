// CORS 來源放行規則的契約測試。
//
// 這條 API 的 Access-Control-Allow-Origin 是安全邊界：放行誰就等於允許誰的頁面
// 帶著使用者憑證打這支後端。因此「放行哪些、擋掉哪些」必須被釘死：
//   * 正式站（FRONTEND_URL）與 Cloudflare Pages 本專案網域（含預覽子網域）放行；
//   * 其餘一律擋，且不能被 `uknow.pages.dev.attacker.com` 這類前綴／字串包含繞過；
//   * localhost 只在開發旗標下放行。
import { assertEquals } from 'jsr:@std/assert@1';
import { isAllowedOrigin } from './index.ts';

// 用可注入的 read，讓測試不依賴真實環境變數。
function readerFrom(env: Record<string, string | undefined>) {
  return (k: string) => env[k];
}

Deno.test('放行正式站 FRONTEND_URL（去尾斜線後精確比對）', () => {
  const read = readerFrom({ FRONTEND_URL: 'https://app.uknow.com.tw' });
  assertEquals(isAllowedOrigin('https://app.uknow.com.tw', read), 'https://app.uknow.com.tw');
  // FRONTEND_URL 帶尾斜線、瀏覽器 Origin 不帶——仍應相等放行。
  const read2 = readerFrom({ FRONTEND_URL: 'https://app.uknow.com.tw/' });
  assertEquals(isAllowedOrigin('https://app.uknow.com.tw', read2), 'https://app.uknow.com.tw');
});

Deno.test('放行 Cloudflare Pages 正式網域與預覽子網域', () => {
  const read = readerFrom({ FRONTEND_URL: 'https://app.uknow.com.tw' });
  assertEquals(isAllowedOrigin('https://uknow.pages.dev', read), 'https://uknow.pages.dev');
  assertEquals(
    isAllowedOrigin('https://claude-dashboard-qr-member-r.uknow.pages.dev', read),
    'https://claude-dashboard-qr-member-r.uknow.pages.dev',
  );
  assertEquals(
    isAllowedOrigin('https://2371e8ad.uknow.pages.dev', read),
    'https://2371e8ad.uknow.pages.dev',
  );
});

Deno.test('擋掉冒充網域：字串包含 / 前綴不得繞過', () => {
  const read = readerFrom({ FRONTEND_URL: 'https://app.uknow.com.tw' });
  assertEquals(isAllowedOrigin('https://uknow.pages.dev.attacker.com', read), '');
  assertEquals(isAllowedOrigin('https://evil-uknow.pages.dev.attacker.com', read), '');
  assertEquals(isAllowedOrigin('https://app.uknow.com.tw.attacker.com', read), '');
  assertEquals(isAllowedOrigin('https://attacker.com', read), '');
});

Deno.test('localhost 僅在開發旗標下放行', () => {
  const base = { FRONTEND_URL: 'https://app.uknow.com.tw' };
  assertEquals(isAllowedOrigin('http://localhost:5173', readerFrom(base)), '');
  assertEquals(
    isAllowedOrigin('http://localhost:5173', readerFrom({ ...base, DEV_CORS: 'true' })),
    'http://localhost:5173',
  );
  assertEquals(
    isAllowedOrigin('http://127.0.0.1:5173', readerFrom({ ...base, PAYUNI_SANDBOX: 'true' })),
    'http://127.0.0.1:5173',
  );
});

Deno.test('空 Origin / 非法 Origin 一律不放行、不丟例外', () => {
  const read = readerFrom({ FRONTEND_URL: 'https://app.uknow.com.tw' });
  assertEquals(isAllowedOrigin('', read), '');
  assertEquals(isAllowedOrigin('not-a-url', read), '');
});
