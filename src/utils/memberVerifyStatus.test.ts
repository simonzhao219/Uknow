import { describe, expect, it } from 'vitest';
import { type MemberVerifyStatus, memberVerifyStatusDisplay } from './memberVerifyStatus';

describe('memberVerifyStatusDisplay', () => {
  it('active → 會籍有效（good）', () => {
    expect(memberVerifyStatusDisplay('active')).toEqual({ label: '會籍有效', tone: 'good' });
  });

  it('expiring → 即將到期（warn）', () => {
    expect(memberVerifyStatusDisplay('expiring')).toEqual({ label: '即將到期', tone: 'warn' });
  });

  it('expired → 會籍已過期（bad）', () => {
    expect(memberVerifyStatusDisplay('expired')).toEqual({ label: '會籍已過期', tone: 'bad' });
  });

  it('suspended → 已停權（bad，與過期不同標籤）', () => {
    const suspended = memberVerifyStatusDisplay('suspended');
    expect(suspended.label).toBe('已停權');
    expect(suspended.label).not.toBe(memberVerifyStatusDisplay('expired').label);
  });

  it('四態都有對應標籤與色調', () => {
    const all: MemberVerifyStatus[] = ['active', 'expiring', 'expired', 'suspended'];
    for (const s of all) {
      const d = memberVerifyStatusDisplay(s);
      expect(d.label.length).toBeGreaterThan(0);
      expect(['good', 'warn', 'bad', 'neutral']).toContain(d.tone);
    }
  });
});
