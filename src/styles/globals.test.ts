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

// ---------------------------------------------------------------------------
// 階段 2：對比度門檻（§2.3.1）。
//
// 自我指涉陷阱：驗證 token 的測試與被測的 contrastRatio() 共用同一個公式，
// 公式寫錯（例如漏掉 WCAG 相對亮度的 gamma 校正分段）不會報錯，測試照樣
// 全綠，但證明的是「這些色值在錯公式下達標」，不是「達標」。所以分兩段，
// 順序不可顛倒：2a 先用與本專案 token 無關的已知參考值錨定公式（含兩個
// 跨門檻的臨界案例），公式綠了才在 2b 驗 token。
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.trim().replace(/^#/, '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`不是合法的 hex 色值：${hex}`);
  }
  const num = Number.parseInt(full, 16);
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

function srgbChannelToLinear(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(srgbChannelToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x 對比度公式。純函式，與本檔其餘部分無關，可獨立錨定。 */
function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexToRgb(hexA));
  const lB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 只支援 oklch(L C H) 裡 C≈0 的灰階（本 repo `--background`/`--card` 深色版
 * 的實際形式）。這不是通用 oklch→sRGB 轉換——那條路要寫整套色彩空間矩陣，
 * bug 會讓閘門說謊（§2.3）。彩度非零時直接丟錯，不猜、不靜默跳過。
 * 推導：C=0 時 OKLab a=b=0，Björn Ottosson 的 OKLab→線性 sRGB 矩陣三列
 * 係數各自加總為 1，化簡成 r=g=b=L³（線性光），再套 sRGB gamma 分段函數。
 */
function parseOklchGrayToHex(value: string): string {
  const match = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value.trim());
  if (!match) {
    throw new Error(`不是可解析的 oklch(...) 語法：${value}`);
  }
  const l = Number.parseFloat(match[1]);
  const c = Number.parseFloat(match[2]);
  if (c > 1e-6) {
    throw new Error(`oklch 色值含非零彩度（${value}），本函式只支援灰階，需人工擴充或改存 hex`);
  }
  const x = l ** 3;
  const channel = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  const byte = Math.round(Math.min(1, Math.max(0, channel)) * 255);
  const hexByte = byte.toString(16).padStart(2, '0');
  return `#${hexByte}${hexByte}${hexByte}`;
}

/** 讀到不可解析的色值格式（例：rgba()）直接丟錯——不靜默跳過（§7 風險表）。 */
function resolveToHex(value: string): string {
  const trimmed = value.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('oklch(')) {
    return parseOklchGrayToHex(trimmed);
  }
  throw new Error(`讀不到可解析的色值：${value}`);
}

describe('對比度公式錨定（階段 2a，與專案 token 無關的已知參考值）', () => {
  it('#000000 對 #ffffff 是 WCAG 定義的上界 21:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('任一色對自己是下界 1:1', () => {
    expect(contrastRatio('#3366cc', '#3366cc')).toBeCloseTo(1, 5);
  });

  it('#777777 對 #ffffff 落在 4.5:1 門檻之下（約 4.48，差一點點不過）', () => {
    const ratio = contrastRatio('#777777', '#ffffff');
    expect(ratio).toBeCloseTo(4.48, 1);
    expect(ratio).toBeLessThan(4.5);
  });

  it('#767676 對 #ffffff 剛好跨過 4.5:1 門檻（約 4.54）', () => {
    const ratio = contrastRatio('#767676', '#ffffff');
    expect(ratio).toBeCloseTo(4.54, 1);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe('oklch 灰階解析錨定（只認 C=0，讀不到就直接紅）', () => {
  it('oklch(1 0 0) 解析為白', () => {
    expect(parseOklchGrayToHex('oklch(1 0 0)')).toBe('#ffffff');
  });

  it('oklch(0 0 0) 解析為黑', () => {
    expect(parseOklchGrayToHex('oklch(0 0 0)')).toBe('#000000');
  });

  it('非零彩度的 oklch 直接丟錯，不當成灰階猜', () => {
    expect(() => parseOklchGrayToHex('oklch(0.5 0.2 30)')).toThrow();
  });

  it('resolveToHex 讀到不支援的 rgba 語法直接丟錯', () => {
    expect(() => resolveToHex('rgba(0, 0, 0, 0.1)')).toThrow();
  });
});

type Mode = 'light' | 'dark';
const MODES: readonly Mode[] = ['light', 'dark'];
const FAMILIES = ['success', 'warning', 'destructive'] as const;

function tokensFor(mode: Mode): Map<string, string> {
  return mode === 'light' ? rootTokens : darkTokens;
}

function hexOf(mode: Mode, tokenName: string): string {
  const tokens = tokensFor(mode);
  const raw = tokens.get(`--${tokenName}`);
  if (raw === undefined) {
    throw new Error(`${mode} 缺少 --${tokenName}`);
  }
  return resolveToHex(raw);
}

// ---------------------------------------------------------------------------
// 推薦樹世代色（S2，僅供 ReferralTreeView 使用，plan.md D3）：avatar（實心底配
// 白字）與 badge/line（淺底提示框，深色模式反轉為暗底亮字）兩組，各 3 階；
// 且兩組都要與「已失效」狀態灰（已收斂為 --muted-foreground）保持可辨識距離，
// 避免深色模式下分不出「第幾代」還是「已失效」（S1 二審 R2-UIUX-1）。
// ---------------------------------------------------------------------------

const TREE_GEN_TIERS = [1, 2, 3] as const;
// 相對亮度差的最低距離——不是 WCAG 標準門檻，是本專案為「避免多值分類色與既有
// 狀態灰混淆」自訂的可辨識基準（棘輪式判準的一種：寫得出具體數字才可驗）。
const TREE_GEN_MIN_LUMINANCE_GAP = 0.08;

function luminanceOf(mode: Mode, tokenName: string): number {
  return relativeLuminance(hexToRgb(hexOf(mode, tokenName)));
}

describe('推薦樹世代色 token 三處齊備', () => {
  const TREE_GEN_TOKENS = [
    'tree-gen-avatar-1',
    'tree-gen-avatar-2',
    'tree-gen-avatar-3',
    'tree-gen-avatar-foreground',
    'tree-gen-badge-1',
    'tree-gen-badge-2',
    'tree-gen-badge-3',
    'tree-gen-badge-foreground',
  ];

  for (const name of TREE_GEN_TOKENS) {
    it(`--${name} 在 :root 有定義`, () => {
      expect(rootTokens.has(`--${name}`), `:root 缺少 --${name}`).toBe(true);
    });

    it(`--${name} 在 .dark 有定義`, () => {
      expect(darkTokens.has(`--${name}`), `.dark 缺少 --${name}`).toBe(true);
    });

    it(`@theme inline 的 --color-${name} 值字面等於 var(--${name})`, () => {
      const key = `--color-${name}`;
      expect(themeTokens.has(key), `@theme inline 缺少 ${key}`).toBe(true);
      expect(themeTokens.get(key)).toBe(`var(--${name})`);
    });
  }
});

describe('推薦樹世代色對比度（階段 2b 之後，公式已錨定）', () => {
  for (const mode of MODES) {
    const modeLabel = mode === 'light' ? '淺色' : '深色';

    for (const tier of TREE_GEN_TIERS) {
      it(`${modeLabel}：avatar 第 ${tier} 階對 avatar-foreground 達 4.5:1`, () => {
        const ratio = contrastRatio(
          hexOf(mode, `tree-gen-avatar-${tier}`),
          hexOf(mode, 'tree-gen-avatar-foreground'),
        );
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });

      it(`${modeLabel}：badge 第 ${tier} 階對 badge-foreground 達 4.5:1`, () => {
        const ratio = contrastRatio(
          hexOf(mode, `tree-gen-badge-${tier}`),
          hexOf(mode, 'tree-gen-badge-foreground'),
        );
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }

    it(`${modeLabel}：avatar 三階彼此的相對亮度嚴格遞增（三代可互相分辨）`, () => {
      const [l1, l2, l3] = TREE_GEN_TIERS.map((t) => luminanceOf(mode, `tree-gen-avatar-${t}`));
      expect(l1).toBeLessThan(l2);
      expect(l2).toBeLessThan(l3);
    });

    it(`${modeLabel}：badge 三階彼此的相對亮度嚴格遞增（三代可互相分辨）`, () => {
      const [l1, l2, l3] = TREE_GEN_TIERS.map((t) => luminanceOf(mode, `tree-gen-badge-${t}`));
      expect(l1).toBeLessThan(l2);
      expect(l2).toBeLessThan(l3);
    });

    for (const tier of TREE_GEN_TIERS) {
      it(`${modeLabel}：avatar 第 ${tier} 階與失效灰亮度差 ≥ ${TREE_GEN_MIN_LUMINANCE_GAP}`, () => {
        const gap = Math.abs(
          luminanceOf(mode, `tree-gen-avatar-${tier}`) - luminanceOf(mode, 'muted-foreground'),
        );
        expect(gap).toBeGreaterThanOrEqual(TREE_GEN_MIN_LUMINANCE_GAP);
      });

      it(`${modeLabel}：badge 第 ${tier} 階與失效灰亮度差 ≥ ${TREE_GEN_MIN_LUMINANCE_GAP}`, () => {
        const gap = Math.abs(
          luminanceOf(mode, `tree-gen-badge-${tier}`) - luminanceOf(mode, 'muted-foreground'),
        );
        expect(gap).toBeGreaterThanOrEqual(TREE_GEN_MIN_LUMINANCE_GAP);
      });
    }
  }
});

describe('token 對比度（階段 2b，公式錨定後才驗，§2.1 三形狀 × 淺深兩版）', () => {
  for (const mode of MODES) {
    const modeLabel = mode === 'light' ? '淺色' : '深色';

    for (const family of FAMILIES) {
      it(`${modeLabel}：${family} A 形狀（實心底+字）達 4.5:1`, () => {
        const ratio = contrastRatio(hexOf(mode, family), hexOf(mode, `${family}-foreground`));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });

      it(`${modeLabel}：${family} B 形狀（淺底字對淺底）達 4.5:1`, () => {
        const ratio = contrastRatio(
          hexOf(mode, `${family}-subtle-foreground`),
          hexOf(mode, `${family}-subtle`),
        );
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });

      it(`${modeLabel}：${family}-border 對 ${family}-subtle 達 3:1（非文字元素）`, () => {
        const ratio = contrastRatio(
          hexOf(mode, `${family}-border`),
          hexOf(mode, `${family}-subtle`),
        );
        expect(ratio).toBeGreaterThanOrEqual(3);
      });

      it(`${modeLabel}：${family} 裸字對 --background 達 4.5:1`, () => {
        const ratio = contrastRatio(
          hexOf(mode, `${family}-subtle-foreground`),
          hexOf(mode, 'background'),
        );
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });

      it(`${modeLabel}：${family} 裸字對 --card 達 4.5:1`, () => {
        const ratio = contrastRatio(
          hexOf(mode, `${family}-subtle-foreground`),
          hexOf(mode, 'card'),
        );
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
