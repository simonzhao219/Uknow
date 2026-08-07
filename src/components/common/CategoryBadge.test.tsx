// @vitest-environment jsdom
//
// 服務類別徽章的**寬度界限**。這支測試的存在理由是「由建構保證」:
// 自訂類別是全站唯一長度不由開發者決定的顯示欄位,四個渲染點(首頁桌面卡片、
// 首頁手機卡片、服務者詳情頁、刊登管理頁)原本各自貼 CSS、零機械驗證。
// 收斂成一個元件之後,這裡綠 = 四處都有界。
//
// 為什麼不靠 e2e/test_overflow_sweep.py:那支巡檢預設 report-only
// (E2E_OVERFLOW_STRICT 不在任何 workflow 設定),不會讓 CI 變紅。
// 拿 report-only 當硬閘門的替代品是降級不是升級——friction-log 2026-08-07 條。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CategoryBadge } from './CategoryBadge';

afterEach(cleanup);

function badgeOf(category: string, className?: string) {
  render(<CategoryBadge category={category} className={className} />);
  return screen.getByText(category);
}

describe('CategoryBadge', () => {
  it('渲染類別文字', () => {
    expect(badgeOf('寵物美容').textContent).toBe('寵物美容');
  });

  it('帶寬度上限，長類別不會把同列的名稱擠到 0 寬', () => {
    // shrink-0 的徽章沒有 max-w 時，flex 容器會先餵飽它再壓縮名稱。
    expect(badgeOf('寵物美容').className).toMatch(/max-w-/);
  });

  it('超出上限時單行截斷而非換行撐高卡片', () => {
    const className = badgeOf('十個字的超長自訂類別').className;
    expect(className).toContain('truncate');
  });

  it('呼叫端可加樣式而不會覆蓋掉寬度界限', () => {
    // 四個渲染點的字級/內距各不相同（詳情頁 text-lg、手機卡片 text-xs），
    // 但界限不該因為呼叫端傳了 className 就消失。
    const className = badgeOf('寵物美容', 'text-lg px-3 py-1').className;
    expect(className).toMatch(/max-w-/);
    expect(className).toContain('truncate');
    expect(className).toContain('text-lg');
  });

  it('把完整類別放進 title，截斷時仍讀得到全文', () => {
    expect(badgeOf('十個字的超長自訂類別').getAttribute('title')).toBe('十個字的超長自訂類別');
  });
});
