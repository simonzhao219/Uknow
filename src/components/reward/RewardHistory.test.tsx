// @vitest-environment jsdom
//
// 獎勵明細（S7a）：世代 chip 用世代色並寫「一代／二代」（不寫「第 N 代」）、負項紅字；
// 讀取失敗＝LoadErrorCallout，重試只重發明細請求（不 window.location.reload），
// 重試落地後焦點不掉在 body（ui-ux-guidelines §6、§9、§12.11）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RewardHistory } from './RewardHistory';
import { apiRequestJson } from '../../utils/apiClient';

vi.mock('../../utils/apiClient', () => ({
  apiRequestJson: vi.fn(),
  buildApiUrl: (p: string) => p,
  ApiError: class ApiError extends Error {
    status = 0;
  },
}));

const mockRequest = vi.mocked(apiRequestJson);

const record = (over: Record<string, unknown> = {}) => ({
  id: 'h1',
  type: 'referral_reward',
  sourceCategory: 'referral_signup',
  amount: 100,
  description: '',
  issuedAt: '2026-09-30T01:10:00.000Z',
  generation: 1,
  balance: 1500,
  refereeName: '十密特',
  ...over,
});

const response = (history: Record<string, unknown>[]) => ({
  success: true,
  data: {
    history,
    total: history.length,
    limit: 50,
    offset: 0,
    sources: [
      { sourceCategory: 'referral_signup', count: 2 },
      { sourceCategory: 'withdrawal', count: 1 },
    ],
  },
});

beforeEach(() => {
  mockRequest.mockReset();
});
afterEach(cleanup);

describe('RewardHistory 世代與金額', () => {
  it('推薦獎勵的世代 chip 用世代色並寫「二代」，不寫「第 2 代」', async () => {
    mockRequest.mockResolvedValue(response([record({ generation: 2 })]) as never);
    render(<RewardHistory />);
    const chip = await screen.findByText('二代');
    expect(chip.className).toContain('bg-[var(--tree-gen-badge-2)]');
    expect(chip.className).toContain('text-[var(--tree-gen-badge-foreground-2)]');
    expect(screen.queryByText('第 2 代')).toBeNull();
  });

  it('沒有世代的類別（提領）不出世代 chip', async () => {
    mockRequest.mockResolvedValue(
      response([
        record({
          id: 'w1',
          type: 'withdrawal',
          sourceCategory: 'withdrawal',
          amount: -1015,
          generation: undefined,
          refereeName: undefined,
        }),
      ]) as never,
    );
    render(<RewardHistory />);
    await screen.findByText('提領 1000 P + 手續費 15 P');
    expect(screen.queryByText(/^(一代|二代|三代)$/)).toBeNull();
  });

  it('入帳為正（綠字加＋號）、提領為負（紅字）', async () => {
    mockRequest.mockResolvedValue(
      response([
        record({ id: 'a', amount: 100 }),
        record({
          id: 'b',
          type: 'withdrawal',
          sourceCategory: 'withdrawal',
          amount: -1015,
          generation: undefined,
          refereeName: undefined,
        }),
      ]) as never,
    );
    render(<RewardHistory />);
    expect((await screen.findByText('+100P')).className).toContain(
      'text-success-subtle-foreground',
    );
    expect(screen.getByText('-1015P').className).toContain('text-destructive-subtle-foreground');
  });
});

describe('RewardHistory 讀取失敗', () => {
  it('顯示黃框與重新載入；點了只重發明細請求並顯示資料', async () => {
    mockRequest
      .mockRejectedValueOnce(new Error('網路錯誤'))
      .mockResolvedValueOnce(response([record({ refereeName: '重試後的名字' })]) as never);
    render(<RewardHistory />);

    expect(await screen.findByText('暫時無法取得獎勵明細')).toBeTruthy();
    expect(screen.getByText('網路錯誤')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '重新載入' }));
    });

    expect(await screen.findByText('重試後的名字')).toBeTruthy();
    expect(mockRequest).toHaveBeenCalledTimes(2);
  });

  it('重試成功後焦點落到「獎勵明細」標題', async () => {
    mockRequest
      .mockRejectedValueOnce(new Error('網路錯誤'))
      .mockResolvedValueOnce(response([record()]) as never);
    render(<RewardHistory />);
    const retry = await screen.findByRole('button', { name: '重新載入' });
    act(() => retry.focus());
    await act(async () => {
      fireEvent.click(retry);
    });

    await screen.findByText('十密特');
    expect(document.activeElement).toBe(screen.getByTestId('reward-history-heading'));
  });

  it('重試仍失敗時焦點回到錯誤框', async () => {
    mockRequest.mockRejectedValue(new Error('網路錯誤'));
    render(<RewardHistory />);
    const retry = await screen.findByRole('button', { name: '重新載入' });
    act(() => retry.focus());
    await act(async () => {
      fireEvent.click(retry);
    });

    await screen.findByText('暫時無法取得獎勵明細');
    const callout = document.querySelector('[data-slot="status-callout"]');
    expect(document.activeElement).toBe(callout?.parentElement);
  });
});
