// 新約（fresh）確認框與新推薦碼欄的文案（第 5 波 S6 階段 6；W5-7、W5-51、W5-53、W5-55）。
// 推薦人句依「建單時會套用的來源」分句：填碼＝改為／維持；留空＋預設推薦人可用＝將改變
// （不揭露預設推薦人，規格書 §7.4）；留空＋預設不可用＝維持原推薦人，不寫推薦人句。
import { describe, expect, it } from 'vitest';
import type { RenewalInfo } from '@contract';
import {
  blankFreshOutcome,
  freshCodeHint,
  freshCodePlaceholder,
  freshReferrerSentence,
  hasFreshAssets,
} from './freshRenewalCopy';

const base = {
  code: '',
  codeStatus: 'idle' as const,
  referrerName: null,
  currentCode: '8048901',
  isAutoReferral: false,
  defaultAvailable: true,
};

describe('freshReferrerSentence', () => {
  it('填別人的碼且驗證通過時，說推薦人將改為對方', () => {
    expect(
      freshReferrerSentence({
        ...base,
        code: '8048999',
        codeStatus: 'valid',
        referrerName: '陳大文',
      }),
    ).toBe('您的推薦人將改為 陳大文。');
  });

  it('填回現任推薦人的碼時，說推薦人維持', () => {
    expect(
      freshReferrerSentence({
        ...base,
        code: ' 8048901 ',
        codeStatus: 'valid',
        referrerName: '王小明',
      }),
    ).toBe('您的推薦人維持 王小明。');
  });

  it('現任推薦人是自動綁定時，填同一個碼也不說維持（不揭露預設推薦人）', () => {
    expect(
      freshReferrerSentence({
        ...base,
        isAutoReferral: true,
        code: '8048901',
        codeStatus: 'valid',
        referrerName: '平台',
      }),
    ).toBe('您的推薦人將改為 平台。');
  });

  it('驗證通過但拿不到姓名時，退回不帶姓名的說法', () => {
    expect(freshReferrerSentence({ ...base, code: '8048999', codeStatus: 'valid' })).toBe(
      '您的推薦人將改為此推薦碼的會員。',
    );
  });

  it('留空且預設推薦人可用時，說推薦人將改變', () => {
    expect(freshReferrerSentence(base)).toBe('您的推薦人將改變。');
  });

  it('留空且預設推薦人不可用或未知時，不寫推薦人句', () => {
    expect(freshReferrerSentence({ ...base, defaultAvailable: false })).toBeNull();
    expect(freshReferrerSentence({ ...base, defaultAvailable: undefined })).toBeNull();
  });

  it('填了碼但尚未驗證通過時，不寫推薦人句', () => {
    expect(
      freshReferrerSentence({ ...base, code: '8048999', codeStatus: 'unavailable' }),
    ).toBeNull();
  });
});

describe('freshCodeHint', () => {
  it('預設推薦人可用時說不填會改變推薦人，不可用時說維持原推薦人', () => {
    expect(freshCodeHint(true)).toContain('不填則推薦人將改變');
    expect(freshCodeHint(false)).toContain('維持原本的推薦人');
    expect(freshCodeHint(undefined)).toContain('維持原本的推薦人');
  });
});

describe('freshCodePlaceholder', () => {
  it('只有留空會維持原推薦人時才提示目前的碼', () => {
    expect(freshCodePlaceholder('8048901', false, false)).toBe('目前：8048901');
    expect(freshCodePlaceholder('8048901', false, true)).toBe('輸入推薦碼');
    expect(freshCodePlaceholder('8048901', true, false)).toBe('輸入推薦碼');
    expect(freshCodePlaceholder(null, false, false)).toBe('輸入推薦碼');
  });
});

// 第 6 波 S6（W5-63、W6-28）：現任推薦人就是預設推薦人時，新約留空推薦人不變——三處文案
// 同一判斷（blankFreshOutcome），都歸「留空＝維持」，且不提示目前的碼（那就是預設碼）。
describe('blankFreshOutcome', () => {
  it('預設可用且即現任時為不變，可用但非現任或未知時為改變，不可用時為維持', () => {
    expect(blankFreshOutcome(true, true)).toBe('keeps_same');
    expect(blankFreshOutcome(true, false)).toBe('changes');
    expect(blankFreshOutcome(true, undefined)).toBe('changes');
    expect(blankFreshOutcome(false, true)).toBe('keeps');
    expect(blankFreshOutcome(undefined, undefined)).toBe('keeps');
  });
});

describe('新約留空且預設推薦人即現任', () => {
  it('確認框說推薦人維持不變，不出現姓名或碼', () => {
    expect(freshReferrerSentence({ ...base, defaultIsCurrent: true })).toBe('您的推薦人維持不變。');
  });

  it('說明與預設不可用時同一句，不說推薦人將改變', () => {
    expect(freshCodeHint(true, true)).toBe(freshCodeHint(false));
  });

  it('placeholder 不提示目前的碼', () => {
    expect(freshCodePlaceholder('8048901', false, true, true)).toBe('輸入推薦碼');
  });

  it('填了碼時照填碼的規則，不受預設即現任影響', () => {
    expect(
      freshReferrerSentence({
        ...base,
        defaultIsCurrent: true,
        code: '8048999',
        codeStatus: 'valid',
        referrerName: '陳大文',
      }),
    ).toBe('您的推薦人將改為 陳大文。');
  });
});

describe('hasFreshAssets', () => {
  const r = {
    freshForfeitPoints: 0,
    freshForfeitReferrals: 0,
    hasPaidAnyBackfill: false,
  } as RenewalInfo;
  it('點數、累積推薦、已付補繳任一有值時才算有資產', () => {
    expect(hasFreshAssets(r)).toBe(false);
    expect(hasFreshAssets({ ...r, freshForfeitPoints: 1 })).toBe(true);
    expect(hasFreshAssets({ ...r, freshForfeitReferrals: 1 })).toBe(true);
    expect(hasFreshAssets({ ...r, hasPaidAnyBackfill: true })).toBe(true);
  });
});

describe('新約文案用語（W5-53）', () => {
  it('使用者看得到的句子不含上線或下線', () => {
    const all = [
      freshReferrerSentence({ ...base, code: '1', codeStatus: 'valid', referrerName: 'A' }),
      freshReferrerSentence({ ...base, code: '8048901', codeStatus: 'valid', referrerName: 'A' }),
      freshReferrerSentence({ ...base, code: '1', codeStatus: 'valid' }),
      freshReferrerSentence(base),
      freshReferrerSentence({ ...base, defaultIsCurrent: true }),
      freshCodeHint(true),
      freshCodeHint(false),
    ].join('');
    expect(all).not.toMatch(/上線|下線/);
  });
});
