// @vitest-environment jsdom
//
// 會籍守衛。這支測試存在的理由寫在 friction-log（2026-08-07｜漏網｜三個
// route guard 元件零測試覆蓋）：`resolveMembershipRedirect` 的六個分支在
// vitest / Deno / e2e 四層裡**都沒有任何斷言**，唯一的防線是
// `e2e/features/route_guards.feature`——那是最貴的一層，而且 e2e 去重盤點
// 差點把它刪掉（誤把 registrationFlow.ts 的 `resolveCheckoutPageRedirect`
// 測試當成它的證據，兩者是兩張獨立決策表、從無互相 import）。
//
// 這裡釘住兩件事，缺一不可：
//   1. **決策表本身**——每個分支的輸出，含優先序（誰蓋過誰）。
//   2. **決策有沒有真的被接進 router**——決策函式對、但沒接上，使用者
//      照樣走錯頁。這正是規劃審查抓到的那個判準：「決策函式有測 ≠
//      決策被接進 router」。
//
// 最重要的一條是 `paidAwaitingActivation`：元件註解自己寫著「絕不能把
// 已付款的人送回結帳頁造成重複付款」。那是金流不變式，不是路由偏好。
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

// vi.hoisted 的內容會被提到所有 import 之前執行，所以 React 要在區塊內
// 自己 import——用檔案頂端那個 binding 會踩到 TDZ。
const { UserCtx } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  // 元件從 '../App' 取 UserContext；在這裡替身掉，測試才不用把整個 App
  // 模組（含所有路由與 provider）拉進來。
  return { UserCtx: createContext<any>({ user: null, isLoggedIn: false }) };
});

vi.mock('../App', () => ({ UserContext: UserCtx }));

import { RequireMembershipRoute, resolveMembershipRedirect } from './RequireMembershipRoute';

afterEach(cleanup);

/** 資料填齊、有訂閱過的一般會員；各測試只覆寫它關心的那幾欄。 */
function member(over: Record<string, unknown> = {}) {
  return {
    isAdmin: false,
    accountStatus: 'expired',
    paidAwaitingActivation: false,
    lastTradeNo: null,
    subscriptionEndDate: null,
    registrationStep: 1,
    name: '王小明',
    phone: '0912345678',
    birthDate: '1990-01-01',
    suspended: false,
    ...over,
  };
}

describe('resolveMembershipRedirect', () => {
  it('管理員一律放行——admin 可能根本沒有訂閱', () => {
    expect(resolveMembershipRedirect(member({ isAdmin: true, registrationStep: 0 }))).toBeNull();
  });

  it('會籍有效放行,不看 registrationStep', () => {
    // step 2 曾經是「一律彈回 result 頁」的門禁，那是付款成功卻被困在
    // 結果頁的死循環根源；現在唯一放行條件是 accountStatus。
    expect(
      resolveMembershipRedirect(member({ accountStatus: 'active', registrationStep: 2 })),
    ).toBeNull();
  });

  it('已付款待開通且有交易序號 → 導向該筆訂單的結果頁', () => {
    expect(
      resolveMembershipRedirect(
        member({ paidAwaitingActivation: true, lastTradeNo: 'PU00000001' }),
      ),
    ).toBe('/payment/result?tradeNo=PU00000001');
  });

  it('已付款待開通但沒有交易序號 → 退回結帳頁（沒有訂單可查)', () => {
    expect(resolveMembershipRedirect(member({ paidAwaitingActivation: true }))).toBe(
      '/payment/checkout',
    );
  });

  it('曾訂閱過已到期 → 直接續約,不重走註冊漏斗', () => {
    expect(
      resolveMembershipRedirect(member({ subscriptionEndDate: '2026-01-01T00:00:00.000Z' })),
    ).toBe('/payment/checkout');
  });

  it('step 0 → 先去填資料', () => {
    expect(resolveMembershipRedirect(member({ registrationStep: 0 }))).toBe(
      '/auth/complete-profile',
    );
  });

  it('step 誤算成 1 但資料沒填齊 → 仍導去填資料（資料完整性優先於 step)', () => {
    expect(resolveMembershipRedirect(member({ registrationStep: 1, phone: null }))).toBe(
      '/auth/complete-profile',
    );
  });

  it('step 1、資料齊、未付款 → 去結帳', () => {
    expect(resolveMembershipRedirect(member())).toBe('/payment/checkout');
  });

  it('step 2 但付款失敗（未待開通）→ 去結帳重付,不是困在結果頁', () => {
    // 回歸釘：舊版把 step 2 一律送去 /payment/result，付款失敗的人會被
    // 永久困在那裡。
    expect(
      resolveMembershipRedirect(member({ registrationStep: 2, paidAwaitingActivation: false })),
    ).toBe('/payment/checkout');
  });

  describe('優先序（哪一條先命中)', () => {
    it('isAdmin 蓋過其他所有狀態', () => {
      expect(
        resolveMembershipRedirect(
          member({ isAdmin: true, paidAwaitingActivation: true, lastTradeNo: 'PU1' }),
        ),
      ).toBeNull();
    });

    it('active 蓋過待開通——已經開通了就不必再看結果頁', () => {
      expect(
        resolveMembershipRedirect(
          member({ accountStatus: 'active', paidAwaitingActivation: true, lastTradeNo: 'PU1' }),
        ),
      ).toBeNull();
    });

    it('待開通蓋過「曾訂閱過」——續費者剛付完款要看結果頁,不是再付一次', () => {
      // 這條是金流不變式：續約會員同時有 subscriptionEndDate 與
      // paidAwaitingActivation，順序反了就會把剛付完錢的人送回結帳頁。
      expect(
        resolveMembershipRedirect(
          member({
            subscriptionEndDate: '2026-01-01T00:00:00.000Z',
            paidAwaitingActivation: true,
            lastTradeNo: 'PU00000002',
          }),
        ),
      ).toBe('/payment/result?tradeNo=PU00000002');
    });

    it('「曾訂閱過」蓋過資料未填齊——老會員續約不該被丟回註冊漏斗', () => {
      expect(
        resolveMembershipRedirect(
          member({ subscriptionEndDate: '2026-01-01T00:00:00.000Z', registrationStep: 0 }),
        ),
      ).toBe('/payment/checkout');
    });
  });
});

// --- 接線：決策有沒有真的驅動 router ---------------------------------------
// 決策函式對、但沒接上，使用者照樣走錯頁。上面那組測試證不到這件事。

/** 把當前路徑與 query 印出來，斷言才看得到 tradeNo 有沒有被帶過去。 */
function Landed({ label }: { label: string }) {
  const { pathname, search } = useLocation();
  return <div data-testid="landed">{`${label}|${pathname}${search}`}</div>;
}

function renderGuard(user: unknown, isLoggedIn = true) {
  return render(
    <UserCtx.Provider value={{ user, isLoggedIn }}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <RequireMembershipRoute>
                <div data-testid="landed">會員區</div>
              </RequireMembershipRoute>
            }
          />
          <Route path="/payment/checkout" element={<Landed label="結帳" />} />
          <Route path="/payment/result" element={<Landed label="開通中" />} />
          <Route path="/auth/complete-profile" element={<Landed label="填資料" />} />
        </Routes>
      </MemoryRouter>
    </UserCtx.Provider>,
  );
}

describe('RequireMembershipRoute 接線', () => {
  it('會籍有效時渲染 children,不導頁', () => {
    renderGuard(member({ accountStatus: 'active' }));
    expect(screen.getByTestId('landed').textContent).toBe('會員區');
  });

  it('已付款待開通時真的導到結果頁,而且帶著 tradeNo', async () => {
    // 這條是本檔最重要的斷言：tradeNo 掉了，結果頁查不到訂單，使用者就
    // 看不到「開通中」而是「找不到訂單」，很可能再付一次。
    renderGuard(member({ paidAwaitingActivation: true, lastTradeNo: 'PU00000003' }));
    expect((await screen.findByTestId('landed')).textContent).toBe(
      '開通中|/payment/result?tradeNo=PU00000003',
    );
  });

  it('過期會員真的導到結帳頁', async () => {
    renderGuard(member({ subscriptionEndDate: '2026-01-01T00:00:00.000Z' }));
    expect((await screen.findByTestId('landed')).textContent).toBe('結帳|/payment/checkout');
  });

  it('step 0 真的導到填資料頁', async () => {
    renderGuard(member({ registrationStep: 0 }));
    expect((await screen.findByTestId('landed')).textContent).toBe('填資料|/auth/complete-profile');
  });

  it('未登入時原樣渲染 children,交給 ProtectedRoute 處理', () => {
    renderGuard(null, false);
    expect(screen.getByTestId('landed').textContent).toBe('會員區');
  });

  describe('停權', () => {
    it('停權會員看到停權說明,而且**不會**被導去結帳頁', async () => {
      // 停權導去結帳頁的話，使用者付了錢還是進不來——錢收了、功能沒開。
      renderGuard(member({ suspended: true }));
      expect(await screen.findByText('帳號已停權')).toBeTruthy();
      expect(screen.queryByTestId('landed')).toBeNull();
    });

    it('停權的管理員不受阻擋', () => {
      renderGuard(member({ suspended: true, isAdmin: true }));
      expect(screen.getByTestId('landed').textContent).toBe('會員區');
    });
  });
});
