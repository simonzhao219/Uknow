// @vitest-environment jsdom
//
// 選取與聚焦一條規則（ui-ux-guidelines §12.12）：分頁格是無框元件，選中＝底色灰字 --sel、
// 文字反白，不靠品牌色字或粗體。只換顏色、不動盒模型——admin 分頁列的 ink-overflow
// 量測（AdminDashboard.tsx 註解、e2e/test_admin_mobile_layout.py）吃的就是 px-2＋border
// 的寬度預算。class 用 classList.contains 比：toContain 比整串會被較長的 class 誤判通過。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Tabs, TabsList, TabsTrigger } from './tabs';

afterEach(cleanup);

function renderTabs() {
  render(
    <Tabs defaultValue="withdrawals">
      <TabsList>
        <TabsTrigger value="withdrawals">提領</TabsTrigger>
        <TabsTrigger value="members">會員</TabsTrigger>
      </TabsList>
    </Tabs>,
  );
  return {
    active: screen.getByRole('tab', { name: '提領' }),
    inactive: screen.getByRole('tab', { name: '會員' }),
  };
}

describe('TabsTrigger', () => {
  it('選中格以 --sel 實心底、反白字標示，深色模式同一組', () => {
    const { active } = renderTabs();
    expect(active.getAttribute('data-state')).toBe('active');
    for (const c of [
      'data-[state=active]:bg-sel',
      'data-[state=active]:text-sel-foreground',
      'dark:data-[state=active]:text-sel-foreground',
    ]) {
      expect(active.classList.contains(c), c).toBe(true);
    }
  });

  it('選中態不再用品牌色字或白卡底', () => {
    const { active } = renderTabs();
    expect(active.className).not.toMatch(/text-brand|bg-card/);
  });

  it('盒模型維持 px-2 加 border 加 text-sm，admin 分頁列的量測預算不變', () => {
    const { inactive } = renderTabs();
    for (const c of ['px-2', 'border', 'border-transparent', 'text-sm', 'whitespace-nowrap']) {
      expect(inactive.classList.contains(c), c).toBe(true);
    }
  });

  it('焦點只有鍵盤焦點環，不另改框線或外框線', () => {
    const { inactive } = renderTabs();
    expect(inactive.classList.contains('focus-visible:ring-ring')).toBe(true);
    expect(inactive.className).not.toMatch(/focus-visible:(border|outline)-ring/);
  });
});
