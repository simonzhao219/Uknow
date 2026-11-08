// @vitest-environment jsdom
//
// 推薦樹節點詳情（第 6 波 S3a 階段 8）。
//   1. 首屏回答「現在什麼狀態、有沒有發錯」：頁首＋「需要注意」置頂（沒有異常就不渲染）。
//   2. 帳號狀態說明：停權、到期、未加入推薦計畫照發獎金但不可提領（W6-15）。
//   3. 推薦人鏈、獎金與點數、任務、提領、換線紀錄（W6-16）、推薦人資料兩處不一致。
//   4. 付款與三代獎金：一律卡片；每代依結果顯示「應給／實發」；自癒提示只出現一次。
//   5. 兩支請求互不連坐；404 與讀取失敗分開。
//   6. Sheet 內跳到另一人：替換內容＋「返回〇〇」，返回時不重讀。
//   7. portal 內容帶 session 錄影的遮蔽 class。
import type {
  AdminReferralMemberAudit,
  AdminReferralNode,
  AdminReferralPaymentItem,
} from '@admin-referral-contract';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { privateClass } from '../../../utils/analytics/privacy';
import type { LedgerData, PaymentsData, ReferralTreeLoaders } from './loaders';
import { ReferralAuditSheet } from './ReferralAuditSheet';

afterEach(cleanup);

function node(over: Partial<AdminReferralNode> = {}): AdminReferralNode {
  return {
    id: 'u1',
    name: '王大明',
    referralCode: '8048876',
    layer: 2,
    directCount: 3,
    status: 'active',
    daysToExpiry: 100,
    endDate: '2027-03-01T15:59:59Z',
    referralProgramJoined: true,
    referralProgramJoinedAt: '2026-10-01T00:00:00Z',
    anomalyKinds: [],
    anomalyScanTruncated: false,
    ...over,
  };
}

function audit(over: Partial<AdminReferralMemberAudit> = {}): AdminReferralMemberAudit {
  return {
    node: node(),
    upline: [
      { id: 'p1', name: '陳推薦', referralCode: '8048877' },
      { id: 'p2', name: '林上層', referralCode: null },
    ],
    uplineStatus: 'root',
    rewards: { byGeneration: { g1: 200, g2: 100, g3: 0 }, available: 1300, totalEarned: 2300 },
    tasks: {
      monthKey: '2026-11',
      monthlyCount: 3,
      threshold: 8,
      creditsUnclaimed: 1,
      creditsClaimed: 2,
    },
    withdrawals: { pendingAmount: 1000, awaitingCollectionAmount: 0, completedAmount: 2000 },
    referrerHistory: { pastReferrers: [], freshEvents: [] },
    referrerMismatch: false,
    anomalies: [],
    paymentSummary: { missingCount: 0, mismatchCount: 0 },
    ...over,
  };
}

function item(generations: AdminReferralPaymentItem['generations']): AdminReferralPaymentItem {
  return {
    kind: 'payment',
    eventId: 'e1',
    at: '2026-11-01T02:00:00Z',
    subscriptionId: 's1',
    claimId: null,
    generations,
  };
}

const gen = (
  g: number,
  over: Partial<AdminReferralPaymentItem['generations'][number]> = {},
): AdminReferralPaymentItem['generations'][number] => ({
  generation: g,
  result: 'paid',
  reason: null,
  expectedId: `r${g}`,
  expectedName: `收獎人${g}`,
  actualId: `r${g}`,
  actualName: `收獎人${g}`,
  actualAmount: 100,
  ...over,
});

function loaders(over: Partial<ReferralTreeLoaders> = {}): ReferralTreeLoaders {
  return {
    loadNodes: vi.fn(),
    search: vi.fn(),
    loadMember: vi.fn(async () => audit()),
    loadPayments: vi.fn(async (): Promise<PaymentsData> => ({ total: 0, items: [] })),
    loadLedger: vi.fn(async (): Promise<LedgerData> => ({ total: 0, items: [], findings: [] })),
    ...over,
  };
}

function renderSheet(l: ReferralTreeLoaders, userId = 'u1') {
  const onClose = vi.fn();
  render(<ReferralAuditSheet loaders={l} userId={userId} onClose={onClose} />);
  return { onClose };
}

describe('ReferralAuditSheet 首屏', () => {
  it('頁首顯示姓名、推薦碼與狀態；沒有異常時不渲染需要注意', async () => {
    renderSheet(loaders());
    expect(await screen.findByRole('heading', { name: '王大明' })).toBeTruthy();
    expect(screen.getByText('8048876')).toBeTruthy();
    expect(screen.getByText('訂閱中')).toBeTruthy();
    expect(screen.queryByText('需要注意')).toBeNull();
  });

  it('有異常時需要注意置頂並逐條列出筆數', async () => {
    renderSheet(
      loaders({
        loadMember: vi.fn(async () =>
          audit({
            anomalies: ['missing_reward', 'cycle'],
            paymentSummary: { missingCount: 2, mismatchCount: 0 },
          }),
        ),
      }),
    );
    const callout = (await screen.findByText('需要注意')).closest('[data-slot="status-callout"]');
    expect(callout).toBeTruthy();
    const box = within(callout as HTMLElement);
    expect(box.getByText(/獎金缺漏 2 筆/)).toBeTruthy();
    expect(box.getByText(/推薦關係成環/)).toBeTruthy();
  });

  it('停權者寫照發但不可提領的原因', async () => {
    renderSheet(
      loaders({ loadMember: vi.fn(async () => audit({ node: node({ status: 'suspended' }) })) }),
    );
    expect(await screen.findByText('獎金照常入帳，但目前不可提領（帳號已停權）')).toBeTruthy();
  });
});

describe('ReferralAuditSheet 各區', () => {
  it('推薦人鏈用推薦人、往上第 N 位；超過 50 層時說明未全部列出', async () => {
    renderSheet(loaders({ loadMember: vi.fn(async () => audit({ uplineStatus: 'truncated' })) }));
    const chain = within(await screen.findByRole('region', { name: '推薦人鏈' }));
    expect(chain.getByText('推薦人')).toBeTruthy();
    expect(chain.getByText('往上第 2 位')).toBeTruthy();
    expect(chain.getByText('往上超過 50 位，未全部列出')).toBeTruthy();
  });

  it('獎金與點數以可提領為主數字，各代獲得降為小字', async () => {
    renderSheet(loaders());
    const sec = within(await screen.findByRole('region', { name: '獎金與點數' }));
    expect(sec.getByText('1,300 P')).toBeTruthy();
    expect(sec.getByText(/第 1 代 200 P · 第 2 代 100 P · 第 3 代 0 P/)).toBeTruthy();
    expect(sec.getByText(/累計已發 2,300 P/)).toBeTruthy();
  });

  it('任務與提領顯示本月進度、credit 與審核中／已匯款金額', async () => {
    renderSheet(loaders());
    const tasks = within(await screen.findByRole('region', { name: '任務' }));
    expect(tasks.getByText('本月 3 / 8 位')).toBeTruthy();
    expect(tasks.getByText(/未領 1 張 · 已領 2 張/)).toBeTruthy();
    const w = within(screen.getByRole('region', { name: '提領' }));
    expect(w.getByText(/審核中 1,000 P/)).toBeTruthy();
    expect(w.getByText(/已匯款 2,000 P/)).toBeTruthy();
  });

  it('換線紀錄：曾有過的推薦人與新約事件；只有確認的那筆寫已生效', async () => {
    renderSheet(
      loaders({
        loadMember: vi.fn(async () =>
          audit({
            referrerHistory: {
              pastReferrers: [{ id: 'b', name: '前推薦人B', referralCode: null }],
              freshEvents: [
                {
                  completedAt: '2026-10-15T02:00:00Z',
                  newReferrerId: 'd',
                  newReferrerName: '新推薦人D',
                  effective: 'confirmed',
                },
                {
                  completedAt: '2026-09-01T02:00:00Z',
                  newReferrerId: 'c',
                  newReferrerName: '新推薦人C',
                  effective: 'unknown',
                },
              ],
            },
          }),
        ),
      }),
    );
    const sec = within(await screen.findByRole('region', { name: '換線紀錄' }));
    expect(sec.getByText('前推薦人B')).toBeTruthy();
    expect(sec.getByText(/新推薦人D/).closest('li')?.textContent).toContain('已生效');
    expect(sec.getByText(/新推薦人C/).closest('li')?.textContent).toContain(
      '現有資料無法確認是否生效',
    );
  });

  it('推薦人資料兩處不一致時寫資訊提示', async () => {
    renderSheet(loaders({ loadMember: vi.fn(async () => audit({ referrerMismatch: true })) }));
    expect(
      await screen.findByText('發獎的第 1 代依會員資料，樹依推薦關係，兩者目前不一致'),
    ).toBeTruthy();
  });
});

describe('ReferralAuditSheet 付款與三代獎金', () => {
  it('收獎人不符顯示應給與實發；缺漏時區塊頂部出現一次自癒提示', async () => {
    renderSheet(
      loaders({
        loadPayments: vi.fn(async () => ({
          total: 2,
          items: [
            item([
              gen(1, {
                result: 'recipient_mismatch',
                actualId: 'x',
                actualName: '他人',
                actualAmount: 100,
              }),
              gen(2, { result: 'missing', actualId: null, actualName: null, actualAmount: null }),
              gen(3, {
                result: 'not_applicable',
                expectedId: null,
                expectedName: null,
                actualId: null,
                actualName: null,
                actualAmount: null,
              }),
            ]),
            {
              ...item([
                gen(1, { result: 'missing', actualId: null, actualName: null, actualAmount: null }),
                gen(2),
                gen(3),
              ]),
              eventId: 'e2',
            },
          ],
        })),
      }),
    );
    const sec = within(await screen.findByRole('region', { name: '付款與三代獎金' }));
    await sec.findByText('已顯示 2 / 2 筆');
    expect(sec.getAllByText(/缺漏會在該會員下次登入載入時自動補發/)).toHaveLength(1);
    const first = sec.getAllByRole('listitem', { name: /付款/ })[0];
    const card = within(first);
    expect(card.getByText('收獎人不符')).toBeTruthy();
    expect(card.getByText('應給 收獎人1')).toBeTruthy();
    expect(card.getByText('實發 他人 · 100 P')).toBeTruthy();
    expect(card.getByText('應給 收獎人2')).toBeTruthy();
    expect(card.getByText('不適用')).toBeTruthy();
  });

  it('沒有付款紀錄寫空態；付款讀取失敗只影響這一區', async () => {
    renderSheet(loaders());
    expect(await screen.findByText('這位會員沒有付款紀錄')).toBeTruthy();
    cleanup();

    renderSheet(loaders({ loadPayments: vi.fn(async () => Promise.reject(new Error('boom'))) }));
    expect(await screen.findByText('付款紀錄讀取失敗')).toBeTruthy();
    expect(screen.getByRole('region', { name: '獎金與點數' })).toBeTruthy();
  });
});

describe('ReferralAuditSheet 讀取與跳轉', () => {
  it('查無此人寫找不到；讀取失敗另有重試', async () => {
    const missing = Object.assign(new Error('找不到此會員'), { status: 404 });
    renderSheet(loaders({ loadMember: vi.fn(async () => Promise.reject(missing)) }));
    expect(await screen.findByText('找不到此會員（可能已刪除）')).toBeTruthy();
    cleanup();

    const load = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(audit());
    renderSheet(loaders({ loadMember: load }));
    fireEvent.click(await screen.findByRole('button', { name: '重新載入' }));
    expect(await screen.findByRole('heading', { name: '王大明' })).toBeTruthy();
  });

  it('點推薦人 → 替換內容並可返回，返回時不重讀', async () => {
    const loadMember = vi.fn(async (id: string) =>
      id === 'p1' ? audit({ node: node({ id: 'p1', name: '陳推薦' }), upline: [] }) : audit(),
    );
    renderSheet(loaders({ loadMember }));
    fireEvent.click(await screen.findByRole('button', { name: '查看陳推薦' }));
    expect(await screen.findByRole('heading', { name: '陳推薦' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '返回王大明' }));
    expect(await screen.findByRole('heading', { name: '王大明' })).toBeTruthy();
    expect(loadMember.mock.calls.filter(([id]) => id === 'u1')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('button', { name: /^返回/ })).toBeNull());
  });

  it('portal 內容帶 session 錄影的遮蔽 class', async () => {
    renderSheet(loaders());
    await screen.findByRole('heading', { name: '王大明' });
    const dialog = screen.getByRole('dialog');
    for (const cls of privateClass().split(' ').filter(Boolean)) {
      expect(dialog.className).toContain(cls);
    }
  });
});

describe('ReferralAuditSheet 實作審查補強', () => {
  it('推薦計畫顯示已加入與加入日期；未加入時寫未加入', async () => {
    renderSheet(loaders());
    expect(await screen.findByText('推薦計畫：已加入（2026/10/01）')).toBeTruthy();
    cleanup();
    renderSheet(
      loaders({
        loadMember: vi.fn(async () =>
          audit({ node: node({ referralProgramJoined: false, referralProgramJoinedAt: null }) }),
        ),
      }),
    );
    expect(await screen.findByText('推薦計畫：未加入')).toBeTruthy();
  });

  it('需要注意的每一條可點，點了焦點移到對應區塊標題', async () => {
    renderSheet(
      loaders({
        loadMember: vi.fn(async () =>
          audit({
            anomalies: ['missing_reward', 'cycle'],
            paymentSummary: { missingCount: 2, mismatchCount: 0 },
          }),
        ),
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: '獎金缺漏 2 筆' }));
    expect(document.activeElement?.textContent).toBe('付款與三代獎金');
    fireEvent.click(screen.getByRole('button', { name: '推薦關係成環' }));
    expect(document.activeElement?.textContent).toBe('推薦人鏈');
  });

  it('曾有過的推薦人同時列出推薦碼', async () => {
    renderSheet(
      loaders({
        loadMember: vi.fn(async () =>
          audit({
            referrerHistory: {
              pastReferrers: [{ id: 'b', name: '前推薦人B', referralCode: '8048899' }],
              freshEvents: [],
            },
          }),
        ),
      }),
    );
    const sec = within(await screen.findByRole('region', { name: '換線紀錄' }));
    expect(sec.getByText('前推薦人B · 8048899')).toBeTruthy();
  });

  it('付款區重試後焦點落在該區標題', async () => {
    const loadPayments = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ total: 0, items: [] });
    renderSheet(loaders({ loadPayments }));
    fireEvent.click(await screen.findByRole('button', { name: '重試' }));
    await screen.findByText('這位會員沒有付款紀錄');
    await waitFor(() => expect(document.activeElement?.textContent).toBe('付款與三代獎金'));
  });

  it('結果徽章帶圖示（不只靠文字顏色）', async () => {
    renderSheet(
      loaders({
        loadPayments: vi.fn(async () => ({ total: 1, items: [item([gen(1), gen(2), gen(3)])] })),
      }),
    );
    const badge = await screen.findAllByText('已發');
    expect(badge[0].closest('[data-slot="badge"]')?.querySelector('svg')).toBeTruthy();
  });
});

describe('ReferralAuditSheet 獨立審查補強', () => {
  it('付款任一代缺漏寫自癒提示；任務續約只缺第 2 代寫請回報', async () => {
    const missing = {
      result: 'missing' as const,
      actualId: null,
      actualName: null,
      actualAmount: null,
    };
    renderSheet(
      loaders({
        loadPayments: vi.fn(async () => ({
          total: 1,
          items: [item([gen(1), gen(2, missing), gen(3)])],
        })),
      }),
    );
    const sec = within(await screen.findByRole('region', { name: '付款與三代獎金' }));
    await sec.findByText('已顯示 1 / 1 筆');
    expect(sec.getByText(/下次登入載入時自動補發/)).toBeTruthy();
    expect(sec.queryByText('這類缺漏不會自動補發，請回報。')).toBeNull();
    cleanup();
    renderSheet(
      loaders({
        loadPayments: vi.fn(async () => ({
          total: 1,
          items: [{ ...item([gen(1), gen(2, missing), gen(3)]), kind: 'claim' as const }],
        })),
      }),
    );
    const sec2 = within(await screen.findByRole('region', { name: '付款與三代獎金' }));
    await sec2.findByText('已顯示 1 / 1 筆');
    expect(sec2.queryByText(/下次登入載入時自動補發/)).toBeNull();
    expect(sec2.getByText('這類缺漏不會自動補發，請回報。')).toBeTruthy();
  });

  it('無法判定時寫依現況鏈的人僅供參考，不寫應給', async () => {
    renderSheet(
      loaders({
        loadPayments: vi.fn(async () => ({
          total: 1,
          items: [
            item([
              gen(1, { result: 'undeterminable', reason: 'referrer_mismatch' }),
              gen(2),
              gen(3),
            ]),
          ],
        })),
      }),
    );
    const sec = within(await screen.findByRole('region', { name: '付款與三代獎金' }));
    expect(await sec.findByText('無法判定：推薦人資料兩處不一致')).toBeTruthy();
    expect(sec.getByText('依現況鏈為 收獎人1（僅供參考）')).toBeTruthy();
    expect(sec.queryByText('應給 收獎人1')).toBeNull();
  });

  it('付款載入更多在途時停用，回來的結果以 eventId 去重', async () => {
    let release: (v: PaymentsData) => void = () => {};
    const loadPayments = vi.fn((_id: string, p: { offset: number }) =>
      p.offset
        ? new Promise<PaymentsData>((r) => {
            release = r;
          })
        : Promise.resolve({
            total: 3,
            items: [{ ...item([gen(1), gen(2), gen(3)]), eventId: 'e1' }],
          }),
    );
    renderSheet(loaders({ loadPayments }));
    const more = await screen.findByRole('button', { name: '載入更多' });
    fireEvent.click(more);
    fireEvent.click(more);
    expect(loadPayments).toHaveBeenCalledTimes(2);
    await act(async () =>
      release({
        total: 3,
        items: [
          { ...item([gen(1), gen(2), gen(3)]), eventId: 'e1' },
          { ...item([gen(1), gen(2), gen(3)]), eventId: 'e2' },
        ],
      }),
    );
    expect(screen.getByText('已顯示 2 / 3 筆')).toBeTruthy();
  });

  it('即將到期時頁首在到期日後寫剩幾天', async () => {
    renderSheet(
      loaders({
        loadMember: vi.fn(async () =>
          audit({
            node: node({ status: 'expiring', daysToExpiry: 5, endDate: '2026-11-13T15:59:59Z' }),
          }),
        ),
      }),
    );
    expect(await screen.findByText('2026/11/13 到期（剩 5 天）')).toBeTruthy();
  });
});

describe('ReferralAuditSheet 點數來源（S3b）', () => {
  function ledgerRow(over: Partial<LedgerData['items'][number]> = {}): LedgerData['items'][number] {
    return {
      id: 't1',
      at: '2026-11-01T04:00:00Z',
      type: 'referral_reward',
      sourceCategory: 'referral_signup',
      amount: 300,
      balanceAfter: 300,
      description: '推薦獎勵',
      generation: 1,
      refereeId: 'p1',
      refereeName: '付款人甲',
      eventAt: '2026-11-01T03:59:00Z',
      withdrawalId: null,
      withdrawalStatus: null,
      subscriptionId: 's1',
      finding: null,
      ...over,
    };
  }

  it('逐列寫分類、金額與異動後餘額；推薦獎勵寫第幾代與付款人', async () => {
    renderSheet(
      loaders({
        loadLedger: vi.fn(async () => ({
          total: 2,
          findings: [],
          items: [
            ledgerRow({
              id: 't2',
              type: 'withdrawal',
              sourceCategory: 'withdrawal',
              amount: -1015,
              balanceAfter: -715,
              generation: null,
              refereeId: null,
              refereeName: null,
              eventAt: null,
              withdrawalId: 'w1',
              withdrawalStatus: 'pending',
            }),
            ledgerRow(),
          ],
        })),
      }),
    );
    const sec = within(await screen.findByRole('region', { name: '點數來源' }));
    await sec.findByText('已顯示 2 / 2 筆');
    const rows = sec.getAllByRole('listitem');
    expect(within(rows[0]).getByText('提領 Point')).toBeTruthy();
    expect(within(rows[0]).getByText('−1,015 P')).toBeTruthy();
    expect(within(rows[0]).getByText('餘額 −715 P')).toBeTruthy();
    expect(within(rows[0]).getByText('提領單：審核中')).toBeTruthy();
    expect(within(rows[1]).getByText('+300 P')).toBeTruthy();
    expect(within(rows[1]).getByText(/第 1 代 · 付款人甲/)).toBeTruthy();
    expect(sec.queryByText(/點數跨表核對不符/)).toBeNull();
  });

  it('核對不符時區塊頂部列出原因、該列加徽章，並寫清空競態說明', async () => {
    renderSheet(
      loaders({
        loadMember: vi.fn(async () => audit({ anomalies: ['ledger_mismatch'] })),
        loadLedger: vi.fn(async () => ({
          total: 1,
          findings: [
            { kind: 'reset_amount' as const, transactionId: 't1', withdrawalId: null, info: false },
            {
              kind: 'refund_missing' as const,
              transactionId: null,
              withdrawalId: 'w9',
              info: false,
            },
          ],
          items: [
            ledgerRow({
              type: 'ledger_reset',
              sourceCategory: 'ledger_reset',
              amount: -300,
              finding: 'reset_amount',
            }),
          ],
        })),
      }),
    );
    const sec = within(await screen.findByRole('region', { name: '點數來源' }));
    expect(await sec.findByText('新約清空的金額與清空前的餘額不符')).toBeTruthy();
    expect(sec.getByText('退件的提領沒有恰好一筆正確金額的退款')).toBeTruthy();
    expect(sec.getByText(/別筆交易同時寫入/)).toBeTruthy();
    expect(within(sec.getAllByRole('listitem').at(-1)!).getByText('核對不符')).toBeTruthy();
  });

  it('需要注意列出點數跨表核對不符，點了焦點移到點數來源標題', async () => {
    renderSheet(
      loaders({ loadMember: vi.fn(async () => audit({ anomalies: ['ledger_mismatch'] })) }),
    );
    fireEvent.click(await screen.findByRole('button', { name: '點數跨表核對不符' }));
    expect(document.activeElement?.textContent).toBe('點數來源');
  });

  it('延遲補沖只寫資訊，不列為核對不符', async () => {
    renderSheet(
      loaders({
        loadLedger: vi.fn(async () => ({
          total: 1,
          findings: [
            { kind: 'reset_delayed' as const, transactionId: 't1', withdrawalId: null, info: true },
          ],
          items: [
            ledgerRow({ type: 'ledger_reset', sourceCategory: 'ledger_reset', amount: -120 }),
          ],
        })),
      }),
    );
    const sec = within(await screen.findByRole('region', { name: '點數來源' }));
    expect(await sec.findByText('有一筆延遲補沖的清空，金額以告警快照為準')).toBeTruthy();
    expect(sec.queryByText(/點數跨表核對不符/)).toBeNull();
  });

  it('沒有紀錄寫空態；讀取失敗只影響這一區，重試後載入', async () => {
    const loadLedger = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ total: 0, items: [], findings: [] });
    renderSheet(loaders({ loadLedger }));
    const sec = within(await screen.findByRole('region', { name: '點數來源' }));
    expect(await sec.findByText('點數來源讀取失敗')).toBeTruthy();
    fireEvent.click(sec.getByRole('button', { name: '重試' }));
    expect(await sec.findByText('帳本沒有紀錄')).toBeTruthy();
    expect(screen.getByRole('region', { name: '推薦人鏈' })).toBeTruthy();
  });

  it('載入更多接著往下取，回來的結果以 id 去重', async () => {
    const loadLedger = vi.fn(async (_id: string, p: { offset: number }) =>
      p.offset === 0
        ? { total: 3, findings: [], items: [ledgerRow({ id: 'a' })] }
        : { total: 3, findings: [], items: [ledgerRow({ id: 'a' }), ledgerRow({ id: 'b' })] },
    );
    renderSheet(loaders({ loadLedger }));
    const sec = within(await screen.findByRole('region', { name: '點數來源' }));
    fireEvent.click(await sec.findByRole('button', { name: '載入更多' }));
    expect(await sec.findByText('已顯示 2 / 3 筆')).toBeTruthy();
    expect(loadLedger).toHaveBeenLastCalledWith('u1', { limit: 20, offset: 1 });
  });
});
