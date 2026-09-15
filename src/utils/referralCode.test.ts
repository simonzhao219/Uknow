import { describe, expect, it } from 'vitest';
import { normalizeReferralCode } from './referralCode';

describe('normalizeReferralCode', () => {
  it('全形數字摺成半形', () => {
    // 中文輸入法的全形模式是標準功能,而推薦碼自 2026-09 起是純數字流水號,
    // 口述後手動輸入是主要路徑——這是本函式存在的理由。
    expect(normalizeReferralCode('８０４８８７６')).toBe('8048876');
  });

  it('全形英文摺成半形並轉小寫', () => {
    // 舊格式碼(3 小寫英文 + 6 數字)仍然有效,兩種格式都要摺得動。
    expect(normalizeReferralCode('ＡＢＣ１２３４５６')).toBe('abc123456');
  });

  it('半形大寫轉小寫', () => {
    expect(normalizeReferralCode('ABC123456')).toBe('abc123456');
  });

  it('頭尾空白被去除', () => {
    expect(normalizeReferralCode('  8048876  ')).toBe('8048876');
  });

  it('全形空白同樣被去除', () => {
    // U+3000 經 NFKC 變成半形空白後才被 trim 接住——順序不可顛倒。
    expect(normalizeReferralCode('　8048876　')).toBe('8048876');
  });

  it('已正規化的值再跑一次不變', () => {
    // idempotent 是硬需求:useImeComposition 的 onCommit 在組字結束後
    // 可能被連呼兩次(Chrome/Android 與 Safari 的事件順序相反)。
    const once = normalizeReferralCode('８０４８８７６');
    expect(normalizeReferralCode(once)).toBe(once);
  });

  it('空字串與空白字串都回空字串', () => {
    expect(normalizeReferralCode('')).toBe('');
    expect(normalizeReferralCode('   ')).toBe('');
  });

  it('null 與 undefined 回空字串而不拋錯', () => {
    // 呼叫端有 `snapshot.referredByCode || ''` 這類寫法,但別處未必記得補。
    expect(normalizeReferralCode(null as unknown as string)).toBe('');
    expect(normalizeReferralCode(undefined as unknown as string)).toBe('');
  });
});
