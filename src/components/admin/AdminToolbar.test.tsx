// @vitest-environment jsdom
//
// 後台列表的工具列（S3 A2）。這支守的是**語意契約**：哪些鈕在、叫什麼名字、
// 什麼時候按不下去。版面（手機一行、icon 鈕 44px）jsdom 量不出來，由
// e2e/test_admin_mobile_layout.py 的真瀏覽器量測把關。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AdminToolbar } from './AdminToolbar';

afterEach(cleanup);

function renderToolbar(props: Partial<Parameters<typeof AdminToolbar>[0]> = {}) {
  const onRefresh = vi.fn();
  const utils = render(
    <AdminToolbar
      filter={<input aria-label="篩選" />}
      onRefresh={onRefresh}
      isRefreshing={false}
      {...props}
    />,
  );
  return { ...utils, onRefresh };
}

describe('AdminToolbar', () => {
  it('篩選欄位放在工具列裡', () => {
    renderToolbar();
    expect(screen.getByRole('textbox', { name: '篩選' })).toBeTruthy();
  });

  it('沒有匯出能力的頁面不出現 CSV 鈕——匯出不是工具列附贈的功能', () => {
    renderToolbar();
    expect(screen.queryByRole('button', { name: /CSV/ })).toBeNull();
  });

  it('兩顆鈕的名稱來自文字本身；CSV 鈕名稱說出它含敏感資料', () => {
    renderToolbar({ onExport: vi.fn() });
    expect(screen.getByRole('button', { name: '重新整理' })).toBeTruthy();
    const csv = screen.getByRole('button', { name: /下載 CSV/ });
    expect(csv.textContent).toContain('含身分證與帳號');
    // 名稱由文字承擔、不另設 aria-label：忙碌時換掉的文字才會被念出來。
    expect(csv.getAttribute('aria-label')).toBeNull();
  });

  it('兩顆鈕都是 type="button"——放進搜尋 form 時不得變成送出鈕', () => {
    renderToolbar({ onExport: vi.fn() });
    for (const btn of screen.getAllByRole('button')) {
      expect(btn.getAttribute('type')).toBe('button');
    }
  });

  it('按下去呼叫對應的處理', () => {
    const onExport = vi.fn();
    const { onRefresh } = renderToolbar({ onExport });
    fireEvent.click(screen.getByRole('button', { name: '重新整理' }));
    fireEvent.click(screen.getByRole('button', { name: /下載 CSV/ }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('重新整理中按不下去', () => {
    renderToolbar({ isRefreshing: true });
    expect(screen.getByRole('button', { name: '重新整理' }).hasAttribute('disabled')).toBe(true);
  });

  it('匯出中：CSV 鈕忙碌、按不下去、名稱改成匯出中，並有狀態宣告', () => {
    renderToolbar({ onExport: vi.fn(), isExporting: true });
    const csv = screen.getByRole('button', { name: /匯出中/ });
    expect(csv.getAttribute('aria-busy')).toBe('true');
    expect(csv.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('匯出中');
  });

  it('整列停用時兩顆鈕都按不下去（匯出期間不准重新整理）', () => {
    renderToolbar({ onExport: vi.fn(), disabled: true });
    expect(screen.getByRole('button', { name: '重新整理' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /下載 CSV/ }).hasAttribute('disabled')).toBe(true);
  });
});
