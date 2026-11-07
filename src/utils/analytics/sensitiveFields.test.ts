import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRIVATE_ROUTES, SENSITIVE_FIELDS } from './sensitiveFields';

const SRC = resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/** 錨點行之前最近的 `<div` 那一行（欄位群組的根容器開頭）。 */
function groupRootLine(rel: string, anchor: string): string | null {
  const lines = read(rel).split('\n');
  const at = lines.findIndex((l) => l.includes(anchor));
  if (at === -1) return null;
  for (let i = at; i >= Math.max(0, at - 4); i--) {
    if (lines[i].includes('<div')) return lines[i];
  }
  return null;
}

/** 從 id="X" 那行到第一個 `/>` 為止的 <Input> 文字。 */
function inputElementText(rel: string, id: string): string | null {
  const lines = read(rel).split('\n');
  const at = lines.findIndex((l) => l.includes(`id="${id}"`));
  if (at === -1) return null;
  const out: string[] = [];
  for (let i = at; i < Math.min(lines.length, at + 25); i++) {
    out.push(lines[i]);
    if (lines[i].includes('/>')) break;
  }
  return out.join('\n');
}

describe('SENSITIVE_FIELDS 群組根容器', () => {
  for (const f of SENSITIVE_FIELDS) {
    it(`${f.file} 的 ${f.anchor} 群組根容器帶 block class`, () => {
      const root = groupRootLine(f.file, f.anchor);
      expect(root, '找不到錨點或其根容器').not.toBeNull();
      expect(root).toMatch(/privateClass\(|ph-no-capture/);
    });
  }
});

describe('SENSITIVE_FIELDS 輸入屬性', () => {
  for (const f of SENSITIVE_FIELDS.filter((x) => x.attrs)) {
    it(`${f.file} 的 ${f.inputId} 有必要的 autocomplete／inputMode`, () => {
      const text = inputElementText(f.file, f.inputId as string);
      expect(text, '找不到 <Input>').not.toBeNull();
      for (const a of f.attrs as string[]) expect(text).toContain(a);
    });
  }

  it('身分證字號欄位不得設成數字鍵盤（首碼為英文字母）', () => {
    for (const f of SENSITIVE_FIELDS.filter(
      (x) => x.inputId === 'nationalId' || x.inputId === 'idNumber',
    )) {
      const text = inputElementText(f.file, f.inputId as string) ?? '';
      expect(text, `${f.file} ${f.inputId}`).not.toMatch(/inputMode="(numeric|tel)"/);
    }
  });
});

describe('敏感欄位漏網掃描', () => {
  const KEYWORDS = /(phone|birth|national|idnumber|bank|account|id-front|id-back)/i;

  it('components 內命中敏感詞的 htmlFor／id 都已登記（admin 整段不錄，排除）', () => {
    const registered = new Set(SENSITIVE_FIELDS.map((f) => `${f.file}|${f.anchor}`));
    const registeredAnchors = SENSITIVE_FIELDS.map((f) => ({ file: f.file, anchor: f.anchor }));
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === 'admin' || e.name === 'ui') continue;
          walk(full);
          continue;
        }
        if (!/\.tsx$/.test(e.name) || /\.test\.tsx$/.test(e.name)) continue;
        const rel = full.slice(SRC.length + 1);
        for (const [, kind, name] of read(rel).matchAll(/\b(htmlFor|id)="([^"]+)"/g)) {
          if (!KEYWORDS.test(name) || kind === 'id') continue;
          const hit = registeredAnchors.some(
            (r) => r.file === rel && r.anchor === `htmlFor="${name}"`,
          );
          if (!hit) offenders.push(`${rel} htmlFor="${name}"`);
        }
      }
    };
    walk(join(SRC, 'components'));
    expect(registered.size).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});

describe('付款頁與後台路由層', () => {
  const app = read('App.tsx');
  for (const route of PRIVATE_ROUTES) {
    it(`${route} 的 element 包在 PrivateRegion 內`, () => {
      const re = new RegExp(`path="${route}"[\\s\\S]{0,160}<PrivateRegion>`);
      expect(app).toMatch(re);
    });
  }
});
