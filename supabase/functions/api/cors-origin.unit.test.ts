// ============================================================
// resolveCorsOrigin：CORS 放行決策的「環境隔離」測試維度。
//
// 為什麼需要這一維：
//   原本的規則對 `*.uknow.pages.dev` 是**無條件**放行,理由是「預覽站跑的
//   是 production edge function,不放行會被擋成 Failed to fetch」。前端改成
//   分支感知(非 main 一律打 develop 分支 DB)之後那個前提就不成立了,但
//   放行條款留著——於是「預覽站誤打正式站」這個應該要爆炸的錯誤會靜默成功,
//   而環境沒分乾淨時,這正是最難察覺的一種。
//
//   收緊後的不變式:**只有自己就是預覽環境的部署,才放行其他預覽網域**。
//   判準取自 FRONTEND_URL 本身,不另開旗標(多一個旗標就多一個會不一致的東西)。
//
// 這裡直接測純函式,不經 app.request:決定安全性的分支要能被窮舉,
// 而不是靠「線上看起來能用」。
// ============================================================
import { assertEquals } from 'jsr:@std/assert@1';
import { resolveCorsOrigin } from './index.ts';

function reader(env: Record<string, string>): (k: string) => string | undefined {
  return (k) => env[k];
}

const PROD = { FRONTEND_URL: 'https://uknow.com.tw', PAYUNI_SANDBOX: 'false' };
const DEVELOP = { FRONTEND_URL: 'https://develop.uknow.pages.dev', PAYUNI_SANDBOX: 'true' };

const PREVIEW_ORIGIN = 'https://claude-dev-prod-environment.uknow.pages.dev';

Deno.test('resolveCorsOrigin：正式站放行自己的網域', () => {
  assertEquals(resolveCorsOrigin('https://uknow.com.tw', reader(PROD)), 'https://uknow.com.tw');
});

Deno.test('resolveCorsOrigin：FRONTEND_URL 帶結尾斜線仍比對得上', () => {
  const env = reader({ FRONTEND_URL: 'https://uknow.com.tw/' });
  assertEquals(resolveCorsOrigin('https://uknow.com.tw', env), 'https://uknow.com.tw');
});

// 本次收緊的核心：同一個 Origin，在兩個環境有相反的結果
Deno.test('resolveCorsOrigin：正式站拒絕 pages.dev 預覽網域', () => {
  assertEquals(
    resolveCorsOrigin(PREVIEW_ORIGIN, reader(PROD)),
    '',
    '預覽站誤打正式站必須失敗,不能靜默成功',
  );
  assertEquals(
    resolveCorsOrigin('https://uknow.pages.dev', reader(PROD)),
    '',
    'Pages 專案根網域對正式站一樣不是自己人',
  );
});

Deno.test('resolveCorsOrigin：develop 放行手足預覽網域', () => {
  assertEquals(
    resolveCorsOrigin(PREVIEW_ORIGIN, reader(DEVELOP)),
    PREVIEW_ORIGIN,
    'branch 預覽打 develop 後端是正常路徑,必須放行',
  );
});

Deno.test('resolveCorsOrigin：兩種環境都擋前綴與後綴繞過網域', () => {
  for (const [name, env] of [['正式站', PROD], ['develop', DEVELOP]] as const) {
    assertEquals(
      resolveCorsOrigin('https://uknow.pages.dev.attacker.com', reader(env)),
      '',
      `${name}:後綴繞過不得放行`,
    );
    assertEquals(
      resolveCorsOrigin('https://evil-uknow.pages.dev', reader(env)),
      '',
      `${name}:前綴繞過不得放行`,
    );
  }
});

Deno.test('resolveCorsOrigin：非開發模式不放行 localhost', () => {
  assertEquals(resolveCorsOrigin('http://localhost:3000', reader(PROD)), '');
  assertEquals(
    resolveCorsOrigin('http://localhost.attacker.com', reader(PROD)),
    '',
    'localhost.attacker.com 不得被當成本機',
  );
});

Deno.test('resolveCorsOrigin：開發旗標下才放行真正的 localhost', () => {
  const devCors = reader({ FRONTEND_URL: 'https://uknow.com.tw', DEV_CORS: 'true' });
  assertEquals(resolveCorsOrigin('http://localhost:3000', devCors), 'http://localhost:3000');
  assertEquals(resolveCorsOrigin('http://127.0.0.1:3000', devCors), 'http://127.0.0.1:3000');
  assertEquals(
    resolveCorsOrigin('http://localhost.attacker.com', devCors),
    '',
    '開發模式也不得被前綴網域繞過',
  );
  // PayUni sandbox 是另一條開發旗標（develop 就是靠它）
  assertEquals(
    resolveCorsOrigin('http://localhost:3000', reader(DEVELOP)),
    'http://localhost:3000',
  );
});

Deno.test('resolveCorsOrigin：非法 Origin 與未設 FRONTEND_URL 一律拒絕', () => {
  assertEquals(resolveCorsOrigin('not-a-url', reader(PROD)), '');
  // FRONTEND_URL 沒設時不得退化成「空字串比對成功」而放行任何人
  assertEquals(resolveCorsOrigin('https://anything.test', reader({})), '');
  assertEquals(resolveCorsOrigin('', reader({})), '');
});
