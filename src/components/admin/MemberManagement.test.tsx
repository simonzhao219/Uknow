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

    fireEvent.change(screen.getByPlaceholderText('搜尋姓名 / Email / 電話'), {
      target: { value: '王小明' },
    });
    fireEvent.submit(screen.getByPlaceholderText('搜尋姓名 / Email / 電話').closest('form')!);

    await waitFor(() =>
      expect(load).toHaveBeenCalledWith(expect.objectContaining({ search: '王小明' })),
    );
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
    const box = await screen.findByPlaceholderText('搜尋姓名 / Email / 電話');
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

  it('每張卡帶姓名、Email、會籍、角色、狀態與刊登數', async () => {
    renderConsole();
    const card = await screen.findByRole('group', { name: /陳大文/ });
    expect(within(card).getByText('陳大文')).toBeTruthy();
    expect(within(card).getByText('a@b.c')).toBeTruthy();
    expect(within(card).getByText('一般會員')).toBeTruthy();
    expect(within(card).getByText('正常')).toBeTruthy();
  });

  it('三顆操作鍵都在卡片內', async () => {
    renderConsole();
    const card = await screen.findByRole('group', { name: /陳大文/ });
    expect(within(card).getByRole('button', { name: /查看 .* 的詳情/ })).toBeTruthy();
    expect(within(card).getByRole('button', { name: '設為管理員' })).toBeTruthy();
    expect(within(card).getByRole('button', { name: '暫停' })).toBeTruthy();
  });
});
