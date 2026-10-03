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
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReferralTreeView } from './ReferralTreeView';
import { DEFAULT_NETWORK_SORT } from '../../utils/referralNetwork';
import type { NetworkNode, NetworkOverview, NetworkSortMode } from '../../utils/referralNetwork';

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
  })) as unknown as typeof window.matchMedia;
  // Radix popper 內容（DropdownMenu）在 jsdom 缺的 API
  Object.assign(window, {
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
  window.HTMLElement.prototype.scrollIntoView = () => {};
  Object.assign(window.HTMLElement.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => {},
  });
});

const DAY = 86_400_000;

function makeNode(over: Partial<NetworkNode> = {}): NetworkNode {
  return {
    userId: `u-${Math.random().toString(36).slice(2, 8)}`,
    name: '王大明',
    generation: 1,
    status: 'active',
    daysToExpiry: 180,
    endDate: new Date(Date.now() + 180 * DAY).toISOString(),
    joinedAt: '2026-07-01T00:00:00Z',
    listingId: null,
    childCount: 0,
    ...over,
  };
}

function makeOverview(over: Partial<NetworkOverview> = {}): NetworkOverview {
  return {
    userReferralCode: 'MYCODE',
    sort: 'updated_desc',
    roots: [],
    attention: { total: 0, items: [] },
    summary: {
      firstGenCount: 0,
      secondGenCount: 0,
      thirdGenCount: 0,
      totalReferrals: 0,
      statusCounts: { active: 0, expiring: 0, expired: 0, suspended: 0 },
    },
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
    onSortChange?: (m: NetworkSortMode) => void;
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
      '最早加入',
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
      '最早加入',
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

  it('預設排序時晶片顯示「最早加入」（驗收 A1，sm+ 可見層）', () => {
    renderTree(makeOverview({ roots: [makeNode()], sort: DEFAULT_NETWORK_SORT }));
    const label = screen.getByTestId('sort-label');
    const visible = Array.from(label.querySelectorAll('span')).filter(
      (s) => !s.className.includes('invisible'),
    );
    expect(visible.map((s) => s.textContent)).toEqual(['最早加入']);
  });

  it('觸發器的可及名稱含目前排序值（手機 icon-only 時的唯一狀態線索）', () => {
    renderTree(makeOverview({ roots: [makeNode()], sort: 'name_asc' }));
    expect(screen.getByRole('button', { name: '排序方式：姓名 A→Z' })).toBeTruthy();
    cleanup();
    renderTree(makeOverview({ roots: [makeNode()], sort: DEFAULT_NETWORK_SORT }));
    expect(screen.getByRole('button', { name: '排序方式：最早加入' })).toBeTruthy();
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

// ---------- 顏色分工（S2c）：頭像＝訂閱狀態；世代＝縮排＋連接線 ----------
// 三代獎勵同額（規格書 §8.1）：世代不影響收入，狀態直接等於收入。所以最大面積的
// 顏色（頭像）給狀態；世代是結構，由縮排與連接線承擔，不再用頭像色重複編碼。
const rowOf = (name: string) => screen.getByRole('treeitem', { name: `${name} 詳情` });
const circleOf = (initial: string) => screen.getByText(initial) as HTMLElement;

describe('頭像顏色語意（綁訂閱狀態，不再表示世代）', () => {
  const AVATAR_CLASSES = [
    ['active', 'bg-success', 'text-success-foreground'],
    ['expiring', 'bg-warning', 'text-warning-foreground'],
    ['expired', 'bg-muted', 'text-muted-foreground'],
    ['suspended', 'bg-destructive', 'text-destructive-foreground'],
  ] as const;

  for (const [status, bg, fg] of AVATAR_CLASSES) {
    it(`${status} 的頭像底色 ${bg}、字色 ${fg}`, () => {
      renderTree(makeOverview({ roots: [makeNode({ name: '甲一', status })] }));
      const el = circleOf('甲');
      expect(el.classList.contains(bg)).toBe(true);
      expect(el.classList.contains(fg)).toBe(true);
    });
  }

  it('同狀態不同世代頭像同色，同世代不同狀態頭像異色', async () => {
    const parent = makeNode({ userId: 'u1', name: '甲一', generation: 1, childCount: 1 });
    const sibling = makeNode({ userId: 'u2', name: '乙二', generation: 1, status: 'expired' });
    const child = makeNode({ userId: 'u3', name: '丙三', generation: 2 });
    const loadChildren = vi.fn().mockResolvedValue([child]);

    renderTree(makeOverview({ roots: [parent, sibling] }), { loadChildren });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '展開' }));
    });

    // 甲（一代）與丙（二代）都是 active → 同色；乙與甲同為一代但已失效 → 異色
    expect(circleOf('甲').className).toBe(circleOf('丙').className);
    expect(circleOf('乙').className).not.toBe(circleOf('甲').className);
  });

  it('頭像是單一圓形：沒有右下角狀態小點，也沒有包它的外層', () => {
    renderTree(makeOverview({ roots: [makeNode({ name: '甲一', status: 'suspended' })] }));
    const el = circleOf('甲');
    expect(el.children.length).toBe(0);
    expect(el.parentElement?.getAttribute('role')).toBe('treeitem');
  });
});

describe('列右側狀態文字（色盲防線：非訂閱中的狀態都有文字，不只靠顏色）', () => {
  it('已失效顯示「已失效」並取代分支數', () => {
    renderTree(
      makeOverview({ roots: [makeNode({ name: '周美玲', status: 'expired', childCount: 3 })] }),
    );
    expect(within(rowOf('周美玲')).getByText('已失效')).toBeTruthy();
    expect(screen.queryByText('3 位')).toBeNull();
  });

  it('已停權顯示 Ban 圖示與「已停權」並取代分支數', () => {
    renderTree(
      makeOverview({ roots: [makeNode({ name: '黃○真', status: 'suspended', childCount: 3 })] }),
    );
    const row = rowOf('黃○真');
    expect(within(row).getByText('已停權')).toBeTruthy();
    expect(row.querySelector('svg.lucide-ban')).not.toBeNull();
    expect(screen.queryByText('3 位')).toBeNull();
  });

  it('訂閱中維持顯示分支數，不加任何狀態文字', () => {
    renderTree(makeOverview({ roots: [makeNode({ name: '王大明', childCount: 3 })] }));
    const row = rowOf('王大明');
    expect(within(row).getByText('3 位')).toBeTruthy();
    for (const word of ['已失效', '已停權', '即將到期']) {
      expect(within(row).queryByText(new RegExp(word))).toBeNull();
    }
  });

  it('即將到期但算不出剩餘天數時，仍顯示「即將到期」文字', () => {
    const node = makeNode({
      name: '林快到期',
      status: 'expiring',
      endDate: null,
      daysToExpiry: null,
    });
    renderTree(makeOverview({ roots: [node] }));
    expect(within(rowOf('林快到期')).getByText('即將到期')).toBeTruthy();
  });
});

describe('整列底色：即將到期淡黃、選中靛藍淺底', () => {
  const expiringNode = (name: string) =>
    makeNode({
      name,
      status: 'expiring',
      daysToExpiry: 5,
      endDate: new Date(Date.now() + 5 * DAY).toISOString(),
    });

  it('即將到期的列整列 bg-warning-subtle，其他狀態的列沒有', () => {
    renderTree(
      makeOverview({
        roots: [
          expiringNode('林快到期'),
          makeNode({ name: '王大明' }),
          makeNode({ name: '周美玲', status: 'expired' }),
        ],
      }),
    );
    expect(rowOf('林快到期').classList.contains('bg-warning-subtle')).toBe(true);
    expect(rowOf('王大明').classList.contains('bg-warning-subtle')).toBe(false);
    expect(rowOf('周美玲').classList.contains('bg-warning-subtle')).toBe(false);
  });

  it('選中列用 bg-brand-subtle，不再用 bg-muted', () => {
    renderTree(makeOverview({ roots: [makeNode({ name: '王大明' })] }));
    fireEvent.click(rowOf('王大明'));
    const row = rowOf('王大明');
    expect(row.getAttribute('aria-selected')).toBe('true');
    expect(row.classList.contains('bg-brand-subtle')).toBe(true);
    expect(row.classList.contains('bg-muted')).toBe(false);
  });

  it('選中的即將到期列以選中色為準，不同時帶兩種底色', () => {
    renderTree(makeOverview({ roots: [expiringNode('林快到期')] }));
    fireEvent.click(rowOf('林快到期'));
    const row = rowOf('林快到期');
    expect(row.classList.contains('bg-brand-subtle')).toBe(true);
    expect(row.classList.contains('bg-warning-subtle')).toBe(false);
  });
});

// 整列套 opacity-55 會把狀態文字一起稀釋：「已失效」2.13:1、「已停權」3.02:1，都低於
// 4.5:1，而這兩段字正是 §12.7 的色盲防線（§12.8 第 3 步也明列要防 opacity 稀釋）。
// 所以只淡化頭像與名字，狀態文字維持不透明。
describe('已失效／已停權的淡化範圍（狀態文字不得被稀釋）', () => {
  it('頭像與名字淡化 opacity-55，整列根節點與狀態文字不淡化', () => {
    renderTree(makeOverview({ roots: [makeNode({ name: '周美玲', status: 'expired' })] }));
    const row = rowOf('周美玲');
    expect(row.classList.contains('opacity-55')).toBe(false);
    expect(within(row).getByText('周').classList.contains('opacity-55')).toBe(true);
    expect(within(row).getByText('周美玲').classList.contains('opacity-55')).toBe(true);
    expect(within(row).getByText('已失效').className).not.toContain('opacity');
  });

  it('已停權的狀態文字同樣不淡化', () => {
    renderTree(makeOverview({ roots: [makeNode({ name: '黃○真', status: 'suspended' })] }));
    expect(within(rowOf('黃○真')).getByText('已停權').className).not.toContain('opacity');
  });

  it('訂閱中的列完全不淡化', () => {
    renderTree(makeOverview({ roots: [makeNode({ name: '王大明' })] }));
    const row = rowOf('王大明');
    expect(within(row).getByText('王').className).not.toContain('opacity');
    expect(within(row).getByText('王大明').className).not.toContain('opacity');
  });
});

describe('世代只剩縮排與連接線（灰階），不再占用頭像顏色', () => {
  it('二、三代連接線用 --muted-foreground 兩階透明度，越深代越淡', async () => {
    const g1 = makeNode({ userId: 'g1', name: '甲一', generation: 1, childCount: 1 });
    const g2 = makeNode({ userId: 'g2', name: '乙二', generation: 2, childCount: 1 });
    const g3 = makeNode({ userId: 'g3', name: '丙三', generation: 3 });
    const loadChildren = vi.fn(async (id: string) => (id === 'g1' ? [g2] : [g3]));

    renderTree(makeOverview({ roots: [g1] }), { loadChildren });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '展開' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '展開' }));
    });

    const groups = document.querySelectorAll('[id^="rtn-group-"]');
    expect(groups.length).toBe(2);
    expect(groups[0].classList.contains('border-muted-foreground')).toBe(true);
    // 最淡一階 80%：globals.test.ts 以同一公式釘住它對背景仍達非文字 3:1
    expect(groups[1].classList.contains('border-muted-foreground/80')).toBe(true);
  });

  it('詳情面板的世代徽章是灰階 bg-muted text-muted-foreground', () => {
    renderTree(makeOverview({ roots: [makeNode({ name: '王大明', generation: 1 })] }));
    fireEvent.click(rowOf('王大明'));
    const badge = screen.getByText('一代');
    expect(badge.classList.contains('bg-muted')).toBe(true);
    expect(badge.classList.contains('text-muted-foreground')).toBe(true);
  });
});

describe('狀態 chip（計數由伺服器提供，點選過濾，兼作圖例）', () => {
  const COUNTS = { active: 6, expiring: 1, expired: 2, suspended: 1 };
  const overviewWith = (roots: NetworkNode[], statusCounts = COUNTS) =>
    makeOverview({
      roots,
      summary: {
        firstGenCount: roots.length,
        secondGenCount: 0,
        thirdGenCount: 0,
        totalReferrals: roots.length,
        statusCounts,
      },
    });
  const chip = (label: string, count: number) =>
    screen.getByRole('button', { name: `${label} ${count}` }) as HTMLButtonElement;
  const expiringNode = (name: string, over: Partial<NetworkNode> = {}) =>
    makeNode({
      name,
      status: 'expiring',
      daysToExpiry: 5,
      endDate: new Date(Date.now() + 5 * DAY).toISOString(),
      ...over,
    });

  it('樹上方顯示四顆 chip：狀態名稱加伺服器給的全樹計數', () => {
    renderTree(overviewWith([makeNode()]));
    expect(screen.getByRole('group', { name: '依訂閱狀態篩選' })).toBeTruthy();
    expect(chip('訂閱中', 6)).toBeTruthy();
    expect(chip('即將到期', 1)).toBeTruthy();
    expect(chip('已失效', 2)).toBeTruthy();
    expect(chip('已停權', 1)).toBeTruthy();
  });

  it('chip 在搜尋列下方：隱藏或顯示 chip 時，輸入框不會位移', () => {
    renderTree(overviewWith([makeNode()]));
    const input = screen.getByPlaceholderText('搜尋下線姓名');
    const group = screen.getByRole('group', { name: '依訂閱狀態篩選' });
    expect(input.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('點 chip 切換過濾（aria-pressed），再點一次取消', () => {
    renderTree(overviewWith([makeNode()]));
    const c = chip('即將到期', 1);
    expect(c.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(c);
    expect(c.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(c);
    expect(c.getAttribute('aria-pressed')).toBe('false');
  });

  it('過濾只留符合狀態的列，不符的葉節點隱藏；取消後全部回來', () => {
    const a = makeNode({ userId: 'a', name: '甲甲' });
    const b = expiringNode('乙乙', { userId: 'b' });
    const c = makeNode({ userId: 'c', name: '丙丙', status: 'expired' });
    renderTree(overviewWith([a, b, c]));

    fireEvent.click(chip('即將到期', 1));
    expect(screen.queryByRole('treeitem', { name: '乙乙 詳情' })).not.toBeNull();
    expect(screen.queryByRole('treeitem', { name: '甲甲 詳情' })).toBeNull();
    expect(screen.queryByRole('treeitem', { name: '丙丙 詳情' })).toBeNull();

    fireEvent.click(chip('即將到期', 1));
    expect(screen.getAllByRole('treeitem').length).toBe(3);
  });

  it('符合者的祖先留著當脈絡、分支數不變，不符的兄弟隱藏，展開狀態不動', async () => {
    const parent = makeNode({ userId: 'p', name: '祖先甲', childCount: 2 });
    const hit = expiringNode('符合乙', { userId: 'h', generation: 2 });
    const miss = makeNode({ userId: 'm', name: '路人丙', generation: 2 });
    renderTree(overviewWith([parent]), { loadChildren: vi.fn().mockResolvedValue([hit, miss]) });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '展開' }));
    });

    fireEvent.click(chip('即將到期', 1));

    expect(within(rowOf('祖先甲')).getByText('2 位')).toBeTruthy(); // 分支數仍是伺服器的 childCount
    expect(screen.queryByRole('treeitem', { name: '符合乙 詳情' })).not.toBeNull();
    expect(screen.queryByRole('treeitem', { name: '路人丙 詳情' })).toBeNull();
    expect(screen.getByRole('button', { name: '收合' })).toBeTruthy(); // 沒有被收合
  });

  it('子代尚未載入的節點保留（可能藏著符合者），確定沒有的葉節點隱藏', () => {
    const unloaded = makeNode({ userId: 'q', name: '未載入', childCount: 3 });
    const leaf = makeNode({ userId: 'r', name: '葉節點' });
    renderTree(overviewWith([unloaded, leaf]));

    fireEvent.click(chip('已失效', 2));

    expect(screen.queryByRole('treeitem', { name: '未載入 詳情' })).not.toBeNull();
    expect(screen.queryByRole('treeitem', { name: '葉節點 詳情' })).toBeNull();
  });

  it('子代已載入且全都不符時，該節點也隱藏；全部隱藏時提示沒有符合者', async () => {
    const s = makeNode({ userId: 's', name: '甲乙', childCount: 1 });
    const x = makeNode({ userId: 'x', name: '丙丁', generation: 2 });
    renderTree(overviewWith([s]), { loadChildren: vi.fn().mockResolvedValue([x]) });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '展開' }));
    });

    fireEvent.click(chip('已失效', 2));

    expect(screen.queryByRole('treeitem', { name: '甲乙 詳情' })).toBeNull();
    expect(screen.getByText('沒有符合的下線')).toBeTruthy();
  });

  it('符合的節點展開後沒有符合的子代時，分支內顯示「沒有符合的下線」', async () => {
    const t = makeNode({ userId: 't', name: '失效甲', status: 'expired', childCount: 1 });
    const kid = makeNode({ userId: 'k', name: '訂閱乙', generation: 2 });
    renderTree(overviewWith([t]), { loadChildren: vi.fn().mockResolvedValue([kid]) });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '展開' }));
    });

    fireEvent.click(chip('已失效', 2));

    expect(screen.queryByRole('treeitem', { name: '失效甲 詳情' })).not.toBeNull();
    expect(screen.queryByRole('treeitem', { name: '訂閱乙 詳情' })).toBeNull();
    expect(screen.getByText('沒有符合的下線')).toBeTruthy();
  });

  it('計數為 0 的 chip 不能點（沒有東西可過濾），其餘可點', () => {
    renderTree(overviewWith([makeNode()], { active: 1, expiring: 0, expired: 0, suspended: 0 }));
    expect(chip('即將到期', 0).disabled).toBe(true);
    expect(chip('訂閱中', 1).disabled).toBe(false);
  });

  it('選中的狀態計數歸零時自動解除過濾，不卡在空畫面', () => {
    const nodes = [
      makeNode({ userId: 'a', name: '甲甲' }),
      makeNode({ userId: 'b', name: '乙乙', status: 'expired' }),
    ];
    const element = (overview: NetworkOverview) => (
      <MemoryRouter>
        <ReferralTreeView
          overview={overview}
          sort={overview.sort}
          onSortChange={() => {}}
          loadChildren={async () => []}
          searchNetwork={async () => ({ matches: [], total: 0 })}
        />
      </MemoryRouter>
    );
    const { rerender } = render(
      element(overviewWith(nodes, { active: 1, expiring: 0, expired: 1, suspended: 0 })),
    );
    fireEvent.click(chip('已失效', 1));
    expect(screen.queryByRole('treeitem', { name: '甲甲 詳情' })).toBeNull();

    rerender(element(overviewWith(nodes, { active: 1, expiring: 0, expired: 0, suspended: 0 })));

    expect(screen.queryByRole('treeitem', { name: '甲甲 詳情' })).not.toBeNull();
  });

  it('statusCounts 缺席（舊快取或部署時差）時不渲染 chip，樹照常顯示', () => {
    const overview = makeOverview({ roots: [makeNode({ name: '王大明' })] });
    // 舊快取的形狀：只有三代人數與總數。型別說必填、執行期不保證，這裡刻意繞過型別。
    const stale = {
      ...overview,
      summary: { firstGenCount: 1, secondGenCount: 0, thirdGenCount: 0, totalReferrals: 1 },
    } as unknown as NetworkOverview;
    renderTree(stale);
    expect(screen.queryByRole('group', { name: '依訂閱狀態篩選' })).toBeNull();
    expect(screen.getByRole('treeitem', { name: '王大明 詳情' })).toBeTruthy();
  });

  it('搜尋中隱藏 chip；清除搜尋後 chip 回來且過濾狀態保留', () => {
    const nodes = [makeNode({ name: '王大明' }), makeNode({ name: '乙乙', status: 'expired' })];
    renderTree(overviewWith(nodes));
    fireEvent.click(chip('已失效', 2));

    fireEvent.change(screen.getByPlaceholderText('搜尋下線姓名'), { target: { value: '王' } });
    expect(screen.queryByRole('group', { name: '依訂閱狀態篩選' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '清除搜尋' }));
    expect(chip('已失效', 2).getAttribute('aria-pressed')).toBe('true');
  });

  it('過濾中顯示一行提示（只列出已載入的下線），取消後提示消失', () => {
    renderTree(overviewWith([makeNode()]));
    fireEvent.click(chip('已失效', 2));
    expect(screen.getByText(/只列出已載入的/)).toBeTruthy();
    fireEvent.click(chip('已失效', 2));
    expect(screen.queryByText(/只列出已載入的/)).toBeNull();
  });
});

describe('「新」tag（加入 30 天內）', () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

  it('加入 10 天的節點在名字旁顯示「新」，樣式用 brand-subtle', () => {
    renderTree(makeOverview({ roots: [makeNode({ name: '王大明', joinedAt: daysAgo(10) })] }));
    const tag = within(rowOf('王大明')).getByText('新');
    expect(tag.classList.contains('bg-brand-subtle')).toBe(true);
    expect(tag.classList.contains('text-brand-subtle-foreground')).toBe(true);
  });

  it('加入超過 30 天不顯示「新」', () => {
    renderTree(makeOverview({ roots: [makeNode({ name: '王大明', joinedAt: daysAgo(31) })] }));
    expect(within(rowOf('王大明')).queryByText('新')).toBeNull();
  });

  it('joinedAt 為空字串或非法值時不顯示「新」（Date.parse 得 NaN，不崩潰）', () => {
    renderTree(
      makeOverview({
        roots: [
          makeNode({ userId: 'e', name: '空日期', joinedAt: '' }),
          makeNode({ userId: 'f', name: '壞日期', joinedAt: 'not-a-date' }),
        ],
      }),
    );
    expect(within(rowOf('空日期')).queryByText('新')).toBeNull();
    expect(within(rowOf('壞日期')).queryByText('新')).toBeNull();
  });
});

// 切排序時：晶片文字立刻變、已展開分支立刻收合，但清單原地維持舊順序直到
// 回應才默默重排。改預設後「老使用者上線第一件事就是切回最新加入」會大量
// 觸發這段無回饋空窗（LINE 內建瀏覽器更慢）。
describe('重新驗證中的載入回饋（切排序不再是無回饋空窗）', () => {
  it('isValidating 期間樹降透明度並標記 aria-busy；回應後恢復', () => {
    const { rerender } = render(
      <MemoryRouter>
        <ReferralTreeView
          overview={makeOverview({ roots: [makeNode()] })}
          sort={DEFAULT_NETWORK_SORT}
          onSortChange={() => {}}
          loadChildren={async () => []}
          searchNetwork={async () => ({ matches: [], total: 0 })}
          isValidating
        />
      </MemoryRouter>,
    );

    const tree = screen.getByRole('tree', { name: '我的推薦網絡' });
    expect(tree.getAttribute('aria-busy')).toBe('true');
    expect(tree.className).toContain('opacity-');

    rerender(
      <MemoryRouter>
        <ReferralTreeView
          overview={makeOverview({ roots: [makeNode()] })}
          sort={DEFAULT_NETWORK_SORT}
          onSortChange={() => {}}
          loadChildren={async () => []}
          searchNetwork={async () => ({ matches: [], total: 0 })}
          isValidating={false}
        />
      </MemoryRouter>,
    );

    const settled = screen.getByRole('tree', { name: '我的推薦網絡' });
    expect(settled.getAttribute('aria-busy')).toBeNull();
    expect(settled.className).not.toContain('opacity-');
  });
});

describe('a11y 語意不退化', () => {
  it('維持 tree / treeitem 結構', () => {
    renderTree(makeOverview({ roots: [makeNode({ name: '王大明' })] }));
    expect(screen.getByRole('tree', { name: '我的推薦網絡' })).toBeTruthy();
    expect(screen.getAllByRole('treeitem').length).toBe(1);
  });
});
