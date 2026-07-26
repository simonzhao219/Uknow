// @vitest-environment jsdom
//
// 核身碼取碼 hook 的行為契約：未啟用不取碼（不浪費請求）、成功回傳碼、
// 失敗給錯誤訊息且不留舊碼。自動換發的計時器不在此驗（時間相關，交由
// 元件層與實機），這裡只釘住三個入口狀態。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMemberVerifyToken } from './useMemberVerifyToken';
import { apiRequestJson } from '../utils/apiClient';

vi.mock('../utils/apiClient', () => ({
  apiRequestJson: vi.fn(),
  buildApiUrl: (p: string) => `https://api.test${p}`,
}));

const mockRequest = vi.mocked(apiRequestJson);

afterEach(() => {
  vi.clearAllMocks();
});

describe('useMemberVerifyToken', () => {
  it('未啟用時不發請求', () => {
    renderHook(() => useMemberVerifyToken(false));
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('啟用時取得短效碼與到期時間', async () => {
    const expiresAt = new Date(Date.now() + 90_000).toISOString();
    mockRequest.mockResolvedValue({ success: true, data: { token: 'signed.token', expiresAt } });

    const { result } = renderHook(() => useMemberVerifyToken(true));

    await waitFor(() => expect(result.current.data?.token).toBe('signed.token'));
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('取碼失敗時給錯誤訊息且沒有碼', async () => {
    mockRequest.mockRejectedValue(new Error('登入已過期，請重新登入'));

    const { result } = renderHook(() => useMemberVerifyToken(true));

    await waitFor(() => expect(result.current.error).toBe('登入已過期，請重新登入'));
    expect(result.current.data).toBeNull();
  });

  it('錯誤沒有訊息時退回預設文案', async () => {
    mockRequest.mockRejectedValue({});

    const { result } = renderHook(() => useMemberVerifyToken(true));

    await waitFor(() => expect(result.current.error).toBe('無法取得核身碼，請稍後再試'));
  });
});
