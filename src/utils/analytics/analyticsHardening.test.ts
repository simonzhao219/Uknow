import { describe, expect, it } from 'vitest';
import { buildPosthogOptions, maskAttribute, sanitizeEvent } from './analyticsConfig';
import { recordingAllowed } from './analyticsGate';

describe('buildPosthogOptions 補強', () => {
  const o = buildPosthogOptions() as Record<string, unknown>;

  it('關掉 conversations 與 product tours，不交給遠端設定', () => {
    expect(o.disable_conversations).toBe(true);
    expect(o.disable_product_tours).toBe(true);
  });

  it('不自動收 campaign 參數（utm、gclid 等）', () => {
    expect(o.save_campaign_params).toBe(false);
  });

  it('只掛錄影擴充，logs、conversations、productTours 等都不在其中', () => {
    const ext = o.__extensionClasses as Record<string, unknown> | undefined;
    expect(ext).toBeUndefined(); // 由 posthogClient 以 SessionReplayExtensions 注入，選項層不帶
  });
});

describe('maskAttribute 補強', () => {
  it('保留錄影重播需要的內嵌樣式與尺寸類屬性', () => {
    for (const name of [
      '_cssText',
      'rr_width',
      'rr_height',
      'rr_scrollLeft',
      'rr_scrollTop',
      'rr_mediaState',
    ]) {
      expect(maskAttribute(name, 'v'), name).toBe('v');
    }
  });

  it('資料 URI 與來源類的 rr 屬性仍遮罩', () => {
    for (const name of ['rr_dataURL', 'rr_src', 'rr_datauri']) {
      expect(maskAttribute(name, 'data:image/png;base64,AAAA'), name).not.toContain('AAAA');
    }
  });

  it('選取狀態屬性不保留（選單選項順序固定，會推得出選了哪個）', () => {
    for (const name of ['aria-selected', 'selected', 'checked']) {
      expect(maskAttribute(name, 'true'), name).not.toBe('true');
    }
  });
});

describe('sanitizeEvent campaign 參數補強', () => {
  it('移除 $session_entry_ 前綴與其他廣告平台參數', () => {
    const out = sanitizeEvent({
      event: '$pageview',
      properties: {
        $session_entry_utm_source: 'a',
        $session_entry_gclid: 'g',
        gad_source: '1',
        mc_cid: 'm',
        gclsrc: 's',
        keep: 1,
      },
    });
    const dump = JSON.stringify(out);
    for (const s of ['utm_source', 'gclid', 'gad_source', 'mc_cid', 'gclsrc']) {
      expect(dump).not.toContain(s);
    }
    expect(out?.properties?.keep).toBe(1);
  });
});

describe('recordingAllowed 補強', () => {
  it('百分比編碼的路徑段先解碼再比對', () => {
    expect(recordingAllowed('/%61dmin')).toBe(false);
    expect(recordingAllowed('/%70ayment/result')).toBe(false);
    expect(recordingAllowed('/%41DMIN/verify')).toBe(false);
  });

  it('格式錯誤的編碼不拋錯，一般頁面照常可錄', () => {
    expect(() => recordingAllowed('/%E0%A4%A')).not.toThrow();
    expect(recordingAllowed('/%E0%A4%A')).toBe(true);
  });
});
