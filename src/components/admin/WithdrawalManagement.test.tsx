// @vitest-environment jsdom
//
// 提領作業台。這支測試守的是**匯款這件事實際怎麼做**，不是「畫面有沒有渲染」：
//
//   1. **同屏**（W1）——admin 開著網銀打字，姓名／身分證／銀行代號／帳號／
//      匯款金額必須同時在眼前，帳號還要能一鍵複製。要捲動或點開才看得到，
//      就是逼人在兩個視窗間來回對帳，那正是打錯帳號的來源。
//   2. **批次確認要列姓名**（§4 危險動作）——這個動作不可回退，金額相近時
//      光看「12 筆共 $36,000」不會露出異常，看到名字才會。
//   3. **「全選」限已載入頁**——悄悄擴大到未載入的頁，等於使用者以為勾了 20 筆
//      實際送出 200 筆。
//   4. **手機鎖「標記已匯款」**（W8）——那個動作需要同時開著網銀，手機上做
//      不到；但退件與代為完成是客服當下就該能處理的事，不該一起鎖。
//   5. **不得靜默截斷**（ui-ux-guidelines §5）——「已顯示 X / Y 筆」。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AdminWithdrawalRecord, AdminWithdrawalsResponse } from '@contract';
import { stubMediaQuery, stubMediaQueryWithControl } from '../../test-utils/stubMediaQuery';
import { WithdrawalManagement, type WithdrawalQuery } from './WithdrawalManagement';

afterEach(cleanup);

type Page = AdminWithdrawalsResponse['data'];

beforeEach(() => {
  stubMediaQuery(true);
  // jsdom 沒有 Blob URL API；CSV 下載會用到它。不替身掉會變成 unhandled
  // error，讓整個檔案的結果失去可信度（vitest 自己也會這麼警告）。
  URL.createObjectURL = () => 'blob:test';
  URL.revokeObjectURL = () => {};
});

function record(over: Partial<AdminWithdrawalRecord> = {}): AdminWithdrawalRecord {
  return {
    id: 'w1',
    userId: 'u1',
    userName: '王小明',
    userPhone: '0912345678',
    idNumber: 'A123456789',
    amount: 1000,
    fee: 15,
    status: 'pending',
    bankCode: '822',
    bankAccount: '1234567890123',
    note: null,
    events: [],
    requestedAt: '2026-08-01T02:00:00Z',
    processedAt: null,
    completedAt: null,
    idCardFrontUrl: null,
    idCardBackUrl: null,
    ...over,
  };
}

function page(over: Partial<Page> = {}): Page {
  const withdrawals = over.withdrawals ?? [record()];
  return {
    withdrawals,
    total: over.total ?? withdrawals.length,
    limit: over.limit ?? 50,
    offset: over.offset ?? 0,
    stats: over.stats ?? {
      pendingAmount: 1000,
      byStatus: { pending: 1, awaiting_collection: 0, completed: 0, rejected: 0 },
    },
  };
}

function renderConsole(
  opts: {
    loadWithdrawals?: (params: WithdrawalQuery) => Promise<Page>;
    updateStatus?: (id: string, status: string, note?: string, bankRef?: string) => Promise<void>;
    batchMarkPaid?: (
      items: { id: string; bankRef?: string }[],
    ) => Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }>;
  } = {},
) {
  return render(
    <WithdrawalManagement
      loadWithdrawals={opts.loadWithdrawals ?? (async () => page())}
      updateStatus={opts.updateStatus ?? (async () => {})}
      batchMarkPaid={opts.batchMarkPaid ?? (async () => ({ succeeded: [], failed: [] }))}
    />,
  );
}

describe('WithdrawalManagement', () => {
  it('取資料期間顯示載入態', async () => {
    let resolve!: (v: Page) => void;
    const pendingPage = new Promise<Page>((r) => {
      resolve = r;
    });
    renderConsole({ loadWithdrawals: () => pendingPage });

    expect(screen.getByRole('status', { name: '載入提領申請中' })).toBeTruthy();
    resolve(page({ withdrawals: [] }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('取資料失敗時顯示錯誤態並提供重試', async () => {
    const load = vi
      .fn<(params: WithdrawalQuery) => Promise<Page>>()
      .mockRejectedValueOnce(new Error('連線失敗'))
      .mockResolvedValueOnce(page());
    renderConsole({ loadWithdrawals: load });

    await screen.findByText('連線失敗');
    fireEvent.click(screen.getByRole('button', { name: '重試' }));
    // findAllByText：重試成功後姓名同時出現在同屏作業面板與表格列，
    // 而那正是 W1 要的形狀，不是重複渲染的瑕疵。
    await screen.findAllByText('王小明');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('沒有任何申請時顯示空態而非空白表格', async () => {
    renderConsole({ loadWithdrawals: async () => page({ withdrawals: [], total: 0 }) });
    expect(await screen.findByText('目前沒有提領申請')).toBeTruthy();
  });

  it('作業面板同屏顯示姓名、身分證、銀行代號、帳號與匯款金額', async () => {
    renderConsole();
    const panel = await screen.findByRole('region', { name: '匯款作業面板' });

    expect(within(panel).getByText('王小明')).toBeTruthy();
    expect(within(panel).getByText('A123456789')).toBeTruthy();
    expect(within(panel).getByText('822')).toBeTruthy();
    expect(within(panel).getByText('1234567890123')).toBeTruthy();
    expect(within(panel).getByText('$1,000')).toBeTruthy();
  });

  it('收款帳號可一鍵複製', async () => {
    // 攔 execCommand 而非 navigator.clipboard：後者是 src/utils/clipboard.ts
    // **刻意排除**的路徑（LINE 等 in-app 瀏覽器會擋掉，而本專案使用者大量
    // 從 LINE 進來）。攔錯層就等於在作業台重新引入階段 2.2 排掉的失效模式。
    const copied: string[] = [];
    document.execCommand = vi.fn(() => {
      copied.push((document.activeElement as HTMLTextAreaElement)?.value ?? '');
      return true;
    });
    renderConsole();

    const panel = await screen.findByRole('region', { name: '匯款作業面板' });
    fireEvent.click(within(panel).getByRole('button', { name: '複製收款帳號' }));
    await waitFor(() => expect(copied).toContain('1234567890123'));
  });

  it('待匯款總額用匯款金額加總，不含平台收的手續費', async () => {
    renderConsole({
      loadWithdrawals: async () =>
        page({
          withdrawals: [record(), record({ id: 'w2', userName: '李小華' })],
          stats: {
            pendingAmount: 2000,
            byStatus: { pending: 2, awaiting_collection: 0, completed: 0, rejected: 0 },
          },
        }),
    });

    const stats = await screen.findByRole('region', { name: '提領彙總' });
    expect(within(stats).getByText('$2,000')).toBeTruthy();
  });

  // CSV 匯出（W6）。這兩條是補階段 2.7 的缺陷：當時匯出的是「已載入的列」，
  // 而畫面同時寫著「已顯示 50 / 300」——admin 拿到的是一份殘缺檔案，而且
  // **沒有任何跡象告訴他這件事**。給半份比明示拒絕糟得多，因為對帳是拿這份
  // 檔案去比銀行的轉出紀錄，少的那些不會自己浮出來。
  it('匯出涵蓋整個篩選結果，不是只有已載入的那頁', async () => {
    const pages = vi.fn(async ({ offset }: { offset: number }) =>
      page({
        withdrawals: [record({ id: `w${offset}`, userName: `會員${offset}` })],
        total: 3,
        limit: 1,
        offset,
      }),
    );
    renderConsole({ loadWithdrawals: pages as never });

    await screen.findByText('已顯示 1 / 3 筆');
    pages.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '下載CSV' }));

    // 匯出必須自己把剩下的頁補齊，而不是拿畫面上現有的那筆交差。
    await waitFor(() => expect(pages.mock.calls.length).toBeGreaterThan(1));
  });

  it('篩選結果超過匯出上限時明示拒絕，不給半份檔案', async () => {
    renderConsole({
      loadWithdrawals: async () => page({ withdrawals: [record()], total: 2500 }),
    });

    await screen.findByText('已顯示 1 / 2500 筆');
    fireEvent.click(screen.getByRole('button', { name: '下載CSV' }));

    expect(await screen.findByText(/超過匯出上限/)).toBeTruthy();
  });

  it('列表顯示已顯示筆數與總筆數，未載完時提供加載更多', async () => {
    renderConsole({
      loadWithdrawals: async () => page({ withdrawals: [record()], total: 37 }),
    });

    expect(await screen.findByText('已顯示 1 / 37 筆')).toBeTruthy();
    expect(screen.getByRole('button', { name: '載入更多' })).toBeTruthy();
  });

  it('全選只勾已載入的頁，計數說出實際勾選筆數', async () => {
    renderConsole({
      loadWithdrawals: async () =>
        page({
          withdrawals: [record(), record({ id: 'w2', userName: '李小華' })],
          total: 37,
        }),
    });

    fireEvent.click(await screen.findByRole('checkbox', { name: '全選本頁的提領記錄' }));
    // 總共 37 筆，但只載入 2 筆——全選不得悄悄擴大到未載入的頁
    expect(screen.getByText('已選取 2 筆')).toBeTruthy();
  });

  it('批次確認框列出受影響會員姓名，不只給筆數與總額', async () => {
    renderConsole({
      loadWithdrawals: async () =>
        page({ withdrawals: [record(), record({ id: 'w2', userName: '李小華' })] }),
    });

    fireEvent.click(await screen.findByRole('checkbox', { name: '全選本頁的提領記錄' }));
    fireEvent.click(screen.getByRole('button', { name: '批次標記已匯款' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/王小明/)).toBeTruthy();
    expect(within(dialog).getByText(/李小華/)).toBeTruthy();
  });

  it('逐筆 checkbox 的 aria-label 帶會員姓名', async () => {
    renderConsole();
    expect(await screen.findByRole('checkbox', { name: '選取 王小明 的提領記錄' })).toBeTruthy();
  });

  it('手機上不顯示標記已匯款，但退件與代為完成照樣可用', async () => {
    stubMediaQuery(false);
    // 兩筆記錄各帶自己的前置狀態：退件只在 pending 可用、代為完成只在
    // awaiting_collection 可用。plan §1.4 不做 awaiting_collection → rejected，
    // 所以一筆記錄不可能同時長出這兩顆鍵。
    renderConsole({
      loadWithdrawals: async () =>
        page({
          withdrawals: [record(), record({ id: 'w2', status: 'awaiting_collection' })],
        }),
    });

    await screen.findAllByText('王小明');
    expect(screen.queryByRole('button', { name: '標記已匯款' })).toBeNull();
    expect(screen.getByRole('button', { name: '退件' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '代為完成' })).toBeTruthy();
  });

  it('桌機上待處理的申請看得到標記已匯款', async () => {
    renderConsole();
    expect(await screen.findByRole('button', { name: '標記已匯款' })).toBeTruthy();
  });

  // 這條原本名叫「確認後才送出並帶理由」，斷言卻是 `..., 'rejected', undefined)`
  // ——名字宣稱的行為與斷言證明的行為相反，等於把「退件不帶理由」錄成預期。
  // 後端對 rejected 強制要求非空 note，所以那個實作在正式環境每次都 400，
  // 而三層測試（元件 mock、mock e2e、journey 的 page object）都攔不到。
  it('退件沒填理由時送不出去', async () => {
    const update = vi.fn(async () => {});
    renderConsole({ updateStatus: update });

    fireEvent.click(await screen.findByRole('button', { name: '退件' }));
    const confirm = await screen.findByRole('button', { name: '確認退件' });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('請填寫退件理由')).toBeTruthy();
    fireEvent.click(confirm);
    expect(update).not.toHaveBeenCalled();
  });

  it('退件把 admin 填的理由送到後端', async () => {
    const update = vi.fn(async () => {});
    renderConsole({ updateStatus: update });

    fireEvent.click(await screen.findByRole('button', { name: '退件' }));
    fireEvent.change(screen.getByLabelText('退件理由'), {
      target: { value: '收款帳號與身分證姓名不符' },
    });
    fireEvent.click(screen.getByRole('button', { name: '確認退件' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('w1', 'rejected', '收款帳號與身分證姓名不符', undefined),
    );
    expect(await screen.findByText(/已退件/)).toBeTruthy();
  });

  it('代為完成走確認框，明示會員端會看到是管理員結案', async () => {
    const update = vi.fn(async () => {});
    renderConsole({
      loadWithdrawals: async () =>
        page({ withdrawals: [record({ status: 'awaiting_collection' })] }),
      updateStatus: update,
    });

    fireEvent.click(await screen.findByRole('button', { name: '代為完成' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/管理員代為完成/)).toBeTruthy();
    // 理由由 admin 自己寫：稽核要答得出「憑什麼認定會員已收到錢」，
    // 寫死一句固定文案只是機械滿足後端的非空檢查。
    fireEvent.change(within(dialog).getByLabelText('代為結案理由'), {
      target: { value: '2026-08-01 致電確認，會員回覆已收到款項' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '確認代為完成' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        'w1',
        'completed',
        '2026-08-01 致電確認，會員回覆已收到款項',
        undefined,
      ),
    );
  });

  it('狀態更新失敗時把原因說出來', async () => {
    renderConsole({
      updateStatus: async () => {
        throw new Error('這筆已被其他管理員處理');
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: '退件' }));
    fireEvent.change(screen.getByLabelText('退件理由'), { target: { value: '資料有誤' } });
    fireEvent.click(screen.getByRole('button', { name: '確認退件' }));
    expect(await screen.findByText(/這筆已被其他管理員處理/)).toBeTruthy();
  });

  it('批次有失敗時說出成功與失敗各幾筆，不只說失敗', async () => {
    renderConsole({
      loadWithdrawals: async () =>
        page({ withdrawals: [record(), record({ id: 'w2', userName: '李小華' })] }),
      batchMarkPaid: async () => ({ succeeded: ['w1'], failed: [{ id: 'w2', error: 'x' }] }),
    });

    fireEvent.click(await screen.findByRole('checkbox', { name: '全選本頁的提領記錄' }));
    fireEvent.click(screen.getByRole('button', { name: '批次標記已匯款' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認批次匯款' }));

    // 「1 筆成功、1 筆失敗」比「批次失敗」有用得多：admin 知道要重做哪一筆。
    expect(await screen.findByText(/1 筆成功、1 筆失敗/)).toBeTruthy();
  });

  it('標記已匯款可帶交易序號，那是唯一能跟銀行對帳的錨點', async () => {
    const update = vi.fn(async () => {});
    renderConsole({ updateStatus: update });

    fireEvent.click(await screen.findByRole('button', { name: '標記已匯款' }));
    fireEvent.change(screen.getByLabelText('交易序號'), { target: { value: 'TX20260801001' } });
    fireEvent.click(screen.getByRole('button', { name: '確認匯款' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('w1', 'awaiting_collection', undefined, 'TX20260801001'),
    );
  });

  it('標記已匯款後畫面回報「已標記匯款完成」並帶上該會員', async () => {
    // 「送出的參數對」與「畫面真的說了什麼」是兩件事：上一條驗前者，這條驗
    // 後者。原本後者由 admin 的 e2e 情境守（斷言同一串「已標記匯款完成」），
    // 那條情境刪掉時一度沒有任何一層接手——按鈕可見、參數正確，都證不到
    // admin 按完之後畫面有沒有回話。帶會員姓名是因為這個動作不可回退，
    // 「對誰做的」比「做了幾筆」重要。
    renderConsole({ updateStatus: async () => {} });

    fireEvent.click(await screen.findByRole('button', { name: '標記已匯款' }));
    fireEvent.click(screen.getByRole('button', { name: '確認匯款' }));

    expect(await screen.findByText(/已標記匯款完成：王小明/)).toBeTruthy();
  });

  it('交易序號留空時不送出空字串', async () => {
    const update = vi.fn(async () => {});
    renderConsole({ updateStatus: update });

    fireEvent.click(await screen.findByRole('button', { name: '標記已匯款' }));
    fireEvent.click(screen.getByRole('button', { name: '確認匯款' }));
    // 選填就是選填：空字串進資料庫會變成「有填但填了空白」，比 null 難查。
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith('w1', 'awaiting_collection', undefined, undefined),
    );
  });

  it('尚無轉換紀錄時歷史對話框說出來，不留空清單', async () => {
    renderConsole();
    fireEvent.click(await screen.findByRole('button', { name: '查看歷史' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('尚無轉換紀錄')).toBeTruthy();
  });

  it('載入更多把下一頁接在後面', async () => {
    renderConsole({
      loadWithdrawals: async ({ offset }: { offset: number }) =>
        page({ withdrawals: [record({ id: `w${offset}` })], total: 2 }),
    });

    await screen.findByText('已顯示 1 / 2 筆');
    fireEvent.click(screen.getByRole('button', { name: '載入更多' }));
    await screen.findByText('已顯示 2 / 2 筆');
  });

  it('手機上完全沒有批次匯款這條路徑——連勾選框都不渲染', async () => {
    stubMediaQuery(false);
    renderConsole({
      loadWithdrawals: async () =>
        page({ withdrawals: [record(), record({ id: 'w2', userName: '李小華' })] }),
    });
    await screen.findByText('李小華');

    // 這條測試原本是「勾了之後批次鍵不出現」——當時手機仍渲染勾選框。
    // Q2 裁決後手機不再渲染它（勾選唯一的下游是批次匯款，而批次鎖在桌面
    // ＝ 留一個按了沒有用的控制項）。它保護的行為（W8:手機不得有批次匯款
    // 路徑）沒有變，而且變得更強:現在連入口都不存在。
    expect(screen.queryByRole('checkbox', { name: '全選本頁的提領記錄' })).toBeNull();
    expect(screen.queryByRole('button', { name: '批次標記已匯款' })).toBeNull();
  });

  it('事件歷史顯示交易序號與會員本人的動作', async () => {
    renderConsole({
      loadWithdrawals: async () =>
        page({
          withdrawals: [
            record({
              status: 'completed',
              events: [
                {
                  fromStatus: 'awaiting_collection',
                  toStatus: 'completed',
                  note: null,
                  bankRef: 'TX20260801001',
                  transferredOn: '2026-08-01',
                  byAdmin: false,
                  createdAt: '2026-08-01T05:00:00Z',
                },
              ],
            }),
          ],
        }),
    });

    fireEvent.click(await screen.findByRole('button', { name: '查看歷史' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/TX20260801001/)).toBeTruthy();
    // 誰按的要看得出來——admin 代為結案與會員本人查收是兩件事。
    expect(within(dialog).getByText(/會員本人/)).toBeTruthy();
  });

  it('事件歷史逐筆列出轉換與說明，手機同樣看得到', async () => {
    stubMediaQuery(false);
    renderConsole({
      loadWithdrawals: async () =>
        page({
          withdrawals: [
            record({
              status: 'rejected',
              note: '收款帳號與身分證姓名不符',
              events: [
                {
                  fromStatus: 'pending',
                  toStatus: 'rejected',
                  note: '收款帳號與身分證姓名不符',
                  bankRef: null,
                  transferredOn: null,
                  byAdmin: true,
                  createdAt: '2026-08-01T03:00:00Z',
                },
              ],
            }),
          ],
        }),
    });

    fireEvent.click(await screen.findByRole('button', { name: '查看歷史' }));
    const history = await screen.findByRole('dialog');
    expect(within(history).getByText(/收款帳號與身分證姓名不符/)).toBeTruthy();
  });
});

// --- 手機版（階段 2） --------------------------------------------------------
//
// 這一組全部跑在 `stubMediaQuery(false)` 底下。守的是「表格換成卡片時，
// **互動不能被悄悄拿掉**」——排版變更最危險的失效方式不是版面難看，是某個
// 只存在於 <tr> 結構裡的職責在轉卡片時蒸發了（審查 F1）。
describe('WithdrawalManagement 跨斷點', () => {
  it('視窗從桌面縮到手機時清空已選取的筆數', async () => {
    // useMediaQuery 是即時訂閱 change 事件的。Q2 裁決手機不渲染勾選框，
    // 但 selected 不會自己消失——「已選取 N 筆」橫幅還在、卻沒有任何逐筆
    // 取消的入口。不會寫壞資料（批次動作仍鎖在 isDesktop 之後），但那是
    // 一個看得到、動不了的殭屍狀態（審查 R7）。
    const setDesktop = stubMediaQueryWithControl(true);
    renderConsole({
      loadWithdrawals: async () =>
        page({ withdrawals: [record(), record({ id: 'w2', userName: '李小華' })] }),
    });
    fireEvent.click(await screen.findByRole('checkbox', { name: '全選本頁的提領記錄' }));
    expect(screen.getByText('已選取 2 筆')).toBeTruthy();

    act(() => setDesktop(false));
    await waitFor(() => expect(screen.queryByText('已選取 2 筆')).toBeNull());
  });
});

describe('WithdrawalManagement 手機版', () => {
  beforeEach(() => {
    stubMediaQuery(false);
  });

  it('不渲染 table，改以每筆一張卡呈現', async () => {
    const { container } = renderConsole();
    await screen.findByText('王小明');
    expect(container.querySelector('table')).toBeNull();
  });

  it('每張卡都帶會員、匯款金額與狀態，資訊量不低於桌面表格的關鍵欄位', async () => {
    renderConsole();
    const card = await screen.findByRole('group', { name: /王小明/ });
    expect(within(card).getByText('王小明')).toBeTruthy();
    expect(within(card).getByText(/1,000/)).toBeTruthy();
    expect(within(card).getByText('待處理')).toBeTruthy();
  });

  it('展開鍵把該筆設為作業對象並就地顯示匯款五欄', async () => {
    renderConsole({
      loadWithdrawals: async () =>
        page({
          withdrawals: [
            record({ id: 'w-1', userName: '甲會員' }),
            record({ id: 'w-2', userName: '乙會員', bankAccount: '99988877766' }),
          ],
        }),
    });
    const card = await screen.findByRole('group', { name: /乙會員/ });
    fireEvent.click(within(card).getByRole('button', { name: '匯款資訊' }));
    // 第二筆的帳號要出現——出現代表 activeId 真的被寫進去了。若卡片沒有接手
    // setActiveId，畫面永遠停在 withdrawals[0]（甲會員）。
    await waitFor(() => expect(within(card).getByText('99988877766')).toBeTruthy());
  });

  it('展開鍵是按鈕，鍵盤可達', async () => {
    renderConsole();
    const card = await screen.findByRole('group', { name: /王小明/ });
    const trigger = within(card).getByRole('button', { name: '匯款資訊' });
    expect(trigger.tagName).toBe('BUTTON');
  });

  it('已展開的卡片再點一次會收合', async () => {
    // onOpenChange 收到的是「使用者想要的結果」（目前 open 的相反值），
    // 忽略它會讓卡片永遠關不掉——setActiveId(w.id) 在 activeId 已是 w.id 時
    // 不改變任何狀態。aria-expanded 也會跟著說謊。
    renderConsole();
    const card = await screen.findByRole('group', { name: /王小明/ });
    const trigger = within(card).getByRole('button', { name: '匯款資訊' });

    fireEvent.click(trigger);
    await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'));
    fireEvent.click(trigger);
    await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('false'));
  });
});
