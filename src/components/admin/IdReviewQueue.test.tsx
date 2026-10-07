// @vitest-environment jsdom
//
// admin 的證件審核佇列。
//
// 這支測試守兩件事：
//   1. **退回必須填理由**，而且不是靠「按鈕 disabled」單獨表達——只把鈕變灰
//      不說原因，是既有的 a11y 反模式（CLAUDE.md：別再添新債）。要接 FieldError。
//   2. **admin 看得到夠大的照片**。審核的實質工作就是看清楚證件上的字；
//      縮圖等於沒審。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AdminIdReview } from '@contract';
import { nextStamp } from '../../hooks/useLatestRequest';
import { type AdminCache, createAdminCache } from './adminCache';
import type { AdminBusy } from './adminBusy';
import { IdReviewQueue } from './IdReviewQueue';

afterEach(cleanup);

HTMLElement.prototype.scrollIntoView ??= () => {};

function review(over: Partial<AdminIdReview> = {}): AdminIdReview {
  return {
    userId: 'u1',
    name: '王小明',
    email: 'a@b.c',
    phone: '0912345678',
    status: 'pending',
    rejectReason: null,
    reviewedAt: null,
    submittedAt: '2026-08-01T00:00:00Z',
    createdAt: '2026-08-01T00:00:00Z',
    idCardFrontUrl: 'https://example.test/front.jpg',
    idCardBackUrl: 'https://example.test/back.jpg',
    ...over,
  };
}

type Queue = { reviews: AdminIdReview[]; total: number };

function renderQueue(
  opts: {
    loadReviews?: (params: { limit: number; offset: number }) => Promise<Queue>;
    submitReview?: (userId: string, approve: boolean, reason?: string) => Promise<void>;
    cache?: AdminCache;
    busy?: AdminBusy;
  } = {},
) {
  return render(
    <IdReviewQueue
      loadReviews={opts.loadReviews ?? (async () => ({ reviews: [review()], total: 1 }))}
      submitReview={opts.submitReview ?? (async () => {})}
      cache={opts.cache}
      busy={opts.busy}
    />,
  );
}

describe('IdReviewQueue', () => {
  it('取資料期間顯示載入態', async () => {
    let resolve!: (v: { reviews: AdminIdReview[]; total: number }) => void;
    const pending = new Promise<{ reviews: AdminIdReview[]; total: number }>((r) => {
      resolve = r;
    });
    renderQueue({ loadReviews: () => pending });

    expect(screen.getByRole('status', { name: '載入審核佇列中' })).toBeTruthy();
    resolve({ reviews: [], total: 0 });
    // 回報的狀態容器常駐 role="status"（live region 要先在才念得出來，業主裁決 B），所以只看骨架。
    await waitFor(() =>
      expect(screen.queryByRole('status', { name: '載入審核佇列中' })).toBeNull(),
    );
  });

  it('取資料失敗時顯示錯誤態並提供重試', async () => {
    const loadReviews = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ reviews: [], total: 0 });
    renderQueue({ loadReviews });

    await screen.findByText('無法取得審核佇列');
    fireEvent.click(screen.getByRole('button', { name: '重試' }));

    await screen.findByText('目前沒有待審核的證件');
    expect(loadReviews).toHaveBeenCalledTimes(2);
  });

  it('佇列為空時顯示空態，不是空白畫面', async () => {
    renderQueue({ loadReviews: async () => ({ reviews: [], total: 0 }) });
    await screen.findByText('目前沒有待審核的證件');
  });

  it('列出待審會員的姓名與正反面照片', async () => {
    renderQueue();

    await screen.findByText('王小明');
    const front = screen.getByAltText('王小明 的身分證正面') as HTMLImageElement;
    const back = screen.getByAltText('王小明 的身分證反面') as HTMLImageElement;
    expect(front.src).toBe('https://example.test/front.jpg');
    expect(back.src).toBe('https://example.test/back.jpg');
  });

  it('按通過後送出核可並重新整理佇列', async () => {
    const submitReview = vi.fn().mockResolvedValue(undefined);
    const loadReviews = vi
      .fn()
      .mockResolvedValueOnce({ reviews: [review()], total: 1 })
      .mockResolvedValueOnce({ reviews: [], total: 0 });
    renderQueue({ loadReviews, submitReview });

    await screen.findByText('王小明');
    fireEvent.click(screen.getByRole('button', { name: '通過' }));

    await screen.findByText('目前沒有待審核的證件');
    expect(submitReview).toHaveBeenCalledWith('u1', true, undefined);
  });

  it('退回理由空白時送出鍵不可用，並以 alert 說明原因', async () => {
    renderQueue();

    await screen.findByText('王小明');
    fireEvent.click(screen.getByRole('button', { name: '退回' }));

    const confirm = await screen.findByRole('button', { name: '確認退回' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    // 只把鈕變灰不說原因是既有的 a11y 反模式，新元件不再添這筆債
    expect(screen.getByRole('alert').textContent).toContain('請填寫退回理由');
  });

  it('填了理由才能退回，理由一併送出', async () => {
    const submitReview = vi.fn().mockResolvedValue(undefined);
    const loadReviews = vi
      .fn()
      .mockResolvedValueOnce({ reviews: [review()], total: 1 })
      .mockResolvedValueOnce({ reviews: [], total: 0 });
    renderQueue({ loadReviews, submitReview });

    await screen.findByText('王小明');
    fireEvent.click(screen.getByRole('button', { name: '退回' }));

    const reason = await screen.findByLabelText('退回理由');
    fireEvent.change(reason, { target: { value: '背面反光看不清' } });
    fireEvent.click(screen.getByRole('button', { name: '確認退回' }));

    await waitFor(() => expect(submitReview).toHaveBeenCalledWith('u1', false, '背面反光看不清'));
  });

  it('只填空白字元不算填了理由', async () => {
    renderQueue();

    await screen.findByText('王小明');
    fireEvent.click(screen.getByRole('button', { name: '退回' }));

    const reason = await screen.findByLabelText('退回理由');
    fireEvent.change(reason, { target: { value: '   ' } });
    expect((screen.getByRole('button', { name: '確認退回' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  // 不得靜默截斷（ui-ux-guidelines §5）：後端一頁預設 50 筆，backfill 上線
  // 當日佇列就可能超過。看不到總數的 admin 會以為「今天審完了」，實際上
  // 第 51 筆之後的人還在等。
  it('佇列顯示已顯示筆數與總筆數，未載完時提供載入更多', async () => {
    renderQueue({
      loadReviews: async ({ offset }) => ({
        reviews: [review({ userId: `u${offset}`, name: `會員${offset}` })],
        total: 3,
      }),
    });

    expect(await screen.findByText('已顯示 1 / 3 筆')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '載入更多' }));
    expect(await screen.findByText('已顯示 2 / 3 筆')).toBeTruthy();
  });
});

// --- S5 階段 5b：錯誤區與回報、結果分類、焦點後備、busy --------------------------------
//
// 佇列不快取（即時資料、通過／退回的依據），切回照舊出骨架；拿 store 只為了讀取回 403 時整體
// 清空。通過／退回不受閘門約束。寫入走 runAdminWrite（不入失效表）：成功回報「已通過／已退回：
// 〈姓名〉」；失敗（後端拒絕或結果不明）印在佇列上方的錯誤區、剛按下的取得焦點，並背景重讀一次
// （E4）。沒有工具列：陳舊提示的逾時也附重試。

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 每次讀佇列都掛著，由測試結算。 */
function heldQueue() {
  const calls: { offset: number; d: ReturnType<typeof deferred<Queue>> }[] = [];
  const load = vi.fn(({ offset }: { limit: number; offset: number }) => {
    const d = deferred<Queue>();
    calls.push({ offset, d });
    return d.promise;
  });
  return { calls, load };
}

const rejected = (message: string, status = 409) => Object.assign(new Error(message), { status });
const twoReviews = (): Queue => ({
  reviews: [review(), review({ userId: 'u2', name: '李小華', email: 'lee@b.c' })],
  total: 2,
});
const cardOf = (name: string) => screen.getByRole('group', { name: new RegExp(name) });
const queue = () => screen.getByRole('region', { name: '證件審核佇列' });

function fakeBusy(): AdminBusy & { release: ReturnType<typeof vi.fn> } {
  const release = vi.fn();
  return {
    locked: false,
    noteId: '',
    release,
    startWrite: vi.fn(() => release),
    startExport: vi.fn(() => ({ progress: vi.fn(), end: vi.fn() })),
  };
}

describe('IdReviewQueue 讀取', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('佇列不快取：帶著 store 重掛時照舊出骨架並重新讀取', async () => {
    const cache = createAdminCache();
    const load = vi.fn(async () => ({ reviews: [review()], total: 1 }));
    const first = renderQueue({ cache, loadReviews: load });
    await screen.findByText('王小明');
    first.unmount();

    renderQueue({ cache, loadReviews: load });
    expect(screen.getByRole('status', { name: '載入審核佇列中' })).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('首次載入超過 15 秒時骨架旁說明仍在等待伺服器回應', () => {
    vi.useFakeTimers();
    const { load } = heldQueue();
    renderQueue({ loadReviews: load });
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByRole('status', { name: '載入審核佇列中' })).toBeTruthy();
    expect(screen.getByText('更新較久，仍在等待伺服器回應')).toBeTruthy();
  });

  it('讀取回 403 時清空全部快取，佇列改顯示錯誤', async () => {
    const cache = createAdminCache();
    cache.write(
      'members:list',
      { items: [{ id: 'm1' }], total: 1, fetchedAt: Date.now() },
      nextStamp(),
    );
    renderQueue({
      cache,
      loadReviews: async () => {
        throw rejected('沒有權限', 403);
      },
    });
    expect(await screen.findByText('無法取得審核佇列')).toBeTruthy();
    expect(cache.read('members:list')).toBeUndefined();
  });

  it('背景更新失敗時保留本次掛載的舊列並提示，重試期間原地寫「正在更新…」', async () => {
    const { calls, load } = heldQueue();
    renderQueue({ loadReviews: load });
    await act(async () => calls[0].d.resolve(twoReviews()));
    fireEvent.click(within(cardOf('王小明')).getByRole('button', { name: '通過' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () => calls[1].d.reject(new Error('連線中斷')));

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('更新失敗，以下是剛剛的資料');
    expect(alert.textContent).toContain('連線中斷');
    expect(cardOf('李小華')).toBeTruthy();

    const retry = within(alert).getByRole('button', { name: '重試' });
    retry.focus();
    fireEvent.click(retry);
    expect(screen.getByText('正在更新…')).toBeTruthy();
    expect(document.activeElement).toBe(retry);
    await act(async () => calls[2].d.resolve({ reviews: [], total: 0 }));
    expect(screen.queryByText('正在更新…')).toBeNull();
    expect(await screen.findByText('目前沒有待審核的證件')).toBeTruthy();
  });

  // 沒有工具列的頁面：逾時的提示自己附重試。
  it('逾時且有舊列時提示更新較久，並附重試', async () => {
    vi.useFakeTimers();
    const { calls, load } = heldQueue();
    renderQueue({ loadReviews: load });
    await act(async () => calls[0].d.resolve(twoReviews()));
    fireEvent.click(within(cardOf('王小明')).getByRole('button', { name: '通過' }));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(screen.getByText(/更新較久，以下是剛剛的資料/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '重試' })).toBeTruthy();
  });

  it('沒有資料時讀取失敗用中性字，重試是流程鈕', async () => {
    renderQueue({
      loadReviews: async () => {
        throw new Error('boom');
      },
    });
    const text = await screen.findByText('無法取得審核佇列');
    expect(text.classList.contains('text-muted-foreground')).toBe(true);
    const alert = screen.getByRole('alert');
    expect(
      within(alert).getByRole('button', { name: '重試' }).classList.contains('bg-primary'),
    ).toBe(true);
  });

  it('載入更多失敗時在鈕旁說出原因，已顯示的卡保留', async () => {
    renderQueue({
      loadReviews: async ({ offset }) => {
        if (offset > 0) throw new Error('連線中斷');
        return { reviews: [review()], total: 3 };
      },
    });
    const more = await screen.findByRole('button', { name: '載入更多' });
    fireEvent.click(more);
    expect(await screen.findByText('連線中斷')).toBeTruthy();
    expect(cardOf('王小明')).toBeTruthy();
    const reason = document.getElementById(more.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toBe('連線中斷');
  });

  it('更新中載入更多按不出去，0.3 秒後套停用外觀，狀態行接「更新中」', async () => {
    vi.useFakeTimers();
    const { calls, load } = heldQueue();
    renderQueue({ loadReviews: load });
    await act(async () => calls[0].d.resolve({ reviews: [review()], total: 3 }));
    fireEvent.click(within(cardOf('王小明')).getByRole('button', { name: '通過' }));
    await act(async () => {
      await Promise.resolve();
    });
    const more = screen.getByRole('button', { name: '載入更多' });
    expect(more.getAttribute('aria-disabled')).toBe('true');

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(more.getAttribute('data-paused')).toBe('true');
    const reason = document.getElementById(more.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toBe('已顯示 1 / 3 筆・更新中');
  });

  // 失敗時載入更多同樣按不出去：狀態行說出原因，鈕以 aria-describedby 指向它。
  it('背景更新失敗時狀態行接「更新失敗」，載入更多指向它', async () => {
    const { calls, load } = heldQueue();
    renderQueue({ loadReviews: load });
    await act(async () => calls[0].d.resolve({ reviews: [review()], total: 3 }));
    fireEvent.click(within(cardOf('王小明')).getByRole('button', { name: '通過' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () => calls[1].d.reject(new Error('連線中斷')));

    const more = screen.getByRole('button', { name: '載入更多' });
    expect(more.getAttribute('aria-disabled')).toBe('true');
    const reason = document.getElementById(more.getAttribute('aria-describedby') ?? '');
    expect(reason?.textContent).toBe('已顯示 1 / 3 筆・更新失敗');
  });

  // 兩張卡並發：第一次重讀落地成空、第二次重讀失敗——「有過資料但清單為空」之後的錯誤區。
  it('有過資料但清單為空時，錯誤區重試途中留在原位，不閃出空狀態', async () => {
    const { calls, load } = heldQueue();
    const writes = new Map([
      ['u1', deferred<void>()],
      ['u2', deferred<void>()],
    ]);
    const submitReview = vi.fn(
      (userId: string) => writes.get(userId)?.promise ?? Promise.resolve(),
    );
    renderQueue({ loadReviews: load, submitReview });
    await act(async () => calls[0].d.resolve(twoReviews()));
    fireEvent.click(within(cardOf('王小明')).getByRole('button', { name: '通過' }));
    fireEvent.click(within(cardOf('李小華')).getByRole('button', { name: '通過' }));
    await act(async () => writes.get('u1')?.resolve());
    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () => calls[1].d.resolve({ reviews: [], total: 0 }));
    expect(screen.getByText('目前沒有待審核的證件')).toBeTruthy();
    await act(async () => writes.get('u2')?.resolve());
    await waitFor(() => expect(calls).toHaveLength(3));
    await act(async () => calls[2].d.reject(new Error('連線中斷')));

    const retry = within(queue()).getByRole('button', { name: '重試' });
    fireEvent.click(retry);
    expect(screen.getByText('正在更新…')).toBeTruthy();
    expect(screen.queryByText('目前沒有待審核的證件')).toBeNull();
    expect(retry.isConnected).toBe(true);
  });
});

describe('IdReviewQueue 動作', () => {
  it('通過成功後佇列上方回報「已通過：〈姓名〉」，畫面上只出現一次', async () => {
    renderQueue();
    await screen.findByText('王小明');
    fireEvent.click(screen.getByRole('button', { name: '通過' }));
    expect(await screen.findByText('已通過：王小明')).toBeTruthy();
    expect(screen.getAllByText('已通過：王小明')).toHaveLength(1);
  });

  it('退回成功後回報「已退回：〈姓名〉」', async () => {
    renderQueue();
    await screen.findByText('王小明');
    fireEvent.click(screen.getByRole('button', { name: '退回' }));
    fireEvent.change(await screen.findByLabelText('退回理由'), { target: { value: '反光' } });
    fireEvent.click(screen.getByRole('button', { name: '確認退回' }));
    expect(await screen.findByText('已退回：王小明')).toBeTruthy();
  });

  it('沒有失敗時不渲染錯誤區', async () => {
    renderQueue();
    await screen.findByText('王小明');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('通過被後端拒絕時錯誤區寫原文並前綴姓名、取得焦點，佇列背景重讀一次', async () => {
    const load = vi.fn(async () => ({ reviews: [review()], total: 1 }));
    renderQueue({
      loadReviews: load,
      submitReview: async () => {
        throw rejected('這位會員已被其他管理員審核');
      },
    });
    await screen.findByText('王小明');
    load.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '通過' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('王小明：這位會員已被其他管理員審核');
    await waitFor(() => expect(document.activeElement).toBe(alert));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('status', { name: '載入審核佇列中' })).toBeNull();
  });

  it('通過沒收到伺服器確認時寫固定文案，並重讀一次', async () => {
    const load = vi.fn(async () => ({ reviews: [review()], total: 1 }));
    renderQueue({
      loadReviews: load,
      submitReview: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await screen.findByText('王小明');
    load.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '通過' }));
    expect(
      await screen.findByText('王小明：未收到伺服器確認，結果不明，佇列更新後請確認'),
    ).toBeTruthy();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  });

  it('另一張卡的動作在途時，這張卡的通過與退回照常可按（不受閘門約束）', async () => {
    const pending = deferred<void>();
    renderQueue({ loadReviews: async () => twoReviews(), submitReview: () => pending.promise });
    await screen.findByText('李小華');
    fireEvent.click(within(cardOf('王小明')).getByRole('button', { name: '通過' }));
    const approve = within(cardOf('李小華')).getByRole('button', { name: '通過' });
    expect(approve.hasAttribute('disabled')).toBe(false);
    expect(approve.getAttribute('aria-disabled')).toBeNull();
    await act(async () => pending.resolve());
  });

  it('姓名空白的會員以 Email 稱呼：卡片標題與退回確認框', async () => {
    renderQueue({ loadReviews: async () => ({ reviews: [review({ name: '  ' })], total: 1 }) });
    const card = await screen.findByRole('group', { name: /a@b\.c/ });
    expect(within(card).getByRole('heading', { name: 'a@b.c' })).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: '退回' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('退回 a@b.c 的證件')).toBeTruthy();
  });

  // §12.11 次要左、主要右；手機兩顆等寬、桌機靠右（業主裁決 C）。
  it('退回在左、通過在右，手機兩顆等寬、桌機靠右', async () => {
    renderQueue();
    const card = await screen.findByRole('group', { name: /王小明/ });
    const reject = within(card).getByRole('button', { name: '退回' });
    const approve = within(card).getByRole('button', { name: '通過' });
    expect(reject.compareDocumentPosition(approve) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const row = reject.parentElement as HTMLElement;
    expect(row).toBe(approve.parentElement);
    for (const token of ['grid', 'grid-cols-2', 'sm:flex', 'sm:justify-end']) {
      expect(row.classList.contains(token), token).toBe(true);
    }
  });
});

describe('IdReviewQueue 焦點後備與 busy', () => {
  it('載入到最後一頁、「載入更多」消失時焦點移到佇列區，不掉到 body', async () => {
    renderQueue({
      loadReviews: async ({ offset }) =>
        offset > 0
          ? { reviews: [review({ userId: 'u2', name: '李小華', email: 'lee@b.c' })], total: 2 }
          : { reviews: [review()], total: 2 },
    });
    const more = await screen.findByRole('button', { name: '載入更多' });
    more.focus();
    fireEvent.click(more);
    await waitFor(() => expect(more.isConnected).toBe(false));
    expect(document.activeElement).toBe(queue());
  });

  it('通過後焦點落在該卡；那張卡因重讀離開佇列時移到下一張', async () => {
    const { calls, load } = heldQueue();
    renderQueue({ loadReviews: load });
    await act(async () => calls[0].d.resolve(twoReviews()));
    fireEvent.click(within(cardOf('王小明')).getByRole('button', { name: '通過' }));
    await waitFor(() => expect(document.activeElement).toBe(cardOf('王小明')));

    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () =>
      calls[1].d.resolve({
        reviews: [review({ userId: 'u2', name: '李小華', email: 'lee@b.c' })],
        total: 1,
      }),
    );
    expect(document.activeElement).toBe(cardOf('李小華'));
  });

  it('最後一張卡審完、佇列清空時焦點移到佇列區', async () => {
    const { calls, load } = heldQueue();
    renderQueue({ loadReviews: load });
    await act(async () => calls[0].d.resolve({ reviews: [review()], total: 1 }));
    fireEvent.click(screen.getByRole('button', { name: '通過' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () => calls[1].d.resolve({ reviews: [], total: 0 }));
    expect(document.activeElement).toBe(queue());
  });

  it('取消退回時焦點回到退回鈕', async () => {
    renderQueue();
    await screen.findByText('王小明');
    const trigger = screen.getByRole('button', { name: '退回' });
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('button', { name: '取消' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('寫入期間呼叫 busy，寫入一結算就釋放', async () => {
    const busy = fakeBusy();
    const pending = deferred<void>();
    renderQueue({ busy, submitReview: () => pending.promise });
    await screen.findByText('王小明');
    fireEvent.click(screen.getByRole('button', { name: '通過' }));
    await waitFor(() => expect(busy.startWrite).toHaveBeenCalledTimes(1));
    expect(busy.release).not.toHaveBeenCalled();
    await act(async () => pending.resolve());
    expect(busy.release).toHaveBeenCalledTimes(1);
  });
});
