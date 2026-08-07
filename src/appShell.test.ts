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
const PUBLIC = resolve(SRC, '..', 'public');
const app = readFileSync(join(SRC, 'App.tsx'), 'utf8');
const main = readFileSync(join(SRC, 'main.tsx'), 'utf8');
const redirects = readFileSync(join(PUBLIC, '_redirects'), 'utf8');
const headers = readFileSync(join(PUBLIC, '_headers'), 'utf8');

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
    expect(app).toMatch(/<ErrorBoundary[\s>]/);
  });

  it('ErrorBoundary 必須吃路由 key，換頁時重置而非鎖死整個 session', () => {
    expect(app).toMatch(/<ErrorBoundary\s+resetKey=\{location\.pathname\}/);
  });

  it('main.tsx 必須註冊 unhandledrejection 全域記錄', () => {
    expect(main).toMatch(/unhandledrejection/);
  });
});

// 2026-08-07 正式站事故的回歸防線：Pages 部署少上傳了三個 chunk，SPA 後備
// 把「檔案不存在」翻譯成「200 + text/html」，module loader 收到 HTML 直接
// 拒絕，admin 後台整頁進不去。程式碼這側該保證的是「取不到能自癒、且不
// 把一頁的失敗擴散成全站的失敗」；部署那側該保證的是「缺檔要誠實回 404」。
describe('chunk 載入失效的恢復契約', () => {
  it('lazy 路由必須經過 importWithRetry，不得直接把 loader 交給 lazy', () => {
    expect(app).toMatch(/importWithRetry\(loader\)/);
    expect(app).not.toMatch(/lazy\(\(\) => loader\(\)\.then/);
  });

  it('_redirects 必須讓缺席的 /assets/* 回 404，而不是餵 HTML 給 module loader', () => {
    // 靜態檔存在時 Pages 一律先送檔，這條只在檔案真的不存在時生效。
    // 順序重要：必須排在 `/*` 的 SPA 後備之前。
    const assetRule = redirects.indexOf('/assets/*');
    const spaFallback = redirects.indexOf('/* /index.html 200');
    expect(assetRule).toBeGreaterThanOrEqual(0);
    expect(spaFallback).toBeGreaterThanOrEqual(0);
    expect(assetRule).toBeLessThan(spaFallback);
    expect(redirects).toMatch(/^\/assets\/\*\s+\S+\s+404$/m);
  });

  it('_headers 必須讓 HTML 每次重新驗證，重載才拿得到新的資產清單', () => {
    // index.html 被瀏覽器快取住的話，「重新整理」拿回的還是舊的檔名清單，
    // 自癒路徑就失效了。hash 過的 /assets/* 才可以長快取。
    expect(headers).toMatch(/no-cache/i);
    expect(headers).toMatch(/\/assets\/\*/);
    expect(headers).toMatch(/immutable/i);
  });
});
