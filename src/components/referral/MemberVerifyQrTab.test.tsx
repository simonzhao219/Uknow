// @vitest-environment jsdom
//
// 會員驗證碼分頁的行為契約：有碼時渲染 QR + 會籍狀態；取碼失敗時給錯誤態與重試。
// 用 mock 控制 useMemberVerifyToken 的回傳，只驗這個分頁自己的呈現邏輯。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemberVerifyQrTab } from './MemberVerifyQrTab';
import { useMemberVerifyToken } from '../../hooks/useMemberVerifyToken';

vi.mock('../../hooks/useMemberVerifyToken', () => ({ useMemberVerifyToken: vi.fn() }));

const mockHook = vi.mocked(useMemberVerifyToken);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MemberVerifyQrTab', () => {
  it('有短效碼時渲染驗證 QR 與會籍狀態', () => {
    mockHook.mockReturnValue({
      data: { token: 'signed.token', expiresAt: new Date(Date.now() + 90_000).toISOString() },
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    render(<MemberVerifyQrTab active accountStatus="active" />);
    expect(screen.getByTestId('member-verify-qrcode')).toBeTruthy();
    expect(screen.getByText('有效')).toBeTruthy();
  });

  it('說明不預設驗證方是店家——會籍有效的會員都掃得了', () => {
    // 方案 B 之前只有管理員能掃，「給店家掃描」是準確的；開放互掃之後這句話
    // 會讓人以為只有店家才能驗，而規格 §13.1 的動機正好包含會員之間當面確認。
    mockHook.mockReturnValue({
      data: { token: 'signed.token', expiresAt: new Date(Date.now() + 90_000).toISOString() },
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
    render(<MemberVerifyQrTab active accountStatus="active" />);
    expect(screen.getByText(/出示這組碼供對方掃描/)).toBeTruthy();
    expect(screen.queryByText(/給店家掃描/)).toBeNull();
  });

  it('取碼失敗時顯示錯誤態與重試，不渲染 QR', () => {
    const refresh = vi.fn();
    mockHook.mockReturnValue({
      data: null,
      loading: false,
      error: '無法取得驗證碼，請稍後再試',
      refresh,
    });
    render(<MemberVerifyQrTab active accountStatus="active" />);
    expect(screen.queryByTestId('member-verify-qrcode')).toBeNull();
    expect(screen.getByText('無法取得驗證碼，請稍後再試')).toBeTruthy();
    expect(screen.getByRole('button', { name: /重試/ })).toBeTruthy();
  });
});
