import { describe, expect, it } from 'vitest';
import {
  BLOCK_SELECTOR,
  buildPosthogOptions,
  maskAttribute,
  PH_BLOCK_CLASS,
  sanitizeEvent,
  stripUrl,
} from './analyticsConfig';

describe('stripUrl', () => {
  it('去掉絕對網址的 query 與 hash', () => {
    expect(stripUrl('https://uknow.com.tw/register?invite=SECRET#x')).toBe(
      'https://uknow.com.tw/register',
    );
  });

  it('相對路徑也去掉 query 與 hash', () => {
    expect(stripUrl('/payment/result?TradeNo=1&token=abc')).toBe('/payment/result');
    expect(stripUrl('/a#frag')).toBe('/a');
  });

  it('沒有 query 或 hash 時原樣回傳', () => {
    expect(stripUrl('https://uknow.com.tw/rewards')).toBe('https://uknow.com.tw/rewards');
    expect(stripUrl('')).toBe('');
  });
});

describe('maskAttribute', () => {
  it('白名單屬性保留原值', () => {
    expect(maskAttribute('class', 'flex p-2')).toBe('flex p-2');
    expect(maskAttribute('style', 'color:red')).toBe('color:red');
    expect(maskAttribute('type', 'text')).toBe('text');
    expect(maskAttribute('role', 'button')).toBe('button');
  });

  it('可能帶網址或文字的屬性一律遮掉，不洩漏原值', () => {
    const secret = '/register?invite=SECRET-TOKEN';
    for (const name of [
      'href',
      'src',
      'srcset',
      'action',
      'formaction',
      'poster',
      'data-user',
      'content',
      'xlink:href',
      'title',
      'aria-label',
      'alt',
      'placeholder',
      'value',
    ]) {
      const out = maskAttribute(name, secret);
      expect(out).not.toContain('SECRET');
      expect(out).not.toBe(secret);
    }
  });

  it('屬性名稱不分大小寫', () => {
    expect(maskAttribute('HREF', '/x?token=1')).not.toContain('token');
    expect(maskAttribute('Class', 'a')).toBe('a');
  });
});

describe('sanitizeEvent', () => {
  it('null 事件原樣回傳', () => {
    expect(sanitizeEvent(null)).toBeNull();
  });

  it('清掉 properties 內所有網址欄位的 query 與 hash', () => {
    const u = 'https://uknow.com.tw/register?invite=SECRET#h';
    const keys = [
      '$current_url',
      '$pathname',
      '$referrer',
      '$session_entry_url',
      '$session_entry_pathname',
      '$session_entry_referrer',
      '$initial_current_url',
      '$initial_pathname',
      '$initial_referrer',
      '$initial_referring_domain',
      '$referring_domain',
    ];
    const properties = Object.fromEntries(keys.map((k) => [k, u]));
    const out = sanitizeEvent({ event: '$pageview', properties });
    for (const k of keys) {
      expect(out?.properties?.[k]).toBe('https://uknow.com.tw/register');
    }
  });

  it('$set 與 $set_once 內的網址欄位同樣清理（事件層與 properties 層）', () => {
    const u = '/x?token=SECRET';
    const out = sanitizeEvent({
      event: 'e',
      $set: { $current_url: u },
      $set_once: { $initial_current_url: u },
      properties: { $set: { $current_url: u }, $set_once: { $initial_referrer: u } },
    });
    const dump = JSON.stringify(out);
    expect(dump).not.toContain('SECRET');
  });

  it('移除 utm 與 click id 追蹤參數', () => {
    const out = sanitizeEvent({
      event: 'e',
      properties: { utm_source: 'a', utm_campaign: 'b', gclid: 'g', fbclid: 'f', keep: 1 },
    });
    expect(out?.properties).toEqual(expect.objectContaining({ keep: 1 }));
    for (const k of ['utm_source', 'utm_campaign', 'gclid', 'fbclid']) {
      expect(out?.properties).not.toHaveProperty(k);
    }
  });

  it('附上 $geoip_disable 輔助旗標（真正保證在專案設定）', () => {
    expect(sanitizeEvent({ event: 'e', properties: {} })?.properties?.$geoip_disable).toBe(true);
  });

  it('未壓縮的 rrweb Meta 事件 href 去掉 query，其他事件不動', () => {
    const out = sanitizeEvent({
      event: '$snapshot',
      properties: {
        $snapshot_data: [
          { type: 4, data: { href: 'https://uknow.com.tw/register?invite=SECRET', width: 390 } },
          { type: 3, data: { source: 1, href: '?keep' } },
        ],
      },
    });
    const data = out?.properties?.$snapshot_data as Array<{
      type: number;
      data: { href: string; width?: number };
    }>;
    expect(data[0].data.href).toBe('https://uknow.com.tw/register');
    expect(data[0].data.width).toBe(390);
    expect(data[1].data.href).toBe('?keep');
  });

  it('已壓縮的 snapshot 字串不動、不拋錯', () => {
    const out = sanitizeEvent({ event: '$snapshot', properties: { $snapshot_data: 'H4sIAAAA' } });
    expect(out?.properties?.$snapshot_data).toBe('H4sIAAAA');
  });

  it('不改動傳入的物件', () => {
    const input = { event: 'e', properties: { $current_url: '/a?b=1' } };
    sanitizeEvent(input);
    expect(input.properties.$current_url).toBe('/a?b=1');
  });
});

describe('buildPosthogOptions', () => {
  const o = buildPosthogOptions() as Record<string, unknown> & {
    session_recording: Record<string, unknown>;
  };

  it('連線到 EU 區域並只收匿名資料', () => {
    expect(o.api_host).toBe('https://eu.i.posthog.com');
    expect(o.ui_host).toBe('https://eu.posthog.com');
    expect(o.person_profiles).toBe('identified_only');
    expect(o.persistence).toBe('localStorage');
  });

  it('不依賴專案端遠端設定：功能一律明確設為 false', () => {
    for (const k of [
      'autocapture',
      'capture_pageview',
      'capture_pageleave',
      'capture_exceptions',
      'capture_heatmaps',
      'capture_dead_clicks',
      'enable_recording_console_log',
      'capture_performance',
    ]) {
      expect(o[k], k).toBe(false);
    }
    expect(o.disable_surveys).toBe(true);
    expect(o.advanced_disable_feature_flags).toBe(true);
    expect(o.disable_capture_url_hashes).toBe(true);
    expect(o.mask_personal_data_properties).toBe(true);
  });

  it('初始化時不錄影，由路由閘門決定何時開始', () => {
    expect(o.disable_session_recording).toBe(true);
  });

  it('錄影設定：全文字與輸入遮罩、不錄 network、不錄 canvas', () => {
    const r = o.session_recording;
    expect(r.maskAllInputs).toBe(true);
    expect(r.maskTextSelector).toBe('*');
    expect(r.recordHeaders).toBe(false);
    expect(r.recordBody).toBe(false);
    expect(r.captureCanvas).toEqual({ recordCanvas: false });
    expect(r.blockClass).toBe(PH_BLOCK_CLASS);
    expect(r.blockSelector).toBe(BLOCK_SELECTOR);
    expect(r.maskAttributeFn).toBe(maskAttribute);
  });

  it('maskCapturedNetworkRequestFn 剝網址而不是回 null（回 null 會丟掉 Meta 事件）', () => {
    const fn = o.session_recording.maskCapturedNetworkRequestFn as (r: {
      name: string;
    }) => { name: string } | null;
    expect(fn({ name: 'https://uknow.com.tw/a?b=1#c' })).toEqual({
      name: 'https://uknow.com.tw/a',
    });
  });

  it('before_send 使用 sanitizeEvent', () => {
    expect(o.before_send).toBe(sanitizeEvent);
  });

  it('sampleRate 預設全錄，可由參數降低', () => {
    expect(o.session_recording.sampleRate).toBe(1);
    const half = buildPosthogOptions({ sampleRate: 0.25 }) as {
      session_recording: Record<string, unknown>;
    };
    expect(half.session_recording.sampleRate).toBe(0.25);
  });
});

describe('BLOCK_SELECTOR', () => {
  it('涵蓋 block class 與敏感欄位的屬性選擇器', () => {
    for (const part of [
      `.${PH_BLOCK_CLASS}`,
      'input[type="tel"]',
      'input[type="password"]',
      'input[autocomplete^="bday"]',
      'input[autocomplete="tel"]',
      'input[autocomplete^="cc-"]',
      '[data-sensitive]',
    ]) {
      expect(BLOCK_SELECTOR).toContain(part);
    }
  });
});
