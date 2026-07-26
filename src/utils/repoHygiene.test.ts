// Repo 衛生守門測試。
//
// 背景：code review 發現兩類「不該進版本庫的東西」曾經（或正在）存在：
// 1. 真實用戶個資傾印——export/*.json 含 146 筆會員的姓名/身分證字號/手機/生日，
//    src/imports/reward-summary.json 含真實用戶姓名的一次性腳本輸出。
// 2. 編碼損毀的中文字串——U+FFFD 替換字元直接出現在使用者可見文案中
//    （「稍後註冊」toast 的「完成」二字曾損毀成兩個替換字元）。
// 這些測試在 CI 的 `npm test` 中長期看守，防止同類問題再次進入 repo。
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..');

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...walk(rel, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      out.push(rel);
    }
  }
  return out;
}

describe('個資傾印不得進版本庫', () => {
  it('repo 根目錄不得存在 export/ 資料傾印目錄', () => {
    expect(
      existsSync(join(REPO_ROOT, 'export')),
      'export/ 含真實會員個資（姓名/身分證/手機/生日），不得存在於 repo；' +
        '資料備份應放在受存取控管的儲存位置（如 Supabase Storage 私有 bucket）',
    ).toBe(false);
  });

  it('src/imports/ 一次性腳本輸出目錄不得存在', () => {
    expect(
      existsSync(join(REPO_ROOT, 'src', 'imports')),
      'src/imports/reward-summary.json 是含真實用戶姓名的一次性 migration 輸出，不得進版本庫',
    ).toBe(false);
  });

  it('src/ 內不得出現含真實個資欄位組合的 JSON 傾印', () => {
    // 個資傾印的指紋：同一個 JSON 檔同時含 nationalId 與真實格式的手機/生日欄位值。
    // 測試 fixtures 用的假資料（如 A123456789）不受影響——這裡只掃 .json 檔。
    for (const rel of walk('src', ['.json'])) {
      const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
      expect(
        /"(nationalId|national_id)"\s*:\s*"[A-Z][12]\d{8}"/.test(text),
        `${rel} 疑似含真實身分證字號的資料傾印`,
      ).toBe(false);
    }
  });
});

describe('使用者可見文案不得含編碼損毀字元', () => {
  it('src/ 所有 .ts/.tsx 檔不得含 U+FFFD 替換字元', () => {
    const offenders: string[] = [];
    for (const rel of walk('src', ['.ts', '.tsx'])) {
      const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
      if (text.includes('\uFFFD')) offenders.push(rel);
    }
    expect(offenders, 'U+FFFD 代表檔案位元組已損毀，使用者會看到亂碼').toEqual([]);
  });
});

describe('外部連結一律在原分頁開啟', () => {
  it('src/ 內不得使用 target="_blank" 或 window.open(url, \'_blank\')', () => {
    // 背景：LINE/IG/FB 等聯絡連結曾各自複製貼上 target="_blank" /
    // window.open(url, '_blank') 開新分頁，與產品預期（原頁開啟）不符。
    // JS 導頁一律改用 utils/externalLink.ts 的 openExternalLink()；
    // <a> 標籤不加 target（預設 _self 即為原頁開啟）。
    const blankTarget = /target=["']_blank["']/;
    const windowOpenBlank = /window\.open\([^)]*_blank/;
    // 這兩檔只在註解裡「提及」舊寫法（記錄先前修過的分頁歷史 bug），
    // 不是實際使用，掃描規則抓不出註解與程式碼的差異，故白名單排除。
    const commentOnlyMentions = new Set([
      join('src', 'utils', 'backNavigation.ts'),
      join('src', 'components', 'referral', 'JoinReferralProgramDialog.tsx'),
    ]);
    const offenders: string[] = [];
    for (const rel of walk('src', ['.ts', '.tsx'])) {
      if (rel === join('src', 'utils', 'repoHygiene.test.ts')) continue;
      if (commentOnlyMentions.has(rel)) continue;
      const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
      if (blankTarget.test(text) || windowOpenBlank.test(text)) offenders.push(rel);
    }
    expect(
      offenders,
      '外部連結請在原分頁開啟：<a> 不加 target="_blank"；JS 導頁改用 ' +
        'utils/externalLink.ts 的 openExternalLink()',
    ).toEqual([]);
  });
});

describe('官方 LINE 帳號代稱統一', () => {
  it('src/ 內不得出現大寫版官方 LINE 帳號代稱，一律透過 utils/constants 的共用常數呈現小寫 @uknow', () => {
    // 拆字組出 pattern，避免這行本身的字面量被自己的掃描規則命中。
    const mixedCaseHandle = new RegExp(`@${'U'}know\\b`);
    const offenders: string[] = [];
    for (const rel of walk('src', ['.ts', '.tsx'])) {
      if (rel === join('src', 'utils', 'repoHygiene.test.ts')) continue;
      const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
      if (mixedCaseHandle.test(text)) offenders.push(rel);
    }
    expect(
      offenders,
      '官方 LINE 帳號代稱應統一小寫 @uknow（見 LINE_OFFICIAL_ACCOUNT_HANDLE）',
    ).toEqual([]);
  });
});
