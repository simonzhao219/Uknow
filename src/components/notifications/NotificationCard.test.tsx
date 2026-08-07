// @vitest-environment jsdom
//
// 同 ToastCard：關閉鈕原本是裸的 20px icon、沒有 padding，熱區低於準則 §1
// 的 44px。這裡還多一處——頁尾的「確認 / 取消」是 px-6 py-2，實高約 40px，
// 而它們才是這個彈窗真正的主要觸控目標。
//
// 熱區釘的是 class 意圖（jsdom 不解析 pointer-coarse，量不到 px）。其餘
// 測試補的是這個檔案原本完全沒有的分支覆蓋：details 有無、onCancel/onConfirm
// 有無、Esc 與遮罩兩條關閉路徑。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NotificationCard, type NotificationType } from './NotificationCard';

afterEach(cleanup);

function renderCard(overrides: Partial<Parameters<typeof NotificationCard>[0]> = {}) {
  const onClose = vi.fn();
  render(
    <NotificationCard
      title="確定要刪除嗎"
      message="刪除後無法復原"
      type="warning"
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onClose };
}

const closeButton = () => screen.getByRole('button', { name: '關閉' });

describe('NotificationCard', () => {
  it('關閉鈕在觸控裝置上有 44px 熱區（準則 §1）', () => {
    renderCard();
    expect(closeButton().className).toContain('pointer-coarse:size-11');
  });

  it('熱區放大不改變 header 版面——負邊距把佔位吸回原本的 20px', () => {
    renderCard();
    expect(closeButton().className).toContain('pointer-coarse:-m-3');
  });

  it('頁尾確認鈕在觸控裝置上達 44px，它才是主要觸控目標', () => {
    renderCard();
    expect(screen.getByRole('button', { name: '確認' }).className).toContain(
      'pointer-coarse:min-h-[44px]',
    );
  });

  it('頁尾取消鈕在觸控裝置上同樣達 44px', () => {
    renderCard({ onCancel: vi.fn() });
    expect(screen.getByRole('button', { name: '取消' }).className).toContain(
      'pointer-coarse:min-h-[44px]',
    );
  });

  it('三顆按鈕都是 type=button，不會誤觸送出外層表單', () => {
    renderCard({ onCancel: vi.fn() });
    for (const name of ['關閉', '確認', '取消']) {
      expect(screen.getByRole('button', { name }).getAttribute('type')).toBe('button');
    }
  });

  it('沒給 onCancel 時不渲染取消鈕，只留單一出口', () => {
    renderCard();
    expect(screen.queryByRole('button', { name: '取消' })).toBeNull();
  });

  it('點確認會先跑 onConfirm 再關閉彈窗', () => {
    const onConfirm = vi.fn();
    const { onClose } = renderCard({ onConfirm });
    fireEvent.click(screen.getByRole('button', { name: '確認' }));
    expect(onConfirm).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('沒給 onConfirm 時點確認仍會關閉，不會卡住使用者', () => {
    const { onClose } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: '確認' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('點取消會先跑 onCancel 再關閉彈窗', () => {
    const onCancel = vi.fn();
    const { onClose } = renderCard({ onCancel });
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('自訂 confirmText 與 cancelText 會取代預設字樣', () => {
    renderCard({ onCancel: vi.fn(), confirmText: '刪除', cancelText: '再想想' });
    expect(screen.getByRole('button', { name: '刪除' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '再想想' })).toBeTruthy();
  });

  it('details 逐條列出；沒給 details 時不渲染那一區', () => {
    renderCard({ details: ['會一併刪除 3 張照片', '推薦紀錄保留'] });
    expect(screen.getByText('會一併刪除 3 張照片')).toBeTruthy();
    expect(screen.getByText('推薦紀錄保留')).toBeTruthy();
    cleanup();

    renderCard({ details: [] });
    expect(screen.queryByText('會一併刪除 3 張照片')).toBeNull();
  });

  it('按 Esc 關閉彈窗，鍵盤使用者不會被困住', () => {
    const { onClose } = renderCard();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('點遮罩關閉，點卡片本身不關閉', () => {
    const { onClose } = renderCard();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    const overlay = dialog.parentElement;
    if (!overlay) throw new Error('找不到遮罩');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it('開啟時焦點移進 dialog，Tab 不會留在背後頁面遊走', () => {
    renderCard();
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('四種 type 各自帶出自己的配色', () => {
    const expected: Record<NotificationType, string> = {
      success: 'bg-green-500',
      error: 'bg-red-500',
      warning: 'bg-orange-500',
      info: 'bg-blue-500',
    };
    for (const [type, buttonBg] of Object.entries(expected)) {
      renderCard({ type: type as NotificationType });
      expect(screen.getByRole('button', { name: '確認' }).className).toContain(buttonBg);
      cleanup();
    }
  });
});
