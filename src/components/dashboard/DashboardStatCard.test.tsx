// @vitest-environment jsdom
//
// 狀態卡外殼：整張卡是一個連結（可及名稱由 aria-label 提供）、載入中是骨架
// 且標 aria-busy；卡內行動提示是次要外框鈕（流程起點，三分法歸次要）。
// 需要真按鈕的卡（推薦格的邀請好友）走 action：標題＋數字是連結、按鈕在連結外——
// <a> 裡不能巢狀互動元素。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Gift } from 'lucide-react';
import { DashboardStatCard, StatCardAction } from './DashboardStatCard';

afterEach(cleanup);

function renderCard(props: {
  loading?: boolean;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
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
    // 沒有 action 的卡維持整卡一個連結：卡片外殼在連結裡面。
    expect(link.querySelector('[data-slot="card"]')).not.toBeNull();
  });

  it('載入中顯示骨架而不是內容', () => {
    const { container } = renderCard({ loading: true });
    expect(screen.getByRole('link').getAttribute('aria-busy')).toBe('true');
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(2);
    expect(screen.queryByText('500')).toBeNull();
  });
});

describe('DashboardStatCard 行動鈕', () => {
  it('有行動鈕時連結只包標題與數字，按鈕在連結外且有自己的名稱', () => {
    renderCard({ action: <button type="button">邀請好友</button> });
    const link = screen.getByRole('link', { name: '可提領點數：500 P' });
    const button = screen.getByRole('button', { name: '邀請好友' });
    expect(link.contains(button)).toBe(false);
    expect(link.textContent).toContain('500');
    expect(link.textContent).toContain('可提領點數');
    // 按鈕仍在同一張卡裡，不是卡外的孤兒。
    const card = link.closest('[data-slot="card"]');
    expect(card).not.toBeNull();
    expect(card?.contains(button)).toBe(true);
  });

  it('載入中時連結區是骨架，行動鈕照常顯示', () => {
    renderCard({ loading: true, action: <button type="button">邀請好友</button> });
    expect(screen.getByRole('link').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('500')).toBeNull();
    expect(screen.getByRole('button', { name: '邀請好友' })).toBeTruthy();
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
