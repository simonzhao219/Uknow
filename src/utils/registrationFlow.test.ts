import { describe, it, expect } from 'vitest';
import {
  resolvePostLoginAction,
  nextRouteForStep,
  classifyLoginError,
  isProfileComplete,
  resolveProfilePageRedirect,
  resolveCheckoutPageRedirect,
  type FunnelProfile,
} from './registrationFlow';

describe('resolvePostLoginAction — registrationStep 是唯一的導向來源', () => {
  it('step 3（完成）→ dashboard 並設定 user', () => {
    const action = resolvePostLoginAction(3);
    expect(action.route).toBe('/dashboard');
    expect(action.authenticate).toBe(true);
    expect(action.toast?.type).toBe('success');
  });

  it('step 1（待付款）→ 付款頁並設定 user，靜默不彈 toast', () => {
    const action = resolvePostLoginAction(1);
    expect(action.route).toBe('/payment/checkout');
    expect(action.authenticate).toBe(true);
    expect(action.toast).toBeUndefined();
  });

  it('step 2（待開通）→ 付款頁並設定 user', () => {
    const action = resolvePostLoginAction(2);
    expect(action.route).toBe('/payment/checkout');
    expect(action.authenticate).toBe(true);
  });

  it('step 0（新用戶未填資料）→ 完善資料頁，且不設定 user', () => {
    const action = resolvePostLoginAction(0);
    expect(action.route).toBe('/auth/complete-profile');
    expect(action.authenticate).toBe(false);
  });

  it.each([null, undefined, 99])('未知/缺值狀態 %p → 保守導向完善資料頁', (step) => {
    const action = resolvePostLoginAction(step as number | null | undefined);
    expect(action.route).toBe('/auth/complete-profile');
    expect(action.authenticate).toBe(false);
  });
});

describe('nextRouteForStep', () => {
  it('與 resolvePostLoginAction 的 route 一致', () => {
    expect(nextRouteForStep(3)).toBe('/dashboard');
    expect(nextRouteForStep(1)).toBe('/payment/checkout');
    expect(nextRouteForStep(0)).toBe('/auth/complete-profile');
  });
});

describe('classifyLoginError — 未驗證不能被誤判成密碼錯誤', () => {
  it('email_not_confirmed（by code）→ 可復原，導回驗證', () => {
    expect(classifyLoginError({ code: 'email_not_confirmed', message: 'Email not confirmed' }))
      .toBe('email_not_confirmed');
  });

  it('email_not_confirmed（只有訊息文字）→ 仍能辨識', () => {
    expect(classifyLoginError({ message: 'Email not confirmed' })).toBe('email_not_confirmed');
  });

  it('email_not_confirmed（走 error_description 欄位）→ 仍能辨識', () => {
    expect(classifyLoginError({ error_description: 'Email not confirmed' }))
      .toBe('email_not_confirmed');
  });

  it('真正的帳密錯誤（invalid_grant / Invalid login credentials）→ invalid_credentials', () => {
    expect(classifyLoginError({ error_description: 'Invalid login credentials' }))
      .toBe('invalid_credentials');
    expect(classifyLoginError({ code: 'invalid_credentials', message: 'Invalid login credentials' }))
      .toBe('invalid_credentials');
  });

  it('未提供錯誤或無法辨識 → unknown', () => {
    expect(classifyLoginError(null)).toBe('unknown');
    expect(classifyLoginError(undefined)).toBe('unknown');
    expect(classifyLoginError({ message: 'some server blew up' })).toBe('unknown');
  });
});

describe('isProfileComplete — 基本資料是否已填齊', () => {
  it('name + phone + birthDate 都有 → 完成', () => {
    expect(isProfileComplete({ name: '王小明', phone: '0912345678', birthDate: '1990-01-01' }))
      .toBe(true);
  });

  it.each([
    ['缺 name', { name: null, phone: '0912345678', birthDate: '1990-01-01' }],
    ['缺 phone', { name: '王小明', phone: null, birthDate: '1990-01-01' }],
    ['缺 birthDate', { name: '王小明', phone: '0912345678', birthDate: null }],
    ['空字串也算沒填', { name: '', phone: '0912345678', birthDate: '1990-01-01' }],
    ['全空', {}],
  ])('%s → 未完成', (_label, profile) => {
    expect(isProfileComplete(profile as FunnelProfile)).toBe(false);
  });
});

describe('resolveProfilePageRedirect — CompleteProfile 頁的守衛（單一決策來源）', () => {
  // 這條就是本次 bug 的核心：使用者在結帳頁按「編輯」回到本頁，
  // 資料本來就填齊了；若守衛只看「資料是否存在」就會把人立刻彈回結帳頁。
  describe('editing 意圖：使用者主動要回來改資料', () => {
    it('step 1、資料已填、editing=true → 留在原頁（不彈回結帳）', () => {
      expect(resolveProfilePageRedirect(1, { editing: true })).toBeNull();
    });

    it('step 2、資料已填、editing=true → 留在原頁', () => {
      expect(resolveProfilePageRedirect(2, { editing: true })).toBeNull();
    });

    it('即便 step 3，editing=true 也不會硬把人推走（交由頁面自行處理，不做彈跳）', () => {
      expect(resolveProfilePageRedirect(3, { editing: true })).toBeNull();
    });
  });

  describe('非 editing：正常漏斗前進', () => {
    it('step 1（待付款）→ 導向結帳頁', () => {
      expect(resolveProfilePageRedirect(1)).toBe('/payment/checkout');
    });

    it('step 2（待開通）→ 導向結帳頁', () => {
      expect(resolveProfilePageRedirect(2)).toBe('/payment/checkout');
    });

    it('step 3（完成）→ 導向會員中心', () => {
      expect(resolveProfilePageRedirect(3)).toBe('/dashboard');
    });

    it('step 0（新用戶尚未填資料）→ 留在本頁填資料', () => {
      expect(resolveProfilePageRedirect(0)).toBeNull();
    });

    it.each([null, undefined])('未知/缺值 %p → 保守留在本頁', (step) => {
      expect(resolveProfilePageRedirect(step as number | null | undefined)).toBeNull();
    });

    it('editing=false 明確傳入時，行為與不傳一致', () => {
      expect(resolveProfilePageRedirect(1, { editing: false })).toBe('/payment/checkout');
    });
  });
});

describe('resolveCheckoutPageRedirect — PaymentCheckout 頁的守衛（單一決策來源）', () => {
  const base: FunnelProfile = {
    registrationStep: 1,
    name: '王小明',
    phone: '0912345678',
    birthDate: '1990-01-01',
    accountStatus: 'expired',
    paidAwaitingActivation: false,
    lastTradeNo: null,
    referralCode: null,
  };

  it('會籍有效（active）→ 導向會員中心', () => {
    expect(resolveCheckoutPageRedirect({ ...base, accountStatus: 'active' }))
      .toBe('/dashboard');
  });

  it('已付款、開通中（paidAwaitingActivation + lastTradeNo）→ 導向結果頁', () => {
    expect(resolveCheckoutPageRedirect({
      ...base,
      paidAwaitingActivation: true,
      lastTradeNo: 'PU00000003',
    })).toBe('/payment/result?tradeNo=PU00000003');
  });

  it('付款失敗的 step 2（paidAwaitingActivation=false）→ 留在結帳頁重新付款', () => {
    expect(resolveCheckoutPageRedirect({
      ...base,
      registrationStep: 2,
      paidAwaitingActivation: false,
    })).toBeNull();
  });

  it('尚未填基本資料（step 0）→ 導向完善資料頁', () => {
    expect(resolveCheckoutPageRedirect({ ...base, registrationStep: 0 }))
      .toBe('/auth/complete-profile');
  });

  // 空白結帳頁 bug 的回歸測試：即使後端把 step 誤算成 1（剛註冊、資料全空的
  // 使用者在舊 effective_registration_step 下就是這樣），只要姓名/生日/手機
  // 沒填齊，就必須被導回完善資料頁，不能停在會顯示空白「註冊資訊確認」的結帳頁。
  it('step 誤算成 1 但基本資料全空 → 仍導回完善資料頁（不顯示空白結帳頁）', () => {
    expect(resolveCheckoutPageRedirect({
      ...base,
      registrationStep: 1,
      name: '',
      phone: null,
      birthDate: null,
    })).toBe('/auth/complete-profile');
  });

  it('step 1 但只缺手機一欄 → 仍導回完善資料頁', () => {
    expect(resolveCheckoutPageRedirect({ ...base, registrationStep: 1, phone: null }))
      .toBe('/auth/complete-profile');
  });

  it('step 1（首次待付款）→ 留在結帳頁', () => {
    expect(resolveCheckoutPageRedirect(base)).toBeNull();
  });

  it('寬限期（grace）續約者 → 留在結帳頁完成付款', () => {
    expect(resolveCheckoutPageRedirect({ ...base, accountStatus: 'grace' }))
      .toBeNull();
  });

  it('active 優先於其它狀態（即使同時 paidAwaitingActivation）', () => {
    expect(resolveCheckoutPageRedirect({
      ...base,
      accountStatus: 'active',
      paidAwaitingActivation: true,
      lastTradeNo: 'PU00000009',
    })).toBe('/dashboard');
  });
});

describe('兩頁守衛互不彈跳（ping-pong 不變式）', () => {
  // 同一位「資料已填、step 1、未付款」的使用者：
  // - 在結帳頁：應留下（可付款）
  // - 在編輯頁且帶 editing 意圖：應留下（可改資料）
  // 兩者都不彈走，才不會出現「結帳↔編輯」的無限迴圈。
  const midFunnelUser: FunnelProfile = {
    registrationStep: 1,
    name: '王小明',
    phone: '0912345678',
    birthDate: '1990-01-01',
    accountStatus: 'expired',
    paidAwaitingActivation: false,
    lastTradeNo: null,
    referralCode: null,
  };

  it('結帳頁不彈走 step 1 使用者', () => {
    expect(resolveCheckoutPageRedirect(midFunnelUser)).toBeNull();
  });

  it('編輯頁（editing）不彈走同一位 step 1 使用者', () => {
    expect(resolveProfilePageRedirect(midFunnelUser.registrationStep, { editing: true }))
      .toBeNull();
  });
});
