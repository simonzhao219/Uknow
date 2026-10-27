// @vitest-environment jsdom
//
// 共用 Dialog 的關閉鈕：名稱「關閉」（中文介面，讀屏念得懂）、觸控裝置撐到 44px
// （對齊 ui/sheet；ui-ux-guidelines §9）。LegalDialog、邀請卡等所有 Dialog 一併受益。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Dialog, DialogContent, DialogTitle } from './dialog';

afterEach(cleanup);

describe('DialogContent 關閉鈕', () => {
  it('名稱為關閉，且觸控裝置的點擊區為 44px', () => {
    render(
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>標題</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const close = screen.getByRole('button', { name: '關閉' });
    expect(close.className).toContain('pointer-coarse:size-11');
  });
});
