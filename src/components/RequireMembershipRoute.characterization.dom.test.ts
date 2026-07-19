import { describe, it, expect } from 'vitest';
import { resolveMembershipRedirect } from './RequireMembershipRoute';

// Characterization test（Phase 1 護欄）：釘死「會員資格守衛」的決策表現況，
// 保護 Phase 3（user 型別化）與 Phase 4（守衛改 layout route）不改變導向行為。
// 用 .dom.test 是因為此模組 transitively import App 的元件圖，需要 jsdom 的 window。
//
// 決策表（見 resolveMembershipRedirect 註解，由上而下）：
//   1. isAdmin → 放行(null)
//   2. accountStatus active/grace → 放行(null)
//   3. paidAwaitingActivation → 開通中結果頁（有 lastTradeNo 帶 tradeNo）
//   4. 曾有訂閱(已過期) → 續約結帳頁
//   5. step 0 或資料不完整 → 完善資料頁
//   6. 其餘 → 結帳頁

const complete = { name: '王小明', phone: '0912345678', birthDate: '1990-01-01' };

describe('resolveMembershipRedirect — 現況決策表', () => {
  it('管理員一律放行（可能沒有訂閱）', () => {
    expect(resolveMembershipRedirect({ isAdmin: true })).toBeNull();
  });

  it('會籍 active / grace 放行', () => {
    expect(resolveMembershipRedirect({ accountStatus: 'active', ...complete })).toBeNull();
    expect(resolveMembershipRedirect({ accountStatus: 'grace', ...complete })).toBeNull();
  });

  it('已付款開通中 + lastTradeNo → 結果頁自癒輪詢', () => {
    expect(
      resolveMembershipRedirect({ paidAwaitingActivation: true, lastTradeNo: 'TX123', ...complete }),
    ).toBe('/payment/result?tradeNo=TX123');
  });

  it('已付款開通中但無 lastTradeNo → 結帳頁', () => {
    expect(resolveMembershipRedirect({ paidAwaitingActivation: true, ...complete })).toBe(
      '/payment/checkout',
    );
  });

  it('曾是會員、已過期（有 subscriptionEndDate）→ 直接續約結帳，不重走漏斗', () => {
    expect(
      resolveMembershipRedirect({ subscriptionEndDate: '2025-01-01', registrationStep: 3, ...complete }),
    ).toBe('/payment/checkout');
  });

  it('step 0 → 完善資料頁', () => {
    expect(resolveMembershipRedirect({ registrationStep: 0, ...complete })).toBe(
      '/auth/complete-profile',
    );
  });

  it('資料不完整（缺 phone）→ 完善資料頁', () => {
    expect(
      resolveMembershipRedirect({ registrationStep: 1, name: '王小明', birthDate: '1990-01-01' }),
    ).toBe('/auth/complete-profile');
  });

  it('step 1 資料已填未付款 → 結帳頁', () => {
    expect(resolveMembershipRedirect({ registrationStep: 1, ...complete })).toBe('/payment/checkout');
  });

  it('step 2 但付款失敗（paidAwaitingActivation 為 false）→ 結帳頁（不被困在結果頁）', () => {
    expect(
      resolveMembershipRedirect({ registrationStep: 2, paidAwaitingActivation: false, ...complete }),
    ).toBe('/payment/checkout');
  });
});
