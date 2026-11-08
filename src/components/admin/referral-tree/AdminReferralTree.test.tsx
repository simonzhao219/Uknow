// @vitest-environment jsdom
//
// 後台推薦樹（第 6 波 S3a 階段 7）：搜尋框＋頂層樹＋逐層展開（W6-7）。
//   1. 頂層與子層各自分頁，顯示「已顯示 X / Y 位」，可以載入更多（不得靜默截斷）。
//   2. 子層讀取失敗只影響那一層（不連坐）。
//   3. 搜尋結果就地取代樹；清除後回到樹。過期回應丟棄；失敗與「找不到」分開。
//   4. 點命中結果：依 ancestorIds 由頂層逐層展開（每層帶 ensureId），完成後焦點落在
//      目標的名稱鈕並播報。成環改走「無法接上推薦樹的會員」群組（W6-21）；超過 50 層只開詳情。
//   5. 群組人數為 0 時不顯示。
import type { AdminReferralNode } from '@admin-referral-contract';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminReferralTree } from './AdminReferralTree';
import type { NodesData, NodesParams, ReferralTreeLoaders, SearchData } from './loaders';

afterEach(cleanup);

function node(id: string, over: Partial<AdminReferralNode> = {}): AdminReferralNode {
  return {
    id,
    name: `會員${id}`,
    referralCode: `80${id}`,
    layer: 1,
    directCount: 0,
    status: 'active',
    daysToExpiry: 100,
    endDate: '2027-03-01T15:59:59Z',
    referralProgramJoined: true,
    referralProgramJoinedAt: null,
    anomalyKinds: [],
    anomalyScanTruncated: false,
    ...over,
  };
}

const nodesData = (
  nodes: AdminReferralNode[],
  total: number,
  extra: Partial<NodesData> = {},
): NodesData => ({ total, nodes, pinned: null, ...extra });

function makeLoaders(over: Partial<ReferralTreeLoaders> = {}): ReferralTreeLoaders {
  return {
    loadNodes: vi.fn(async () => nodesData([], 0, { unplaceableCount: 0 })),
    search: vi.fn(async (): Promise<SearchData> => ({ total: 0, matches: [] })),
    loadMember: vi.fn(),
    loadPayments: vi.fn(),
    loadLedger: vi.fn(),
    ...over,
  };
}

function renderTree(loaders: ReferralTreeLoaders, onOpenNode = vi.fn()) {
  render(<AdminReferralTree loaders={loaders} onOpenNode={onOpenNode} searchDebounceMs={0} />);
  return { onOpenNode };
}

describe('頂層與逐層展開', () => {
  it('頂層顯示已顯示 X / Y 位，載入更多接著往下取', async () => {
    const loadNodes = vi.fn(async (p: NodesParams) =>
      p.offset === 0
        ? nodesData([node('1'), node('2')], 3, { unplaceableCount: 0 })
        : nodesData([node('3')], 3, { unplaceableCount: 0 }),
    );
    renderTree(makeLoaders({ loadNodes }));
    expect(await screen.findByText('已顯示 2 / 3 位')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /載入更多/ }));
    expect(await screen.findByText('已顯示 3 / 3 位')).toBeTruthy();
    expect(loadNodes).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 2 }));
  });

  it('節點列顯示第 N 層、直接推薦人數與異常徽章，點名稱開詳情', async () => {
    const loaders = makeLoaders({
      loadNodes: vi.fn(async () =>
        nodesData([node('1', { directCount: 12, anomalyKinds: ['missing_reward'] })], 1, {
          unplaceableCount: 0,
        }),
      ),
    });
    const { onOpenNode } = renderTree(loaders);
    const name = await screen.findByRole('button', { name: '查看會員1的推薦與查帳資訊' });
    const row = name.closest('li') as HTMLElement;
    expect(within(row).getByText(/第 1 層/)).toBeTruthy();
    expect(within(row).getByText(/直接推薦 12 位/)).toBeTruthy();
    expect(within(row).getByText('獎金缺漏')).toBeTruthy();
    fireEvent.click(name);
    expect(onOpenNode).toHaveBeenCalledWith('1');
  });

  it('展開子層；子層讀取失敗只在該層顯示錯誤並可重試', async () => {
    let fail = true;
    const loadNodes = vi.fn(async (p: NodesParams) => {
      if (!p.parentId) {
        return nodesData([node('1', { directCount: 1 }), node('2', { directCount: 1 })], 2, {
          unplaceableCount: 0,
        });
      }
      if (fail) throw new Error('boom');
      return nodesData([node('c', { layer: 2 })], 1);
    });
    renderTree(makeLoaders({ loadNodes }));
    fireEvent.click(await screen.findByRole('button', { name: '展開會員1' }));
    expect(await screen.findByText('讀取失敗，請稍後再試')).toBeTruthy();
    expect(screen.getByRole('button', { name: '查看會員2的推薦與查帳資訊' })).toBeTruthy();

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: '重試' }));
    expect(await screen.findByRole('button', { name: '查看會員c的推薦與查帳資訊' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '收合會員1' }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('頂層讀取失敗 → 整頁黃框與重新載入', async () => {
    let fail = true;
    const loadNodes = vi.fn(async () => {
      if (fail) throw new Error('boom');
      return nodesData([node('1')], 1, { unplaceableCount: 0 });
    });
    renderTree(makeLoaders({ loadNodes }));
    expect(await screen.findByText('推薦樹讀取失敗')).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: '重新載入' }));
    expect(await screen.findByText('已顯示 1 / 1 位')).toBeTruthy();
  });
});

describe('無法接上推薦樹的會員', () => {
  it('人數為 0 時不顯示；大於 0 時預設收合，展開後載入群組', async () => {
    const loadNodes = vi.fn(async (p: NodesParams) =>
      p.group === 'unplaceable'
        ? nodesData([node('p', { layer: null, anomalyKinds: ['cycle'] })], 1)
        : nodesData([node('1')], 1, { unplaceableCount: 1 }),
    );
    renderTree(makeLoaders({ loadNodes }));
    const toggle = await screen.findByRole('button', { name: /無法接上推薦樹的會員（1）/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(await screen.findByText('推薦關係成環')).toBeTruthy();
    expect(loadNodes).toHaveBeenCalledWith(expect.objectContaining({ group: 'unplaceable' }));
  });

  it('人數為 0 → 群組不渲染', async () => {
    renderTree(
      makeLoaders({
        loadNodes: vi.fn(async () => nodesData([node('1')], 1, { unplaceableCount: 0 })),
      }),
    );
    await screen.findByText('已顯示 1 / 1 位');
    expect(screen.queryByText(/無法接上推薦樹的會員/)).toBeNull();
  });
});

describe('搜尋', () => {
  it('結果就地取代樹，清除後回到樹', async () => {
    const search = vi.fn(async () => ({
      total: 1,
      matches: [{ ...node('9'), ancestorIds: [], unplaceableReason: null }],
    }));
    renderTree(
      makeLoaders({
        loadNodes: vi.fn(async () => nodesData([node('1')], 1, { unplaceableCount: 0 })),
        search,
      }),
    );
    await screen.findByText('已顯示 1 / 1 位');
    fireEvent.change(screen.getByRole('searchbox', { name: '搜尋姓名或推薦碼' }), {
      target: { value: '會員9' },
    });
    expect(await screen.findByText('已顯示 1 / 1 筆')).toBeTruthy();
    expect(screen.queryByText('已顯示 1 / 1 位')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '清除搜尋' }));
    expect(await screen.findByText('已顯示 1 / 1 位')).toBeTruthy();
  });

  it('沒有命中寫找不到；讀取失敗寫搜尋失敗，兩者分開', async () => {
    let fail = false;
    const search = vi.fn(async () => {
      if (fail) throw new Error('boom');
      return { total: 0, matches: [] };
    });
    renderTree(makeLoaders({ search }));
    const box = await screen.findByRole('searchbox', { name: '搜尋姓名或推薦碼' });
    fireEvent.change(box, { target: { value: '無此人' } });
    expect(await screen.findByText('找不到符合的會員')).toBeTruthy();
    fail = true;
    fireEvent.change(box, { target: { value: '無此人2' } });
    expect(await screen.findByText('搜尋失敗，請稍後再試')).toBeTruthy();
    expect(screen.queryByText('找不到符合的會員')).toBeNull();
  });

  it('舊查詢的回應晚到 → 丟棄，不蓋掉新查詢的結果', async () => {
    let releaseOld: (v: SearchData) => void = () => {};
    const search = vi.fn((p: { q: string }) =>
      p.q === '舊'
        ? new Promise<SearchData>((r) => {
            releaseOld = r;
          })
        : Promise.resolve({
            total: 1,
            matches: [{ ...node('new'), ancestorIds: [], unplaceableReason: null }],
          }),
    );
    renderTree(makeLoaders({ search }));
    const box = await screen.findByRole('searchbox', { name: '搜尋姓名或推薦碼' });
    fireEvent.change(box, { target: { value: '舊' } });
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    fireEvent.change(box, { target: { value: '新' } });
    expect(await screen.findByText('會員new')).toBeTruthy();
    await act(async () => {
      releaseOld({
        total: 1,
        matches: [{ ...node('old'), ancestorIds: [], unplaceableReason: null }],
      });
    });
    expect(screen.queryByText('會員old')).toBeNull();
  });
});

describe('自動展開', () => {
  it('點命中結果 → 由頂層逐層帶 ensureId 展開，焦點落在目標並播報', async () => {
    const loadNodes = vi.fn(async (p: NodesParams) => {
      if (!p.parentId)
        return nodesData([node('r', { directCount: 1 })], 1, { unplaceableCount: 0 });
      if (p.parentId === 'r') return nodesData([node('a', { layer: 2, directCount: 1 })], 1);
      return nodesData([], 1, { pinned: node('t', { layer: 3 }) });
    });
    const search = vi.fn(async () => ({
      total: 1,
      matches: [{ ...node('t', { layer: 3 }), ancestorIds: ['r', 'a'], unplaceableReason: null }],
    }));
    renderTree(makeLoaders({ loadNodes, search }));
    await screen.findByText('已顯示 1 / 1 位');
    fireEvent.change(screen.getByRole('searchbox', { name: '搜尋姓名或推薦碼' }), {
      target: { value: '會員t' },
    });
    fireEvent.click(await screen.findByRole('button', { name: '在樹上展開到會員t' }));

    const target = await screen.findByRole('button', { name: '查看會員t的推薦與查帳資訊' });
    await waitFor(() => expect(document.activeElement).toBe(target));
    expect(loadNodes).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 'r', ensureId: 'a' }),
    );
    expect(loadNodes).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 'a', ensureId: 't' }),
    );
    expect(screen.getByText('已展開到會員t')).toBeTruthy();
    expect(within(target.closest('li') as HTMLElement).getByText('搜尋目標')).toBeTruthy();
  });

  it('中途某層失敗 → 停在該層顯示重試展開，重試後接續', async () => {
    let fail = true;
    const loadNodes = vi.fn(async (p: NodesParams) => {
      if (!p.parentId)
        return nodesData([node('r', { directCount: 1 })], 1, { unplaceableCount: 0 });
      if (fail) throw new Error('boom');
      return nodesData([node('t', { layer: 2 })], 1);
    });
    const search = vi.fn(async () => ({
      total: 1,
      matches: [{ ...node('t', { layer: 2 }), ancestorIds: ['r'], unplaceableReason: null }],
    }));
    renderTree(makeLoaders({ loadNodes, search }));
    fireEvent.change(await screen.findByRole('searchbox', { name: '搜尋姓名或推薦碼' }), {
      target: { value: 't' },
    });
    fireEvent.click(await screen.findByRole('button', { name: '在樹上展開到會員t' }));
    const retry = await screen.findByRole('button', { name: '重試展開' });
    fail = false;
    fireEvent.click(retry);
    const target = await screen.findByRole('button', { name: '查看會員t的推薦與查帳資訊' });
    await waitFor(() => expect(document.activeElement).toBe(target));
  });

  it('成環的人 → 展開群組並定位；超過 50 層 → 只開詳情並說明原因', async () => {
    const loadNodes = vi.fn(async (p: NodesParams) =>
      p.group === 'unplaceable'
        ? nodesData([node('p', { layer: null })], 1)
        : nodesData([node('1')], 1, { unplaceableCount: 1 }),
    );
    const search = vi.fn(async (p: { q: string }) => ({
      total: 1,
      matches: [
        p.q === '環'
          ? {
              ...node('p', { layer: null }),
              ancestorIds: null,
              unplaceableReason: 'cycle' as const,
            }
          : {
              ...node('d', { layer: null }),
              ancestorIds: null,
              unplaceableReason: 'truncated' as const,
            },
      ],
    }));
    const { onOpenNode } = renderTree(makeLoaders({ loadNodes, search }));
    const box = await screen.findByRole('searchbox', { name: '搜尋姓名或推薦碼' });

    fireEvent.change(box, { target: { value: '環' } });
    fireEvent.click(await screen.findByRole('button', { name: '在樹上展開到會員p' }));
    await screen.findByRole('button', { name: '查看會員p的推薦與查帳資訊' });
    expect(loadNodes).toHaveBeenCalledWith(
      expect.objectContaining({ group: 'unplaceable', ensureId: 'p' }),
    );

    fireEvent.change(screen.getByRole('searchbox', { name: '搜尋姓名或推薦碼' }), {
      target: { value: '深' },
    });
    expect(await screen.findByText('往上超過 50 層，無法在樹上定位')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '查看會員d的推薦與查帳資訊' }));
    expect(onOpenNode).toHaveBeenCalledWith('d');
  });
});

describe('實作審查補強', () => {
  it('子層重試成功後焦點落在第一個子節點', async () => {
    let fail = true;
    const loadNodes = vi.fn(async (p: NodesParams) => {
      if (!p.parentId)
        return nodesData([node('1', { directCount: 1 })], 1, { unplaceableCount: 0 });
      if (fail) throw new Error('boom');
      return nodesData([node('c', { layer: 2 })], 1);
    });
    renderTree(makeLoaders({ loadNodes }));
    fireEvent.click(await screen.findByRole('button', { name: '展開會員1' }));
    const retry = await screen.findByRole('button', { name: '重試' });
    fail = false;
    fireEvent.click(retry);
    const child = await screen.findByRole('button', { name: '查看會員c的推薦與查帳資訊' });
    await waitFor(() => expect(document.activeElement).toBe(child));
  });

  it('自動展開進行中列表標 aria-busy，完成後解除', async () => {
    let release: (v: NodesData) => void = () => {};
    const loadNodes = vi.fn((p: NodesParams) =>
      p.parentId
        ? new Promise<NodesData>((r) => {
            release = r;
          })
        : Promise.resolve(nodesData([node('r', { directCount: 1 })], 1, { unplaceableCount: 0 })),
    );
    const search = vi.fn(async () => ({
      total: 1,
      matches: [{ ...node('t', { layer: 2 }), ancestorIds: ['r'], unplaceableReason: null }],
    }));
    renderTree(makeLoaders({ loadNodes, search }));
    fireEvent.change(await screen.findByRole('searchbox', { name: '搜尋姓名或推薦碼' }), {
      target: { value: 't' },
    });
    fireEvent.click(await screen.findByRole('button', { name: '在樹上展開到會員t' }));
    const tree = await screen.findByRole('region', { name: '推薦樹' });
    await waitFor(() => expect(tree.getAttribute('aria-busy')).toBe('true'));
    await act(async () => release(nodesData([node('t', { layer: 2 })], 1)));
    await waitFor(() => expect(tree.getAttribute('aria-busy')).not.toBe('true'));
  });

  it('搜尋命中成環的人時層級寫無法定位的原因，不寫層數', async () => {
    const search = vi.fn(async () => ({
      total: 1,
      matches: [
        { ...node('p', { layer: 4 }), ancestorIds: null, unplaceableReason: 'cycle' as const },
      ],
    }));
    renderTree(makeLoaders({ search }));
    fireEvent.change(await screen.findByRole('searchbox', { name: '搜尋姓名或推薦碼' }), {
      target: { value: 'p' },
    });
    expect(await screen.findByText('推薦關係成環，無法在樹上定位')).toBeTruthy();
    expect(screen.queryByText('第 4 層')).toBeNull();
  });
});

describe('獨立審查補強', () => {
  it('無法接上群組裡 X↔Y 成環：巢狀回到 X 時不再展開並寫說明', async () => {
    const loadNodes = vi.fn(async (p: NodesParams) => {
      if (p.group === 'unplaceable') {
        return nodesData([node('X', { layer: null, directCount: 1, anomalyKinds: ['cycle'] })], 1);
      }
      if (p.parentId === 'X') return nodesData([node('Y', { layer: null, directCount: 1 })], 1);
      if (p.parentId === 'Y') return nodesData([node('X', { layer: null, directCount: 1 })], 1);
      return nodesData([node('1')], 1, { unplaceableCount: 1 });
    });
    renderTree(makeLoaders({ loadNodes }));
    fireEvent.click(await screen.findByRole('button', { name: /無法接上推薦樹的會員（1）/ }));
    fireEvent.click(await screen.findByRole('button', { name: '展開會員X' }));
    fireEvent.click(await screen.findByRole('button', { name: '展開會員Y' }));
    expect(await screen.findByText('推薦關係成環，不再往下展開')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /展開會員X|收合會員X/ })).toHaveLength(1);
  });

  it('節點列只寫到期日，不寫剩幾天', async () => {
    renderTree(
      makeLoaders({
        loadNodes: vi.fn(async () =>
          nodesData([node('1', { status: 'expiring', daysToExpiry: 5 })], 1, {
            unplaceableCount: 0,
          }),
        ),
      }),
    );
    await screen.findByText('已顯示 1 / 1 位');
    expect(screen.queryByText(/剩 5 天/)).toBeNull();
    expect(screen.getByText(/到期$/)).toBeTruthy();
  });

  it('同一層有兩支請求在途時只採最新一次回應', async () => {
    const resolvers: ((v: NodesData) => void)[] = [];
    const loadNodes = vi.fn((p: NodesParams) =>
      p.parentId
        ? new Promise<NodesData>((r) => resolvers.push(r))
        : Promise.resolve(nodesData([node('r', { directCount: 2 })], 1, { unplaceableCount: 0 })),
    );
    const search = vi.fn(async () => ({
      total: 1,
      matches: [{ ...node('t', { layer: 2 }), ancestorIds: ['r'], unplaceableReason: null }],
    }));
    renderTree(makeLoaders({ loadNodes, search }));
    fireEvent.click(await screen.findByRole('button', { name: '展開會員r' }));
    fireEvent.change(screen.getByRole('searchbox', { name: '搜尋姓名或推薦碼' }), {
      target: { value: 't' },
    });
    fireEvent.click(await screen.findByRole('button', { name: '在樹上展開到會員t' }));
    await waitFor(() => expect(resolvers).toHaveLength(2));
    await act(async () => resolvers[1](nodesData([node('t', { layer: 2 })], 2)));
    await act(async () => resolvers[0](nodesData([node('old', { layer: 2 })], 2)));
    expect(screen.getByRole('button', { name: '查看會員t的推薦與查帳資訊' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '查看會員old的推薦與查帳資訊' })).toBeNull();
  });

  it('搜尋載入更多在途時停用，回來的結果以 id 去重', async () => {
    let release: (v: SearchData) => void = () => {};
    const search = vi.fn((params: { offset?: number }) =>
      params.offset
        ? new Promise<SearchData>((r) => {
            release = r;
          })
        : Promise.resolve({
            total: 3,
            matches: [{ ...node('a'), ancestorIds: [], unplaceableReason: null }],
          }),
    );
    renderTree(makeLoaders({ search: search as unknown as ReferralTreeLoaders['search'] }));
    fireEvent.change(await screen.findByRole('searchbox', { name: '搜尋姓名或推薦碼' }), {
      target: { value: 'q' },
    });
    const more = await screen.findByRole('button', { name: '載入更多' });
    fireEvent.click(more);
    await waitFor(() => expect((more as HTMLButtonElement).disabled).toBe(true));
    await act(async () =>
      release({
        total: 3,
        matches: [
          { ...node('a'), ancestorIds: [], unplaceableReason: null },
          { ...node('b'), ancestorIds: [], unplaceableReason: null },
        ],
      }),
    );
    expect(screen.getAllByRole('button', { name: '查看會員a的推薦與查帳資訊' })).toHaveLength(1);
    expect(screen.getByText('已顯示 2 / 3 筆')).toBeTruthy();
  });
});
