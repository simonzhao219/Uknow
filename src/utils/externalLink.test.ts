import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openExternalLink } from './externalLink';

describe('openExternalLink', () => {
  let win: { location: { href: string } };

  beforeEach(() => {
    win = { location: { href: '' } };
    vi.stubGlobal('window', win);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('在原分頁導頁（設定 location.href），不開新分頁/視窗', () => {
    openExternalLink('https://line.me/R/ti/p/@uknow');
    expect(win.location.href).toBe('https://line.me/R/ti/p/@uknow');
  });
});
