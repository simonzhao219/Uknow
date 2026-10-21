// @vitest-environment jsdom
//
// 獎勵回饋的資訊層次（ui-ux-guidelines §13、S7a）：主數字是「可提領」，它是本頁唯一的
// 淡底主區，「申請提領」鈕收進這張卡；「總累積」降為一般小卡。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { RewardStats } from './RewardStats';

afterEach(cleanup);

const available = () => screen.getByTestId('available-rewards-card');
const total = () => screen.getByTestId('total-rewards-card');

describe('RewardStats', () => {
  it('可提領是本頁唯一的淡底主區，總累積是一般卡', () => {
    render(<RewardStats totalRewards={2515} availableRewards={1500} />);
    expect(available().classList.contains('bg-brand-subtle')).toBe(true);
    expect(total().classList.contains('bg-brand-subtle')).toBe(false);
  });

  it('可提領的數字比總累積大一級', () => {
    render(<RewardStats totalRewards={2515} availableRewards={1500} />);
    const bigNumber = within(available()).getByText('1500P');
    const smallNumber = within(total()).getByText('2515P');
    expect(bigNumber.className).toContain('text-3xl');
    expect(smallNumber.className).not.toContain('text-3xl');
  });

  it('申請提領鈕（action）收進可提領卡內，不在總累積卡', () => {
    render(
      <RewardStats
        totalRewards={2515}
        availableRewards={1500}
        action={<button type="button">申請Point提領</button>}
      />,
    );
    expect(within(available()).getByRole('button', { name: '申請Point提領' })).toBeTruthy();
    expect(within(total()).queryByRole('button')).toBeNull();
  });

  it('沒有 action 時主區裡沒有任何按鈕', () => {
    render(<RewardStats totalRewards={0} availableRewards={0} />);
    expect(within(available()).queryByRole('button')).toBeNull();
  });

  it('可提領排在總累積前面（手機單欄時主數字在上）', () => {
    render(<RewardStats totalRewards={2515} availableRewards={1500} />);
    const order = available().compareDocumentPosition(total());
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
