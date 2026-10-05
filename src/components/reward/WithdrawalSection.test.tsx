// @vitest-environment jsdom
//
// 會員端的提領記錄。這支測試只守一件事，但那是整條證件與提領審核鏈的終點：
// **admin 填的退件理由，會員必須看得到。**
//
// 看不到理由的人只會重送一模一樣的東西，然後再被退一次——admin 多做一次工、
// 會員多等一輪，兩邊都沒有得到任何資訊。後端在階段 2.6 已經把 note 送到
// 回應裡了；沒有這一層渲染，那個欄位就只是躺在 JSON 裡沒人讀。
//
// 反面同樣要守：**沒有理由時不要留一個空殼**。渲染一個空的「退件原因：」
// 比不渲染更糟——它看起來像系統把理由弄丟了。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { WithdrawalRecord } from '@contract';
import { WithdrawalSection } from './WithdrawalSection';

// 這支測試不碰通知，替身掉整個 context 才不用把 Provider 拉進來。
vi.mock('../notifications/NotificationContext', () => ({
  useNotification: () => ({
    showToast: () => {},
    showSuccess: () => {},
    showError: () => {},
  }),
}));

afterEach(cleanup);

function record(over: Partial<WithdrawalRecord> = {}): WithdrawalRecord {
  return {
    id: 'w1',
    userId: 'u1',
    amount: 1000,
    fee: 15,
    status: 'pending',
    note: null,
    completedByAdmin: false,
    requestedAt: '2026-08-01T02:00:00Z',
    processedAt: null,
    completedAt: null,
    ...over,
  };
}

function renderSection(
  withdrawals: WithdrawalRecord[],
  subscriptionStatus: 'active' | 'expired' = 'active',
) {
  return render(
    <WithdrawalSection
      availableRewards={5000}
      pendingRewards={0}
      withdrawnRewards={0}
      hasWithdrawnToday={false}
      withdrawals={withdrawals}
      onStartWithdrawal={() => {}}
      onRefresh={() => {}}
      subscriptionStatus={subscriptionStatus}
      referralProgramJoined
    />,
  );
}

describe('WithdrawalSection', () => {
  it('被退件且有理由時，理由渲染在該筆記錄上', () => {
    renderSection([record({ status: 'rejected', note: '收款帳號與身分證姓名不符' })]);
    expect(screen.getByText(/收款帳號與身分證姓名不符/)).toBeTruthy();
  });

  it('被退件但沒有理由時不留空殼標籤', () => {
    renderSection([record({ status: 'rejected', note: null })]);
    expect(screen.queryByText(/退件原因/)).toBeNull();
  });

  // 管理員代為結案的揭露（B7／實作審查 P0-2）。改版前 activeWithdrawals 把所有
  // completed 濾掉，所以 completedByAdmin 這個欄位在 src/ 裡零讀者——契約有、
  // 後端有、測試有，但揭露到不了任何會員面前。規格書 §10.3 卻已經斷言
  // 「會員端明示」，等於文件承諾了一個不存在的保護。
  it('管理員代為結案的記錄標示出來，不讓會員以為自己按過查收', () => {
    renderSection([
      record({ status: 'completed', completedByAdmin: true, completedAt: '2026-08-02T00:00:00Z' }),
    ]);
    expect(screen.getByText(/管理員代為結案/)).toBeTruthy();
  });

  it('會員自己查收的已完成記錄不標成管理員代為結案', () => {
    renderSection([
      record({ status: 'completed', completedByAdmin: false, completedAt: '2026-08-02T00:00:00Z' }),
    ]);
    expect(screen.queryByText(/管理員代為結案/)).toBeNull();
    // 但記錄本身要看得到——會員查不到自己的提領何時結束，客服情境
    // 「我提領怎麼還沒到」在他自己那一側就沒有答案。
    expect(screen.getByText('已完成')).toBeTruthy();
  });

  it('非退件狀態不顯示退件原因區塊', () => {
    renderSection([record({ status: 'pending', note: '這是內部備註' })]);
    expect(screen.queryByText(/退件原因/)).toBeNull();
    expect(screen.queryByText(/這是內部備註/)).toBeNull();
  });

  // 引導鈕一頁一顆（ui-ux-guidelines §12.11，業主裁決 E2）：待查收可能累積好幾筆（每日可
  // 申請一筆），只有最早申請的那筆是引導鈕（蔚藍實心），其餘是次要外框。
  it('多筆待查收時只有最早申請的那筆是引導鈕，其餘是次要外框', () => {
    renderSection([
      record({
        id: 'w-new',
        status: 'awaiting_collection',
        amount: 2000,
        requestedAt: '2026-08-03T02:00:00Z',
      }),
      record({
        id: 'w-old',
        status: 'awaiting_collection',
        amount: 1000,
        requestedAt: '2026-08-01T02:00:00Z',
      }),
    ]);
    const buttons = screen.getAllByRole('button', { name: '確認收款' });
    expect(buttons).toHaveLength(2);
    const [guide, ...rest] = [...buttons].sort(
      (a, b) => Number(b.classList.contains('bg-brand')) - Number(a.classList.contains('bg-brand')),
    );
    expect(guide.classList.contains('bg-brand')).toBe(true);
    expect(guide.closest('[class*="justify-between"]')?.textContent).toContain('1,000P');
    for (const other of rest) {
      expect(other.classList.contains('bg-brand')).toBe(false);
      expect(other.classList.contains('bg-card')).toBe(true);
    }
  });

  it('只有一筆待查收時它就是引導鈕', () => {
    renderSection([record({ status: 'awaiting_collection' })]);
    expect(screen.getByRole('button', { name: '確認收款' }).classList.contains('bg-brand')).toBe(
      true,
    );
  });

  it('最早的判斷看時間不看陣列順序，同一時點不同寫法也比得出先後', () => {
    renderSection([
      record({
        id: 'w-old',
        status: 'awaiting_collection',
        amount: 1000,
        requestedAt: '2026-08-01T02:00:00+00:00',
      }),
      record({
        id: 'w-new',
        status: 'awaiting_collection',
        amount: 2000,
        requestedAt: '2026-08-01T03:00:00Z',
      }),
      record({
        id: 'w-pending',
        status: 'pending',
        amount: 3000,
        requestedAt: '2026-07-01T00:00:00Z',
      }),
    ]);
    const guide = screen
      .getAllByRole('button', { name: '確認收款' })
      .filter((b) => b.classList.contains('bg-brand'));
    expect(guide).toHaveLength(1);
    expect(guide[0].closest('[class*="justify-between"]')?.textContent).toContain('1,000P');
  });

  // 會籍失效時獎勵頁橫幅的續訂優先（續訂＞加入推薦計畫＞確認收款），確認收款全部讓位。
  it('會籍失效時確認收款全部是次要外框，引導鈕讓給橫幅的續訂', () => {
    renderSection([record({ status: 'awaiting_collection' })], 'expired');
    const button = screen.getByRole('button', { name: '確認收款' });
    expect(button.classList.contains('bg-brand')).toBe(false);
    expect(button.classList.contains('bg-card')).toBe(true);
  });
});
