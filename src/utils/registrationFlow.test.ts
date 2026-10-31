import { describe, it, expect } from 'vitest';
import {
  resolvePostLoginAction,
  nextRouteForStep,
  classifyLoginError,
  isProfileComplete,
  isRegistrationLocked,
  resolveProfilePageRedirect,
  resolveCheckoutPageRedirect,
  type FunnelProfile,
  type RegistrationStep,
  classifyInviteAcceptError,
  resolveInviteEntry,
  shouldRedirectToCompleteProfile,
  classifyMembershipGate,
  redirectForGate,
  isFirstTimeFunnel,
  nextFunnelRoute,
  funnelNextKind,
  routeForFunnelNext,
  funnelCtaLabel,
  FUNNEL_ROUTES,
  isFunnelRoute,
  type GateProfile,
} from './registrationFlow';
import { resolveMembershipRedirect } from '../components/RequireMembershipRoute';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
    expect(
      classifyLoginError({ code: 'email_not_confirmed', message: 'Email not confirmed' }),
    ).toBe('email_not_confirmed');
  });

  it('email_not_confirmed（只有訊息文字）→ 仍能辨識', () => {
    expect(classifyLoginError({ message: 'Email not confirmed' })).toBe('email_not_confirmed');
  });

  it('email_not_confirmed（走 error_description 欄位）→ 仍能辨識', () => {
    expect(classifyLoginError({ error_description: 'Email not confirmed' })).toBe(
      'email_not_confirmed',
    );
  });

  it('真正的帳密錯誤（invalid_grant / Invalid login credentials）→ invalid_credentials', () => {
    expect(classifyLoginError({ error_description: 'Invalid login credentials' })).toBe(
      'invalid_credentials',
    );
    expect(
      classifyLoginError({ code: 'invalid_credentials', message: 'Invalid login credentials' }),
    ).toBe('invalid_credentials');
  });

  it('未提供錯誤或無法辨識 → unknown', () => {
    expect(classifyLoginError(null)).toBe('unknown');
    expect(classifyLoginError(undefined)).toBe('unknown');
    expect(classifyLoginError({ message: 'some server blew up' })).toBe('unknown');
  });
});

describe('isProfileComplete — 基本資料是否已填齊', () => {
  it('name + phone + birthDate 都有 → 完成', () => {
    expect(
      isProfileComplete({ name: '王小明', phone: '0912345678', birthDate: '1990-01-01' }),
    ).toBe(true);
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

// 鎖定判準的唯一定義：CompleteProfile 的編輯守衛與 PaymentCheckout 的編輯入口
// 共用。後端以「有 completed 訂單」拒寫（/auth/register 403），前端看得到的
// 對應訊號是 step 3；曾有訂閱（subscriptionEndDate）必然有過完成的付款。
describe('isRegistrationLocked — 註冊完成後身分資料鎖定', () => {
  it('step 3 → 鎖定', () => {
    expect(isRegistrationLocked({ registrationStep: 3 })).toBe(true);
  });

  it('曾有訂閱（續約者）→ 鎖定，即使快取沒帶到 registrationStep', () => {
    expect(isRegistrationLocked({ subscriptionEndDate: '2026-01-01T00:00:00Z' })).toBe(true);
  });

  it.each([0, 1, 2, null, undefined])('step %p 且無訂閱 → 未鎖定（付款前可重填）', (step) => {
    expect(isRegistrationLocked({ registrationStep: step })).toBe(false);
  });
});

describe('resolveProfilePageRedirect — CompleteProfile 頁的守衛（單一決策來源）', () => {
  // 一個「資料已填齊」的 profile 骨架，測試只覆寫 registrationStep。
  const filled = (registrationStep: RegistrationStep): FunnelProfile => ({
    registrationStep,
    name: '王小明',
    phone: '0912345678',
    birthDate: '1990-01-01',
  });

  // 這條就是本次 bug 的核心：使用者在結帳頁按「編輯」回到本頁，
  // 資料本來就填齊了；若守衛只看「資料是否存在」就會把人立刻彈回結帳頁。
  describe('editing 意圖：使用者主動要回來改資料', () => {
    it('step 1、資料已填、editing=true → 留在原頁（不彈回結帳）', () => {
      expect(resolveProfilePageRedirect(filled(1), { editing: true })).toBeNull();
    });

    it('step 2、資料已填、editing=true → 留在原頁', () => {
      expect(resolveProfilePageRedirect(filled(2), { editing: true })).toBeNull();
    });

    // 註冊完成後後端拒絕寫入（/auth/register 403），編輯意圖失效：停在編輯頁
    // 時另一個分頁付完款、或重新整理沿用舊 history state 的人，要被帶回會員中心。
    it('step 3、資料已填、editing=true → 導向 dashboard（註冊完成後不可改）', () => {
      expect(resolveProfilePageRedirect(filled(3), { editing: true })).toBe('/dashboard');
    });

    it('續約者（有訂閱、快取缺 step）、editing=true → 導向 dashboard', () => {
      expect(
        resolveProfilePageRedirect(
          { ...filled(undefined), subscriptionEndDate: '2026-01-01T00:00:00Z' },
          { editing: true },
        ),
      ).toBe('/dashboard');
    });

    it('step 3 但資料未填齊、editing=true → 仍留在本頁（不破壞未填齊不變式）', () => {
      expect(
        resolveProfilePageRedirect({ registrationStep: 3, name: '王小明' }, { editing: true }),
      ).toBeNull();
    });
  });

  describe('非 editing：正常漏斗前進（資料已填齊）', () => {
    it('step 1（待付款）→ 導向結帳頁', () => {
      expect(resolveProfilePageRedirect(filled(1))).toBe('/payment/checkout');
    });

    it('step 2（待開通）→ 導向結帳頁', () => {
      expect(resolveProfilePageRedirect(filled(2))).toBe('/payment/checkout');
    });

    it('step 3（完成）→ 導向會員中心', () => {
      expect(resolveProfilePageRedirect(filled(3))).toBe('/dashboard');
    });

    it('step 0（新用戶尚未填資料）→ 留在本頁填資料', () => {
      expect(resolveProfilePageRedirect({ registrationStep: 0 })).toBeNull();
    });

    it.each([null, undefined])('未知/缺值 %p → 保守留在本頁', (step) => {
      expect(resolveProfilePageRedirect({ registrationStep: step as RegistrationStep })).toBeNull();
    });

    it('editing=false 明確傳入時，行為與不傳一致', () => {
      expect(resolveProfilePageRedirect(filled(1), { editing: false })).toBe('/payment/checkout');
    });
  });

  // 第二道防線（與 resolveCheckoutPageRedirect 對稱）：資料未填齊時，
  // 不論後端把 step 誤算成多少，都留在本頁——避免與結帳頁守衛互彈。
  describe('資料未填齊 → 一律留在本頁（不被 step 帶走）', () => {
    it('step 誤算成 1 但資料全空 → 留在本頁（不彈去結帳頁）', () => {
      expect(
        resolveProfilePageRedirect({ registrationStep: 1, name: '', phone: null, birthDate: null }),
      ).toBeNull();
    });

    it('step 誤算成 2 但只缺手機一欄 → 仍留在本頁', () => {
      expect(
        resolveProfilePageRedirect({
          registrationStep: 2,
          name: '王小明',
          phone: null,
          birthDate: '1990-01-01',
        }),
      ).toBeNull();
    });

    it('step 3 但資料未填齊 → 仍留在本頁（資料完整性優先於 step）', () => {
      expect(
        resolveProfilePageRedirect({
          registrationStep: 3,
          name: '',
          phone: '0912345678',
          birthDate: '1990-01-01',
        }),
      ).toBeNull();
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
    expect(resolveCheckoutPageRedirect({ ...base, accountStatus: 'active' })).toBe('/dashboard');
  });

  it('已付款、開通中（paidAwaitingActivation + lastTradeNo）→ 導向結果頁', () => {
    expect(
      resolveCheckoutPageRedirect({
        ...base,
        paidAwaitingActivation: true,
        lastTradeNo: 'PU00000003',
      }),
    ).toBe('/payment/result?tradeNo=PU00000003');
  });

  it('付款失敗的 step 2（paidAwaitingActivation=false）→ 留在結帳頁重新付款', () => {
    expect(
      resolveCheckoutPageRedirect({
        ...base,
        registrationStep: 2,
        paidAwaitingActivation: false,
      }),
    ).toBeNull();
  });

  it('尚未填基本資料（step 0）→ 導向完善資料頁', () => {
    expect(resolveCheckoutPageRedirect({ ...base, registrationStep: 0 })).toBe(
      '/auth/complete-profile',
    );
  });

  // 空白結帳頁 bug 的回歸測試：即使後端把 step 誤算成 1（剛註冊、資料全空的
  // 使用者在舊 effective_registration_step 下就是這樣），只要姓名/生日/手機
  // 沒填齊，就必須被導回完善資料頁，不能停在會顯示空白「註冊資訊確認」的結帳頁。
  it('step 誤算成 1 但基本資料全空 → 仍導回完善資料頁（不顯示空白結帳頁）', () => {
    expect(
      resolveCheckoutPageRedirect({
        ...base,
        registrationStep: 1,
        name: '',
        phone: null,
        birthDate: null,
      }),
    ).toBe('/auth/complete-profile');
  });

  it('step 1 但只缺手機一欄 → 仍導回完善資料頁', () => {
    expect(resolveCheckoutPageRedirect({ ...base, registrationStep: 1, phone: null })).toBe(
      '/auth/complete-profile',
    );
  });

  it('step 1（首次待付款）→ 留在結帳頁', () => {
    expect(resolveCheckoutPageRedirect(base)).toBeNull();
  });

  it('已失效（expired）續約者 → 留在結帳頁完成付款', () => {
    expect(resolveCheckoutPageRedirect({ ...base, accountStatus: 'expired' })).toBeNull();
  });

  it('active 優先於其它狀態（即使同時 paidAwaitingActivation）', () => {
    expect(
      resolveCheckoutPageRedirect({
        ...base,
        accountStatus: 'active',
        paidAwaitingActivation: true,
        lastTradeNo: 'PU00000009',
      }),
    ).toBe('/dashboard');
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
    expect(resolveProfilePageRedirect(midFunnelUser, { editing: true })).toBeNull();
  });

  // 對稱防線下的另一個不變式：資料未填齊的使用者，兩頁都留住他——
  // 結帳頁把他導去填資料頁，填資料頁不會再用 step 把他彈回結帳頁。
  const unfilledUser: FunnelProfile = {
    registrationStep: 1, // 後端誤算（空白結帳頁事故的形狀）
    name: '',
    phone: null,
    birthDate: null,
    accountStatus: 'expired',
    paidAwaitingActivation: false,
    lastTradeNo: null,
    referralCode: null,
  };

  it('結帳頁把資料未填的使用者導去填資料頁', () => {
    expect(resolveCheckoutPageRedirect(unfilledUser)).toBe('/auth/complete-profile');
  });

  it('填資料頁不會再把同一位使用者用 step 彈回結帳頁（無 ping-pong）', () => {
    expect(resolveProfilePageRedirect(unfilledUser)).toBeNull();
  });
});

// --- Email 邀請（R2）：從信中連結進入註冊頁中段 ---

const b64url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const tokenOf = (payload: unknown) => `${b64url(JSON.stringify(payload))}.sig`;

describe('resolveInviteEntry', () => {
  it.each([
    ['壞 base64', '***.sig'],
    ['壞 JSON', `${b64url('{not json')}.sig`],
    ['缺 c 欄', tokenOf({ v: 1, e: 'a@b.co', x: 1 })],
    ['v 不是 1', tokenOf({ v: 2, e: 'a@b.co', c: '8048876', x: 1 })],
    ['沒有簽章段', b64url(JSON.stringify({ v: 1, e: 'a@b.co', c: '8048876', x: 1 }))],
  ])('%s時回 undecodable', (_label, token) => {
    expect(resolveInviteEntry(token)).toEqual({ kind: 'undecodable' });
  });

  it('有效 payload 時回 email 與推薦碼', () => {
    expect(resolveInviteEntry(tokenOf({ v: 1, e: 'a@b.co', c: '8048876', x: 4102444800 }))).toEqual(
      {
        kind: 'valid',
        email: 'a@b.co',
        code: '8048876',
      },
    );
  });

  it('到期時間已過仍回 valid（過期由伺服器判）', () => {
    expect(resolveInviteEntry(tokenOf({ v: 1, e: 'a@b.co', c: '8048876', x: 1 })).kind).toBe(
      'valid',
    );
  });
});

describe('classifyInviteAcceptError', () => {
  it.each([
    ['weak_password', 'stay2B', false],
    ['rate_limited', 'stay2B', false],
    ['unavailable', 'stay2B', false],
    ['disabled', 'stay2B', false],
    [undefined, 'stay2B', false],
    ['some_future_code', 'stay2B', false],
    ['expired', 'to2A', false],
    ['invalid_token', 'to2A', false],
    ['gone', 'to2A', false],
    ['already_accepted', 'to2A', true],
  ] as const)('code %s 有 email 時 → %s', (code, target, clearPassword) => {
    expect(classifyInviteAcceptError(code, true)).toEqual({ target, clearPassword });
  });

  it.each(['expired', 'invalid_token', 'gone', 'already_accepted'])(
    '沒有 email 時 %s 回步驟 1',
    (code) => {
      expect(classifyInviteAcceptError(code, false).target).toBe('toStep1');
    },
  );
});

describe('shouldRedirectToCompleteProfile', () => {
  it.each([
    ['/auth/complete-profile', false],
    ['/auth/reset-password', false],
    ['/dashboard', true],
    ['/register', true],
  ])('%s → %s', (pathname, expected) => {
    expect(shouldRedirectToCompleteProfile(pathname)).toBe(expected);
  });
});

// ------------------------------------------------------------
// T1 auth-state-trust：會籍分類、首購漏斗判定、漏斗路由
// ------------------------------------------------------------

const COMPLETE = { name: '王小明', phone: '0912345678', birthDate: '1990-01-01' };

/** 判定表八格（plan §2.1、§5 A1）。 */
const CELLS: Record<string, GateProfile> = {
  未齊: { registrationStep: 0, name: null, phone: null, birthDate: null, accountStatus: 'expired' },
  step1: { ...COMPLETE, registrationStep: 1, accountStatus: 'expired' },
  step2付款失敗: { ...COMPLETE, registrationStep: 2, accountStatus: 'expired' },
  待開通: {
    ...COMPLETE,
    registrationStep: 2,
    accountStatus: 'expired',
    paidAwaitingActivation: true,
    lastTradeNo: 'T123',
  },
  續約待開通: {
    ...COMPLETE,
    registrationStep: 3,
    accountStatus: 'expired',
    paidAwaitingActivation: true,
    lastTradeNo: 'T456',
    subscriptionEndDate: '2026-01-01',
  },
  續約: {
    ...COMPLETE,
    registrationStep: 3,
    accountStatus: 'expired',
    subscriptionEndDate: '2026-01-01',
  },
  admin: { registrationStep: 0, accountStatus: 'expired', isAdmin: true },
  停權: { ...COMPLETE, registrationStep: 1, accountStatus: 'expired', suspended: true },
  會員: {
    ...COMPLETE,
    registrationStep: 3,
    accountStatus: 'active',
    subscriptionEndDate: '2027-01-01',
  },
};

describe('classifyMembershipGate', () => {
  it.each([
    ['未齊', 'profile'],
    ['step1', 'checkout'],
    ['step2付款失敗', 'checkout'],
    ['待開通', 'activating'],
    ['續約待開通', 'activating'],
    ['續約', 'renew'],
    ['admin', 'admin'],
    ['會員', 'active'],
  ])('%s 歸為 %s', (cell, gate) => {
    expect(classifyMembershipGate(CELLS[cell])).toBe(gate);
  });

  it('step 1 但缺生日時歸為 profile', () => {
    expect(classifyMembershipGate({ ...CELLS.step1, birthDate: null })).toBe('profile');
  });
});

describe('redirectForGate', () => {
  it('與 resolveMembershipRedirect 在判定表每格輸出相同', () => {
    for (const p of Object.values(CELLS)) {
      expect(redirectForGate(p)).toBe(resolveMembershipRedirect(p));
      expect(redirectForGate(p, { allowExpired: true })).toBe(
        resolveMembershipRedirect(p, { allowExpired: true }),
      );
    }
  });

  it('待開通有 lastTradeNo 時導結果頁並帶 tradeNo', () => {
    expect(redirectForGate(CELLS.待開通)).toBe('/payment/result?tradeNo=T123');
  });

  it('待開通無 lastTradeNo 時導結帳頁', () => {
    expect(redirectForGate({ ...CELLS.待開通, lastTradeNo: null })).toBe('/payment/checkout');
  });

  it('續約格在 allowExpired 時放行', () => {
    expect(redirectForGate(CELLS.續約, { allowExpired: true })).toBeNull();
    expect(redirectForGate(CELLS.續約)).toBe('/payment/checkout');
  });
});

describe('isFirstTimeFunnel', () => {
  it.each([
    ['未齊', true],
    ['step1', true],
    ['step2付款失敗', true],
    ['待開通', true],
    ['續約待開通', false],
    ['續約', false],
    ['admin', false],
    ['停權', false],
    ['會員', false],
  ])('%s → %s', (cell, expected) => {
    expect(isFirstTimeFunnel(CELLS[cell])).toBe(expected);
  });

  it('accountStatus 為 unknown 時不算漏斗', () => {
    expect(isFirstTimeFunnel({ ...CELLS.step1, accountStatus: 'unknown' })).toBe(false);
  });

  // 性質測試：組合所有影響判定的欄位，對照守衛的導向決策。
  const grid: GateProfile[] = [];
  for (const isAdmin of [false, true])
    for (const accountStatus of ['active', 'expired'])
      for (const paidAwaitingActivation of [false, true])
        for (const lastTradeNo of [null, 'T1'])
          for (const subscriptionEndDate of [null, '2026-01-01'])
            for (const registrationStep of [0, 1, 2, 3])
              for (const complete of [false, true])
                for (const suspended of [false, true])
                  grid.push({
                    isAdmin,
                    accountStatus,
                    paidAwaitingActivation,
                    lastTradeNo,
                    subscriptionEndDate,
                    registrationStep,
                    suspended,
                    ...(complete ? COMPLETE : { name: null, phone: null, birthDate: null }),
                  });

  it('每格與守衛導向一致（redirect 非 null 且非續約、未停權）', () => {
    for (const p of grid) {
      const expected =
        resolveMembershipRedirect(p) !== null &&
        classifyMembershipGate(p) !== 'renew' &&
        !p.subscriptionEndDate &&
        !p.suspended;
      expect(isFirstTimeFunnel(p), JSON.stringify(p)).toBe(expected);
    }
  });

  it('守衛放行者必定不是漏斗', () => {
    for (const p of grid) {
      if (resolveMembershipRedirect(p) === null) expect(isFirstTimeFunnel(p)).toBe(false);
    }
  });
});

describe('nextFunnelRoute', () => {
  it('資料未齊導完善資料頁', () => {
    expect(nextFunnelRoute(CELLS.未齊)).toBe('/auth/complete-profile');
  });

  it('首購未付款導結帳頁', () => {
    expect(nextFunnelRoute(CELLS.step1)).toBe('/payment/checkout');
    expect(nextFunnelRoute(CELLS.step2付款失敗)).toBe('/payment/checkout');
  });

  it('已付款待開通導結果頁並帶 tradeNo', () => {
    expect(nextFunnelRoute(CELLS.待開通)).toBe('/payment/result?tradeNo=T123');
  });

  it('非漏斗者回 null', () => {
    for (const cell of ['續約', '續約待開通', 'admin', '停權', '會員']) {
      expect(nextFunnelRoute(CELLS[cell]), cell).toBeNull();
    }
  });
});

describe('funnelNextKind／routeForFunnelNext', () => {
  it.each([
    ['/auth/complete-profile', 'profile'],
    ['/payment/checkout', 'checkout'],
    ['/payment/result?tradeNo=T1', 'result'],
    ['/payment/result', 'result'],
  ] as const)('%s 歸為 %s', (route, kind) => {
    expect(funnelNextKind(route)).toBe(kind);
  });

  it('null 或未知路徑回 null', () => {
    expect(funnelNextKind(null)).toBeNull();
    expect(funnelNextKind('/dashboard')).toBeNull();
  });

  it('提示的 next 對回暫用連結（結果頁不帶 tradeNo）', () => {
    expect(routeForFunnelNext('profile')).toBe('/auth/complete-profile');
    expect(routeForFunnelNext('checkout')).toBe('/payment/checkout');
    expect(routeForFunnelNext('result')).toBe('/payment/result');
    expect(routeForFunnelNext(null)).toBeNull();
  });
});

describe('funnelCtaLabel', () => {
  it('目的地為結果頁時顯示查看開通進度', () => {
    expect(funnelCtaLabel('/payment/result?tradeNo=T1')).toBe('查看開通進度');
    expect(funnelCtaLabel('/payment/result')).toBe('查看開通進度');
  });

  it('其餘目的地顯示繼續完成註冊', () => {
    expect(funnelCtaLabel('/payment/checkout')).toBe('繼續完成註冊');
    expect(funnelCtaLabel('/auth/complete-profile')).toBe('繼續完成註冊');
  });

  it('待開通但無 lastTradeNo 時文案依結帳頁目的地為繼續完成註冊', () => {
    expect(funnelCtaLabel(nextFunnelRoute({ ...CELLS.待開通, lastTradeNo: null }))).toBe(
      '繼續完成註冊',
    );
  });
});

describe('FUNNEL_ROUTES／isFunnelRoute', () => {
  it('包含四條漏斗路由', () => {
    expect([...FUNNEL_ROUTES].sort()).toEqual(
      ['/auth/complete-profile', '/auth/verify-otp', '/payment/checkout', '/payment/result'].sort(),
    );
  });

  it('每條漏斗路由在 App.tsx 都有對應的 Route', () => {
    const app = readFileSync(resolve(__dirname, '..', 'App.tsx'), 'utf8');
    for (const route of FUNNEL_ROUTES) {
      expect(app, route).toContain(`<Route path="${route}"`);
    }
  });

  it('精確比對並容許結尾斜線', () => {
    expect(isFunnelRoute('/payment/result')).toBe(true);
    expect(isFunnelRoute('/payment/result/')).toBe(true);
    expect(isFunnelRoute('/auth/verify-otp')).toBe(true);
  });

  it('非漏斗路由與前綴相似路徑回 false', () => {
    expect(isFunnelRoute('/')).toBe(false);
    expect(isFunnelRoute('/payment')).toBe(false);
    expect(isFunnelRoute('/payment/result-x')).toBe(false);
    expect(isFunnelRoute('/dashboard')).toBe(false);
  });
});
