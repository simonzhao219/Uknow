// @vitest-environment jsdom
//
// 會員查詢台。
//
//   1. **統計卡說的是全站，不是當前頁**（M2）。改版前是
//      `members.filter(m => m.suspended).length`——那個數字會隨分頁改變。
//      admin 看到「暫停 3 人」就會據此判斷要不要處理，第 2 頁還有 5 個他
//      永遠不知道。後端在階段 3.1 已經把全站 `stats` 送上來了。
//   2. **不得靜默截斷**（ui-ux-guidelines §5）——「已顯示 X / Y 筆」＋加載更多。
//   3. **詳情面板要答得出「我提領怎麼還沒到」**（M1）：§1.1 的頭號客服情境。
//   4. **會改變狀態的動作全部只在詳情面板裡，且走同一條路徑**
//      （ui-ux-guidelines §11）：停權與授予管理員是同一類事——**對一個人做的
//      判斷**，不是對一筆資料做的修改。同類的東西用同一套邏輯與設計：同一個
//      確認框、同一個執行器、同一處錯誤顯示。列上只有「查看」。
//   5. **確認框逐方向看破壞力**（M4）：暫停／授予／撤銷都要確認，只有「恢復」
//      不收（破壞力 ~0）。授予在資料層面不可逆——他當下就讀得到全站身分證與
//      收款帳號，撤回權限撤不回已經看過的東西。失敗時要說出是哪一種失敗。
//   6. 空／錯／載入三態。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AdminMember, AdminMemberDetail, AdminMembersResponse } from '@contract';
import { stubMediaQuery } from '../../test-utils/stubMediaQuery';
import { MemberManagement } from './MemberManagement';

afterEach(cleanup);

// MemberManagement 從階段 3 起用 useMediaQuery 決定表格/卡片，而 jsdom 沒有
// matchMedia——沒有替身整個檔案會炸，而那個紅燈不代表任何真實缺陷
// （plan §7 風險表已預期）。預設回「桌機」，手機情境的 describe 自己覆寫。
beforeEach(() => {
  stubMediaQuery(true);
});

type Page = AdminMembersResponse['data'];

function member(over: Partial<AdminMember> = {}): AdminMember {
  return {
    id: 'm1',
    name: '陳大文',
    email: 'a@b.c',
    phone: '0912345678',
    isAdmin: false,
    suspended: false,
    suspendedAt: null,
    accountStatus: 'active',
    endDate: '2027-01-01T00:00:00Z',
    idVerificationStatus: 'none',
    listingCount: 0,
    createdAt: '2026-07-01T00:00:00Z',
    ...over,
  };
}

function page(over: Partial<Page> = {}): Page {
  const members = over.members ?? [member()];
  return {
    members,
    total: over.total ?? members.length,
    stats: over.stats ?? { total: 1, active: 1, expired: 0, suspended: 0, admins: 0 },
  };
}

function detail(over: Partial<AdminMemberDetail> = {}): AdminMemberDetail {
  return {
    id: 'm1',
    name: '陳大文',
    email: 'a@b.c',
    phone: '0912345678',
    isAdmin: false,
    suspended: false,
    suspendedAt: null,
    createdAt: '2026-07-01T00:00:00Z',
    accountStatus: 'active',
    endDate: '2027-01-01T00:00:00Z',
    idVerificationStatus: 'approved',
    idRejectReason: null,
    idNumber: 'A12****789',
    bankCode: '822',
    bankAccount: '*********0123',
    referrerName: '王小明',
    directChildCount: 2,
    listingCount: 1,
    availablePoints: 3000,
    pendingPoints: 0,
    withdrawnPoints: 1000,
    recentWithdrawals: [],
    ...over,
  };
}

function renderConsole(
  opts: {
    loadMembers?: (params: Record<string, unknown>) => Promise<Page>;
    loadMemberDetail?: (id: string) => Promise<AdminMemberDetail>;
    setMemberAdmin?: (id: string, isAdmin: boolean) => Promise<void>;
    suspendMember?: (id: string, suspend: boolean) => Promise<void>;
  } = {},
) {
  return render(
    <MemberManagement
      loadMembers={opts.loadMembers ?? (async () => page())}
      loadMemberDetail={opts.loadMemberDetail ?? (async () => detail())}
      setMemberAdmin={opts.setMemberAdmin ?? (async () => {})}
      suspendMember={opts.suspendMember ?? (async () => {})}
      loadIdReviews={async () => ({ reviews: [], total: 0 })}
      submitIdReview={async () => {}}
    />,
  );
}

describe('MemberManagement', () => {
  it('取資料期間顯示載入態', async () => {
    let resolve!: (v: Page) => void;
    const pending = new Promise<Page>((r) => {
      resolve = r;
    });
    renderConsole({ loadMembers: () => pending });

    expect(screen.getByRole('status', { name: '載入會員列表中' })).toBeTruthy();
    resolve(page({ members: [] }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('取資料失敗時顯示錯誤態並提供重試', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('連線失敗')).mockResolvedValueOnce(page());
    renderConsole({ loadMembers: load });

    await screen.findByText('連線失敗');
    fireEvent.click(screen.getByRole('button', { name: '重試' }));
    await screen.findAllByText('陳大文');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('沒有任何會員時顯示空態', async () => {
    renderConsole({ loadMembers: async () => page({ members: [], total: 0 }) });
    expect(await screen.findByText('沒有符合條件的會員')).toBeTruthy();
  });

  it('統計卡顯示全站數字，不是當前頁的加總', async () => {
    renderConsole({
      loadMembers: async () =>
        page({
          // 當前頁只有 1 筆、且沒有停權者；全站有 7 個停權、3 個管理員。
          members: [member()],
          total: 120,
          stats: { total: 120, active: 100, expired: 13, suspended: 7, admins: 3 },
        }),
    });

    const stats = await screen.findByRole('region', { name: '會員統計' });
    expect(within(stats).getByText('120')).toBeTruthy();
    expect(within(stats).getByText('7')).toBeTruthy();
    expect(within(stats).getByText('3')).toBeTruthy();
  });

  it('列表顯示已顯示筆數與總筆數，未載完時提供加載更多', async () => {
    renderConsole({
      loadMembers: async () => page({ members: [member()], total: 42 }),
    });

    expect(await screen.findByText('已顯示 1 / 42 筆')).toBeTruthy();
    expect(screen.getByRole('button', { name: '載入更多' })).toBeTruthy();
  });

  it('點會員開詳情，看得到近期提領記錄與退件理由', async () => {
    renderConsole({
      loadMemberDetail: async () =>
        detail({
          recentWithdrawals: [
            {
              id: 'w1',
              amount: 1000,
              fee: 15,
              status: 'rejected',
              note: '收款帳號與身分證姓名不符',
              requestedAt: '2026-08-01T00:00:00Z',
              processedAt: '2026-08-01T02:00:00Z',
              completedAt: null,
            },
          ],
        }),
    });

    fireEvent.click(await screen.findByRole('button', { name: /查看 陳大文/ }));
    const panel = await screen.findByRole('dialog');
    // §1.1 的頭號客服情境「我提領怎麼還沒到」——答案要在這個面板裡。
    expect(within(panel).getByText(/收款帳號與身分證姓名不符/)).toBeTruthy();
  });

  it('詳情面板的身分證與銀行帳號是遮罩值', async () => {
    renderConsole();
    fireEvent.click(await screen.findByRole('button', { name: /查看 陳大文/ }));
    const panel = await screen.findByRole('dialog');

    expect(within(panel).getByText('A12****789')).toBeTruthy();
    expect(within(panel).queryByText('A123456789')).toBeNull();
  });

  it('停權確認後重抓列表', async () => {
    const load = vi.fn(async () => page({ members: [member({ suspended: false })] }));
    const suspend = vi.fn(async () => {});
    renderConsole({ loadMembers: load, suspendMember: suspend });

    const panel = await openDetail();
    fireEvent.click(within(panel).getByRole('button', { name: '暫停' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認暫停' }));
    await waitFor(() => expect(suspend).toHaveBeenCalledWith('m1', true));
    // 重抓而不是就地改：停權會連帶影響刊登可見性等衍生欄位，本地猜測會失真。
    await waitFor(() => expect(load.mock.calls.length).toBeGreaterThan(1));
  });

  // 停權會立刻凍結對方的刊登可見性與提領（規格書 §5.2），誤觸的代價落在
  // 會員身上而不是 admin 身上——他不會知道自己被停過。
  it('停權走確認框，取消不送出', async () => {
    const suspend = vi.fn(async () => {});
    renderConsole({ suspendMember: suspend });

    const panel = await openDetail();
    fireEvent.click(within(panel).getByRole('button', { name: '暫停' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/刊登將立即隱藏/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(suspend).not.toHaveBeenCalled();
  });

  // 四個方向裡只有「恢復」的破壞力是 ~0（把凍結的東西還回去）。可逆又無傷的
  // 動作也收確認框，只會把確認框訓練成無腦點掉的一步，真正危險的那次就攔不住。
  it('恢復不走確認框，直接送出', async () => {
    const suspend = vi.fn(async () => {});
    renderConsole({
      loadMemberDetail: async () => detail({ suspended: true }),
      suspendMember: suspend,
    });

    const panel = await openDetail();
    fireEvent.click(within(panel).getByRole('button', { name: '恢復' }));
    await waitFor(() => expect(suspend).toHaveBeenCalledWith('m1', false));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('停權失敗時把哪一種失敗印在詳情面板裡', async () => {
    renderConsole({
      suspendMember: async () => {
        throw new Error('該會員已被其他管理員處理');
      },
    });

    const panel = await openDetail();
    fireEvent.click(within(panel).getByRole('button', { name: '暫停' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認暫停' }));
    expect(await within(panel).findByText(/該會員已被其他管理員處理/)).toBeTruthy();
  });

  // 停權與授予管理員是同一類事——對一個人做的判斷，不是對一筆資料做的修改。
  // 同類的東西走同一套邏輯與設計：同一個面板、同一個確認框、同一處錯誤顯示。
  it('停權成功後詳情面板的管理區跟著更新', async () => {
    let suspended = false;
    renderConsole({
      loadMemberDetail: async () => detail({ suspended }),
      suspendMember: async () => {
        suspended = true;
      },
    });

    const panel = await openDetail();
    expect(within(panel).getByText('帳號正常')).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: '暫停' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認暫停' }));
    expect(await within(panel).findByText('帳號已暫停')).toBeTruthy();
  });

  it('搜尋送出後以關鍵字重新查詢', async () => {
    const load = vi.fn(async () => page());
    renderConsole({ loadMembers: load });
    await screen.findAllByText('陳大文');

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: '王小明' },
    });
    fireEvent.submit(screen.getByRole('searchbox').closest('form')!);

    await waitFor(() =>
      expect(load).toHaveBeenCalledWith(expect.objectContaining({ search: '王小明' })),
    );
  });

  // 工具列（S3 A2）：搜尋＋重新整理，沒有 CSV——會員資料的匯出不存在，
  // 規則見 ui-ux-guidelines §3（CSV 鈕只在已有匯出邏輯的頁面傳入）。
  it('工具列有重新整理、沒有 CSV 鈕', async () => {
    renderConsole();
    await screen.findAllByText('陳大文');
    expect(screen.getByRole('button', { name: '重新整理' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /CSV/ })).toBeNull();
  });

  it('重新整理以同一個關鍵字重讀列表', async () => {
    const load = vi.fn(async () => page());
    renderConsole({ loadMembers: load });
    await screen.findAllByText('陳大文');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '王小明' } });
    fireEvent.submit(screen.getByRole('searchbox').closest('form')!);
    await waitFor(() =>
      expect(load).toHaveBeenLastCalledWith(expect.objectContaining({ search: '王小明' })),
    );
    load.mockClear();

    fireEvent.click(screen.getByRole('button', { name: '重新整理' }));

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ search: '王小明', offset: 0 }));
  });

  it('載入更多進行中按不到重新整理——兩者交錯會把舊頁尾接到新列表上', async () => {
    let releaseMore!: () => void;
    const load = vi.fn(async ({ offset }: { offset: number }) => {
      if (offset > 0) await new Promise<void>((r) => (releaseMore = r));
      return page({ members: [member({ id: `m${offset}`, name: `會員${offset}` })], total: 2 });
    });
    renderConsole({ loadMembers: load as never });
    await screen.findByText('已顯示 1 / 2 筆');

    fireEvent.click(screen.getByRole('button', { name: '載入更多' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '重新整理' }).hasAttribute('disabled')).toBe(true),
    );
    releaseMore();
    await screen.findByText('已顯示 2 / 2 筆');
    expect(screen.getByRole('button', { name: '重新整理' }).hasAttribute('disabled')).toBe(false);
  });

  it('搜尋框內的放大鏡可送出，有名稱；沒有另一顆獨立的送出鈕', async () => {
    const load = vi.fn(async () => page());
    renderConsole({ loadMembers: load });
    await screen.findAllByText('陳大文');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '0912' } });

    const submit = screen.getByRole('button', { name: '搜尋' });
    expect(submit.getAttribute('type')).toBe('submit');
    expect(submit.closest('form')).toBe(screen.getByRole('searchbox').closest('form'));
    fireEvent.click(submit);

    await waitFor(() =>
      expect(load).toHaveBeenCalledWith(expect.objectContaining({ search: '0912' })),
    );
  });

  it('搜尋框的名稱說出可搜的欄位，placeholder 縮短成「搜尋會員」', async () => {
    renderConsole();
    const box = await screen.findByRole('searchbox', { name: /姓名.*Email.*電話/ });
    expect(box.getAttribute('placeholder')).toBe('搜尋會員');
  });

  it('載入更多把下一頁接在後面，不是取代', async () => {
    const load = vi.fn(async ({ offset }: { offset: number }) =>
      page({
        members: [member({ id: `m${offset}`, name: `會員${offset}` })],
        total: 2,
      }),
    );
    renderConsole({ loadMembers: load as never });

    await screen.findByText('已顯示 1 / 2 筆');
    fireEvent.click(screen.getByRole('button', { name: '載入更多' }));
    await screen.findByText('已顯示 2 / 2 筆');
  });

  it('詳情取不到時顯示錯誤，不留一個空面板', async () => {
    renderConsole({
      loadMemberDetail: async () => {
        throw new Error('查無此會員');
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: /查看 陳大文/ }));
    expect(await screen.findByText('查無此會員')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('沒有推薦人與提領記錄時詳情不顯示空欄位殘影', async () => {
    renderConsole({
      loadMemberDetail: async () =>
        detail({ referrerName: null, endDate: null, recentWithdrawals: [] }),
    });
    fireEvent.click(await screen.findByRole('button', { name: /查看 陳大文/ }));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByText('尚無提領記錄')).toBeTruthy();
  });

  it('停權與失效會員在列表上看得出來', async () => {
    renderConsole({
      loadMembers: async () =>
        page({
          members: [
            member({
              id: 'm2',
              name: '林小美',
              suspended: true,
              suspendedAt: '2026-07-20T00:00:00Z',
              accountStatus: 'expired',
              phone: null,
            }),
          ],
        }),
    });

    await screen.findByText('林小美');
    expect(screen.getByText('已暫停')).toBeTruthy();
    expect(screen.getByText('已失效')).toBeTruthy();
  });

  // 列上只有「查看」一個動作，誤觸的上限就是開錯一個面板。停權與授予管理員
  // 都是**對一個人做的判斷**，做之前本來就該先看清楚他是誰——那道摩擦是流程
  // 本身，不是人工加的關卡。改版前這裡有三顆等寬平排的鍵。
  it('列表上按不到任何會改變會員狀態的鍵', async () => {
    renderConsole({
      loadMembers: async () =>
        page({ members: [member({ isAdmin: false }), member({ id: 'm2', suspended: true })] }),
    });
    await screen.findAllByText('陳大文');

    for (const name of ['設為管理員', '撤銷管理員', '暫停', '恢復']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  async function openDetail() {
    fireEvent.click(await screen.findByRole('button', { name: /查看 陳大文/ }));
    return screen.findByRole('dialog');
  }

  it('詳情面板的管理區可把一般會員設為管理員', async () => {
    const setAdmin = vi.fn(async () => {});
    renderConsole({
      loadMemberDetail: async () => detail({ isAdmin: false }),
      setMemberAdmin: setAdmin,
    });

    const panel = await openDetail();
    fireEvent.click(within(panel).getByRole('button', { name: '設為管理員' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認授予' }));
    await waitFor(() => expect(setAdmin).toHaveBeenCalledWith('m1', true));
  });

  // 授予的代價不對稱地重，而且方向和直覺相反：他當下就讀得到全站的身分證與
  // 收款帳號，撤回權限撤不回已經被看過的資料。「授錯了撤回即可」只在權限層
  // 成立，在個資層不成立——所以授予也要一道確認框，而且要把這件事講出來。
  it('授予管理員的確認框說明存取無法追溯撤回', async () => {
    const setAdmin = vi.fn(async () => {});
    renderConsole({
      loadMemberDetail: async () => detail({ isAdmin: false }),
      setMemberAdmin: setAdmin,
    });

    const panel = await openDetail();
    fireEvent.click(within(panel).getByRole('button', { name: '設為管理員' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/無法追溯撤回/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(setAdmin).not.toHaveBeenCalled();
  });

  // 撤銷把整個後台的一把鑰匙收回來，誤觸的代價是那個人瞬間失去所有管理能力。
  it('撤銷管理員走確認框，取消不送出', async () => {
    const setAdmin = vi.fn(async () => {});
    renderConsole({
      loadMemberDetail: async () => detail({ isAdmin: true }),
      setMemberAdmin: setAdmin,
    });

    const panel = await openDetail();
    fireEvent.click(within(panel).getByRole('button', { name: '撤銷管理員' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
    expect(setAdmin).not.toHaveBeenCalled();
  });

  it('撤銷管理員確認後才送出', async () => {
    const setAdmin = vi.fn(async () => {});
    renderConsole({
      loadMemberDetail: async () => detail({ isAdmin: true }),
      setMemberAdmin: setAdmin,
    });

    const panel = await openDetail();
    fireEvent.click(within(panel).getByRole('button', { name: '撤銷管理員' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認撤銷' }));
    await waitFor(() => expect(setAdmin).toHaveBeenCalledWith('m1', false));
  });

  // 錯誤要出現在動作發生的地方。詳情面板蓋在列表上，把訊息印在列表區等於
  // 印在看不見的地方——admin 只會覺得按了沒反應，然後再按一次。
  it('撤銷管理員失敗時把哪一種失敗印在詳情面板裡', async () => {
    renderConsole({
      loadMemberDetail: async () => detail({ isAdmin: true }),
      setMemberAdmin: async () => {
        throw new Error('不能撤銷自己的管理員權限，請由其他管理員操作');
      },
    });

    const panel = await openDetail();
    fireEvent.click(within(panel).getByRole('button', { name: '撤銷管理員' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認撤銷' }));
    expect(await within(panel).findByText(/不能撤銷自己的管理員權限/)).toBeTruthy();
  });

  // 面板停在舊狀態會讓 admin 以為沒生效而再按一次。
  it('授予成功後詳情面板的管理區跟著更新', async () => {
    let isAdmin = false;
    renderConsole({
      loadMemberDetail: async () => detail({ isAdmin }),
      setMemberAdmin: async () => {
        isAdmin = true;
      },
    });

    const panel = await openDetail();
    fireEvent.click(within(panel).getByRole('button', { name: '設為管理員' }));
    fireEvent.click(await screen.findByRole('button', { name: '確認授予' }));
    expect(await within(panel).findByRole('button', { name: '撤銷管理員' })).toBeTruthy();
  });

  it('搜尋框是 search 型別，輔助科技辨識得出來', async () => {
    renderConsole();
    const box = await screen.findByRole('searchbox');
    expect(box.getAttribute('type')).toBe('search');
  });
});

// --- 手機版（階段 3） --------------------------------------------------------
//
// 與提領管理同一個原則：表格換卡片時，**互動不能被悄悄拿掉**。這裡的三顆
// 操作鍵（查看／設為管理員／暫停）都是顯式按鈕、不依賴 <tr> 結構，所以沒有
// F1 那種隱性耦合；要守的是「資訊量不低於桌面關鍵欄位」與「三顆鍵都在」。
describe('MemberManagement 手機版', () => {
  beforeEach(() => {
    stubMediaQuery(false);
  });

  it('不渲染 table，改以每位會員一張卡呈現', async () => {
    const { container } = renderConsole();
    await screen.findByText('陳大文');
    expect(container.querySelector('table')).toBeNull();
  });

  it('每張卡帶姓名、Email、會籍與刊登數', async () => {
    renderConsole();
    const card = await screen.findByRole('group', { name: /陳大文/ });
    expect(within(card).getByText('陳大文')).toBeTruthy();
    expect(within(card).getByText('a@b.c')).toBeTruthy();
    expect(within(card).getByText('有效會員')).toBeTruthy();
    expect(within(card).getByText(/刊登/)).toBeTruthy();
  });

  it('正常狀態不顯示 badge——只有需要注意的才佔位', async () => {
    // 「一般會員」「正常」是預設值:佔了位置卻沒有資訊量，而六個 badge 擠在
    // 一起反而讓真正需要注意的那個消失在噪音裡。
    renderConsole();
    const card = await screen.findByRole('group', { name: /陳大文/ });
    expect(within(card).queryByText('一般會員')).toBeNull();
    expect(within(card).queryByText('正常')).toBeNull();
  });

  it('暫停中的會員才顯示已暫停 badge', async () => {
    renderConsole({ loadMembers: async () => page({ members: [member({ suspended: true })] }) });
    const card = await screen.findByRole('group', { name: /陳大文/ });
    expect(within(card).getByText('已暫停')).toBeTruthy();
  });

  it('卡片上只有一顆操作鍵——改「一個人的狀態」的動作全在詳情面板', async () => {
    // ⚠️ 主斷言是**數數**。先前這條測試名字叫「只有兩顆」，三條斷言卻是
    // 「查看在、暫停在、設為管理員不在」——沒有一條在數數，插入第三顆按鈕
    // 三層閘門全綠。`.claude/rules/test-naming.md` 的反例正是同型。
    // ui-ux-guidelines §11.1:分類看動作的對象。停權與管理員切換改的都是
    // 「一個人的狀態」，一律移進詳情面板，且走同一個 MemberAction 路徑
    // （同一種確認框、同一處錯誤顯示）。曾經替停權開的「時效性」例外已被
    // §11.1 明文廢止——提領台改的是一筆交易，會員管理改的是一個人。
    renderConsole();
    const card = await screen.findByRole('group', { name: /陳大文/ });
    expect(within(card).getAllByRole('button')).toHaveLength(1);
    expect(within(card).getByRole('button', { name: /查看 .* 的詳情/ })).toBeTruthy();
    // 負向斷言留著:它不是套套邏輯——這兩顆鍵兩個 commit 前真的在卡片上，
    // 把它們貼回去這裡就會紅。
    expect(within(card).queryByRole('button', { name: '暫停' })).toBeNull();
    expect(within(card).queryByRole('button', { name: '設為管理員' })).toBeNull();
  });

  it('管理員的卡片一樣只有一顆鍵——動態標籤鍵不得從這裡繞回來', async () => {
    // isAdmin 的卡片渲染的是「撤銷管理員」，上一條的負向斷言抓不到它。
    renderConsole({ loadMembers: async () => page({ members: [member({ isAdmin: true })] }) });
    const card = await screen.findByRole('group', { name: /陳大文/ });
    expect(within(card).getAllByRole('button')).toHaveLength(1);
    expect(within(card).queryByRole('button', { name: '撤銷管理員' })).toBeNull();
  });

  it('卡片顯示電話——admin 用來電號碼搜到人之後要認得出是同一個人', async () => {
    // 搜尋框的名稱就寫著「姓名、Email 或電話」，後端 RPC 也真的
    // 有 phone ilike。手機是 JS 擇一渲染、表格不掛 DOM，卡片不顯示就等於
    // 手機上完全看不到號碼，也無法回撥。
    renderConsole();
    const card = await screen.findByRole('group', { name: /陳大文/ });
    expect(within(card).getByText('0912345678')).toBeTruthy();
  });
});

// --- 「查看」→ 詳情面板（S4 階段 2） ------------------------------------------
//
// 點「查看」到面板出現之間要有回饋，而且**只有最後一次意圖算數**：
//   - 在途的那一列轉圈、停用，同列連點不重送；
//   - 他列照常可點，誰最後被點，面板就開誰——較早的回應晚到，不得蓋掉面板、
//     不得把自己的錯誤印出來；
//   - 動作後的重讀與「查看」共用同一個序號：面板關掉之後，晚到的重讀不得把它
//     重新打開，也不得把別人的面板換掉。
// 取詳情失敗時錯誤框要捲進視窗並取得焦點——手機上停在長列表深處按「查看」，
// 錯誤若印在畫面外，使用者看到的就是「按了沒反應」。
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const TWO_MEMBERS = page({
  members: [member(), member({ id: 'm2', name: '林小美', email: 'lin@b.c' })],
});

function viewButton(name: string) {
  // 面板開著時 Radix 會把列表設成 aria-hidden，所以要 hidden: true 才找得到。
  return screen.getByRole('button', { name: `查看 ${name} 的詳情`, hidden: true });
}

describe('MemberManagement 查看與請求順序', () => {
  it('取詳情期間該列的查看鈕轉圈且停用，連點不重送', async () => {
    const pending = deferred<AdminMemberDetail>();
    const load = vi.fn(() => pending.promise);
    renderConsole({ loadMemberDetail: load });

    fireEvent.click(await screen.findByRole('button', { name: /查看 陳大文/ }));
    const btn = viewButton('陳大文');
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.hasAttribute('disabled')).toBe(true);
    fireEvent.click(btn);
    expect(load).toHaveBeenCalledTimes(1);

    pending.resolve(detail());
    await screen.findByRole('dialog');
  });

  it('取詳情期間報讀器聽得到正在讀取誰', async () => {
    const pending = deferred<AdminMemberDetail>();
    renderConsole({ loadMemberDetail: () => pending.promise });

    fireEvent.click(await screen.findByRole('button', { name: /查看 陳大文/ }));
    const status = screen.getByText('正在讀取 陳大文 的詳情');
    expect(status.closest('[role="status"]')).toBeTruthy();
    pending.resolve(detail());
    await screen.findByRole('dialog');
  });

  it('A 在途時點 B、B 先回 A 後失敗時，開 B 且不印 A 的錯誤', async () => {
    const a = deferred<AdminMemberDetail>();
    const b = deferred<AdminMemberDetail>();
    renderConsole({
      loadMembers: async () => TWO_MEMBERS,
      loadMemberDetail: (id) => (id === 'm1' ? a.promise : b.promise),
    });

    fireEvent.click(await screen.findByRole('button', { name: /查看 陳大文/ }));
    fireEvent.click(viewButton('林小美'));
    b.resolve(detail({ id: 'm2', name: '林小美', email: 'lin@b.c' }));
    const panel = await screen.findByRole('dialog');
    a.reject(new Error('A 的錯誤'));

    await waitFor(() => expect(viewButton('陳大文').hasAttribute('disabled')).toBe(false));
    expect(within(panel).getByRole('heading', { name: '林小美' })).toBeTruthy();
    expect(screen.queryByText('A 的錯誤')).toBeNull();
  });

  it('A 在途時點 B、B 先回 A 後成功時，面板仍是 B', async () => {
    const a = deferred<AdminMemberDetail>();
    const b = deferred<AdminMemberDetail>();
    renderConsole({
      loadMembers: async () => TWO_MEMBERS,
      loadMemberDetail: (id) => (id === 'm1' ? a.promise : b.promise),
    });

    fireEvent.click(await screen.findByRole('button', { name: /查看 陳大文/ }));
    fireEvent.click(viewButton('林小美'));
    b.resolve(detail({ id: 'm2', name: '林小美', email: 'lin@b.c' }));
    const panel = await screen.findByRole('dialog');
    a.resolve(detail());

    await waitFor(() => expect(viewButton('陳大文').hasAttribute('disabled')).toBe(false));
    expect(within(panel).getByRole('heading', { name: '林小美' })).toBeTruthy();
  });

  it('動作後重讀途中關掉面板時，重讀回來不會把面板重新打開', async () => {
    const reread = deferred<AdminMemberDetail>();
    const load = vi
      .fn()
      .mockResolvedValueOnce(detail({ suspended: true }))
      .mockReturnValueOnce(reread.promise);
    renderConsole({ loadMemberDetail: load });

    const panel = await openDetail();
    fireEvent.click(within(panel).getByRole('button', { name: '恢復' }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    fireEvent.keyDown(panel, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    reread.resolve(detail({ suspended: false }));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('關掉 A 後開 B，A 的重讀晚到不會把 B 的面板換掉', async () => {
    const reread = deferred<AdminMemberDetail>();
    let aCalls = 0;
    renderConsole({
      loadMembers: async () => TWO_MEMBERS,
      loadMemberDetail: async (id) => {
        if (id === 'm2') return detail({ id: 'm2', name: '林小美', email: 'lin@b.c' });
        aCalls += 1;
        return aCalls === 1 ? detail({ suspended: true }) : reread.promise;
      },
    });

    const panelA = await openDetail();
    fireEvent.click(within(panelA).getByRole('button', { name: '恢復' }));
    await waitFor(() => expect(aCalls).toBe(2));
    fireEvent.keyDown(panelA, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(viewButton('林小美'));
    const panelB = await screen.findByRole('dialog');
    reread.resolve(detail({ suspended: false }));
    await new Promise((r) => setTimeout(r, 0));
    expect(within(panelB).getByRole('heading', { name: '林小美' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '陳大文' })).toBeNull();
  });

  it('關掉 A 後開 B，A 的重讀失敗不會把錯誤印進 B 的面板', async () => {
    const reread = deferred<AdminMemberDetail>();
    let aCalls = 0;
    renderConsole({
      loadMembers: async () => TWO_MEMBERS,
      loadMemberDetail: async (id) => {
        if (id === 'm2') return detail({ id: 'm2', name: '林小美', email: 'lin@b.c' });
        aCalls += 1;
        return aCalls === 1 ? detail({ suspended: true }) : reread.promise;
      },
    });

    const panelA = await openDetail();
    fireEvent.click(within(panelA).getByRole('button', { name: '恢復' }));
    await waitFor(() => expect(aCalls).toBe(2));
    fireEvent.keyDown(panelA, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(viewButton('林小美'));
    const panelB = await screen.findByRole('dialog');
    reread.reject(new Error('network'));
    await new Promise((r) => setTimeout(r, 0));
    expect(within(panelB).queryByText(/重新讀取詳情失敗/)).toBeNull();
  });

  it('取詳情失敗時錯誤框被捲進視窗並取得焦點', async () => {
    const scrollIntoView = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    try {
      renderConsole({
        loadMemberDetail: async () => {
          throw new Error('查無此會員');
        },
      });
      fireEvent.click(await screen.findByRole('button', { name: /查看 陳大文/ }));
      const alert = await screen.findByRole('alert');
      await waitFor(() => expect(document.activeElement?.contains(alert)).toBe(true));
      expect(scrollIntoView).toHaveBeenCalled();
      expect(viewButton('陳大文').hasAttribute('disabled')).toBe(false);
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it('面板開啟時焦點落在姓名標題，不是畫面外的管理鈕', async () => {
    renderConsole();
    const panel = await openDetail();
    const title = within(panel).getByRole('heading', { name: '陳大文' });
    await waitFor(() => expect(document.activeElement).toBe(title));
  });

  it('面板關閉後焦點回到同一位會員的查看鈕', async () => {
    renderConsole({ loadMembers: async () => TWO_MEMBERS });
    fireEvent.click(await screen.findByRole('button', { name: /查看 林小美/ }));
    const panel = await screen.findByRole('dialog');
    fireEvent.keyDown(panel, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(viewButton('林小美')));
  });

  async function openDetail() {
    fireEvent.click(await screen.findByRole('button', { name: /查看 陳大文/ }));
    return screen.findByRole('dialog');
  }
});

describe('MemberManagement 手機版的查看回饋', () => {
  beforeEach(() => {
    stubMediaQuery(false);
  });

  // 手機（LINE 內建瀏覽器）是後台與桌機並重的主裝置；焦點還原靠卡片上的觸發鈕
  // 屬性找回，卡片改版時最容易悄悄斷掉。
  it('面板關閉後焦點回到卡片上的查看鈕', async () => {
    renderConsole({ loadMembers: async () => TWO_MEMBERS });
    const card = await screen.findByRole('group', { name: /林小美/ });
    fireEvent.click(within(card).getByRole('button', { name: /查看 林小美/ }));
    const panel = await screen.findByRole('dialog');
    fireEvent.keyDown(panel, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(screen.getByRole('group', { name: /林小美/ })).getByRole('button', {
          name: /查看 林小美/,
        }),
      ),
    );
  });

  it('卡片上的查看鈕在取詳情期間轉圈且停用，連點不重送', async () => {
    const pending = deferred<AdminMemberDetail>();
    const load = vi.fn(() => pending.promise);
    renderConsole({ loadMemberDetail: load });

    const card = await screen.findByRole('group', { name: /陳大文/ });
    fireEvent.click(within(card).getByRole('button', { name: /查看 陳大文/ }));
    const btn = within(card).getByRole('button', { name: /查看 陳大文/ });
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.hasAttribute('disabled')).toBe(true);
    fireEvent.click(btn);
    expect(load).toHaveBeenCalledTimes(1);

    pending.resolve(detail());
    await screen.findByRole('dialog');
  });
});

// --- 管理區與確認框（S4 階段 4） ----------------------------------------------
//
// 管理區按鈕與確認鈕的外觀，規則見 ui-ux-guidelines §12.11（按鈕三分法、確認鈕跟
// 觸發鈕同類）；這裡釘的是它在會員詳情的落點。
// 斷言用 classList 逐 token 比對：`hover:bg-destructive-subtle` 也含 `bg-destructive`
// 這個子字串，用 className.includes 會誤判。
describe('MemberManagement 管理區與確認框', () => {
  async function openPanel(d: AdminMemberDetail) {
    renderConsole({ loadMemberDetail: async () => d });
    fireEvent.click(await screen.findByRole('button', { name: /查看 陳大文/ }));
    return screen.findByRole('dialog');
  }

  it('暫停與撤銷管理員是紅框字', async () => {
    const panel = await openPanel(detail({ isAdmin: true }));
    for (const name of ['暫停', '撤銷管理員']) {
      const btn = within(panel).getByRole('button', { name });
      expect(btn.classList.contains('border-destructive-border')).toBe(true);
      expect(btn.classList.contains('text-destructive-subtle-foreground')).toBe(true);
    }
  });

  it('恢復與設為管理員是次要外觀，不帶紅色', async () => {
    const panel = await openPanel(detail({ suspended: true, isAdmin: false }));
    for (const name of ['恢復', '設為管理員']) {
      const btn = within(panel).getByRole('button', { name });
      expect(btn.classList.contains('bg-card')).toBe(true);
      // base class 帶 aria-invalid:border-destructive-border，所以逐 token 比，不比子字串。
      expect(btn.classList.contains('border-destructive-border')).toBe(false);
      expect(btn.classList.contains('text-destructive-subtle-foreground')).toBe(false);
    }
  });

  it('面板內沒有任何實心鈕', async () => {
    const panel = await openPanel(detail({ isAdmin: true }));
    const solid = within(panel)
      .getAllByRole('button')
      .filter((b) =>
        ['bg-primary', 'bg-brand', 'bg-destructive'].some((c) => b.classList.contains(c)),
      );
    expect(solid.map((b) => b.textContent)).toEqual([]);
  });

  it('暫停的確認鈕是紅實心', async () => {
    const panel = await openPanel(detail());
    fireEvent.click(within(panel).getByRole('button', { name: '暫停' }));
    const confirm = await screen.findByRole('button', { name: '確認暫停' });
    expect(confirm.classList.contains('bg-destructive')).toBe(true);
  });

  it('撤銷管理員的確認鈕是紅實心', async () => {
    const panel = await openPanel(detail({ isAdmin: true }));
    fireEvent.click(within(panel).getByRole('button', { name: '撤銷管理員' }));
    const confirm = await screen.findByRole('button', { name: '確認撤銷' });
    expect(confirm.classList.contains('bg-destructive')).toBe(true);
  });

  it('授予管理員的確認鈕維持墨黑，不是紅實心', async () => {
    const panel = await openPanel(detail({ isAdmin: false }));
    fireEvent.click(within(panel).getByRole('button', { name: '設為管理員' }));
    const confirm = await screen.findByRole('button', { name: '確認授予' });
    expect(confirm.classList.contains('bg-primary')).toBe(true);
    expect(confirm.classList.contains('bg-destructive')).toBe(false);
  });

  // 規格書 §5.2：停權會員一律看到「帳號已停權」、進不了會員區（RequireMembershipRoute
  // 的 suspendedBlocked）。確認框是 admin 判斷後果的依據，寫錯就是讓他低估後果。
  it('暫停確認框說明停權後進不了會員區', async () => {
    const panel = await openPanel(detail());
    fireEvent.click(within(panel).getByRole('button', { name: '暫停' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/無法進入會員區/)).toBeTruthy();
    expect(within(dialog).queryByText(/會員區瀏覽不受影響/)).toBeNull();
  });

  // 只有一個請求取整份詳情，所以「區塊各自三態」落地為：動作後重讀失敗只印在管理區，
  // 其他分區保留上一份資料，不連坐成整面錯誤。
  it('動作後重讀失敗時錯誤只在管理區，其他分區仍是原資料', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(detail({ suspended: true }))
      .mockRejectedValueOnce(new Error('network'));
    renderConsole({ loadMemberDetail: load });
    fireEvent.click(await screen.findByRole('button', { name: /查看 陳大文/ }));
    const panel = await screen.findByRole('dialog');
    fireEvent.click(within(panel).getByRole('button', { name: '恢復' }));

    const manage = within(panel).getByRole('region', { name: '管理' });
    expect(await within(manage).findByText(/重新讀取詳情失敗/)).toBeTruthy();
    expect(
      within(within(panel).getByRole('region', { name: '帳號' })).getByText('0912345678'),
    ).toBeTruthy();
    expect(
      within(within(panel).getByRole('region', { name: '推薦關係' })).getByText('王小明'),
    ).toBeTruthy();
  });
});
