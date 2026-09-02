// App 殼層的架構契約（source-level 回歸防線）。
//
// 這些斷言釘住 Wave 3 的三個架構決策，防止日後被無意間退回：
// 1. code splitting——admin 後台與法務內容不得同步打進首屏 bundle
//    （訪客開首頁不需要下載提領審核介面與整份事業手冊）。
// 2. 全站必須有 ErrorBoundary（render 錯誤不得白屏）。
// 3. 未捕獲的 promise rejection 必須有全域記錄點。
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
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

  it('MyQrPage 走 lazy——掃碼庫與相機邏輯不該進首屏 bundle', () => {
    expect(app).not.toMatch(/^import\s*{\s*MyQrPage\s*}/m);
    expect(app).toMatch(/lazyNamed\(\s*\(\) => import\('\.\/components\/MyQrPage'\)/);
  });
});

// /admin/verify 是管理員可能加在手機主畫面的舊網址。轉址本身不守門（守門在
// 目的地），但**必須帶 state.from**：漏了的話掃完按返回會落到會員中心，而
// 管理員平常是在後台工作的。state 不會反映在網址上，只有這裡看得到。
describe('舊路由轉址契約', () => {
  it('/admin/verify 轉址到掃描分頁並帶上來源', () => {
    expect(app).toMatch(/path="\/admin\/verify"/);
    expect(app).toMatch(/to="\/dashboard\/qr\?tab=scan"/);
    expect(app).toMatch(/state=\{\{\s*from:\s*'\/admin'\s*\}\}/);
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
// 把一頁的失敗擴散成全站的失敗」。
//
// 「缺檔要誠實回 404」原本想用 `_redirects` 的 `/assets/* /404.html 404`
// 達成——**那條規則 Cloudflare 不支援**，而且為它新增的 `public/404.html`
// 反而關掉了 Pages 的 SPA 後備（見下面「Pages 服務模式契約」）。缺檔的
// 誠實回報改由部署後 smoke（scripts/check-deployed-assets.py）負責：那是
// 唯一真的驗證得到「上傳完整」的層，靜態檢查與 CI 都碰不到線上檔案。
describe('chunk 載入失效的恢復契約', () => {
  it('lazy 路由必須經過 importWithRetry，不得直接把 loader 交給 lazy', () => {
    expect(app).toMatch(/importWithRetry\(loader\)/);
    expect(app).not.toMatch(/lazy\(\(\) => loader\(\)\.then/);
  });

  it('hash 過的 /assets/* 必須宣告長快取，重複下載會拖慢每一次進站', () => {
    expect(headers).toMatch(/\/assets\/\*/);
    expect(headers).toMatch(/immutable/i);
  });
});

// _headers 的重複宣告陷阱（與上面同一個根因：把平台行為寫進註解卻沒查文件）。
//
// 官方 Custom headers 文件兩句話決定了這件事：
//   「An incoming request which matches multiple rules' URL patterns will
//    inherit **all** rules' headers.」
//   「If a header is applied twice in the `_headers` file, the values are
//    **joined with a comma separator**.」
//
// 也就是說 `/*` 與 `/assets/*` 兩個區塊都寫 Cache-Control 時，`/assets/x.js`
// 兩條都命中，拿到的是 `no-cache, public, max-age=31536000, immutable`——
// **不是覆寫，是相加**。而 `no-cache` 要求每次都回源驗證，於是那個一年期的
// immutable 完全失效，每個 chunk 每次進站都重新驗證一遍。
//
// 舊註解寫的是「後面的規則會覆寫前面同名的標頭」，舊測試也只斷言字串
// `immutable` 有出現——**兩者都不會因為這個缺陷而變紅**。
//
// HTML 的重新驗證改為倚賴 Pages 的預設值（Serving Pages 文件：cacheable 的
// 回應會帶 `Cache-Control: public, max-age=0, must-revalidate`），語意與
// no-cache 等價且不需要一條會與 /assets/* 相撞的 `/*` 規則。這一項靜態檢查
// 驗不到，由部署後 smoke 對真實回應標頭把關。
describe('_headers 重複宣告契約', () => {
  it('同一個標頭不得跨規則重複宣告，Cloudflare 是逗號合併而非覆寫', () => {
    const declared = headers
      .split('\n')
      .filter((line) => /^\s+\S/.test(line) && !line.trimStart().startsWith('#'))
      .map((line) => line.trim().split(':')[0].trim().toLowerCase());
    const seen = new Set<string>();
    const duplicated = declared.filter((name) => {
      if (seen.has(name)) return true;
      seen.add(name);
      return false;
    });
    expect(duplicated).toEqual([]);
  });
});

// Cloudflare Pages 的服務模式契約（2026-08-08 事故的回歸防線）。
//
// 症狀：`develop.uknow.pages.dev` 上任何**硬導航到深層路徑**（在 /admin 按
// 重新整理、直接貼網址、掃 QR、從外部連結點進來、金流導回 /payment/result）
// 都得到一張純靜態的「找不到這個資源」，而不是 SPA。
//
// 根因是 08-07 那次修復自己帶進來的，兩條都寫在 Cloudflare 官方文件裡：
//
//   1. Serving Pages —「If your project does **not** include a top-level
//      `404.html` file, Pages assumes that you are deploying a single-page
//      application.」新增 `public/404.html` → 建置輸出多了 `build/404.html`
//      → Pages 從 SPA 模式切換成 Not Found 模式，深層路徑一律回 404 頁。
//   2. Redirects —「Rewrites (other status codes) ❌」，文件舉的**不支援**
//      範例正是 `/blog/* /blog/404.html 404`，與我們寫的
//      `/assets/* /404.html 404` 同形。那條規則從來沒有生效過。
//
// 同一份文件還寫著「Redirects are always followed, regardless of whether or
// not an asset matches the incoming request」——與舊註解宣稱的「靜態檔存在時
// Pages 一律先送檔」相反。**舊測試把這個錯誤的心智模型釘成了綠燈**，是比沒有
// 測試更糟的狀態：它宣稱守著一條平台根本不執行的規則。
describe('Cloudflare Pages 服務模式契約', () => {
  it('建置輸出根目錄不得有 404.html——它會關掉 Pages 的 SPA 模式', () => {
    // public/ 的內容會原樣複製到建置輸出根目錄，所以這裡就是 top-level。
    expect(existsSync(join(PUBLIC, '404.html'))).toBe(false);
  });

  it('_redirects 必須保留 SPA 後備，深層路徑才交得回前端路由', () => {
    expect(redirects).toMatch(/^\/\*\s+\/index\.html\s+200$/m);
  });

  it('_redirects 不得出現非 200／3xx 的改寫，Cloudflare 不支援', () => {
    // 支援的只有 200（proxy／rewrite）與 301/302/303/307/308（真轉址）。
    // 其餘狀態碼寫了不會報錯，只會靜默失效——所以要在 CI 就擋住。
    const supported = new Set(['200', '301', '302', '303', '307', '308']);
    const offenders = redirects
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'))
      .filter((line) => {
        const code = line.split(/\s+/)[2];
        return code !== undefined && !supported.has(code);
      });
    expect(offenders).toEqual([]);
  });
});
