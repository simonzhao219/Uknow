// @vitest-environment jsdom
//
// 會員端的證件審核狀態區塊。
//
// 這支測試守的核心是**退回理由要到得了會員面前**：看不到理由的會員只會重送
// 一模一樣的照片，然後再被退一次。整條證件審核流程的價值就卡在這一句話上。
//
// 另一個關鍵是 pending 的文案必須明講「審核期間仍可正常申請提領」——需求方
// 裁決了審核只擋 rejected（plan §2.1），但會員看到「審核中」的直覺是「要等」。
// 不寫清楚，這個裁決省下的等待就白費了。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IdVerificationSection, type IdPhotosData } from './IdVerificationSection';

afterEach(cleanup);

function data(over: Partial<IdPhotosData> = {}): IdPhotosData {
  return {
    frontUrl: null,
    backUrl: null,
    verificationStatus: 'none',
    rejectReason: null,
    ...over,
  };
}

function renderSection(
  opts: {
    loadStatus?: () => Promise<IdPhotosData>;
    uploadPhotos?: (files: { front?: File; back?: File }) => Promise<void>;
  } = {},
) {
  return render(
    <IdVerificationSection
      loadStatus={opts.loadStatus ?? (async () => data())}
      uploadPhotos={opts.uploadPhotos ?? (async () => {})}
    />,
  );
}

describe('IdVerificationSection', () => {
  it('取資料期間顯示載入態，不是空白', async () => {
    let resolve!: (v: IdPhotosData) => void;
    const pending = new Promise<IdPhotosData>((r) => {
      resolve = r;
    });
    renderSection({ loadStatus: () => pending });

    expect(screen.getByRole('status', { name: '載入證件狀態中' })).toBeTruthy();
    resolve(data({ verificationStatus: 'approved' }));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('取資料失敗時顯示錯誤態並提供重試', async () => {
    const loadStatus = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(data({ verificationStatus: 'approved' }));
    renderSection({ loadStatus });

    await screen.findByText('無法取得證件審核狀態');
    fireEvent.click(screen.getByRole('button', { name: '重試' }));

    await screen.findByText('證件已通過審核');
    expect(loadStatus).toHaveBeenCalledTimes(2);
  });

  it('審核中時說明預計工作天，並講明期間仍可申請提領', async () => {
    renderSection({ loadStatus: async () => data({ verificationStatus: 'pending' }) });

    await screen.findByText('證件審核中');
    // 需求方裁決的 SLA
    expect(screen.getByText(/3 個工作天/)).toBeTruthy();
    // 審核只擋 rejected，不講清楚會員會以為要乾等
    expect(screen.getByText(/仍可正常申請提領/)).toBeTruthy();
  });

  it('被退回時顯示 admin 填的理由', async () => {
    renderSection({
      loadStatus: async () =>
        data({ verificationStatus: 'rejected', rejectReason: '背面反光看不清出生年月日' }),
    });

    await screen.findByText('證件審核未通過');
    expect(screen.getByText('背面反光看不清出生年月日')).toBeTruthy();
  });

  it('被退回時提供重新上傳入口', async () => {
    renderSection({
      loadStatus: async () => data({ verificationStatus: 'rejected', rejectReason: '照片模糊' }),
    });

    await screen.findByText('證件審核未通過');
    // 被退回的人無法靠提領流程重傳——那條路會被守衛 #5a 擋下，
    // 所以這個區塊必須自己給得出上傳入口。
    expect(screen.getByLabelText('身分證正面')).toBeTruthy();
    expect(screen.getByLabelText('身分證反面')).toBeTruthy();
  });

  it('尚未上傳時引導上傳，不顯示退回理由區', async () => {
    renderSection({ loadStatus: async () => data({ verificationStatus: 'none' }) });

    await screen.findByText('尚未上傳身分證');
    expect(screen.queryByText('證件審核未通過')).toBeNull();
  });

  it('上傳成功後重新取狀態，畫面跟著更新', async () => {
    const loadStatus = vi
      .fn()
      .mockResolvedValueOnce(data({ verificationStatus: 'none' }))
      .mockResolvedValueOnce(data({ verificationStatus: 'pending' }));
    const uploadPhotos = vi.fn().mockResolvedValue(undefined);
    renderSection({ loadStatus, uploadPhotos });

    await screen.findByText('尚未上傳身分證');
    const front = screen.getByLabelText('身分證正面') as HTMLInputElement;
    fireEvent.change(front, {
      target: { files: [new File(['x'], 'f.jpg', { type: 'image/jpeg' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: '送出審核' }));

    await screen.findByText('證件審核中');
    expect(uploadPhotos).toHaveBeenCalledTimes(1);
    expect(loadStatus).toHaveBeenCalledTimes(2);
  });

  it('一面都沒選時送出鍵不可用', async () => {
    renderSection({ loadStatus: async () => data({ verificationStatus: 'none' }) });

    await screen.findByText('尚未上傳身分證');
    expect((screen.getByRole('button', { name: '送出審核' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
