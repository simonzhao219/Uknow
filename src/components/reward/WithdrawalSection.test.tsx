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

function renderSection(withdrawals: WithdrawalRecord[]) {
  return render(
    <WithdrawalSection
      availableRewards={5000}
      pendingRewards={0}
      withdrawnRewards={0}
      hasWithdrawnToday={false}
      withdrawals={withdrawals}
      onStartWithdrawal={() => {}}
      onRefresh={() => {}}
      subscriptionStatus="active"
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

  it('非退件狀態不顯示退件原因區塊', () => {
    renderSection([record({ status: 'pending', note: '這是內部備註' })]);
    expect(screen.queryByText(/退件原因/)).toBeNull();
    expect(screen.queryByText(/這是內部備註/)).toBeNull();
  });
});
