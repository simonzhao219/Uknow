// @vitest-environment jsdom
//
// 確認框的確認鈕預設是流程鈕（墨黑）；只有不可逆的破壞性確認（刪除刊登、退件）才傳
// variant="destructive" 成紅實心——紅實心只出現在這種確認框裡，列內的觸發鈕是紅框字
// tone="destructive"（ui-ux-guidelines §12.11，業主裁決 D4）。class 用 classList.contains
// 比，理由同 tabs.test.tsx。
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from './alert-dialog';

afterEach(cleanup);

function renderConfirm(action: ReactNode) {
  render(
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogTitle>確定要刪除這則刊登嗎？</AlertDialogTitle>
        <AlertDialogDescription>此動作無法復原。</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          {action}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>,
  );
}

describe('AlertDialogAction', () => {
  it('未指定 variant 時是流程鈕墨黑實心', () => {
    renderConfirm(<AlertDialogAction>確定</AlertDialogAction>);
    const action = screen.getByRole('button', { name: '確定' });
    expect(action.classList.contains('bg-primary')).toBe(true);
    expect(action.classList.contains('bg-destructive')).toBe(false);
  });

  it('不可逆確認傳 variant destructive 時是紅實心，不殘留墨黑底', () => {
    renderConfirm(<AlertDialogAction variant="destructive">確認刪除</AlertDialogAction>);
    const action = screen.getByRole('button', { name: '確認刪除' });
    for (const c of ['bg-destructive', 'text-destructive-foreground']) {
      expect(action.classList.contains(c), c).toBe(true);
    }
    expect(action.classList.contains('bg-primary')).toBe(false);
  });
});
