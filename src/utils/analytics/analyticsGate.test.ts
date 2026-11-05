import { describe, expect, it } from 'vitest';
import { analyticsEnabled, recordingAllowed } from './analyticsGate';

describe('analyticsEnabled', () => {
  it('沒有 key、空字串或佔位值時為停用', () => {
    expect(analyticsEnabled(undefined)).toBe(false);
    expect(analyticsEnabled('')).toBe(false);
    expect(analyticsEnabled('phc_PLACEHOLDER_NOT_CONFIGURED')).toBe(false);
  });

  it('有真實 key 時為啟用', () => {
    expect(analyticsEnabled('phc_abc123')).toBe(true);
  });
});

describe('recordingAllowed', () => {
  it('一般頁面可錄影', () => {
    for (const p of ['/', '/service-providers/1', '/rewards', '/auth/complete-profile']) {
      expect(recordingAllowed(p)).toBe(true);
    }
  });

  it('付款頁整段不錄', () => {
    for (const p of ['/payment', '/payment/', '/payment/checkout', '/payment/result']) {
      expect(recordingAllowed(p)).toBe(false);
    }
  });

  it('後台整段不錄（含 /admin/verify）', () => {
    for (const p of ['/admin', '/admin/', '/admin/verify']) {
      expect(recordingAllowed(p)).toBe(false);
    }
  });

  it('路徑比對不分大小寫', () => {
    expect(recordingAllowed('/Admin')).toBe(false);
    expect(recordingAllowed('/PAYMENT/Result')).toBe(false);
  });

  it('只比第一段，名稱相近的路徑不被誤擋', () => {
    expect(recordingAllowed('/administrator')).toBe(true);
    expect(recordingAllowed('/payments-info')).toBe(true);
  });
});
