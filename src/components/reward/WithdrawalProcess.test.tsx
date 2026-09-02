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

  it('退回理由缺失時顯示聯繫客服的後備文案', async () => {
    mockIdPhotos(idPhotosResponse({ verificationStatus: 'rejected', rejectReason: null }));
    await renderAndGoToStep3();

    // 理由欄位理論上必填(後端 note_required),但契約允許 null——
    // 空白的退回警示比看不到警示更糟,後備文案至少給出下一步。
    await screen.findByText('證件審核未通過');
    expect(screen.getByText('請聯繫客服了解原因')).toBeTruthy();
  });

  it('移除既有照片後該面回到上傳區', async () => {
    mockIdPhotos(idPhotosResponse({ verificationStatus: 'pending' }));
    await renderAndGoToStep3();

    fireEvent.click(await screen.findByLabelText('移除正面照片'));

    // 正面回到上傳區,背面縮圖不受影響——兩面各自獨立。
    expect(screen.getByText('上傳正面照')).toBeTruthy();
    expect(screen.getByLabelText('移除背面照片')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('移除背面照片'));
    expect(screen.getByText('上傳背面照')).toBeTruthy();
  });

  it('選擇非圖片檔案時顯示格式錯誤', async () => {
    mockIdPhotos(idPhotosResponse({ verificationStatus: 'none', frontUrl: null, backUrl: null }));
    await renderAndGoToStep3();

    const front = (await screen.findByText('上傳正面照')).closest('label') as HTMLLabelElement;
    const input = front.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'doc.txt', { type: 'text/plain' })] },
    });

    await screen.findByText('請上傳圖片檔案');
  });

  it('身分證字號格式正確且後端驗證通過時顯示成功標記', async () => {
    mockIdPhotos(idPhotosResponse());
    await renderAndGoToStep3();

    fireEvent.change(screen.getByLabelText('身分證字號 *'), { target: { value: 'A123456789' } });

    await screen.findByText('✓ 身分證驗證成功');
  });

  it('後端身分證驗證失敗時顯示欄位錯誤', async () => {
    apiRequestJson.mockImplementation(async (url: unknown) => {
      if (String(url).includes('/rewards/id-photos')) return idPhotosResponse();
      if (String(url).includes('/rewards/verify-id')) {
        return { success: false, message: '身分證字號與會員資料不符' };
      }
      return { success: true };
    });
    await renderAndGoToStep3();

    fireEvent.change(screen.getByLabelText('身分證字號 *'), { target: { value: 'A123456789' } });

    await screen.findByText('身分證字號與會員資料不符');
    expect(screen.queryByText('✓ 身分證驗證成功')).toBeNull();
  });

  it('已儲存的銀行帳號自動帶入步驟 3', async () => {
    localStorage.setItem(
      'withdrawalBankData',
      JSON.stringify({ bankCode: '004', bankAccount: '1234567890' }),
    );
    mockIdPhotos(idPhotosResponse());
    await renderAndGoToStep3();

    expect((screen.getByLabelText('收款銀行帳號 *') as HTMLInputElement).value).toBe('1234567890');
  });

  it('已存銀行資料損毀時流程照常啟動', async () => {
    localStorage.setItem('withdrawalBankData', '{not json');
    mockIdPhotos(idPhotosResponse());
    await renderAndGoToStep3();

    // 壞資料被吞掉(console.error),欄位保持空白而不是整頁掛掉。
    expect((screen.getByLabelText('收款銀行帳號 *') as HTMLInputElement).value).toBe('');
  });

  it('選擇超過 5MB 的照片時顯示大小錯誤', async () => {
    mockIdPhotos(idPhotosResponse({ verificationStatus: 'none', frontUrl: null, backUrl: null }));
    await renderAndGoToStep3();

    const front = (await screen.findByText('上傳正面照')).closest('label') as HTMLLabelElement;
    const input = front.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [
          new File([new ArrayBuffer(5 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' }),
        ],
      },
    });

    await screen.findByText('檔案大小不能超過 5MB');
  });

  it('金額非 1000 倍數時停在步驟 1 並顯示錯誤', async () => {
    mockIdPhotos(idPhotosResponse());
    render(
      <WithdrawalProcess
        availableRewards={5000}
        pendingRewards={0}
        onSuccess={() => {}}
        onCancel={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText(/提領Point \*/), { target: { value: '1500' } });
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));

    await screen.findByText('提領Point必須為 1000 的倍數');
    // 沒進步驟 2:提領明細不在畫面上。
    expect(screen.queryByText('確認並繼續')).toBeNull();
  });

  it('步驟 2 按上一步回到金額設定', async () => {
    mockIdPhotos(idPhotosResponse());
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
    fireEvent.click(await screen.findByRole('button', { name: /上一步/ }));

    // 回到步驟 1:金額輸入欄仍在且保留原值。
    expect((screen.getByLabelText(/提領Point \*/) as HTMLInputElement).value).toBe('1000');
  });

  // 提領是多步驟表單,步驟 3 已經填了銀行帳號、身分證字號、上傳了照片。
  // 同意款的文件連結若是會換頁的 <a href>,點下去整個表單會被卸載、useState
  // 全部清空——這正是 CompleteProfile 與 JoinReferralProgramDialog 修過兩次
  // 的同一個 bug(見 LegalDialog docblock),提領頁當初漏改。
  it('點同意款的推廣獎勵規章連結時不換頁且已填欄位不流失', async () => {
    mockIdPhotos(idPhotosResponse());
    await renderAndGoToStep3();

    const bankAccount = screen.getByLabelText(/銀行帳號 \*/) as HTMLInputElement;
    fireEvent.change(bankAccount, { target: { value: '1234567890' } });

    const trigger = screen.getByTestId('withdrawal-rules-link');
    // 觸發元件必須是就地彈窗的 <button>,不是會離開本頁的 <a href>。
    expect(trigger.tagName).toBe('BUTTON');

    fireEvent.click(trigger);

    // 文件就地讀得到,且底下的表單仍掛載、值原封不動。
    expect(await screen.findByTestId('legal-dialog-body')).toBeTruthy();
    expect((screen.getByLabelText(/銀行帳號 \*/) as HTMLInputElement).value).toBe('1234567890');
  });
});
