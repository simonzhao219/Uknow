// @vitest-environment jsdom
//
// 後台的分頁區（S5 階段 7）：AdminDashboard 以 `user.id` 為 key 掛它，它持有記憶體快取
// store 與「忙碌」狀態（寫入或匯出在途）。四個分頁替身掉、只記錄收到的 props——各頁自己的
// 行為各有測試，這裡只驗殼層決定的事：
// - store 的生命週期：掛載建立並開啟、卸載清空、重掛換新的；四處拿同一個，告警的 403 清的也是它
// - 鎖分頁：寫入或匯出在途時其他分頁停用（邏輯立即），停用外觀與說明行等 0.3 秒；同一筆寫入
//   超過 15 秒時說明行接等候提示；計數放 ref（release 重複呼叫、舊閉包的 release 都正確）
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AdminBusy, AdminExportSession } from './adminBusy';
import { type AdminCache, createAdminCache } from './adminCache';

type Props = Record<string, unknown>;

const seen = vi.hoisted(() => ({
  withdrawals: [] as Props[],
  members: [] as Props[],
  notifications: [] as Props[],
  alerts: [] as Props[],
}));

vi.mock('./WithdrawalManagement', () => ({
  WithdrawalManagement: (props: Props) => {
    seen.withdrawals.push(props);
    return <div data-testid="withdrawals-page" />;
  },
}));
vi.mock('./MemberManagement', () => ({
  MemberManagement: (props: Props) => {
    seen.members.push(props);
    return <div data-testid="members-page" />;
  },
}));
vi.mock('./SystemNotifications', () => ({
  SystemNotifications: (props: Props) => {
    seen.notifications.push(props);
    return <div data-testid="notifications-page" />;
  },
}));
vi.mock('./SystemAlerts', () => ({
  SystemAlerts: (props: Props) => {
    seen.alerts.push(props);
    return <div data-testid="alerts-page" />;
  },
}));

import { AdminConsole } from './AdminConsole';

const WITHDRAWALS = {
  loadWithdrawals: vi.fn(),
  updateStatus: vi.fn(),
  batchMarkPaid: vi.fn(),
};
const MEMBERS = {
  loadMembers: vi.fn(),
  loadMemberDetail: vi.fn(),
  setMemberAdmin: vi.fn(),
  suspendMember: vi.fn(),
  loadIdReviews: vi.fn(),
  submitIdReview: vi.fn(),
};

type ObservedCache = AdminCache & {
  open: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  invalidate: ReturnType<typeof vi.fn>;
};

function observedCache(): ObservedCache {
  const cache = createAdminCache();
  return Object.assign(cache, {
    open: vi.fn(cache.open),
    dispose: vi.fn(cache.dispose),
    invalidate: vi.fn(cache.invalidate),
  });
}

function renderConsole() {
  const stores: ObservedCache[] = [];
  const createCache = vi.fn(() => {
    const store = observedCache();
    stores.push(store);
    return store;
  });
  const ui = (key = 'admin-1') => (
    <AdminConsole key={key} withdrawals={WITHDRAWALS} members={MEMBERS} createCache={createCache} />
  );
  const utils = render(ui());
  return { ...utils, stores, createCache, remount: (key: string) => utils.rerender(ui(key)) };
}

const last = <T,>(list: T[]): T => list[list.length - 1];
const tab = (name: string) => screen.getByRole('tab', { name });
const OTHER_TABS = ['會員管理', '系統公告', '系統告警'];
const busyOf = () => last(seen.withdrawals).busy as AdminBusy;
const WRITING = '處理中，完成前無法切換分頁';
const SLOW_WRITING = `${WRITING}・仍在等待伺服器回應，離開此頁不會取消已送出的操作`;

beforeEach(() => {
  for (const list of Object.values(seen)) list.length = 0;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AdminConsole 快取 store 的生命週期', () => {
  it('掛載時建立一個 store 並開啟，重繪不換新的，卸載時清空', () => {
    const { stores, createCache, remount, unmount } = renderConsole();
    remount('admin-1');
    expect(createCache).toHaveBeenCalledTimes(1);
    expect(stores[0].open).toHaveBeenCalled();
    expect(stores[0].dispose).not.toHaveBeenCalled();
    unmount();
    expect(stores[0].dispose).toHaveBeenCalledTimes(1);
  });

  it('key 一變（換成另一位管理員）就換新的 store，舊的清空', () => {
    const { stores, remount } = renderConsole();
    remount('admin-2');
    expect(stores).toHaveLength(2);
    expect(stores[0].dispose).toHaveBeenCalledTimes(1);
    expect(stores[1].dispose).not.toHaveBeenCalled();
    expect(last(seen.withdrawals).cache).toBe(stores[1]);
  });

  it('提領、會員、公告拿到同一個 store 與各自的取數函式', () => {
    const { stores } = renderConsole();
    expect(last(seen.withdrawals)).toMatchObject({ ...WITHDRAWALS, cache: stores[0] });
    fireEvent.mouseDown(tab('會員管理'));
    expect(last(seen.members)).toMatchObject({ ...MEMBERS, cache: stores[0] });
    fireEvent.mouseDown(tab('系統公告'));
    expect(last(seen.notifications).cache).toBe(stores[0]);
  });

  it('告警讀取回 403 時清空的是同一個 store', () => {
    const { stores } = renderConsole();
    fireEvent.mouseDown(tab('系統告警'));
    act(() => (last(seen.alerts).onAccessLost as () => void)());
    expect(stores[0].invalidate).toHaveBeenCalledWith('accessLost');
  });

  it('四個分頁拿到同一個 busy，鎖定與否不變時維持同一個物件', () => {
    const { remount } = renderConsole();
    const busy = busyOf();
    remount('admin-1');
    expect(busyOf()).toBe(busy);
    for (const [name, list] of [
      ['會員管理', seen.members],
      ['系統公告', seen.notifications],
      ['系統告警', seen.alerts],
    ] as const) {
      fireEvent.mouseDown(tab(name));
      expect(last(list).busy).toBe(busy);
    }
  });
});

describe('AdminConsole 寫入與匯出在途時鎖分頁', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('寫入在途時其他分頁立即停用，結算後解開', () => {
    renderConsole();
    let release!: () => void;
    act(() => {
      release = busyOf().startWrite();
    });
    for (const name of OTHER_TABS) expect(tab(name).hasAttribute('disabled')).toBe(true);
    expect(tab('獎金提領管理').hasAttribute('disabled')).toBe(false);
    expect(busyOf().locked).toBe(true);

    act(() => release());
    for (const name of OTHER_TABS) expect(tab(name).hasAttribute('disabled')).toBe(false);
    expect(busyOf().locked).toBe(false);
  });

  it('停用的分頁按不動', () => {
    renderConsole();
    act(() => {
      busyOf().startWrite();
    });
    fireEvent.mouseDown(tab('會員管理'));
    expect(tab('會員管理').getAttribute('data-state')).toBe('inactive');
    expect(tab('獎金提領管理').getAttribute('data-state')).toBe('active');
  });

  it('停用外觀與說明行在 0.3 秒後出現，停用的分頁指向說明行', () => {
    renderConsole();
    act(() => {
      busyOf().startWrite();
    });
    expect(tab('會員管理').getAttribute('data-locked')).toBeNull();
    expect(screen.queryByText(WRITING)).toBeNull();

    act(() => vi.advanceTimersByTime(300));
    const note = screen.getByText(WRITING);
    expect(note.id).toBe(busyOf().noteId);
    for (const name of OTHER_TABS) {
      expect(tab(name).getAttribute('data-locked')).toBe('true');
      expect(tab(name).getAttribute('aria-describedby')).toBe(note.id);
    }
    expect(tab('獎金提領管理').getAttribute('data-locked')).toBeNull();
    expect(tab('獎金提領管理').getAttribute('aria-describedby')).toBeNull();
  });

  it('說明行在分頁列正下方', () => {
    renderConsole();
    act(() => {
      busyOf().startWrite();
    });
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByRole('tablist').nextElementSibling).toBe(screen.getByText(WRITING));
  });

  it('寫入 0.3 秒內結束時不出說明行，也不帶停用外觀', () => {
    renderConsole();
    let release!: () => void;
    act(() => {
      release = busyOf().startWrite();
    });
    act(() => vi.advanceTimersByTime(299));
    act(() => release());
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByText(/完成前無法切換分頁/)).toBeNull();
    expect(tab('會員管理').getAttribute('data-locked')).toBeNull();
  });

  it('同一筆寫入超過 15 秒時說明行接等候提示，結算後解除', () => {
    renderConsole();
    let release!: () => void;
    act(() => {
      release = busyOf().startWrite();
    });
    act(() => vi.advanceTimersByTime(14_999));
    expect(screen.getByText(WRITING)).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText(SLOW_WRITING)).toBeTruthy();

    act(() => release());
    expect(screen.queryByText(/仍在等待伺服器回應/)).toBeNull();
  });

  it('兩筆寫入接力超過 15 秒、但沒有一筆超過時不接等候提示', () => {
    renderConsole();
    let first!: () => void;
    let second!: () => void;
    act(() => {
      first = busyOf().startWrite();
    });
    act(() => vi.advanceTimersByTime(10_000));
    act(() => {
      second = busyOf().startWrite();
    });
    act(() => vi.advanceTimersByTime(2_000));
    act(() => first());
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText(WRITING)).toBeTruthy();
    expect(screen.queryByText(/仍在等待伺服器回應/)).toBeNull();

    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.getByText(SLOW_WRITING)).toBeTruthy();
    act(() => second());
  });

  it('匯出中其他分頁停用，說明行寫已收集的筆數，結束後解開', () => {
    renderConsole();
    let session!: AdminExportSession;
    act(() => {
      session = busyOf().startExport();
    });
    for (const name of OTHER_TABS) expect(tab(name).hasAttribute('disabled')).toBe(true);
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByText('匯出中，完成前無法切換分頁，離開此頁會中止')).toBeTruthy();

    act(() => session.progress(50, 120));
    expect(
      screen.getByText('匯出中（已收集 50 / 120 筆），完成前無法切換分頁，離開此頁會中止'),
    ).toBeTruthy();

    act(() => session.end());
    for (const name of OTHER_TABS) expect(tab(name).hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText(/匯出中/)).toBeNull();
  });

  it('release 呼叫兩次不會多減：另一筆仍在途時維持鎖定', () => {
    renderConsole();
    let first!: () => void;
    let second!: () => void;
    act(() => {
      first = busyOf().startWrite();
      second = busyOf().startWrite();
    });
    act(() => {
      first();
      first();
    });
    expect(tab('會員管理').hasAttribute('disabled')).toBe(true);
    act(() => second());
    expect(tab('會員管理').hasAttribute('disabled')).toBe(false);
  });

  it('busy 換新之後，舊物件發出的 release 仍減同一個計數', () => {
    renderConsole();
    const before = busyOf();
    let first!: () => void;
    act(() => {
      first = before.startWrite();
    });
    const after = busyOf();
    expect(after).not.toBe(before);
    expect(after.locked).toBe(true);

    let second!: () => void;
    act(() => {
      second = after.startWrite();
    });
    act(() => first());
    expect(busyOf().locked).toBe(true);
    act(() => second());
    expect(busyOf().locked).toBe(false);
  });

  it('卸載後才結算的寫入與匯出不拋錯', () => {
    const { unmount } = renderConsole();
    let release!: () => void;
    let session!: AdminExportSession;
    act(() => {
      release = busyOf().startWrite();
      session = busyOf().startExport();
    });
    unmount();
    expect(() => {
      release();
      session.progress(1, 2);
      session.end();
      vi.advanceTimersByTime(20_000);
    }).not.toThrow();
  });
});
