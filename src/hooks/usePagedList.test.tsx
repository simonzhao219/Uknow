// @vitest-environment jsdom
//
// 伺服器分頁的共用狀態機。
//
// 它存在的理由是 ui-ux-guidelines §5「不得靜默截斷」原本在三個地方各自手刻，
// 所以這支測試守的正是「靜默」的幾種形態：
//   * 載入更多失敗時**不清空已顯示的資料**——按一次失敗就整片消失，比沒有
//     加載更多還糟。
//   * 後端少回欄位時退回保守值，而不是讓 `total` 變成 `undefined` 再往下讀。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { usePagedList } from './usePagedList';

afterEach(cleanup);

function Probe({ load }: { load: (p: { limit: number; offset: number }) => Promise<any> }) {
  const list = usePagedList<{ id: string }>({ load, pageSize: 2, deps: [] });
  return (
    <div>
      <span data-testid="items">{list.items.map((i) => i.id).join(',')}</span>
      <span data-testid="total">{list.total}</span>
      <span data-testid="error">{list.error ?? ''}</span>
      <span data-testid="more">{String(list.hasMore)}</span>
      <button type="button" onClick={list.loadMore}>
        more
      </button>
    </div>
  );
}

describe('usePagedList', () => {
  it('載入更多失敗時保留已顯示的資料', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ id: 'a' }], total: 3 })
      .mockRejectedValueOnce(new Error('連線中斷'));
    render(<Probe load={load} />);

    await waitFor(() => expect(screen.getByTestId('items').textContent).toBe('a'));
    screen.getByRole('button', { name: 'more' }).click();

    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('連線中斷'));
    // 已顯示的那筆必須還在——這就是「失敗不清空」。
    expect(screen.getByTestId('items').textContent).toBe('a');
  });

  it('後端少回 items 或 total 時退回保守值', async () => {
    render(<Probe load={async () => ({})} />);
    await waitFor(() => expect(screen.getByTestId('total').textContent).toBe('0'));
    expect(screen.getByTestId('items').textContent).toBe('');
    expect(screen.getByTestId('more').textContent).toBe('false');
  });

  it('載入更多把下一頁接在後面而不是取代', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ id: 'a' }], total: 2 })
      .mockResolvedValueOnce({ items: [{ id: 'b' }], total: 2 });
    render(<Probe load={load} />);

    await waitFor(() => expect(screen.getByTestId('more').textContent).toBe('true'));
    screen.getByRole('button', { name: 'more' }).click();

    await waitFor(() => expect(screen.getByTestId('items').textContent).toBe('a,b'));
    expect(screen.getByTestId('more').textContent).toBe('false');
  });

  it('第一頁載入失敗時把原因說出來', async () => {
    render(
      <Probe
        load={async () => {
          throw new Error('伺服器忙碌中');
        }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('伺服器忙碌中'));
  });

  it('擲出非 Error 時仍給得出可讀訊息', async () => {
    render(
      <Probe
        load={async () => {
          throw 'boom';
        }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('error').textContent).toBe('載入失敗'));
  });
});
