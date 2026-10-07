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
import ts from 'typescript';

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

describe('法遵文件一律就地彈窗閱讀', () => {
  it('src/ 內指向法遵內容路由的導覽連結只允許出現在 Footer 與 App 路由表', () => {
    // 背景：表單裡放一條會離開本頁的法遵連結，點下去會卸載整張表單、清空
    // 使用者填到一半的 useState。這個 bug 修過三次——CompleteProfile（換頁）、
    // JoinReferralProgramDialog（開新分頁害返回鈕變死鈕）、WithdrawalProcess
    // （提領步驟 3 的銀行帳號與已上傳照片全歸零）。前兩次的結論只寫進
    // LegalDialog 的 docblock，沒有任何閘門，於是第三次照樣發生。
    //
    // 既有的「外部連結一律在原分頁開啟」只擋 target="_blank"，規則比要守的
    // 行為窄：同分頁導航不帶 target，擋不到。這條補的就是那個缺口。
    //
    // 白名單的兩個檔案是這些頁「正當的」導覽入口：Footer 的快速連結本來就
    // 是要換頁，App.tsx 則是路由定義與舊 slug 轉址。其餘任何檔案要呈現法遵
    // 文件，一律走 LegalDialog（content/*.ts 直接餵給彈窗，不經路由）。
    const LEGAL_ROUTES = [
      '/terms-of-service',
      '/listing-plans',
      '/business-manual',
      '/participation-contract',
      '/referral-reward-rules',
    ];
    // 只抓導覽屬性（href= / to=），不抓 path=（那是路由「定義」不是導覽），
    // 也不抓字串裡剛好提到路由的註解。
    const navToLegalRoute = new RegExp(`(href|to)=["'](${LEGAL_ROUTES.join('|')})["']`);
    const allowed = new Set([
      join('src', 'components', 'Footer.tsx'),
      join('src', 'App.tsx'),
      join('src', 'utils', 'repoHygiene.test.ts'),
    ]);
    const offenders: string[] = [];
    for (const rel of walk('src', ['.ts', '.tsx'])) {
      if (allowed.has(rel)) continue;
      const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
      if (navToLegalRoute.test(text)) offenders.push(rel);
    }
    expect(
      offenders,
      '法遵文件請用 <LegalDialog> 就地彈窗呈現，不要用會離開本頁的 <a href> / ' +
        '<Link to>——表單頁換頁會清空使用者填到一半的資料（見 LegalDialog docblock）',
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

// 兩條規則的比對式拉出來，下方各有正反例自測：比對式寫錯時，「掃完沒有違規」會是假綠。
// 引導鈕三種寫法都要抓：tone="guide"、tone={x ? 'guide' : ...}、buttonVariants({ tone: 'guide' })。
const GUIDE_TONE = /tone=(?:"guide"|\{[^}]*['"]guide['"])|tone:\s*['"]guide['"]/;
// 帶透明度的 ring／outline 色：ring-ring/50、ring-destructive/20、outline-ring/50。
const TRANSLUCENT_RING = /\b(?:ring|outline)-[a-z][\w-]*\/\d+/;

const isSource = (rel: string) => !/\.test\.tsx?$/.test(rel);

describe('守門比對式自測', () => {
  it.each([
    ['<Button tone="guide">', true],
    ["tone={yieldsGuide ? 'secondary' : 'guide'}", true],
    ["buttonVariants({ tone: 'guide', size: 'sm' })", true],
    ['<Button tone="secondary">', false],
    ["buttonVariants({ tone: 'secondary' })", false],
  ])('引導鈕比對式：%s → %s', (text, hit) => {
    expect(GUIDE_TONE.test(text)).toBe(hit);
  });

  it.each([
    ['focus-visible:ring-ring/50', true],
    ['aria-invalid:ring-destructive/20', true],
    ['@apply border-border outline-ring/50;', true],
    ['focus-visible:ring-ring focus-visible:ring-[3px]', false],
    ['@apply border-border outline-ring;', false],
    ['bg-black/50', false],
  ])('半透明環比對式：%s → %s', (text, hit) => {
    expect(TRANSLUCENT_RING.test(text)).toBe(hit);
  });
});

describe('引導鈕只有三種', () => {
  it('tone="guide" 只出現在續訂、加入推薦計畫、確認收款三種鈕所在的元件', () => {
    // ui-ux-guidelines §12.11：品牌色實心的引導鈕只給續訂＞加入推薦計畫＞確認收款，
    // 一頁一顆。它一出現只有一個意思——系統在引導你；多一處就稀釋一次。文件寫得
    // 再清楚也擋不住順手加的第四種，所以釘成白名單：真的要新增（或搬家），同一個
    // PR 改這份清單，審查時就看得到。
    const allowed = [
      join('src', 'components', 'RewardDashboard.tsx'),
      join('src', 'components', 'referral', 'MyQrEntry.tsx'),
      join('src', 'components', 'reward', 'WithdrawalSection.tsx'),
      join('src', 'components', 'subscription', 'SubscriptionStatusCard.tsx'),
    ].sort();
    // button.tsx 是 tone 的定義處（compoundVariants），不是使用者。
    const definition = join('src', 'components', 'ui', 'button.tsx');
    const users = walk('src', ['.ts', '.tsx'])
      .filter(isSource)
      .filter((rel) => rel !== definition)
      .filter((rel) => GUIDE_TONE.test(readFileSync(join(REPO_ROOT, rel), 'utf8')))
      .sort();
    expect(users, '新增引導鈕前先對照 §12.11 的三種與一頁一顆').toEqual(allowed);
  });
});

describe('焦點環與錯誤環一律全不透明', () => {
  it('src/ 的元件與樣式不得用帶透明度的 ring／outline 色', () => {
    // 業主裁決 D1（#354）：焦點環全不透明——灰字 --sel 打三成透明對白底只剩 1.54:1，
    // 過不了 WCAG 1.4.11 的 3:1。錯誤欄位聚焦時的紅環同理（兩成透明的紅等於沒有環）。
    // S2b 收過一次 ring-ring/50、S2e 又在錯誤環與 base 層 outline 各找到一次，所以連
    // .ts 與 .css 一起掃。
    const offenders = walk('src', ['.ts', '.tsx', '.css'])
      .filter(isSource)
      .filter((rel) => TRANSLUCENT_RING.test(readFileSync(join(REPO_ROOT, rel), 'utf8')));
    expect(
      offenders,
      '焦點與錯誤環請用全不透明的 token（ring-ring、ring-destructive-border、outline-ring）',
    ).toEqual([]);
  });
});

// 後台的未遮罩身分證字號與銀行帳號只准待在記憶體（S5 約束 a）。主防線是行為測試
// （adminCache／AdminConsole／AdminDashboard 監看 Storage.prototype.setItem）；這裡
// 補 spy 看不到的路——屬性賦值（sessionStorage.k = v）、新的落地管道。
//
// 以 TypeScript 解析後掃識別字與 import，註解與字串天然不算：用 regex 剝註解會把
// 字串裡的 `//`（例如網址）當成註解起點，吃掉同一行後面的真呼叫而假綠。
// 限制：只掃下列路徑，範圍外的新檔掃不到；`window['localStorage']` 這種字串鍵也看不到
// ——所以它是輔助，不是主防線。
interface StorageRules {
  identifiers: string[];
  members: string[];
  imports: RegExp[];
}

const ADMIN_PII_RULES: StorageRules = {
  identifiers: ['sessionStorage', 'localStorage', 'indexedDB', 'caches'],
  members: ['document.cookie'],
  // 帶副檔名的寫法（`DataCacheContext.tsx`）也算同一個模組。
  imports: [/DataCacheContext(\.[jt]sx?)?$/, /formDraft(\.[jt]sx?)?$/],
};

// 快取、組合 hook 與殼層另禁會把狀態帶出記憶體的管道（網址、跨分頁、視窗名稱）。
const ADMIN_CACHE_RULES: StorageRules = {
  identifiers: [
    ...ADMIN_PII_RULES.identifiers,
    'pushState',
    'replaceState',
    'useSearchParams',
    'setSearchParams',
    'BroadcastChannel',
  ],
  members: [...ADMIN_PII_RULES.members, 'navigator.storage', 'window.name'],
  imports: ADMIN_PII_RULES.imports,
};

function storageUses(source: string, fileName: string, rules: StorageRules): string[] {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const hits: string[] = [];
  const lastName = (node: ts.Expression) =>
    ts.isIdentifier(node) ? node.text : ts.isPropertyAccessExpression(node) ? node.name.text : '';
  const checkImport = (spec: ts.Node | undefined, via = 'import') => {
    if (spec && ts.isStringLiteral(spec) && rules.imports.some((re) => re.test(spec.text))) {
      hits.push(`${via} ${spec.text}`);
    }
  };
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && rules.identifiers.includes(node.text)) hits.push(node.text);
    if (ts.isPropertyAccessExpression(node)) {
      const member = `${lastName(node.expression)}.${node.name.text}`;
      if (rules.members.includes(member)) hits.push(member);
    }
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      checkImport(node.moduleSpecifier);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      checkImport(node.arguments[0]);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require'
    ) {
      checkImport(node.arguments[0], 'require');
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return hits;
}

describe('後台 PII 不得落地', () => {
  it.each([
    ['// sessionStorage.setItem(key, value)', []],
    ["const hint = 'localStorage 不可用';", []],
    ["const url = 'https://x.test//a'; localStorage.setItem('k', v);", ['localStorage']],
    ["sessionStorage.setItem('k', JSON.stringify(rows));", ['sessionStorage']],
    ["window.localStorage.getItem('k');", ['localStorage']],
    ["document.cookie = 'a=b';", ['document.cookie']],
    [
      "import { useDataCache } from '../../contexts/DataCacheContext';",
      ['import ../../contexts/DataCacheContext'],
    ],
    ["const mod = await import('../../utils/formDraft');", ['import ../../utils/formDraft']],
    [
      "import { useDataCache } from '../../contexts/DataCacheContext.tsx';",
      ['import ../../contexts/DataCacheContext.tsx'],
    ],
    ["const { saveDraft } = require('../../utils/formDraft');", ['require ../../utils/formDraft']],
    ['const name = member.name; const view = { cookie: 1 };', []],
  ])('全範圍規則：%s → %j', (source, expected) => {
    expect(storageUses(source, 'sample.ts', ADMIN_PII_RULES)).toEqual(expected);
  });

  it.each([
    ["window.history.replaceState(null, '', url);", ['replaceState']],
    ["const channel = new BroadcastChannel('admin');", ['BroadcastChannel']],
    ['await navigator.storage.persist();', ['navigator.storage']],
    ["window.name = 'admin';", ['window.name']],
    [
      'const [params, setSearchParams] = useSearchParams();',
      ['setSearchParams', 'useSearchParams'],
    ],
    ["// history.pushState({}, '', '/admin?status=pending')", []],
  ])('快取與殼層的額外規則：%s → %j', (source, expected) => {
    expect(storageUses(source, 'sample.tsx', ADMIN_CACHE_RULES)).toEqual(expected);
  });

  it('後台的元件、快取與分頁 hook 不碰任何會落地的儲存', () => {
    const scoped = [
      join('src', 'components', 'AdminDashboard.tsx'),
      join('src', 'hooks', 'usePagedList.ts'),
      join('src', 'hooks', 'useLatestRequest.ts'),
      ...walk(join('src', 'components', 'admin'), ['.ts', '.tsx']),
    ].filter(isSource);
    const admin = (name: string) => join('src', 'components', 'admin', name);
    const strict = ['adminCache.ts', 'useAdminList.ts', 'AdminConsole.tsx'].map(admin);
    // 掃描範圍本身也要釘住：檔案改名、搬家或 walk 漏掃時，「沒有違規」只是因為沒掃到。
    // AdminConsole.tsx 在階段 7 才建立——建立它的那個紅燈 commit 把這裡的預期改成 []。
    const required = [
      ...strict,
      ...['WithdrawalManagement.tsx', 'MemberManagement.tsx', 'IdReviewQueue.tsx'].map(admin),
    ];
    expect(
      required.filter((rel) => !scoped.includes(rel)),
      '清單裡的檔案都要在掃描範圍內（改名或搬家時同步這份清單）',
    ).toEqual([admin('AdminConsole.tsx')]);
    const offenders = scoped.flatMap((rel) => {
      const rules = strict.includes(rel) ? ADMIN_CACHE_RULES : ADMIN_PII_RULES;
      const source = readFileSync(join(REPO_ROOT, rel), 'utf8');
      return storageUses(source, rel, rules).map((hit) => `${rel}: ${hit}`);
    });
    expect(offenders, '後台資料只准待在記憶體（見 adminCache.ts 檔頭）').toEqual([]);
  });
});
