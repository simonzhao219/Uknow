// @vitest-environment jsdom
//
// 首頁的服務類別篩選(單選 chip)。抽出成獨立檔案的理由就是這支測試——
// 留在 HomePage.tsx 裡當 module-level function 時,要驗「自訂類別篩得到」
// 就得把整個首頁(supabase 查詢、geolocation、router)一起拉起來。
//
// 這裡守兩件事:
//   1. 需求第 3 點:自訂類別在篩選器裡要和內建類別一樣能用。
//   2. 內建與自訂的分區契約——分隔線＋小標、自訂在後、超過門檻收合,
//      以及**收合時目前套用中的類別仍然看得到**(見元件檔頭)。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SERVICE_CATEGORIES } from '../../utils/constants';
import { CUSTOM_CATEGORY_VISIBLE_LIMIT, CategoryFilterChips } from './CategoryFilterChips';

afterEach(cleanup);

const CUSTOM_GROUP_LABEL = '自訂創意類別';

/** 超過露出門檻的自訂類別清單;`extra` 決定超出幾個。 */
function overLimitCustomCategories(extra = 2): string[] {
  return Array.from(
    { length: CUSTOM_CATEGORY_VISIBLE_LIMIT + extra },
    (_, index) => `自訂${index + 1}`,
  );
}

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

describe('CategoryFilterChips 分區', () => {
  it('有自訂類別時，該區以小標與 group 和內建隔開', () => {
    renderChips(['寵物美容']);
    const group = screen.getByRole('group', { name: CUSTOM_GROUP_LABEL });
    expect(group.textContent).toContain('寵物美容');
  });

  it('自訂區只裝自訂類別，內建類別不在裡面', () => {
    renderChips(['寵物美容']);
    const group = screen.getByRole('group', { name: CUSTOM_GROUP_LABEL });
    expect(group.textContent).not.toContain('美髮');
  });

  it('沒有自訂類別時整區不渲染（空小標等於宣告「這裡本來有東西」）', () => {
    renderChips([]);
    expect(screen.queryByText(CUSTOM_GROUP_LABEL)).toBeNull();
    expect(screen.queryByRole('group')).toBeNull();
  });
});

describe('CategoryFilterChips 收合', () => {
  it('自訂類別未超過門檻時不出現收合鈕', () => {
    renderChips(Array.from({ length: CUSTOM_CATEGORY_VISIBLE_LIMIT }, (_, i) => `自訂${i + 1}`));
    expect(screen.queryByRole('button', { name: /顯示全部/ })).toBeNull();
  });

  it('超過門檻時只露出前 N 個，其餘收起', () => {
    const custom = overLimitCustomCategories();
    renderChips(custom);
    expect(
      screen.getByRole('button', { name: custom[CUSTOM_CATEGORY_VISIBLE_LIMIT - 1] }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: custom[CUSTOM_CATEGORY_VISIBLE_LIMIT] }),
    ).toBeNull();
  });

  it('收合鈕標示自訂類別總數，不是被收起的數量', () => {
    const custom = overLimitCustomCategories();
    renderChips(custom);
    expect(screen.getByRole('button', { name: `顯示全部 (${custom.length})` })).toBeTruthy();
  });

  it('點「顯示全部」後被收起的類別也出現', () => {
    const custom = overLimitCustomCategories();
    renderChips(custom);
    fireEvent.click(screen.getByRole('button', { name: /顯示全部/ }));
    expect(
      screen.getByRole('button', { name: custom[CUSTOM_CATEGORY_VISIBLE_LIMIT] }),
    ).toBeTruthy();
  });

  it('展開後可再收合回去', () => {
    const custom = overLimitCustomCategories();
    renderChips(custom);
    fireEvent.click(screen.getByRole('button', { name: /顯示全部/ }));
    fireEvent.click(screen.getByRole('button', { name: '收合' }));
    expect(
      screen.queryByRole('button', { name: custom[CUSTOM_CATEGORY_VISIBLE_LIMIT] }),
    ).toBeNull();
  });

  it('收合鈕以 aria-expanded 反映目前狀態', () => {
    renderChips(overLimitCustomCategories());
    const toggle = screen.getByRole('button', { name: /顯示全部/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: '收合' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('選中的類別落在收合段時，不必展開也看得到', () => {
    const custom = overLimitCustomCategories();
    const hidden = custom[CUSTOM_CATEGORY_VISIBLE_LIMIT];
    renderChips(custom, hidden);
    expect(screen.getByRole('button', { name: hidden }).getAttribute('aria-pressed')).toBe('true');
  });

  it('被提上來的只有選中的那一個，其餘仍然收著', () => {
    const custom = overLimitCustomCategories();
    renderChips(custom, custom[CUSTOM_CATEGORY_VISIBLE_LIMIT]);
    expect(
      screen.queryByRole('button', { name: custom[CUSTOM_CATEGORY_VISIBLE_LIMIT + 1] }),
    ).toBeNull();
  });

  it('選中的是內建類別時不影響收合（不會誤把自訂類別提上來）', () => {
    const custom = overLimitCustomCategories();
    renderChips(custom, '美髮');
    expect(
      screen.queryByRole('button', { name: custom[CUSTOM_CATEGORY_VISIBLE_LIMIT] }),
    ).toBeNull();
  });
});
