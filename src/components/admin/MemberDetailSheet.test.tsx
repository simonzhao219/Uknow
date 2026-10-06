// @vitest-environment jsdom
//
// 會員詳情面板（純呈現）的**分區與條件矩陣**。跨元件的行為（查看回饋、請求序號、
// 確認框、執行器）在 `MemberManagement.test.tsx`；這裡直接 render 子元件。
//
//   1. 先看到「這是誰、狀態如何」，再往下找細節：固定的身分卡（姓名＋徽章＋到期）
//      → 帳號 → 點數 → 近期提領 → 推薦關係 → 敏感資料 → 管理。
//   2. 每區一個主項，空態是一般文字，不借錯誤樣式。
//   3. 定位器契約：journey f70 用 `get_by_text("推薦人", exact=True)` 找這個面板，
//      完整等於「推薦人」的節點只能有一個（Playwright strict mode）。
//   4. 子元件不判斷要不要確認、不渲染確認框——四顆管理鈕只回呼
//      `onRequestAction`（ui-ux-guidelines §11 的單一路徑在父層）。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { AdminMemberDetail, AdminMemberWithdrawal } from '@contract';
import { MemberDetailSheet } from './MemberDetailSheet';

afterEach(cleanup);

function detail(over: Partial<AdminMemberDetail> = {}): AdminMemberDetail {
  return {
    id: 'm1',
    name: '陳大文',
    email: 'a@b.c',
    phone: '0912345678',
    isAdmin: false,
    suspended: false,
    suspendedAt: null,
    // 跨台灣日界：UTC 6/30 16:30 = 台灣 7/1 00:30。日期若用 UTC 切，會差一天。
    createdAt: '2026-06-30T16:30:00Z',
    accountStatus: 'active',
    endDate: '2026-12-31T16:30:00Z',
    idVerificationStatus: 'approved',
    idRejectReason: null,
    idNumber: 'A12****789',
    bankCode: '822',
    bankAccount: '*********0123',
    referrerName: '王小明',
    directChildCount: 2,
    listingCount: 1,
    availablePoints: 3000,
    pendingPoints: 1015,
    withdrawnPoints: 1000,
    recentWithdrawals: [],
    ...over,
  };
}

function withdrawal(over: Partial<AdminMemberWithdrawal> = {}): AdminMemberWithdrawal {
  return {
    id: 'w1',
    amount: 1000,
    fee: 15,
    status: 'pending',
    note: null,
    requestedAt: '2026-08-01T00:00:00Z',
    processedAt: null,
    completedAt: null,
    ...over,
  };
}

function renderSheet(d: AdminMemberDetail = detail(), onRequestAction = vi.fn()) {
  render(
    <MemberDetailSheet
      detail={d}
      processing={false}
      panelError={null}
      onRequestAction={onRequestAction}
      onClose={() => {}}
    />,
  );
  return { panel: screen.getByRole('dialog'), onRequestAction };
}

function section(panel: HTMLElement, name: string) {
  return within(panel).getByRole('region', { name });
}

function headerBadges(panel: HTMLElement) {
  const header = panel.querySelector('[data-slot="sheet-header"]') as HTMLElement;
  return Array.from(header.querySelectorAll('[data-slot="badge"]')).map((b) => b.textContent);
}

describe('MemberDetailSheet 分區結構', () => {
  it('分區由上到下是帳號、點數、近期提領、推薦關係、敏感資料、管理', () => {
    const { panel } = renderSheet();
    const titles = within(panel)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(titles).toEqual(['帳號', '點數', '近期提領', '推薦關係', '敏感資料', '管理']);
  });

  it('每個分區都是以標題命名的區塊', () => {
    const { panel } = renderSheet();
    for (const name of ['帳號', '點數', '近期提領', '推薦關係', '敏感資料', '管理']) {
      expect(section(panel, name)).toBeTruthy();
    }
  });

  it('完整等於「推薦人」的文字在面板裡恰好一個（journey f70 的定位器）', () => {
    renderSheet();
    expect(screen.getAllByText('推薦人', { exact: true })).toHaveLength(1);
    expect(screen.getByText('王小明', { exact: true })).toBeTruthy();
  });
});

describe('MemberDetailSheet 身分卡', () => {
  it('停權的管理員：徽章依序是已暫停、管理員、會籍', () => {
    const { panel } = renderSheet(
      detail({ suspended: true, suspendedAt: '2026-07-20T00:00:00Z', isAdmin: true }),
    );
    expect(headerBadges(panel)).toEqual(['已暫停', '管理員', '有效會員']);
  });

  it('一般有效會員只顯示會籍徽章', () => {
    const { panel } = renderSheet();
    expect(headerBadges(panel)).toEqual(['有效會員']);
  });

  it('有效會員顯示台灣日曆日的會籍到期日', () => {
    const { panel } = renderSheet();
    const header = panel.querySelector('[data-slot="sheet-header"]') as HTMLElement;
    expect(within(header).getByText('會籍到期 2027/01/01')).toBeTruthy();
  });

  it('已失效會員寫「已於…到期」', () => {
    const { panel } = renderSheet(detail({ accountStatus: 'expired' }));
    const header = panel.querySelector('[data-slot="sheet-header"]') as HTMLElement;
    expect(within(header).getByText('已於 2027/01/01 到期')).toBeTruthy();
  });

  it('沒有到期日時不留到期行的殘影', () => {
    const { panel } = renderSheet(detail({ endDate: null }));
    expect(within(panel).queryByText(/到期/)).toBeNull();
  });

  it('沒有姓名時標題用 Email，且 Email 不再印第二次', () => {
    const { panel } = renderSheet(detail({ name: null }));
    expect(within(panel).getByRole('heading', { level: 2 }).textContent).toBe('a@b.c');
    expect((panel.textContent ?? '').split('a@b.c').length - 1).toBe(1);
  });
});

describe('MemberDetailSheet 帳號與點數', () => {
  it('帳號區有電話、台灣日曆日的註冊日與刊登數', () => {
    const { panel } = renderSheet();
    const account = section(panel, '帳號');
    expect(within(account).getByText('0912345678')).toBeTruthy();
    expect(within(account).getByText('2026/07/01')).toBeTruthy();
    expect(within(account).getByText('刊登數')).toBeTruthy();
  });

  it('暫停時間只在停權時出現', () => {
    const { panel } = renderSheet();
    expect(within(section(panel, '帳號')).queryByText('暫停時間')).toBeNull();
    cleanup();
    const { panel: suspended } = renderSheet(
      detail({ suspended: true, suspendedAt: '2026-07-20T00:00:00Z' }),
    );
    expect(within(section(suspended, '帳號')).getByText('暫停時間')).toBeTruthy();
  });

  it('點數區的主數字是可提領，處理中標明含手續費', () => {
    const { panel } = renderSheet();
    const points = section(panel, '點數');
    expect(within(points).getByText('3,000 P')).toBeTruthy();
    expect(within(points).getByText('處理中 1,015 P（含手續費）')).toBeTruthy();
    expect(within(points).getByText('已提領 1,000 P')).toBeTruthy();
  });
});

describe('MemberDetailSheet 近期提領', () => {
  it('狀態用與提領管理同源的徽章，待查收是 warning', () => {
    const { panel } = renderSheet(
      detail({ recentWithdrawals: [withdrawal({ status: 'awaiting_collection' })] }),
    );
    const badge = within(section(panel, '近期提領')).getByText('待查收');
    expect(badge.getAttribute('data-slot')).toBe('badge');
    expect(badge.className).toContain('bg-warning');
  });

  it('待查收列有匯款時間、已完成列有完成時間', () => {
    const { panel } = renderSheet(
      detail({
        recentWithdrawals: [
          withdrawal({
            id: 'w1',
            status: 'awaiting_collection',
            processedAt: '2026-08-02T01:00:00Z',
          }),
          withdrawal({
            id: 'w2',
            status: 'completed',
            processedAt: '2026-07-02T01:00:00Z',
            completedAt: '2026-07-03T01:00:00Z',
          }),
        ],
      }),
    );
    const list = section(panel, '近期提領');
    expect(within(list).getByText(/匯款時間 2026\/08\/02/)).toBeTruthy();
    expect(within(list).getByText(/完成時間 2026\/07\/03/)).toBeTruthy();
  });

  it('已退件列的備註標成退件理由並用紅字，其他狀態標成備註', () => {
    const { panel } = renderSheet(
      detail({
        recentWithdrawals: [
          withdrawal({ id: 'w1', status: 'rejected', note: '收款帳號與身分證姓名不符' }),
          withdrawal({ id: 'w2', status: 'completed', note: '客服代為結案' }),
        ],
      }),
    );
    const list = section(panel, '近期提領');
    const reason = within(list).getByText(/收款帳號與身分證姓名不符/);
    expect(reason.textContent).toContain('退件理由');
    expect(reason.className).toContain('text-destructive-subtle-foreground');
    const note = within(list).getByText(/客服代為結案/);
    expect(note.textContent).toContain('備註');
    expect(note.className).not.toContain('destructive');
  });

  it('滿 10 筆時加尾註，不指向不存在的搜尋', () => {
    const ten = Array.from({ length: 10 }, (_, i) => withdrawal({ id: `w${i}` }));
    const { panel } = renderSheet(detail({ recentWithdrawals: ten }));
    expect(within(section(panel, '近期提領')).getByText('最多列出最近 10 筆')).toBeTruthy();
  });

  it('不滿 10 筆時沒有尾註', () => {
    const { panel } = renderSheet(detail({ recentWithdrawals: [withdrawal()] }));
    expect(within(panel).queryByText('最多列出最近 10 筆')).toBeNull();
  });

  it('沒有提領時是一般文字的空態', () => {
    const { panel } = renderSheet();
    const empty = within(section(panel, '近期提領')).getByText('尚無提領記錄');
    expect(empty.className).not.toContain('destructive');
  });
});

describe('MemberDetailSheet 推薦關係與敏感資料', () => {
  it('沒有推薦人時顯示「—」', () => {
    const { panel } = renderSheet(detail({ referrerName: null }));
    expect(within(section(panel, '推薦關係')).getByText('—')).toBeTruthy();
  });

  it('敏感資料區說明只顯示部分碼，值仍是遮罩', () => {
    const { panel } = renderSheet();
    const sensitive = section(panel, '敏感資料');
    expect(within(sensitive).getByText('身分證與收款帳號只顯示部分碼')).toBeTruthy();
    expect(within(sensitive).getByText('A12****789')).toBeTruthy();
    expect(within(sensitive).getByText('822 / *********0123')).toBeTruthy();
  });

  it('證件被退回時顯示退回理由，通過時不顯示', () => {
    const { panel } = renderSheet(
      detail({ idVerificationStatus: 'rejected', idRejectReason: '照片模糊' }),
    );
    expect(within(section(panel, '敏感資料')).getByText('照片模糊')).toBeTruthy();
    cleanup();
    const { panel: approved } = renderSheet();
    expect(within(section(approved, '敏感資料')).queryByText('退回理由')).toBeNull();
  });

  it('銀行代號與帳號都沒有時只寫一次「未設定」', () => {
    const { panel } = renderSheet(detail({ bankCode: null, bankAccount: null }));
    const sensitive = section(panel, '敏感資料');
    expect(within(sensitive).getAllByText('未設定')).toHaveLength(1);
    expect(within(sensitive).queryByText(/—/)).toBeNull();
  });
});

describe('MemberDetailSheet 管理動作只回呼父層', () => {
  it('暫停只回呼 onRequestAction，不自己跳確認框', () => {
    const { panel, onRequestAction } = renderSheet();
    fireEvent.click(within(panel).getByRole('button', { name: '暫停' }));
    expect(onRequestAction).toHaveBeenCalledWith({ kind: 'suspend', next: true });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('撤銷管理員回呼 admin＝false 的動作', () => {
    const { panel, onRequestAction } = renderSheet(detail({ isAdmin: true }));
    fireEvent.click(within(panel).getByRole('button', { name: '撤銷管理員' }));
    expect(onRequestAction).toHaveBeenCalledWith({ kind: 'admin', next: false });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
