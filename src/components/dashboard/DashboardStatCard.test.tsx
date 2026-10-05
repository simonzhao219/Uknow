// @vitest-environment jsdom
//
// 狀態卡外殼：整張卡是一個連結（可及名稱由 aria-label 提供）、載入中是骨架
// 且標 aria-busy；卡內行動提示是次要外框鈕（流程起點，三分法歸次要）。
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
  it('是白底框線的次要鈕，不是墨黑或品牌色實心', () => {
    render(<StatCardAction>申請提領</StatCardAction>);
    const el = screen.getByText('申請提領');
    expect(el.classList.contains('bg-card')).toBe(true);
    expect(el.classList.contains('border')).toBe(true);
    expect(el.classList.contains('bg-primary')).toBe(false);
    expect(el.classList.contains('bg-brand')).toBe(false);
  });
});
