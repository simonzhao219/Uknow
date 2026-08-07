// @vitest-environment jsdom
//
// 提領申請多步驟流程——目前只守「證件被退回時的步驟 3 引導」。
//
// 背景:守衛 #5a 在**送出時**才擋 rejected,而 validateStep2 允許沿用既有照片
// ——被退回的會員若沿用照片,會填完整張表才被後端打回(toast)。這裡守的是
// 前端引導:rejected 要在步驟 3 一進來就看到退回原因,且既有照片(正是被
// 退回的那組)不得沿用——兩面都強制新上傳,杜絕「重送同一份資料」
// (規格書 §10.1 點名的失敗模式)。上傳新照片會轉 pending,守衛隨之放行。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { IdPhotosResponse } from '@contract';

const apiRequestJson = vi.fn();
vi.mock('../../utils/apiClient', () => ({
  apiRequestJson: (...args: unknown[]) => apiRequestJson(...args),
  buildApiUrl: (path: string) => path,
  ApiError: class ApiError extends Error {},
}));
vi.mock('../notifications/NotificationContext', () => ({
  useNotification: () => ({ showToast: vi.fn() }),
}));

import { WithdrawalProcess } from './WithdrawalProcess';

function idPhotosResponse(over: Partial<IdPhotosResponse['data']> = {}): IdPhotosResponse {
  return {
    success: true,
    data: {
      frontUrl: 'https://mock/front.jpg',
      backUrl: 'https://mock/back.jpg',
      verificationStatus: 'pending',
      rejectReason: null,
      ...over,
    },
  };
}

function mockIdPhotos(res: IdPhotosResponse) {
  apiRequestJson.mockImplementation(async (url: unknown) => {
    if (String(url).includes('/rewards/id-photos')) return res;
    return { success: true };
  });
}

async function renderAndGoToStep3() {
  render(
    <WithdrawalProcess
      availableRewards={5000}
      pendingRewards={0}
      onSuccess={() => {}}
      onCancel={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText(/提領Point \*/), { target: { value: '1000' } });
  fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
  fireEvent.click(await screen.findByRole('button', { name: /確認並繼續/ }));
  await screen.findByLabelText('身分證字號 *');
}

beforeEach(() => {
  apiRequestJson.mockReset();
  localStorage.clear();
});
afterEach(cleanup);

describe('WithdrawalProcess', () => {
  it('證件被退回時步驟 3 顯示退回原因警示', async () => {
    mockIdPhotos(
      idPhotosResponse({
        verificationStatus: 'rejected',
        rejectReason: '背面反光看不清出生年月日',
      }),
    );
    await renderAndGoToStep3();

    await screen.findByText('證件審核未通過');
    expect(screen.getByText('背面反光看不清出生年月日')).toBeTruthy();
    expect(screen.getByText(/重新上傳身分證正反面/)).toBeTruthy();
  });

  it('證件被退回時既有照片不予沿用——兩面都要求重新上傳', async () => {
    mockIdPhotos(idPhotosResponse({ verificationStatus: 'rejected', rejectReason: '照片模糊' }));
    await renderAndGoToStep3();

    await screen.findByText('證件審核未通過');
    // 被退回的照片不得以縮圖現身(那正是要被換掉的那組),兩面都回到上傳區。
    expect(screen.queryByLabelText('移除正面照片')).toBeNull();
    expect(screen.queryByLabelText('移除背面照片')).toBeNull();
    expect(screen.getByText('上傳正面照')).toBeTruthy();
    expect(screen.getByText('上傳背面照')).toBeTruthy();
  });

  it('證件未被退回時既有照片照常帶入且無退回警示', async () => {
    mockIdPhotos(idPhotosResponse({ verificationStatus: 'pending' }));
    await renderAndGoToStep3();

    // 既有照片以縮圖呈現(可移除重傳),不顯示退回警示。
    expect(await screen.findByLabelText('移除正面照片')).toBeTruthy();
    expect(screen.getByLabelText('移除背面照片')).toBeTruthy();
    expect(screen.queryByText('證件審核未通過')).toBeNull();
  });
});
