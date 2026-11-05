/**
 * 用語機械把關(W5-53):使用者看得到的字串不得出現「下線／上線／傳銷商／直銷」,
 * 一律用「推薦人／您推薦的會員／一代二代三代」。
 *
 * 背景:業主 2026-10-23 裁決使用者可見文案一律「推薦人」,2026-11-05 重申。
 * 原本只有刊登方案頁(listingPlans.test.ts)與邀請文案
 * (supabase/functions/_shared/recruitment-copy.ts 的 RECRUITMENT_FORBIDDEN_WORDS)
 * 有測試把關,其餘全靠人記得。
 *
 * 掃描對象:src/**\/*.{ts,tsx} 的字串字面值、樣板字串、JSX 文字(用 TypeScript
 * compiler API 解析,所以註解、識別字、型別不會誤擋)。
 * 排除:*.test.*(測試檔需要寫出禁用詞才能斷言它們不出現)。
 * 不在範圍:規格書、內部文件、程式註解、已套用 migration(規格書 §7 術語對照
 * 明定內部術語)、supabase/functions 的後端字串(邀請文案另有 RECRUITMENT_FORBIDDEN_WORDS)。
 *
 * 禁用詞表與 RECRUITMENT_FORBIDDEN_WORDS 刻意分開:那份是「招募文案不得暗示
 * 收入／僱傭」的法遵詞表(Deno 側、涵蓋賺／獎金等),這份是「平台自己的用語」
 * 詞表(前端全站字串)。兩者只在「直銷」「下線」重疊,語意與適用範圍不同。
 * 用「傳銷商」而不用「傳銷」:服務類別「傳銷」是職業類別名(10-23 裁決保留)。
 *
 * 白名單 = 律師定案、維持原文的內容頁(10-23 裁決),且只列「目前確有命中」的檔:
 * 其餘律師頁(termsOfService、referralRewardRules)現在沒有命中,不放行——
 * 日後律師改版若帶進禁用詞,CI 會紅,逼人當下決定「進白名單」還是「改字」。
 * 退場條件:律師定稿改用「推薦人」用語後,從 LAWYER_FINALIZED 移除該檔。
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const BANNED_TERMS = ['下線', '上線', '傳銷商', '直銷'] as const;

const LAWYER_FINALIZED = new Set([
  'src/content/businessManual.ts',
  'src/content/participationContract.ts',
]);

type Hit = { line: number; term: string; text: string };

function scanSource(fileName: string, source: string): Hit[] {
  const kind = fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const hits: Hit[] = [];
  const visit = (node: ts.Node): void => {
    const k = node.kind;
    const isText =
      k === ts.SyntaxKind.StringLiteral ||
      k === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
      k === ts.SyntaxKind.TemplateHead ||
      k === ts.SyntaxKind.TemplateMiddle ||
      k === ts.SyntaxKind.TemplateTail ||
      k === ts.SyntaxKind.JsxText;
    if (isText) {
      const text = k === ts.SyntaxKind.JsxText ? node.getText() : (node as ts.LiteralLikeNode).text;
      for (const term of BANNED_TERMS) {
        if (text.includes(term)) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          hits.push({ line, term, text: text.slice(0, 40) });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSourceFiles(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('scanSource(用語掃描器自身)', () => {
  it('字串字面值、樣板字串、JSX 文字出現禁用詞時回報', () => {
    const src = [
      'const a = "您的下線已加入";',
      'const b = `傳銷商 ${a}`;',
      'const c = <p>直銷說明</p>;',
      "const d = '請稍後再上線';",
    ].join('\n');
    const terms = scanSource('x.tsx', src).map((h) => h.term);
    expect(terms).toEqual(['下線', '傳銷商', '直銷', '上線']);
  });

  it('註解與識別字出現禁用詞時不回報', () => {
    const src = [
      '// 下線 是內部術語',
      '/* 傳銷商 */',
      'const 上線 = 1;',
      'const ok = "推薦人";',
    ].join('\n');
    expect(scanSource('x.ts', src)).toEqual([]);
  });

  it('職業類別名「傳銷」本身不算命中(只擋「傳銷商」)', () => {
    expect(scanSource('x.ts', 'const c = "傳銷";')).toEqual([]);
  });
});

describe('使用者可見文案用語把關(W5-53)', () => {
  it('src 下非測試檔、非律師定案白名單的字串不含下線／上線／傳銷商／直銷', () => {
    const offenders: string[] = [];
    for (const file of listSourceFiles('src')) {
      const rel = file.split(path.sep).join('/');
      if (LAWYER_FINALIZED.has(rel)) continue;
      for (const hit of scanSource(rel, fs.readFileSync(file, 'utf8'))) {
        offenders.push(`${rel}:${hit.line} 「${hit.term}」 → ${hit.text}`);
      }
    }
    expect(
      offenders,
      '使用者看得到的文案請改用「推薦人／您推薦的會員／一代二代三代」(W5-53)',
    ).toEqual([]);
  });

  it('律師定案白名單的檔案都存在且確實含禁用詞(失效的白名單要移除)', () => {
    for (const rel of LAWYER_FINALIZED) {
      expect(fs.existsSync(rel), `${rel} 不存在,請從白名單移除`).toBe(true);
      expect(
        scanSource(rel, fs.readFileSync(rel, 'utf8')).length,
        `${rel} 已無命中,請從白名單移除`,
      ).toBeGreaterThan(0);
    }
  });
});
