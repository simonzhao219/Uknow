// App 殼層的架構契約（source-level 回歸防線）。
//
// 這些斷言釘住 Wave 3 的三個架構決策，防止日後被無意間退回：
// 1. code splitting——admin 後台與法務內容不得同步打進首屏 bundle
//    （訪客開首頁不需要下載提領審核介面與整份推薦獎勵合約）。
// 2. 全站必須有 ErrorBoundary（render 錯誤不得白屏）。
// 3. 未捕獲的 promise rejection 必須有全域記錄點。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SRC = resolve(__dirname);
const app = readFileSync(join(SRC, 'App.tsx'), 'utf8');
const main = readFileSync(join(SRC, 'main.tsx'), 'utf8');

describe('code splitting 契約', () => {
  it('AdminDashboard 不得同步 import（admin 後台只有管理員需要下載）', () => {
    expect(app).not.toMatch(/^import\s*{\s*AdminDashboard\s*}/m);
    expect(app).toMatch(/lazy\(/);
  });

  it('法務內容檔不得同步 import 進 App（隨內容路由載入）', () => {
    expect(app).not.toMatch(/from '\.\/content\//);
  });

  it('會員區頁面不得同步 import（MemberDashboard 為代表）', () => {
    expect(app).not.toMatch(/^import\s*{\s*MemberDashboard\s*}/m);
  });
});

describe('會籍守衛新鮮度契約', () => {
  // 兩態下「有/無存取權」是硬切換：會員於 session 中途到期時，路由守衛
  // 讀的 accountStatus（來自 /profile）必須能重新驗證，否則守衛整個
  // session 放行已失效會員（卡片顯示失效、人卻還在會員區）。與
  // useSubscription 的 focus-revalidate 對齊：App 必須在分頁切回時
  // 靜默重抓 /profile（refreshUser）。
  it('App 必須對 profile 掛 focus-revalidation（refreshUser）', () => {
    expect(app).toMatch(/useRevalidateOnFocus\(/);
    expect(app).toMatch(/useRevalidateOnFocus\([\s\S]*?refreshUser\(\)/);
  });
});

describe('錯誤防線契約', () => {
  it('App 必須掛 ErrorBoundary', () => {
    expect(app).toMatch(/<ErrorBoundary>/);
  });

  it('main.tsx 必須註冊 unhandledrejection 全域記錄', () => {
    expect(main).toMatch(/unhandledrejection/);
  });
});
