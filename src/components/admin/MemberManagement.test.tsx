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
//   4. **管理員切換**（M4）：撤銷失敗時要說出是哪一種失敗。
//   5. 空／錯／載入三態。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AdminMember, AdminMemberDetail, AdminMembersResponse } from '@contract';
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
      loadIdReviews={async () => []}
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

  it('撤銷管理員失敗時說出是哪一種失敗，不壓成一句操作失敗', async () => {
    renderConsole({
      loadMembers: async () => page({ members: [member({ isAdmin: true })] }),
      setMemberAdmin: async () => {
        throw new Error('不能撤銷自己的管理員權限，請由其他管理員操作');
      },
    });

    fireEvent.click(await screen.findByRole('button', { name: '撤銷管理員' }));
    expect(await screen.findByText(/不能撤銷自己的管理員權限/)).toBeTruthy();
  });
});
