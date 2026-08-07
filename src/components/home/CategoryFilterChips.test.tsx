// @vitest-environment jsdom
//
// 首頁的服務類別篩選(單選 chip)。抽出成獨立檔案的理由就是這支測試——
// 留在 HomePage.tsx 裡當 module-level function 時,要驗「自訂類別篩得到」
// 就得把整個首頁(supabase 查詢、geolocation、router)一起拉起來。
//
// 這裡守的是需求第 3 點:自訂類別在篩選器裡要和內建類別一樣能用。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SERVICE_CATEGORIES } from '../../utils/constants';
import { CategoryFilterChips } from './CategoryFilterChips';

afterEach(cleanup);

function renderChips(customCategories: string[] = [], selectedCategory = '') {
  const onSelect = vi.fn();
  render(
    <CategoryFilterChips
      selectedCategory={selectedCategory}
      customCategories={customCategories}
      onSelect={onSelect}
    />,
  );
  return { onSelect };
}

describe('CategoryFilterChips', () => {
  it('內建類別全數列為 chip', () => {
    renderChips();
    for (const category of SERVICE_CATEGORIES) {
      expect(screen.getByRole('button', { name: category })).toBeTruthy();
    }
  });

  it('自訂類別也列為 chip（需求第 3 點：篩選器要篩得到）', () => {
    renderChips(['寵物美容']);
    expect(screen.getByRole('button', { name: '寵物美容' })).toBeTruthy();
  });

  it('點自訂類別的 chip 會套用該篩選條件', () => {
    const { onSelect } = renderChips(['寵物美容']);
    fireEvent.click(screen.getByRole('button', { name: '寵物美容' }));
    expect(onSelect).toHaveBeenCalledWith('寵物美容');
  });

  it('再點一次已選的自訂類別會取消篩選', () => {
    const { onSelect } = renderChips(['寵物美容'], '寵物美容');
    fireEvent.click(screen.getByRole('button', { name: '寵物美容' }));
    expect(onSelect).toHaveBeenCalledWith('');
  });

  it('自訂類別排在內建類別之後', () => {
    renderChips(['寵物美容']);
    const labels = screen.getAllByRole('button').map((node) => node.textContent);
    expect(labels.indexOf('寵物美容')).toBeGreaterThan(labels.indexOf('其他'));
  });

  it('選中的 chip 以 aria-pressed 標示', () => {
    renderChips(['寵物美容'], '寵物美容');
    expect(screen.getByRole('button', { name: '寵物美容' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('沒有任何自訂類別時「全部類別」仍在且被選中', () => {
    renderChips([]);
    const all = screen.getByRole('button', { name: '全部類別' });
    expect(all.getAttribute('aria-pressed')).toBe('true');
  });

  it('自訂類別與內建同名時不重複渲染（view 回傳的內建類別已被扣除，這是防呆）', () => {
    renderChips(['美髮']);
    expect(screen.getAllByRole('button', { name: '美髮' })).toHaveLength(1);
  });
});
