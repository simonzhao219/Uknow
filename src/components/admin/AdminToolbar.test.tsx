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
      isUpdating={false}
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
    // 名稱整串由一個節點承擔（aria-labelledby），不是拆段 sr-only 拼起來——
    // 拆段在 Chromium 會多出空白（ui-ux-guidelines §9）；也不用 aria-label。
    const csv = screen.getByRole('button', { name: '下載 CSV（含身分證與帳號）' });
    expect(csv.getAttribute('aria-label')).toBeNull();
    const labelId = csv.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId as string)?.textContent).toBe(
      '下載 CSV（含身分證與帳號）',
    );
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

  it('重新整理中鈕標成停用、焦點不動，點擊交給頁面決定', () => {
    const { onRefresh } = renderToolbar({ isUpdating: true });
    const refresh = screen.getByRole('button', { name: '重新整理' });
    // 不用原生 disabled：被按的鈕變停用，焦點會掉到 body。
    expect(refresh.getAttribute('aria-disabled')).toBe('true');
    expect(refresh.hasAttribute('disabled')).toBe(false);
    expect(refresh.querySelector('svg')?.getAttribute('class')).toContain(
      'motion-safe:animate-spin',
    );
    refresh.focus();
    fireEvent.click(refresh);
    expect(document.activeElement).toBe(refresh);
    // 更新途中要不要重送、要寫「仍在更新」，由頁面的 useRefreshAnnouncer 決定；工具列照樣交出點擊。
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('載入更多中真停用，點了不呼叫 onRefresh', () => {
    const { onRefresh } = renderToolbar({ refreshDisabled: true });
    const refresh = screen.getByRole('button', { name: '重新整理' });
    expect(refresh.hasAttribute('disabled')).toBe(true);
    fireEvent.click(refresh);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('匯出中：CSV 鈕忙碌、按不下去、名稱改成匯出中，並有狀態宣告', () => {
    renderToolbar({ onExport: vi.fn(), isExporting: true });
    const csv = screen.getByRole('button', { name: '匯出中…' });
    expect(csv.getAttribute('aria-busy')).toBe('true');
    expect(csv.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('匯出中');
  });

  it('狀態宣告區在匯出前就存在、只切換文字——live region 要先在才念得出來', () => {
    const { rerender } = renderToolbar({ onExport: vi.fn() });
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');
    rerender(
      <AdminToolbar
        filter={<input aria-label="篩選" />}
        onRefresh={vi.fn()}
        isUpdating={false}
        onExport={vi.fn()}
        isExporting
      />,
    );
    expect(screen.getByRole('status')).toBe(status);
    expect(status.textContent).toContain('匯出中');
  });

  it('沒有匯出能力的頁面不放匯出狀態宣告區（沒有東西要宣告）', () => {
    renderToolbar();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('匯出結束時焦點回到 CSV 鈕——按下去後鈕被停用，焦點掉到 body 就回不來了', () => {
    const props = { filter: <input aria-label="篩選" />, onRefresh: vi.fn(), isUpdating: false };
    const { rerender } = render(<AdminToolbar {...props} onExport={vi.fn()} isExporting />);
    (document.activeElement as HTMLElement | null)?.blur();
    rerender(<AdminToolbar {...props} onExport={vi.fn()} isExporting={false} />);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: '下載 CSV（含身分證與帳號）' }),
    );
  });

  it('匯出結束時使用者已把焦點移到別處，就不搶回來', () => {
    const props = { filter: <input aria-label="篩選" />, onRefresh: vi.fn(), isUpdating: false };
    const { rerender } = render(<AdminToolbar {...props} onExport={vi.fn()} isExporting />);
    const box = screen.getByRole('textbox', { name: '篩選' });
    box.focus();
    rerender(<AdminToolbar {...props} onExport={vi.fn()} isExporting={false} />);
    expect(document.activeElement).toBe(box);
  });

  it('整列停用時兩顆鈕都按不下去（匯出期間不准重新整理）', () => {
    renderToolbar({ onExport: vi.fn(), disabled: true });
    expect(screen.getByRole('button', { name: '重新整理' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /下載 CSV/ }).hasAttribute('disabled')).toBe(true);
  });

  it('匯出中的宣告說出完成前無法切換分頁', () => {
    renderToolbar({ onExport: vi.fn(), isExporting: true });
    expect(screen.getByRole('status').textContent).toBe('匯出中，完成前無法切換分頁');
  });

  it('CSV 停用的原因以 exportDescribedBy 掛在鈕上', () => {
    renderToolbar({ onExport: vi.fn(), canExport: false, exportDescribedBy: 'export-why' });
    const csv = screen.getByRole('button', { name: /下載 CSV/ });
    expect(csv.getAttribute('aria-describedby')).toBe('export-why');
  });

  it('狀態文字是工具列那一行之外的 aria-live 段落，不是 role="status"', () => {
    renderToolbar({ statusText: '正在更新' });
    const status = screen.getByText('正在更新');
    expect(status.getAttribute('aria-live')).toBe('polite');
    // role="status" 是列表骨架的定位器；狀態文字不能搶走它。
    expect(status.getAttribute('role')).toBeNull();
    expect(status.closest('[data-slot="admin-toolbar"]')).toBeNull();
  });

  it('狀態文字的段落常駐、只換文字——live region 要先在才念得出來', () => {
    const props = { onRefresh: vi.fn(), isUpdating: false };
    const { container, rerender } = render(<AdminToolbar {...props} statusText="" />);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    rerender(<AdminToolbar {...props} statusText="已更新 09:05" />);
    expect(container.querySelector('[aria-live="polite"]')).toBe(live);
    expect(live?.textContent).toBe('已更新 09:05');
  });

  it('沒有篩選的頁面，重新整理鈕靠右', () => {
    const { container } = render(<AdminToolbar onRefresh={vi.fn()} isUpdating={false} />);
    const toolbar = container.querySelector('[data-slot="admin-toolbar"]');
    expect(toolbar?.className).toContain('justify-end');
    expect(toolbar?.firstElementChild).toBe(screen.getByRole('button', { name: '重新整理' }));
  });

  it('匯出暫停時 CSV 鈕標成停用、點了不匯出，停用的外觀等頁面說可以才套', () => {
    const onExport = vi.fn();
    const props = { onRefresh: vi.fn(), isUpdating: false, onExport, exportPaused: true };
    const { rerender } = render(<AdminToolbar {...props} />);
    const csv = screen.getByRole('button', { name: /下載 CSV/ });
    // 不用原生 disabled：0.3 秒內結束的更新不該閃灰，焦點也不能因停用掉到 body。
    expect(csv.getAttribute('aria-disabled')).toBe('true');
    expect(csv.hasAttribute('disabled')).toBe(false);
    expect(csv.getAttribute('data-paused')).toBeNull();
    fireEvent.click(csv);
    expect(onExport).not.toHaveBeenCalled();

    rerender(<AdminToolbar {...props} exportPausedVisible />);
    expect(screen.getByRole('button', { name: /下載 CSV/ }).getAttribute('data-paused')).toBe(
      'true',
    );
  });
});
