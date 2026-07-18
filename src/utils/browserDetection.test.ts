import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectInAppBrowser,
  getCurrentURL,
  openInExternalBrowser,
  copyLinkToClipboard,
} from './browserDetection';

// vitest.config.ts runs these in the `node` environment (no jsdom), so there is
// no real navigator/window/document. Each test stubs exactly the globals the
// function under test reads, then unstubAllGlobals() restores them afterwards.
// This is the browser-agnostic gate the LINE user hits first: `detectInAppBrowser`
// decides which UA renders the full app vs. is recognised as an in-app browser.

interface StubLocation {
  href: string;
  host?: string;
  pathname?: string;
  search?: string;
}

function stubBrowser(options: {
  ua?: string;
  liff?: boolean;
  location?: StubLocation;
  clipboard?: unknown;
  document?: unknown;
} = {}) {
  const {
    ua = 'test-agent',
    liff = false,
    location = { href: 'https://uknow.example.com/path?ref=abc' },
    clipboard,
    document: doc,
  } = options;

  const navigatorStub: Record<string, unknown> = { userAgent: ua };
  if (clipboard !== undefined) navigatorStub.clipboard = clipboard;

  const windowStub: Record<string, unknown> = { location };
  if (liff) windowStub.liff = {};

  vi.stubGlobal('navigator', navigatorStub);
  vi.stubGlobal('window', windowStub);
  if (doc !== undefined) vi.stubGlobal('document', doc);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Representative real-world user-agent strings for each detected surface.
const UA = {
  lineIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/13.5.0',
  lineAndroid:
    'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/114.0.0.0 Mobile Safari/537.36 Line/13.5.0/IAB',
  lineUpper:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 LINE/13.5.0',
  facebookIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/430.0.0]',
  facebookAndroid:
    'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/430.0.0]',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.29.110',
  twitter:
    'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36 TwitterAndroid',
  wechat:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.34(0x18002234)',
  androidWebview:
    'Mozilla/5.0 (Linux; Android 13; SM-S908B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/114.0.0.0 Mobile Safari/537.36',
  iosWebview:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
  iosChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
};

describe('detectInAppBrowser — in-app browsers', () => {
  it('detects LINE on iOS via the "Line/" token', () => {
    stubBrowser({ ua: UA.lineIOS });
    const result = detectInAppBrowser();
    expect(result.isInAppBrowser).toBe(true);
    expect(result.platform).toBe('line');
  });

  it('detects LINE on Android even though the UA also contains chrome/safari', () => {
    stubBrowser({ ua: UA.lineAndroid });
    expect(detectInAppBrowser().platform).toBe('line');
  });

  it('detects LINE regardless of token casing (UA is lower-cased first)', () => {
    stubBrowser({ ua: UA.lineUpper });
    expect(detectInAppBrowser().platform).toBe('line');
  });

  it('detects LINE via the injected window.liff global even with a plain browser UA', () => {
    stubBrowser({ ua: UA.iosSafari, liff: true });
    const result = detectInAppBrowser();
    expect(result.isInAppBrowser).toBe(true);
    expect(result.platform).toBe('line');
  });

  it('detects Facebook on iOS (FBAN) and Android (FB_IAB)', () => {
    stubBrowser({ ua: UA.facebookIOS });
    expect(detectInAppBrowser().platform).toBe('facebook');
    stubBrowser({ ua: UA.facebookAndroid });
    expect(detectInAppBrowser().platform).toBe('facebook');
  });

  it('detects Instagram', () => {
    stubBrowser({ ua: UA.instagram });
    expect(detectInAppBrowser().platform).toBe('instagram');
  });

  it('detects Twitter', () => {
    stubBrowser({ ua: UA.twitter });
    expect(detectInAppBrowser().platform).toBe('twitter');
  });

  it('detects WeChat (MicroMessenger)', () => {
    stubBrowser({ ua: UA.wechat });
    expect(detectInAppBrowser().platform).toBe('wechat');
  });

  it('detects a generic Android WebView (wv + android)', () => {
    stubBrowser({ ua: UA.androidWebview });
    expect(detectInAppBrowser().platform).toBe('webview');
  });

  it('detects an iOS WebView via the AppleWebKit-without-Safari heuristic', () => {
    stubBrowser({ ua: UA.iosWebview });
    expect(detectInAppBrowser().platform).toBe('webview');
  });
});

describe('detectInAppBrowser — real browsers are not flagged', () => {
  it.each([
    ['desktop Chrome', UA.desktopChrome],
    ['iOS Safari', UA.iosSafari],
    ['iOS Chrome (CriOS)', UA.iosChrome],
    ['Android Chrome', UA.androidChrome],
  ])('treats %s as a normal external browser', (_label, ua) => {
    stubBrowser({ ua });
    const result = detectInAppBrowser();
    expect(result.isInAppBrowser).toBe(false);
    expect(result.platform).toBeNull();
  });

  it('excludes search-engine crawlers', () => {
    stubBrowser({ ua: UA.googlebot });
    const result = detectInAppBrowser();
    expect(result.isInAppBrowser).toBe(false);
    expect(result.platform).toBeNull();
  });
});

describe('getCurrentURL', () => {
  it('returns window.location.href', () => {
    stubBrowser({ location: { href: 'https://uknow.example.com/service-providers/42' } });
    expect(getCurrentURL()).toBe('https://uknow.example.com/service-providers/42');
  });
});

describe('openInExternalBrowser', () => {
  it('uses the x-web-search scheme on iOS and reports success', () => {
    const location: StubLocation = { href: 'https://uknow.example.com/payment/checkout' };
    stubBrowser({ ua: UA.iosSafari, location });
    const ok = openInExternalBrowser();
    expect(ok).toBe(true);
    expect(location.href).toContain('x-web-search://');
    expect(location.href).toContain(encodeURIComponent('https://uknow.example.com/payment/checkout'));
  });

  it('builds an intent:// URL on Android and reports success', () => {
    const location: StubLocation = {
      href: 'https://uknow.example.com/payment/checkout?x=1',
      host: 'uknow.example.com',
      pathname: '/payment/checkout',
      search: '?x=1',
    };
    stubBrowser({ ua: UA.androidChrome, location });
    const ok = openInExternalBrowser();
    expect(ok).toBe(true);
    expect(location.href).toBe(
      'intent://uknow.example.com/payment/checkout?x=1#Intent;scheme=https;end',
    );
  });

  it('reports failure on desktop (no known scheme to hand off to)', () => {
    const location: StubLocation = { href: 'https://uknow.example.com/' };
    stubBrowser({ ua: UA.desktopChrome, location });
    expect(openInExternalBrowser()).toBe(false);
    expect(location.href).toBe('https://uknow.example.com/');
  });
});

describe('copyLinkToClipboard', () => {
  it('uses the Clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubBrowser({
      location: { href: 'https://uknow.example.com/referrals' },
      clipboard: { writeText },
    });
    await expect(copyLinkToClipboard()).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://uknow.example.com/referrals');
  });

  it('returns false when the Clipboard API rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    stubBrowser({ clipboard: { writeText } });
    await expect(copyLinkToClipboard()).resolves.toBe(false);
  });

  it('falls back to execCommand("copy") when the Clipboard API is unavailable', async () => {
    const textArea: Record<string, unknown> = { style: {}, focus: vi.fn(), select: vi.fn(), value: '' };
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const execCommand = vi.fn(() => true);
    stubBrowser({
      location: { href: 'https://uknow.example.com/dashboard' },
      document: {
        createElement: vi.fn(() => textArea),
        body: { appendChild, removeChild },
        execCommand,
      },
    });
    await expect(copyLinkToClipboard()).resolves.toBe(true);
    expect(textArea.value).toBe('https://uknow.example.com/dashboard');
    expect(appendChild).toHaveBeenCalledWith(textArea);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(removeChild).toHaveBeenCalledWith(textArea);
  });

  it('returns false when the execCommand fallback fails', async () => {
    const textArea: Record<string, unknown> = { style: {}, focus: vi.fn(), select: vi.fn(), value: '' };
    stubBrowser({
      document: {
        createElement: vi.fn(() => textArea),
        body: { appendChild: vi.fn(), removeChild: vi.fn() },
        execCommand: vi.fn(() => false),
      },
    });
    await expect(copyLinkToClipboard()).resolves.toBe(false);
  });
});
