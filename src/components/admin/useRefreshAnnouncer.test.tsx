// @vitest-environment jsdom
//
// 手動重新整理（工具列、錯誤區與陳舊提示的「重試」）的狀態文字。
//
// 文字依**這一次按下所接的那條結算**寫，不從 isUpdating 的邊緣推斷：慢更新 15 秒時
// isUpdating 會先掉下去放行重新整理，邊緣推斷會在資料真正落地之前誤報「已更新」。
// 更新途中再按不重送請求，文字在「正在更新」與「仍在更新」之間交替——同一串字報讀器
// 不會再念一次，按了沒有回饋。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { RefreshOutcome } from '../../hooks/usePagedList';
import { type RefreshableList, useRefreshAnnouncer } from './useRefreshAnnouncer';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** 假 list：每次 reload 回一個可手動結算的 promise；settled 接在最近那一次上。 */
function fakeList() {
  const runs: ReturnType<typeof deferred<RefreshOutcome>>[] = [];
  let ongoing: ReturnType<typeof deferred<RefreshOutcome>> | null = null;
  const reload = vi.fn(() => {
    ongoing = deferred<RefreshOutcome>();
    runs.push(ongoing);
    return ongoing.promise;
  });
  const settled = vi.fn(() => {
    if (!ongoing) {
      ongoing = deferred<RefreshOutcome>();
      runs.push(ongoing);
    }
    return ongoing.promise;
  });
  return { runs, reload, settled };
}

function Harness({ list }: { list: RefreshableList }) {
  const { statusText, refresh } = useRefreshAnnouncer(list);
  return (
    <div>
      <p data-testid="status">{statusText}</p>
      <button type="button" onClick={refresh}>
        重新整理
      </button>
    </div>
  );
}

const status = () => screen.getByTestId('status').textContent;
const press = () => fireEvent.click(screen.getByRole('button', { name: '重新整理' }));

describe('useRefreshAnnouncer', () => {
  it('沒有更新在途時按下才重讀，先寫「正在更新」，成功結算後寫「已更新 HH:mm」', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 7, 9, 5));
    const { runs, reload, settled } = fakeList();
    render(<Harness list={{ isUpdating: false, reload, settled }} />);
    expect(status()).toBe('');

    press();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(status()).toBe('正在更新');

    await act(async () => runs[0].resolve('done'));
    expect(status()).toBe('已更新 09:05');
  });

  it('結算失敗時寫「更新失敗」', async () => {
    const { runs, reload, settled } = fakeList();
    render(<Harness list={{ isUpdating: false, reload, settled }} />);
    press();
    expect(reload).toHaveBeenCalledTimes(1);
    await act(async () => runs[0].resolve('failed'));
    expect(status()).toBe('更新失敗');
  });

  it('更新途中再按不重送請求，文字在「仍在更新」與「正在更新」之間交替', () => {
    const { reload, settled } = fakeList();
    const { rerender } = render(<Harness list={{ isUpdating: false, reload, settled }} />);
    press();
    rerender(<Harness list={{ isUpdating: true, reload, settled }} />);

    press();
    expect(status()).toBe('仍在更新');
    press();
    expect(status()).toBe('正在更新');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('isUpdating 先降下來（慢更新放行）時不寫「已更新」，等結算才寫', async () => {
    const { runs, reload, settled } = fakeList();
    const { rerender } = render(<Harness list={{ isUpdating: false, reload, settled }} />);
    press();
    rerender(<Harness list={{ isUpdating: true, reload, settled }} />);
    rerender(<Harness list={{ isUpdating: false, reload, settled }} />);
    expect(status()).toBe('正在更新');

    await act(async () => runs[0].resolve('done'));
    expect(status()).toMatch(/^已更新 \d\d:\d\d$/);
  });

  it('自動更新途中按下，接在 settled() 上而不重送請求', async () => {
    const { runs, reload, settled } = fakeList();
    render(<Harness list={{ isUpdating: true, reload, settled }} />);

    press();
    expect(reload).not.toHaveBeenCalled();
    expect(settled).toHaveBeenCalledTimes(1);
    expect(status()).toBe('正在更新');

    await act(async () => runs[0].resolve('failed'));
    expect(status()).toBe('更新失敗');
  });

  it('只有最後一次按下所接的結算會寫入', async () => {
    const { runs, reload, settled } = fakeList();
    const { rerender } = render(<Harness list={{ isUpdating: false, reload, settled }} />);
    press();
    // 慢更新放行後再按：重送一次，之後先到的舊結算不得蓋掉新的。
    rerender(<Harness list={{ isUpdating: false, reload, settled }} />);
    press();
    expect(reload).toHaveBeenCalledTimes(2);

    await act(async () => runs[1].resolve('done'));
    const settledText = status();
    expect(settledText).toMatch(/^已更新 /);
    await act(async () => runs[0].resolve('failed'));
    expect(status()).toBe(settledText);
  });

  it('沒有手動按下時，自動更新的結算不寫任何文字', async () => {
    const { reload, settled } = fakeList();
    const { rerender } = render(<Harness list={{ isUpdating: true, reload, settled }} />);
    rerender(<Harness list={{ isUpdating: false, reload, settled }} />);
    expect(status()).toBe('');
    expect(settled).not.toHaveBeenCalled();
  });
});
