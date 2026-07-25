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
import { DEFAULT_NETWORK_SORT } from '../../utils/referralNetwork';
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
  // Radix popper 內容（DropdownMenu）在 jsdom 缺的 API
  (window as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.HTMLElement.prototype.scrollIntoView = () => {};
  (window.HTMLElement.prototype as any).hasPointerCapture = () => false;
  (window.HTMLElement.prototype as any).releasePointerCapture = () => {};
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

function renderTree(
  overview: NetworkOverview,
  opts: {
    loadChildren?: (parentId: string) => Promise<NetworkNode[]>;
    searchNetwork?: (
      q: string,
      offset: number,
    ) => Promise<{ matches: { node: NetworkNode; ancestorPath: string[] }[]; total: number }>;
    onSortChange?: (m: any) => void;
  } = {},
) {
  return render(
    <MemoryRouter>
      <ReferralTreeView
        overview={overview}
        sort={overview.sort}
        onSortChange={opts.onSortChange ?? (() => {})}
        loadChildren={opts.loadChildren ?? (async () => [])}
        searchNetwork={opts.searchNetwork ?? (async () => ({ matches: [], total: 0 }))}
      />
    </MemoryRouter>,
  );
}

describe('懶載入展開', () => {
  it('展開呼叫 loadChildren(parentId)，等待中顯示 skeleton，回來後渲染子列', async () => {
    const parent = makeNode({ userId: 'p1', name: '王大明', childCount: 1 });
    let resolveChildren!: (v: NetworkNode[]) => void;
    const pending = new Promise<NetworkNode[]>((r) => {
      resolveChildren = r;
    });
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
      daysToExpiry: 99, // 伺服器過時快照
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

describe('排序控制（Radix DropdownMenu：選單面板站內風格，原生 select 退役）', () => {
  it('無原生 select（OS 面板不一致的根因）；觸發器為選單按鈕、手機 icon-only', () => {
    renderTree(makeOverview({ roots: [makeNode()], sort: 'name_desc' }));

    // 原生 select 正式退役：選單面板改由 app 渲染，風格才管得到
    expect(document.querySelector('select')).toBeNull();

    const trigger = screen.getByRole('button', { name: /排序方式/ });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');

    // sm+ 短標籤、手機 icon-only（隱藏標籤）；grid 疊放承載固定寬
    const label = screen.getByTestId('sort-label');
    expect(label.className).toContain('hidden');
    expect(label.className).toContain('sm:grid');

    // 關閉狀態下全畫面每份排序文字至多一份：疊字問題結構性絕跡
    expect(screen.getAllByText('姓名 Z→A').length).toBe(1);
  });

  it('排序晶片寬度固定：四個標籤全數疊放於同一格，非當前者隱形且不進 a11y 樹', () => {
    renderTree(makeOverview({ roots: [makeNode()], sort: 'name_desc' }));

    // 所有選項標籤都在觸發器內佔位（疊同一 grid 格）→ 晶片寬度恆為最寬
    // 標籤之寬，切換排序不再伸縮
    const label = screen.getByTestId('sort-label');
    const stacked = Array.from(label.querySelectorAll('span'));
    expect(stacked.map((s) => s.textContent)).toEqual([
      '最舊加入',
      '最新加入',
      '姓名 A→Z',
      '姓名 Z→A',
    ]);
    for (const s of stacked) {
      expect(s.className).toContain('col-start-1');
      expect(s.className).toContain('row-start-1');
    }

    // 當前選項可見；其餘三個以 invisible 佔位、aria-hidden 退出 a11y 樹
    const [oldest, newest, nameAsc, nameDesc] = stacked;
    expect(nameDesc.className).not.toContain('invisible');
    expect(nameDesc.getAttribute('aria-hidden')).toBeNull();
    for (const ghost of [oldest, newest, nameAsc]) {
      expect(ghost.className).toContain('invisible');
      expect(ghost.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('展開為 menuitemradio 四選項、當前排序 aria-checked、點選回報 onSortChange', async () => {
    const onSortChange = vi.fn();
    renderTree(makeOverview({ roots: [makeNode()], sort: 'name_desc' }), { onSortChange });

    fireEvent.keyDown(screen.getByRole('button', { name: /排序方式/ }), { key: 'Enter' });

    const items = await screen.findAllByRole('menuitemradio');
    expect(items.map((i) => i.textContent)).toEqual([
      '最舊加入',
      '最新加入',
      '姓名 A→Z',
      '姓名 Z→A',
    ]);
    expect(
      screen.getByRole('menuitemradio', { name: '姓名 Z→A' }).getAttribute('aria-checked'),
    ).toBe('true');

    fireEvent.click(screen.getByRole('menuitemradio', { name: '姓名 A→Z' }));
    expect(onSortChange).toHaveBeenCalledWith('name_asc');
  });

  it('非預設排序顯示指示點（手機 icon-only 的狀態補償）、預設不顯示', () => {
    renderTree(makeOverview({ roots: [makeNode()], sort: 'name_desc' }));
    expect(screen.getByTestId('sort-active-dot')).toBeTruthy();
    cleanup();

    // 「最新加入」在新預設下已是非預設 → 必須亮點。判斷基準若沒跟著
    // DEFAULT_NETWORK_SORT 走，亮點語意會完全反轉，而且純視覺不會報錯。
    renderTree(makeOverview({ roots: [makeNode()], sort: 'updated_desc' }));
    expect(screen.getByTestId('sort-active-dot')).toBeTruthy();
    cleanup();

    renderTree(makeOverview({ roots: [makeNode()], sort: DEFAULT_NETWORK_SORT }));
    expect(screen.queryByTestId('sort-active-dot')).toBeNull();
  });

  it('預設排序時晶片顯示「最舊加入」（驗收 A1，sm+ 可見層）', () => {
    renderTree(makeOverview({ roots: [makeNode()], sort: DEFAULT_NETWORK_SORT }));
    const label = screen.getByTestId('sort-label');
    const visible = Array.from(label.querySelectorAll('span')).filter(
      (s) => !s.className.includes('invisible'),
    );
    expect(visible.map((s) => s.textContent)).toEqual(['最舊加入']);
  });

  it('觸發器的可及名稱含目前排序值（手機 icon-only 時的唯一狀態線索）', () => {
    renderTree(makeOverview({ roots: [makeNode()], sort: 'name_asc' }));
    expect(screen.getByRole('button', { name: '排序方式：姓名 A→Z' })).toBeTruthy();
    cleanup();
    renderTree(makeOverview({ roots: [makeNode()], sort: DEFAULT_NETWORK_SORT }));
    expect(screen.getByRole('button', { name: '排序方式：最舊加入' })).toBeTruthy();
  });
});

describe('伺服器搜尋（debounce）', () => {
  it('輸入後 300ms 才呼叫 searchNetwork，渲染遮罩結果', async () => {
    vi.useFakeTimers();
    try {
      const searchNetwork = vi.fn().mockResolvedValue({
        matches: [
          {
            node: makeNode({ userId: 's1', name: '陳○華', generation: 2 }),
            ancestorPath: ['g1', 's1'],
          },
        ],
        total: 1,
      });
      renderTree(makeOverview({ roots: [makeNode({ name: '王大明' })] }), { searchNetwork });

      fireEvent.change(screen.getByPlaceholderText('搜尋下線姓名'), { target: { value: '小' } });
      expect(searchNetwork).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(searchNetwork).toHaveBeenCalledWith('小', 0);

      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByText('陳○華')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  // 「符合條件的都必須搜得到」——需求方訂下的原則。伺服器分頁（Phase 3）
  // 若沒有對應的 UI，使用者仍只看得到第一頁且毫不知情，等於白做。
  it('命中多於一頁：顯示「已顯示 X / Y」與加載更多，載完後按鈕消失', async () => {
    const mk = (id: string) => ({
      node: makeNode({ userId: id, name: `林○${id}`, generation: 2 }),
      ancestorPath: ['g1', id],
    });
    const searchNetwork = vi
      .fn()
      .mockResolvedValueOnce({ matches: [mk('s1'), mk('s2')], total: 3 })
      .mockResolvedValueOnce({ matches: [mk('s3')], total: 3 });

    renderTree(makeOverview({ roots: [makeNode({ name: '王大明' })] }), { searchNetwork });
    fireEvent.change(screen.getByPlaceholderText('搜尋下線姓名'), { target: { value: '林' } });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    expect(searchNetwork).toHaveBeenCalledWith('林', 0);
    expect(screen.getByText('已顯示 2 / 3 筆記錄')).toBeTruthy();

    // 加載更多：以「已取回筆數」為 offset 續接，不是重打第一頁
    fireEvent.click(screen.getByRole('button', { name: '加載更多' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(searchNetwork).toHaveBeenCalledWith('林', 2);

    // 三筆到齊 → 計數更新、按鈕消失（沒有「還有更多」的假象）
    expect(screen.getByText('已顯示 3 / 3 筆記錄')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '加載更多' })).toBeNull();
    expect(screen.getByText('林○s3')).toBeTruthy();
  });

  it('命中僅一頁：仍顯示總數，但不出現加載更多', async () => {
    const searchNetwork = vi.fn().mockResolvedValue({
      matches: [
        { node: makeNode({ userId: 's1', name: '陳○華', generation: 2 }), ancestorPath: ['s1'] },
      ],
      total: 1,
    });
    renderTree(makeOverview({ roots: [makeNode()] }), { searchNetwork });
    fireEvent.change(screen.getByPlaceholderText('搜尋下線姓名'), { target: { value: '陳' } });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    expect(screen.getByText('已顯示 1 / 1 筆記錄')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '加載更多' })).toBeNull();
  });
});

describe('頭像顏色語意（綁世代，非 userId 雜湊）', () => {
  const avatarBg = (initial: string) =>
    (screen.getByText(initial) as HTMLElement).style.backgroundColor;

  it('同世代同色（不因 userId 而異）、跨世代異色', async () => {
    const parent = makeNode({ userId: 'u1', name: '甲一', generation: 1, childCount: 1 });
    const sibling = makeNode({ userId: 'u2', name: '乙二', generation: 1 });
    const child = makeNode({ userId: 'u3', name: '丙三', generation: 2 });
    const loadChildren = vi.fn().mockResolvedValue([child]);

    renderTree(makeOverview({ roots: [parent, sibling] }), { loadChildren });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '展開' }));
    });

    expect(avatarBg('甲')).toBe(avatarBg('乙'));
    expect(avatarBg('丙')).not.toBe(avatarBg('甲'));
  });
});

describe('a11y 語意不退化', () => {
  it('維持 tree / treeitem 結構', () => {
    renderTree(makeOverview({ roots: [makeNode({ name: '王大明' })] }));
    expect(screen.getByRole('tree', { name: '我的推薦網絡' })).toBeTruthy();
    expect(screen.getAllByRole('treeitem').length).toBe(1);
  });
});
