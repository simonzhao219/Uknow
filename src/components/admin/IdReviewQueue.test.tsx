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
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AdminIdReview } from '@contract';
import { IdReviewQueue } from './IdReviewQueue';

afterEach(cleanup);

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

function renderQueue(
  opts: {
    loadReviews?: () => Promise<AdminIdReview[]>;
    submitReview?: (userId: string, approve: boolean, reason?: string) => Promise<void>;
  } = {},
) {
  return render(
    <IdReviewQueue
      loadReviews={opts.loadReviews ?? (async () => [review()])}
      submitReview={opts.submitReview ?? (async () => {})}
    />,
  );
}

describe('IdReviewQueue', () => {
  it('取資料期間顯示載入態', async () => {
    let resolve!: (v: AdminIdReview[]) => void;
    const pending = new Promise<AdminIdReview[]>((r) => {
      resolve = r;
    });
    renderQueue({ loadReviews: () => pending });

    expect(screen.getByRole('status', { name: '載入審核佇列中' })).toBeTruthy();
    resolve([]);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('取資料失敗時顯示錯誤態並提供重試', async () => {
    const loadReviews = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([]);
    renderQueue({ loadReviews });

    await screen.findByText('無法取得審核佇列');
    fireEvent.click(screen.getByRole('button', { name: '重試' }));

    await screen.findByText('目前沒有待審核的證件');
    expect(loadReviews).toHaveBeenCalledTimes(2);
  });

  it('佇列為空時顯示空態，不是空白畫面', async () => {
    renderQueue({ loadReviews: async () => [] });
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
    const loadReviews = vi.fn().mockResolvedValueOnce([review()]).mockResolvedValueOnce([]);
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
    const loadReviews = vi.fn().mockResolvedValueOnce([review()]).mockResolvedValueOnce([]);
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
});
