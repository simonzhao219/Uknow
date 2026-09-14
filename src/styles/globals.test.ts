// 設計語言地基（S1，docs/plans/design-language-foundation/plan.md）階段 1+2。
//
// 守的是 §2.2 點名的靜默失效：Tailwind v4 的 `bg-success` 只有在
// `@theme inline` 有 `--color-success` 時才存在——沒有的話那個 class
// 不會報錯，只是不產生任何 CSS。所以測試要驗兩件事，不是一件：
// (a) token 在 `:root`、`.dark`、`@theme inline` 三處齊備（漏一處 → 紅）
// (b) `@theme inline` 每一行的值字面等於預期的 `var(--token名)`（指錯 → 紅）
// 複製貼上打錯一個字（互指錯位）只有 (b) 抓得到。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS_PATH = resolve(__dirname, 'globals.css');
const css = readFileSync(CSS_PATH, 'utf-8');

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** 挖出 `header { ... }` 區塊的內容（本檔涉及的三個區塊本身都不含巢狀 `{`）。 */
function extractBlock(source: string, header: RegExp): string {
  const match = header.exec(source);
  if (!match) {
    throw new Error(`globals.css 找不到區塊：${header}`);
  }
  const start = match.index + match[0].length;
  const end = source.indexOf('}', start);
  if (end === -1) {
    throw new Error(`globals.css 的區塊未閉合：${header}`);
  }
  return source.slice(start, end);
}

/** 把區塊內容解析成 `--token名 → 值字面` 的 map（值兩側空白已 trim）。 */
function parseDeclarations(block: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of stripComments(block).split(';')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const prop = trimmed.slice(0, idx).trim();
    if (!prop.startsWith('--')) continue;
    map.set(prop, trimmed.slice(idx + 1).trim());
  }
  return map;
}

const rootTokens = parseDeclarations(extractBlock(css, /:root\s*\{/));
const darkTokens = parseDeclarations(extractBlock(css, /\.dark\s*\{/));
const themeTokens = parseDeclarations(extractBlock(css, /@theme inline\s*\{/));

// §2.1 token 分層表：success / warning 各補齊 A（實心底+其上字）、
// B（淺底提示框+其上字+框）三形狀；destructive 已有 A（既有），
// 本次補 B 的 subtle 三件組（業主裁決 Q1）。C 形狀（裸字）不發新
// token，直接重用 B 的 `-subtle-foreground`（§2.1 表格「形狀 C」列）。
const NEW_SEMANTIC_TOKENS = [
  'success',
  'success-foreground',
  'success-subtle',
  'success-subtle-foreground',
  'success-border',
  'warning',
  'warning-foreground',
  'warning-subtle',
  'warning-subtle-foreground',
  'warning-border',
  'destructive-subtle',
  'destructive-subtle-foreground',
  'destructive-border',
];

describe('globals.css 語義色 token 三處齊備（success / warning / destructive-subtle）', () => {
  for (const name of NEW_SEMANTIC_TOKENS) {
    it(`--${name} 在 :root 有定義`, () => {
      expect(rootTokens.has(`--${name}`), `:root 缺少 --${name}`).toBe(true);
    });

    it(`--${name} 在 .dark 有定義`, () => {
      expect(darkTokens.has(`--${name}`), `.dark 缺少 --${name}`).toBe(true);
    });

    it(`@theme inline 的 --color-${name} 值字面等於 var(--${name})`, () => {
      const key = `--color-${name}`;
      expect(themeTokens.has(key), `@theme inline 缺少 ${key}`).toBe(true);
      // 值字面必須「指對」，不是只要存在——複製貼上打錯一個字
      // （例：`--color-success-subtle: var(--success);` 漏改成互指）
      // 只驗存在完全抓不到，這正是本節要堵的靜默失效。
      expect(
        themeTokens.get(key),
        `@theme inline 的 ${key} 指到 ${themeTokens.get(key)}，預期 var(--${name})`,
      ).toBe(`var(--${name})`);
    });
  }

  it('既有 --destructive / --destructive-foreground 未被本次改動誤刪', () => {
    expect(rootTokens.has('--destructive')).toBe(true);
    expect(rootTokens.has('--destructive-foreground')).toBe(true);
    expect(darkTokens.has('--destructive')).toBe(true);
    expect(darkTokens.has('--destructive-foreground')).toBe(true);
  });
});
