// @vitest-environment jsdom
//
// 「申請Point提領」鈕與它被停用時的原因（獎勵回饋可提領主區內）。判斷式與會員中心的
// 「申請提領」共用 canRequestWithdrawal；原因文案的優先序：未加入 → 失效 → 餘額不足 → 今日已提領。
// 「已付費、未加入推薦計畫」(P3′) 是正式狀態：只用說明文字＋連結引導（總綱 §0 原則 5），
// 不複製「加入推薦計畫」鈕；還不知道（會員資料未取得）不畫成未加入。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WithdrawalAction, type WithdrawalActionProps } from './WithdrawalAction';

afterEach(cleanup);

function renderAction(over: Partial<WithdrawalActionProps> = {}) {
  const onStartWithdrawal = vi.fn();
  render(
    <MemoryRouter>
      <WithdrawalAction
        availableRewards={5000}
        hasWithdrawnToday={false}
        subscriptionStatus="active"
        referralProgramJoined
        onStartWithdrawal={onStartWithdrawal}
        {...over}
      />
    </MemoryRouter>,
  );
  return { onStartWithdrawal };
}

const button = () => screen.getByRole('button', { name: '申請Point提領' }) as HTMLButtonElement;

describe('WithdrawalAction 可提領', () => {
  it('符合資格時鈕可按，點了開始提領流程', () => {
    const { onStartWithdrawal } = renderAction();
    expect(button().disabled).toBe(false);
    fireEvent.click(button());
    expect(onStartWithdrawal).toHaveBeenCalledTimes(1);
  });

  it('是品牌色淡底主區內的次要外框鈕，不是實心鈕', () => {
    renderAction();
    for (const c of ['border-brand', 'text-brand-subtle-foreground']) {
      expect(button().classList.contains(c), c).toBe(true);
    }
    expect(button().classList.contains('bg-primary')).toBe(false);
    expect(button().classList.contains('bg-brand')).toBe(false);
  });

  it('可以提領時沒有任何原因文字', () => {
    renderAction();
    expect(screen.queryByText(/無法申請提領|不足|請明天再試/)).toBeNull();
  });
});

describe('WithdrawalAction 已付費、未加入推薦計畫（P3′）', () => {
  it('鈕停用，原因寫尚未加入推薦計畫，並連到推薦管理', () => {
    renderAction({ referralProgramJoined: false });
    expect(button().disabled).toBe(true);
    expect(screen.getByText('尚未加入推薦計畫，無法申請提領')).toBeTruthy();
    expect(screen.getByRole('link', { name: '前往推薦管理加入' }).getAttribute('href')).toBe(
      '/referrals',
    );
  });

  it('不複製加入推薦計畫的鈕：只有申請提領這一顆按鈕', () => {
    renderAction({ referralProgramJoined: false });
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('未加入的原因優先於會籍失效與餘額不足', () => {
    renderAction({
      referralProgramJoined: false,
      subscriptionStatus: 'expired',
      availableRewards: 0,
    });
    expect(screen.getByText('尚未加入推薦計畫，無法申請提領')).toBeTruthy();
    expect(screen.queryByText(/訂閱已失效/)).toBeNull();
  });

  it('會員資料還沒取得（不知道）時不說「尚未加入」也不給連結', () => {
    renderAction({ referralProgramJoined: undefined });
    expect(button().disabled).toBe(true);
    expect(screen.queryByText(/尚未加入推薦計畫/)).toBeNull();
    expect(screen.queryByRole('link', { name: '前往推薦管理加入' })).toBeNull();
  });
});

describe('WithdrawalAction 其他停用原因', () => {
  it('會籍失效：停用並請續訂（續訂鈕在頁面橫幅，這裡不重複）', () => {
    renderAction({ subscriptionStatus: 'expired' });
    expect(button().disabled).toBe(true);
    expect(screen.getByText('訂閱已失效，無法申請提領。請續訂以恢復服務。')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('餘額不足最低提領加手續費：停用並寫出門檻', () => {
    renderAction({ availableRewards: 1000 });
    expect(button().disabled).toBe(true);
    expect(screen.getByText('可提領Point不足1,015P（最低提領1,000P + 手續費15P）')).toBeTruthy();
  });

  it('今日已提領過：停用並請明天再試', () => {
    renderAction({ hasWithdrawnToday: true });
    expect(button().disabled).toBe(true);
    expect(screen.getByText('今日已提領過一次，請明天再試')).toBeTruthy();
  });
});
