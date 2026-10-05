// @vitest-environment jsdom
//
// 推薦管理統計區的版面契約（ui-ux-guidelines §13）：一個主數字（推薦總人數）＋
// 一行世代小字，不再是四張等大數字；手機與桌機同一套，jsdom 下每個數字只出現一次。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ReferralStats } from './ReferralStats';

afterEach(cleanup);

describe('ReferralStats', () => {
  it('主數字是三代加總的推薦總人數', () => {
    render(<ReferralStats firstLevelCount={7} secondLevelCount={4} thirdLevelCount={1} />);
    expect(screen.getByText('推薦總人數')).toBeTruthy();
    expect(screen.getByTestId('referral-stats').textContent).toContain('12位');
  });

  it('世代分布以一行小字呈現', () => {
    render(<ReferralStats firstLevelCount={7} secondLevelCount={4} thirdLevelCount={1} />);
    expect(screen.getByTestId('referral-stats-generations').textContent).toBe(
      '一代 7 · 二代 4 · 三代 1',
    );
  });

  it('還沒有推薦任何人時主數字為 0', () => {
    render(<ReferralStats firstLevelCount={0} secondLevelCount={0} thirdLevelCount={0} />);
    expect(screen.getByTestId('referral-stats').textContent).toContain('0位');
  });
});
