import { describe, it, expect } from 'vitest';
import {
  MIN_WITHDRAWAL,
  WITHDRAWAL_FEE,
  DAILY_WITHDRAWAL_LIMIT,
  MIN_REQUIRED_BALANCE,
  computeWithdrawablePoints,
  computeMaxWithdrawal,
  canWithdrawFromBalance,
  validateWithdrawalAmount,
  validateBankAccount,
  isValidIdNumberFormat,
} from './withdrawalValidation';

describe('常數與後端規則一致', () => {
  it('最低 1000、手續費 15、每日上限 8000、門檻 1015', () => {
    expect(MIN_WITHDRAWAL).toBe(1000);
    expect(WITHDRAWAL_FEE).toBe(15);
    expect(DAILY_WITHDRAWAL_LIMIT).toBe(8000);
    expect(MIN_REQUIRED_BALANCE).toBe(1015);
  });
});

describe('computeWithdrawablePoints — 扣手續費後不小於 0', () => {
  it('一般情況：available - 15', () => {
    expect(computeWithdrawablePoints(5000)).toBe(4985);
  });

  it('餘額低於手續費 → 0（不為負）', () => {
    expect(computeWithdrawablePoints(10)).toBe(0);
    expect(computeWithdrawablePoints(15)).toBe(0);
  });

  it('無效輸入（NaN / undefined / 負數）視為 0', () => {
    expect(computeWithdrawablePoints(NaN)).toBe(0);
    expect(computeWithdrawablePoints(undefined as unknown as number)).toBe(0);
    expect(computeWithdrawablePoints(-100)).toBe(0);
  });
});

describe('computeMaxWithdrawal — floor 到千位，並壓在每日上限 8000', () => {
  it('小額：4985 可提領 → 4000', () => {
    expect(computeMaxWithdrawal(5000)).toBe(4000);
  });

  it('邊界 1015：可提領 1000 → 最大 1000', () => {
    expect(computeMaxWithdrawal(1015)).toBe(1000);
  });

  it('差 1 點（1014）→ 最大 0（不可提領）', () => {
    expect(computeMaxWithdrawal(1014)).toBe(0);
  });

  it('大額被每日上限壓住：20000 → 8000（而非 19000）', () => {
    expect(computeMaxWithdrawal(20000)).toBe(DAILY_WITHDRAWAL_LIMIT);
  });

  it('剛好足以達每日上限：8015 → 8000', () => {
    // 8015 - 15 = 8000 → floor 8000 → 上限 8000
    expect(computeMaxWithdrawal(8015)).toBe(8000);
  });

  it('略低於上限：8014 → 7000（可提領 7999 → floor 7000）', () => {
    expect(computeMaxWithdrawal(8014)).toBe(7000);
  });
});

describe('canWithdrawFromBalance — 是否有機會提領', () => {
  it('1015（門檻）可提領', () => {
    expect(canWithdrawFromBalance(1015)).toBe(true);
  });

  it('1014（差 1 點）不可提領', () => {
    expect(canWithdrawFromBalance(1014)).toBe(false);
  });

  it('0 不可提領', () => {
    expect(canWithdrawFromBalance(0)).toBe(false);
  });
});

describe('validateWithdrawalAmount — 金額守門（順序：未填 → 低於最低 → 非倍數 → 超過上限）', () => {
  const MAX = 8000;

  it('合法金額（1000、8000、上限值）→ null', () => {
    expect(validateWithdrawalAmount('1000', MAX)).toBeNull();
    expect(validateWithdrawalAmount('8000', MAX)).toBeNull();
    expect(validateWithdrawalAmount('4000', MAX)).toBeNull();
  });

  it('未填 → 請輸入', () => {
    expect(validateWithdrawalAmount('', MAX)).toBe('請輸入提領Point');
  });

  it('低於最低（999 / 500 / 0）→ 最低提領提示', () => {
    expect(validateWithdrawalAmount('999', MAX)).toBe('最低提領Point為 1,000P');
    expect(validateWithdrawalAmount('500', MAX)).toBe('最低提領Point為 1,000P');
    expect(validateWithdrawalAmount('0', MAX)).toBe('最低提領Point為 1,000P');
  });

  it('負數視為低於最低', () => {
    expect(validateWithdrawalAmount('-1000', MAX)).toBe('最低提領Point為 1,000P');
  });

  it('非數字視為 0 → 低於最低', () => {
    expect(validateWithdrawalAmount('abc', MAX)).toBe('最低提領Point為 1,000P');
  });

  it('非 1000 倍數（1500 / 1001）→ 倍數提示', () => {
    expect(validateWithdrawalAmount('1500', MAX)).toBe('提領Point必須為 1000 的倍數');
    expect(validateWithdrawalAmount('1001', MAX)).toBe('提領Point必須為 1000 的倍數');
  });

  it('超過最大提領額度 → 上限提示（含千分位）', () => {
    expect(validateWithdrawalAmount('9000', MAX)).toBe('提領Point不能超過 8,000P');
  });

  it('剛好等於上限 → 通過', () => {
    expect(validateWithdrawalAmount('8000', MAX)).toBeNull();
  });

  it('上限比 8000 小時（例如餘額只夠 3000）超過即擋', () => {
    expect(validateWithdrawalAmount('4000', 3000)).toBe('提領Point不能超過 3,000P');
    expect(validateWithdrawalAmount('3000', 3000)).toBeNull();
  });
});

describe('validateBankAccount — 10~16 位純數字（可含連字號）', () => {
  it('10 位（下界）與 16 位（上界）純數字 → 通過', () => {
    expect(validateBankAccount('1234567890')).toBeNull();
    expect(validateBankAccount('1234567890123456')).toBeNull();
  });

  it('含連字號但去掉後為 10 位 → 通過', () => {
    expect(validateBankAccount('12-3456-7890')).toBeNull();
  });

  it('空 / 純空白 → 請輸入', () => {
    expect(validateBankAccount('')).toBe('請輸入收款銀行帳號');
    expect(validateBankAccount('   ')).toBe('請輸入收款銀行帳號');
  });

  it('含英文字母等非法字元 → 只能包含數字和連字號', () => {
    expect(validateBankAccount('1234abc890')).toBe('銀行帳號只能包含數字和連字號');
    expect(validateBankAccount('1234 567890')).toBe('銀行帳號只能包含數字和連字號');
  });

  it('9 位（不足下界）→ 至少 10 位', () => {
    expect(validateBankAccount('123456789')).toBe('銀行帳號至少需要10位數字');
  });

  it('17 位（超過上界）→ 不能超過 16 位', () => {
    expect(validateBankAccount('12345678901234567')).toBe('銀行帳號不能超過16位數字');
  });

  it('全連字號（去掉後 0 位）→ 至少 10 位', () => {
    expect(validateBankAccount('----------')).toBe('銀行帳號至少需要10位數字');
  });
});

describe('isValidIdNumberFormat — 台灣身分證格式', () => {
  it('合法格式 → true', () => {
    expect(isValidIdNumberFormat('A123456789')).toBe(true);
    expect(isValidIdNumberFormat('B234567890')).toBe(true);
  });

  it('小寫自動視為大寫、前後空白忽略', () => {
    expect(isValidIdNumberFormat('a123456789')).toBe(true);
    expect(isValidIdNumberFormat('  A123456789  ')).toBe(true);
  });

  it('性別碼非 1/2 → false', () => {
    expect(isValidIdNumberFormat('A323456789')).toBe(false);
    expect(isValidIdNumberFormat('A023456789')).toBe(false);
  });

  it('開頭非英文字母 → false', () => {
    expect(isValidIdNumberFormat('1123456789')).toBe(false);
  });

  it('長度不足 / 過長 → false', () => {
    expect(isValidIdNumberFormat('A12345678')).toBe(false);
    expect(isValidIdNumberFormat('A1234567890')).toBe(false);
  });

  it('含非數字尾段 → false', () => {
    expect(isValidIdNumberFormat('A12345678X')).toBe(false);
  });

  it('空字串 → false', () => {
    expect(isValidIdNumberFormat('')).toBe(false);
  });
});
