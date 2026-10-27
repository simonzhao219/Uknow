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

  it('og:site_name 與 og:title 品牌名統一寫 Uknow', () => {
    expect(ogContent('og:site_name')).toBe('Uknow');
    expect(ogContent('og:title')).toMatch(/^Uknow｜/);
  });

  it('og:image 附寬高且 twitter:card 為 summary_large_image', () => {
    expect(ogContent('og:image:width')).toBe('1200');
    expect(ogContent('og:image:height')).toBe('630');
    expect(html).toMatch(/<meta\s+name="twitter:card"\s+content="summary_large_image"/);
  });

  it('有 meta description 與指向正式站首頁的 canonical', () => {
    expect(html.match(/<meta\s+name="description"\s+content="([^"]+)"/)?.[1]).toBeTruthy();
    expect(html).toMatch(/<link rel="canonical" href="https:\/\/uknow\.com\.tw\/" \/>/);
  });

  it('favicon、apple-touch-icon、manifest 的連結都指向 public 內存在的檔案', () => {
    const hrefs = [
      ...html.matchAll(/<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*href="([^"]+)"/g),
    ].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThanOrEqual(4);
    for (const href of hrefs) {
      expect(existsSync(resolve(ROOT, 'public', href.slice(1))), href).toBe(true);
    }
  });

  it('JSON-LD 可解析，含 name 為 Uknow 的 Organization 與 WebSite', () => {
    const raw = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? '';
    const graph = JSON.parse(raw)['@graph'] as { '@type': string; name: string }[];
    for (const type of ['Organization', 'WebSite']) {
      expect(graph.find((n) => n['@type'] === type)?.name, type).toBe('Uknow');
    }
  });
});

describe('public 搜尋與安裝檔案', () => {
  const pub = (name: string) => readFileSync(resolve(ROOT, 'public', name), 'utf8');

  it('robots.txt 含 Sitemap 行並擋 /admin', () => {
    const robots = pub('robots.txt');
    expect(robots).toMatch(/^Sitemap: https:\/\/uknow\.com\.tw\/sitemap\.xml$/m);
    expect(robots).toMatch(/^Disallow: \/admin$/m);
  });

  it('sitemap.xml 結構完整，不含需登入的 /service-providers 管理頁', () => {
    const xml = pub('sitemap.xml');
    expect(xml).toMatch(/^<\?xml[^>]*\?>\s*<urlset [^>]*>[\s\S]*<\/urlset>\s*$/);
    expect(xml.match(/<url>/g)?.length).toBe(xml.match(/<\/url>/g)?.length);
    expect(xml).toContain('<loc>https://uknow.com.tw/listing-plans</loc>');
    expect(xml).not.toContain('<loc>https://uknow.com.tw/service-providers</loc>');
  });

  it('site.webmanifest 可解析且帶兩張 icon', () => {
    const manifest = JSON.parse(pub('site.webmanifest'));
    expect(manifest.name).toBe('Uknow');
    expect(manifest.icons).toHaveLength(2);
    for (const icon of manifest.icons) {
      expect(existsSync(resolve(ROOT, 'public', icon.src.slice(1))), icon.src).toBe(true);
    }
  });
});
