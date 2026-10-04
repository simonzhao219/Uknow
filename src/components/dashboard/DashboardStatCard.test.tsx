// @vitest-environment jsdom
//
// 狀態卡外殼：整張卡是一個連結（可及名稱由 aria-label 提供）、載入中是骨架
// 且標 aria-busy；卡內行動提示 primary 是黑色主按鈕樣式、否則降為 brand。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Gift } from 'lucide-react';
import { DashboardStatCard, StatCardAction } from './DashboardStatCard';

afterEach(cleanup);

function renderCard(props: { loading?: boolean; children?: React.ReactNode }) {
  return render(
    <MemoryRouter>
      <DashboardStatCard
        to="/rewards"
        title="可提領點數"
        icon={Gift}
        ariaLabel="可提領點數：500 P"
        {...props}
      >
        {props.children ?? <p>500</p>}
      </DashboardStatCard>
    </MemoryRouter>,
  );
}

describe('DashboardStatCard', () => {
  it('整張卡是一個以 aria-label 命名的連結', () => {
    renderCard({});
    const link = screen.getByRole('link', { name: '可提領點數：500 P' });
    expect(link.getAttribute('href')).toBe('/rewards');
    expect(link.getAttribute('aria-busy')).toBeNull();
  });

  it('載入中顯示骨架而不是內容', () => {
    const { container } = renderCard({ loading: true });
    expect(screen.getByRole('link').getAttribute('aria-busy')).toBe('true');
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(2);
    expect(screen.queryByText('500')).toBeNull();
  });
});

describe('StatCardAction', () => {
  it('primary 時是黑色主按鈕樣式、否則降為 brand', () => {
    const { rerender } = render(<StatCardAction primary>申請提領</StatCardAction>);
    expect(screen.getByText('申請提領').classList.contains('bg-primary')).toBe(true);
    rerender(<StatCardAction primary={false}>申請提領</StatCardAction>);
    const el = screen.getByText('申請提領');
    expect(el.classList.contains('bg-brand')).toBe(true);
    expect(el.classList.contains('bg-primary')).toBe(false);
  });
});
