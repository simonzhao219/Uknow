import { describe, expect, it } from 'vitest';
import { canonicalRedirectUrl } from './canonicalHost';

const loc = (hostname: string, pathname = '/', search = '', hash = '') => ({
  hostname,
  pathname,
  search,
  hash,
});

describe('canonicalRedirectUrl', () => {
  it.each([
    ['uknow.pages.dev', '/', '', '', 'https://uknow.com.tw/'],
    ['uknow.pages.dev', '/auth', '', '', 'https://uknow.com.tw/auth'],
    [
      'uknow.pages.dev',
      '/listing/12',
      '?ref=ABC',
      '#top',
      'https://uknow.com.tw/listing/12?ref=ABC#top',
    ],
    ['uknow.pages.dev', '/', '', '#access_token=x', 'https://uknow.com.tw/#access_token=x'],
  ])('根網址 %s%s%s%s 導向正式網域並保留路徑', (host, path, search, hash, expected) => {
    expect(canonicalRedirectUrl(loc(host, path, search, hash))).toBe(expected);
  });

  it.each([
    'develop.uknow.pages.dev',
    'abc123.uknow.pages.dev',
    'uknow.pages.dev.attacker.com',
    'evil-uknow.pages.dev',
    'xuknow.pages.dev',
    'localhost',
    '127.0.0.1',
    'uknow.com.tw',
    'www.uknow.com.tw',
    '',
  ])('主機 %s 不導向', (host) => {
    expect(canonicalRedirectUrl(loc(host, '/x', '?a=1', '#h'))).toBeNull();
  });

  it('主機大小寫與結尾點不影響判斷時仍精確比對', () => {
    expect(canonicalRedirectUrl(loc('UKNOW.PAGES.DEV'))).toBe('https://uknow.com.tw/');
    expect(canonicalRedirectUrl(loc('uknow.pages.dev.'))).toBe('https://uknow.com.tw/');
  });
});
