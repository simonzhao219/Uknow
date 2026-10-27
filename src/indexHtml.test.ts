// index.html 的靜態分享預覽契約：LINE／FB 爬蟲不執行 JS，og 標籤必須寫死在 HTML。
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

const ogContent = (property: string): string | undefined =>
  html.match(new RegExp(`<meta\\s+property="${property}"\\s+content="([^"]*)"`))?.[1];

describe('index.html', () => {
  it('og:title、og:description、og:image 三者都存在且非空', () => {
    for (const p of ['og:title', 'og:description', 'og:image']) {
      expect(ogContent(p), p).toBeTruthy();
    }
  });

  it('og:image 是 https 絕對網址且指向 public 內存在的檔案', () => {
    const image = ogContent('og:image') ?? '';
    expect(image).toMatch(/^https:\/\/uknow\.com\.tw\/[^/]+\.(png|jpg)$/);
    expect(existsSync(resolve(ROOT, 'public', new URL(image).pathname.slice(1)))).toBe(true);
  });

  it('html lang 為 zh-Hant', () => {
    expect(html).toMatch(/<html\s+lang="zh-Hant"/);
  });
});
