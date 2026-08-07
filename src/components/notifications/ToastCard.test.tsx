// @vitest-environment jsdom
//
// Toast 的關閉鈕原本是裸的 16px icon、沒有任何 padding——熱區只有圖示本身，
// 在觸控裝置上遠低於準則 §1 的 44px。這是 PR #231 掃出、當時標為待償還的
// 同類病灶（另一處是 NotificationCard）。
//
// jsdom 沒有排版引擎也不解析 pointer-coarse media query，量不到實際 px，
// 所以熱區釘的是「產生該尺寸的 class 意圖」。這是唯一能機械把關純 CSS
// 決策的方式；壞掉時測試名會直接說出是哪一條版面決策被改掉。
//
// 其餘測試不是為了熱區，是因為這個檔案在本 PR 之前**沒有任何測試**：
// 一被載入，v8 就會用執行期的分支圖取代未測檔的靜態估算，只測熱區等於
// 讓覆蓋率棘輪替 toastStyles 與計時器那段沒人測的邏輯背書（PR #231 的教訓）。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastCard, type ToastType } from './ToastCard';

afterEach(cleanup);

function renderToast(overrides: Partial<Parameters<typeof ToastCard>[0]> = {}) {
  const onClose = vi.fn();
  render(
    <ToastCard
      id="toast-1"
      message="已儲存"
      type="success"
      duration={10_000}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onClose, closeButton: screen.getByRole('button', { name: '關閉' }) };
}

describe('ToastCard', () => {
  it('關閉鈕在觸控裝置上有 44px 熱區（準則 §1）', () => {
    const { closeButton } = renderToast();
    expect(closeButton.className).toContain('pointer-coarse:size-11');
  });

  it('熱區放大不撐高 toast——負邊距把佔位吸回原本的 24px', () => {
    const { closeButton } = renderToast();
    expect(closeButton.className).toContain('pointer-coarse:-m-2.5');
  });

  it('關閉鈕是 type=button，不會在表單裡誤觸送出', () => {
    const { closeButton } = renderToast();
    expect(closeButton.getAttribute('type')).toBe('button');
  });

  it('點關閉鈕會在退場動畫後回呼 onClose，並帶上自己的 id', async () => {
    const { onClose, closeButton } = renderToast({ id: 'toast-42' });
    fireEvent.click(closeButton);
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('toast-42'));
  });

  it('duration 到期後自動關閉，不需要使用者動作', async () => {
    const { onClose } = renderToast({ duration: 10 });
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('toast-1'));
  });

  it('四種 type 各自帶出自己的配色與圖示', () => {
    const expected: Record<ToastType, string> = {
      success: 'bg-green-50',
      error: 'bg-red-50',
      warning: 'bg-orange-50',
      info: 'bg-blue-50',
    };
    for (const [type, bg] of Object.entries(expected)) {
      renderToast({ type: type as ToastType });
      const toast = screen.getByTestId('toast');
      expect(toast.getAttribute('data-toast-type')).toBe(type);
      expect(toast.className).toContain(bg);
      // 圖示與關閉鈕兩個 svg，第一個才是 type 圖示
      expect(toast.querySelectorAll('svg').length).toBe(2);
      cleanup();
    }
  });

  it('長訊息會斷行而不是把卡片撐出容器', () => {
    const long = 'a'.repeat(200);
    renderToast({ message: long });
    const text = screen.getByText(long);
    expect(text.className).toContain('break-words');
    expect(text.className).toContain('min-w-0');
  });

  it('卸載後計時器不再回呼，不會對已消失的 toast 呼叫 onClose', async () => {
    const { onClose } = renderToast({ duration: 10 });
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(onClose).not.toHaveBeenCalled();
  });
});
