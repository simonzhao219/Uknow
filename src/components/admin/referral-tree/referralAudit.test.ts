import type { AdminReferralNode } from '@admin-referral-contract';
import { describe, expect, it } from 'vitest';
import {
  anomalyLabel,
  appendPage,
  displayName,
  emptyLayer,
  expansionPath,
  layerLabel,
  nodeAnomalyBadges,
  resultLabel,
  rowsToRender,
  shownCount,
  unplaceableReasonText,
  uplineLabel,
  withdrawalBlockReason,
} from './referralAudit';

function node(id: string, over: Partial<AdminReferralNode> = {}): AdminReferralNode {
  return {
    id,
    name: `會員${id}`,
    referralCode: null,
    layer: 1,
    directCount: 0,
    status: 'active',
    daysToExpiry: 100,
    endDate: null,
    referralProgramJoined: true,
    referralProgramJoinedAt: null,
    anomalyKinds: [],
    anomalyScanTruncated: false,
    ...over,
  };
}

describe('appendPage／rowsToRender／shownCount', () => {
  it('pinned 接在已載入列尾端且不計入已顯示數', () => {
    const s = appendPage(emptyLayer(), {
      nodes: [node('a'), node('b')],
      total: 5,
      pinned: node('t'),
    });
    expect(rowsToRender(s).map((r) => [r.node.id, r.pinned])).toEqual([
      ['a', false],
      ['b', false],
      ['t', true],
    ]);
    expect(shownCount(s)).toBe(2);
    expect(s.total).toBe(5);
  });

  it('之後的正常頁載到 pinned 的 id 時不重複渲染，但計入已顯示數', () => {
    let s = appendPage(emptyLayer(), { nodes: [node('a')], total: 3, pinned: node('t') });
    s = appendPage(s, { nodes: [node('t'), node('c')], total: 3, pinned: null });
    expect(rowsToRender(s).map((r) => r.node.id)).toEqual(['a', 'c', 't']);
    expect(rowsToRender(s).at(-1)?.pinned).toBe(true);
    expect(shownCount(s)).toBe(3);
  });

  it('下一頁再回同一個 pinned 時保留第一次的 pinned，不重複', () => {
    let s = appendPage(emptyLayer(), { nodes: [node('a')], total: 3, pinned: node('t') });
    s = appendPage(s, { nodes: [node('b')], total: 3, pinned: node('t') });
    expect(rowsToRender(s).filter((r) => r.node.id === 't')).toHaveLength(1);
  });

  it('重複的正常列只保留一份', () => {
    let s = appendPage(emptyLayer(), { nodes: [node('a'), node('b')], total: 3, pinned: null });
    s = appendPage(s, { nodes: [node('b'), node('c')], total: 3, pinned: null });
    expect(rowsToRender(s).map((r) => r.node.id)).toEqual(['a', 'b', 'c']);
    expect(shownCount(s)).toBe(3);
  });
});

describe('resultLabel', () => {
  it('六種結果都有中文文字，缺漏、收獎人不符、成環停發用 warning', () => {
    expect(resultLabel('paid', null)).toEqual({ text: '已發', tone: 'neutral' });
    expect(resultLabel('not_applicable', null)).toEqual({ text: '不適用', tone: 'neutral' });
    expect(resultLabel('missing', null)).toEqual({ text: '缺漏', tone: 'warning' });
    expect(resultLabel('recipient_mismatch', null)).toEqual({
      text: '收獎人不符',
      tone: 'warning',
    });
    expect(resultLabel('cycle_stopped', null)).toEqual({ text: '成環停發', tone: 'warning' });
    expect(resultLabel('undeterminable', 'changed_after').tone).toBe('muted');
  });

  it('無法判定時帶出原因', () => {
    expect(resultLabel('undeterminable', 'changed_after').text).toBe(
      '無法判定：付款後推薦關係有變動',
    );
    expect(resultLabel('undeterminable', 'no_subscription').text).toBe('無法判定：找不到對應訂閱');
  });
});

describe('nodeAnomalyBadges', () => {
  it('兩種以內逐一列出，超過兩種收成 N 項異常', () => {
    expect(nodeAnomalyBadges(['missing_reward'])).toEqual(['獎金缺漏']);
    expect(nodeAnomalyBadges(['cycle', 'self_referral'])).toEqual(['推薦關係成環', '自己推薦自己']);
    expect(nodeAnomalyBadges(['cycle', 'missing_reward', 'recipient_mismatch'])).toEqual([
      '3 項異常',
    ]);
    expect(nodeAnomalyBadges([])).toEqual([]);
  });

  it('anomalyLabel 涵蓋四種異常', () => {
    expect(anomalyLabel('recipient_mismatch')).toBe('收獎人不符');
  });
});

describe('文案', () => {
  it('layerLabel：有層級寫第 N 層，沒有寫層級無法判定', () => {
    expect(layerLabel(3)).toBe('第 3 層');
    expect(layerLabel(null)).toBe('層級無法判定');
  });

  it('uplineLabel：第一位是推薦人，其後寫往上第 N 位', () => {
    expect([0, 1, 2].map(uplineLabel)).toEqual(['推薦人', '往上第 2 位', '往上第 3 位']);
  });

  it('displayName：姓名為空時寫未填姓名', () => {
    expect(displayName('')).toBe('未填姓名');
    expect(displayName('  ')).toBe('未填姓名');
    expect(displayName('王大明')).toBe('王大明');
  });

  it('unplaceableReasonText：成環與超過 50 層各有說明', () => {
    expect(unplaceableReasonText('cycle')).toBe('推薦關係成環，無法在樹上定位');
    expect(unplaceableReasonText('truncated')).toBe('往上超過 50 層，無法在樹上定位');
  });
});

describe('withdrawalBlockReason', () => {
  it('依提領守衛順序取第一個原因：停權、未加入推薦計畫、會籍失效', () => {
    expect(
      withdrawalBlockReason(node('x', { status: 'suspended', referralProgramJoined: false })),
    ).toBe('獎金照常入帳，但目前不可提領（帳號已停權）');
    expect(
      withdrawalBlockReason(node('x', { status: 'expired', referralProgramJoined: false })),
    ).toBe('獎金照常入帳，但目前不可提領（尚未加入推薦計畫）');
    expect(withdrawalBlockReason(node('x', { status: 'expired' }))).toBe(
      '獎金照常入帳，但目前不可提領（會籍已失效）',
    );
  });

  it('訂閱中、即將到期且已加入推薦計畫時沒有說明', () => {
    expect(withdrawalBlockReason(node('x', { status: 'expiring' }))).toBeNull();
  });
});

describe('expansionPath', () => {
  it('由頂層逐層往下，每層確保包含下一層的人', () => {
    expect(expansionPath('t', ['r', 'a'], null)).toEqual([
      { kind: 'top', ensureId: 'r' },
      { kind: 'children', parentId: 'r', ensureId: 'a' },
      { kind: 'children', parentId: 'a', ensureId: 't' },
    ]);
  });

  it('本人就在頂層時只有一步', () => {
    expect(expansionPath('t', [], null)).toEqual([{ kind: 'top', ensureId: 't' }]);
  });

  it('成環時改走無法接上推薦樹的群組；超過 50 層時回 null（只開詳情）', () => {
    expect(expansionPath('t', null, 'cycle')).toEqual([{ kind: 'unplaceable', ensureId: 't' }]);
    expect(expansionPath('t', null, 'truncated')).toBeNull();
  });
});
