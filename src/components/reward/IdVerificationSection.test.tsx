// @vitest-environment jsdom
//
// 會員端的證件退回警示卡。
//
// 這個元件的契約是「**只在 rejected 時現身**」:none/pending/approved 對使用者
// 都沒有行動價值(上傳走提領流程步驟 3、pending 不擋任何事、approved 無事可做),
// 常駐渲染只會變成紅色噪音——設計討論詳見 PR 描述。
//
// 這支測試守的核心仍是**退回理由要到得了會員面前**:看不到理由的會員只會重送
// 一模一樣的照片,然後再被退一次。此外守「非 rejected 一律不渲染」——包含
// 載入中與載入失敗:先閃骨架再消失是新的噪音,而這張卡只是輔助通道,
// 提領流程內還有一道 rejected 引導,載入失敗不值得在這裡打擾使用者。
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
  it('none 狀態時整卡不渲染', async () => {
    const loadStatus = vi.fn().mockResolvedValue(data({ verificationStatus: 'none' }));
    const { container } = renderSection({ loadStatus });

    await waitFor(() => expect(loadStatus).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('pending 狀態時整卡不渲染', async () => {
    const loadStatus = vi.fn().mockResolvedValue(data({ verificationStatus: 'pending' }));
    const { container } = renderSection({ loadStatus });

    await waitFor(() => expect(loadStatus).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('approved 狀態時整卡不渲染', async () => {
    const loadStatus = vi.fn().mockResolvedValue(data({ verificationStatus: 'approved' }));
    const { container } = renderSection({ loadStatus });

    await waitFor(() => expect(loadStatus).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('載入期間不渲染——rejected 確認前不閃骨架', () => {
    const never = new Promise<IdPhotosData>(() => {});
    const { container } = renderSection({ loadStatus: () => never });

    expect(container.firstChild).toBeNull();
  });

  it('載入失敗時靜默不渲染', async () => {
    const loadStatus = vi.fn().mockRejectedValue(new Error('boom'));
    const { container } = renderSection({ loadStatus });

    await waitFor(() => expect(loadStatus).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.firstChild).toBeNull());
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
    // 提領流程內的重傳要走完整申請;不想（或暫時不能）提領的人得有
    // 流程外的補救通道,否則退回狀態會一直掛著。
    expect(screen.getByLabelText('身分證正面')).toBeTruthy();
    expect(screen.getByLabelText('身分證反面')).toBeTruthy();
  });

  it('退回理由缺失時顯示聯繫客服的後備文案', async () => {
    renderSection({
      loadStatus: async () => data({ verificationStatus: 'rejected', rejectReason: null }),
    });

    // 理由理論上必填(後端 note_required),但契約允許 null——空白的退回
    // 警示比看不到更糟,後備文案至少給出下一步。
    await screen.findByText('證件審核未通過');
    expect(screen.getByText('請聯繫客服了解原因')).toBeTruthy();
  });

  it('只補反面一張也可送出審核', async () => {
    const uploadPhotos = vi.fn().mockResolvedValue(undefined);
    renderSection({
      loadStatus: async () => data({ verificationStatus: 'rejected', rejectReason: '反面模糊' }),
      uploadPhotos,
    });

    await screen.findByText('證件審核未通過');
    fireEvent.change(screen.getByLabelText('身分證反面') as HTMLInputElement, {
      target: { files: [new File(['x'], 'b.jpg', { type: 'image/jpeg' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: '送出審核' }));

    // 只退一面時逐面補傳是合法路徑(上傳端點會與既有照片合併)。
    await waitFor(() => expect(uploadPhotos).toHaveBeenCalledTimes(1));
    expect(uploadPhotos.mock.calls[0][0].back).toBeTruthy();
    expect(uploadPhotos.mock.calls[0][0].front).toBeUndefined();
  });

  it('被退回但一面都沒選時送出鍵不可用', async () => {
    renderSection({
      loadStatus: async () => data({ verificationStatus: 'rejected', rejectReason: '照片模糊' }),
    });

    await screen.findByText('證件審核未通過');
    expect((screen.getByRole('button', { name: '送出審核' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('重傳成功轉 pending 後卡片消失', async () => {
    const loadStatus = vi
      .fn()
      .mockResolvedValueOnce(data({ verificationStatus: 'rejected', rejectReason: '照片模糊' }))
      .mockResolvedValueOnce(data({ verificationStatus: 'pending' }));
    const uploadPhotos = vi.fn().mockResolvedValue(undefined);
    const { container } = renderSection({ loadStatus, uploadPhotos });

    await screen.findByText('證件審核未通過');
    const front = screen.getByLabelText('身分證正面') as HTMLInputElement;
    fireEvent.change(front, {
      target: { files: [new File(['x'], 'f.jpg', { type: 'image/jpeg' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: '送出審核' }));

    await waitFor(() => expect(container.firstChild).toBeNull());
    expect(uploadPhotos).toHaveBeenCalledTimes(1);
    expect(loadStatus).toHaveBeenCalledTimes(2);
  });
});
