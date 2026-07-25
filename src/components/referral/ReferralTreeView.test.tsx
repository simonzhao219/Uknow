// @vitest-environment jsdom
//
// TDD red-first：推薦網絡樹（PR-B2 懶載入版）的行為契約。
// 紅階段 ReferralTreeView 仍是舊 props（roots 一次全載），這些測試以
// 「新契約」寫成，先紅後綠：
//   * 懶載入：展開呼叫 loadChildren(parentId)、等待中有 skeleton、回來後渲染子列
//   * 對齊（方案 A）：分支數移列右側「N 位」；即將到期以倒數取代且優先
//   * 倒數以 endDate 前端重算（不吃伺服器過時快照）
//   * 需要關注橫幅：伺服器上限 + 「還有 N 位」
//   * 排序：原生 select、值受控、變更回報
//   * 搜尋：debounce 300ms 呼叫伺服器、渲染遮罩結果
//   * a11y：tree/treeitem 語意在改寫後不退化
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReferralTreeView } from './ReferralTreeView';
import type { NetworkNode, NetworkOverview } from '../../utils/referralNetwork';

afterEach(cleanup);

// jsdom 沒有 matchMedia；一律回「桌機」（詳情走側欄，避免 radix Sheet portal）
beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as any;
});

const DAY = 86_400_000;

function makeNode(over: Partial<NetworkNode> = {}): NetworkNode {
  return {
    userId: 'u-' + Math.random().toString(36).slice(2, 8),
    name: '王大明',
    generation: 1,
    status: 'active',
    daysToExpiry: 180,
    endDate: new Date(Date.now() + 180 * DAY).toISOString(),
    joinedAt: '2026-07-01T00:00:00Z',
    listingId: null,
    childCount: 0,
    subtreeLatestJoinedAt: '2026-07-01T00:00:00Z',
    ...over,
  };
}

function makeOverview(over: Partial<NetworkOverview> = {}): NetworkOverview {
  return {
    userReferralCode: 'MYCODE',
    sort: 'updated_desc',
    roots: [],
    attention: { total: 0, items: [] },
    summary: { firstGenCount: 0, secondGenCount: 0, thirdGenCount: 0, totalReferrals: 0 },
    ...over,
  };
}

function renderTree(overview: NetworkOverview, opts: {
  loadChildren?: (parentId: string) => Promise<NetworkNode[]>;
  searchNetwork?: (q: string) => Promise<{ node: NetworkNode; ancestorPath: string[] }[]>;
  onSortChange?: (m: any) => void;
} = {}) {
  return render(
    <MemoryRouter>
      <ReferralTreeView
        overview={overview}
        sort={overview.sort}
        onSortChange={opts.onSortChange ?? (() => {})}
        loadChildren={opts.loadChildren ?? (async () => [])}
        searchNetwork={opts.searchNetwork ?? (async () => [])}
      />
    </MemoryRouter>,
  );
}

describe('懶載入展開', () => {
  it('展開呼叫 loadChildren(parentId)，等待中顯示 skeleton，回來後渲染子列', async () => {
    const parent = makeNode({ userId: 'p1', name: '王大明', childCount: 1 });
    let resolveChildren!: (v: NetworkNode[]) => void;
    const pending = new Promise<NetworkNode[]>((r) => { resolveChildren = r; });
    const loadChildren = vi.fn().mockReturnValue(pending);

    renderTree(makeOverview({ roots: [parent] }), { loadChildren });

    fireEvent.click(screen.getByRole('button', { name: '展開' }));
    expect(loadChildren).toHaveBeenCalledWith('p1');
    expect(screen.getByTestId('children-loading')).toBeTruthy();

    await act(async () => {
      resolveChildren([makeNode({ userId: 'c1', name: '陳○華', generation: 2 })]);
      await pending;
    });
    expect(screen.getByText('陳○華')).toBeTruthy();
    expect(screen.queryByTestId('children-loading')).toBeNull();
  });

  it('葉節點（childCount 0）沒有展開鈕', () => {
    renderTree(makeOverview({ roots: [makeNode({ name: '獨行俠', childCount: 0 })] }));
    expect(screen.queryByRole('button', { name: '展開' })).toBeNull();
  });
});

describe('列右側資訊（方案 A 對齊）', () => {
  it('有下線的節點於列右側顯示「N 位」', () => {
    renderTree(makeOverview({ roots: [makeNode({ name: '王大明', childCount: 3 })] }));
    expect(screen.getByText('3 位')).toBeTruthy();
  });

  it('即將到期以「剩 N 天到期」取代分支數（且由 endDate 重算，不吃過時快照）', () => {
    const node = makeNode({
      name: '林快到期',
      childCount: 1,
      status: 'expiring',
      daysToExpiry: 99,                                      // 伺服器過時快照
      endDate: new Date(Date.now() + 10 * DAY).toISOString(), // 實際剩 10 天
    });
    renderTree(makeOverview({ roots: [node] }));
    expect(screen.getByText('剩 10 天到期')).toBeTruthy();
    expect(screen.queryByText('1 位')).toBeNull();
  });
});

describe('需要關注橫幅（伺服器上限）', () => {
  it('顯示 total、上限內的 chips 與「還有 N 位」', () => {
    const items = [
      makeNode({ userId: 'a1', name: '陳○華', generation: 2, status: 'suspended' }),
      makeNode({ userId: 'a2', name: '林○樺', generation: 2, status: 'expired' }),
    ];
    renderTree(makeOverview({ attention: { total: 8, items } }));
    expect(screen.getByText('8 位下線需要關注')).toBeTruthy();
    expect(screen.getByText('陳○華')).toBeTruthy();
    expect(screen.getByText('還有 6 位')).toBeTruthy();
  });

  it('無需要關注者不渲染橫幅', () => {
    renderTree(makeOverview({ roots: [makeNode()] }));
    expect(screen.queryByText(/需要關注/)).toBeNull();
  });
});

describe('排序控制', () => {
  it('原生 select 受控於 sort、變更回報 onSortChange', () => {
    const onSortChange = vi.fn();
    renderTree(makeOverview({ roots: [makeNode()], sort: 'updated_desc' }), { onSortChange });
    const select = screen.getByLabelText('排序方式') as HTMLSelectElement;
    expect(select.value).toBe('updated_desc');
    fireEvent.change(select, { target: { value: 'name_asc' } });
    expect(onSortChange).toHaveBeenCalledWith('name_asc');
  });
});

describe('伺服器搜尋（debounce）', () => {
  it('輸入後 300ms 才呼叫 searchNetwork，渲染遮罩結果', async () => {
    vi.useFakeTimers();
    try {
      const searchNetwork = vi.fn().mockResolvedValue([
        { node: makeNode({ userId: 's1', name: '陳○華', generation: 2 }), ancestorPath: ['g1', 's1'] },
      ]);
      renderTree(makeOverview({ roots: [makeNode({ name: '王大明' })] }), { searchNetwork });

      fireEvent.change(screen.getByPlaceholderText('搜尋下線姓名'), { target: { value: '小' } });
      expect(searchNetwork).not.toHaveBeenCalled();

      await act(async () => { vi.advanceTimersByTime(300); });
      expect(searchNetwork).toHaveBeenCalledWith('小');

      await act(async () => { await Promise.resolve(); });
      expect(screen.getByText('陳○華')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a11y 語意不退化', () => {
  it('維持 tree / treeitem 結構', () => {
    renderTree(makeOverview({ roots: [makeNode({ name: '王大明' })] }));
    expect(screen.getByRole('tree', { name: '我的推薦網絡' })).toBeTruthy();
    expect(screen.getAllByRole('treeitem').length).toBe(1);
  });
});
