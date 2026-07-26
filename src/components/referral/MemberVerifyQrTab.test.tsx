// @vitest-environment jsdom
//
// 會員核身碼分頁的行為契約：有碼時渲染 QR + 會籍狀態；取碼失敗時給錯誤態與重試。
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
  it('有短效碼時渲染核身 QR 與會籍狀態', () => {
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

  it('取碼失敗時顯示錯誤態與重試，不渲染 QR', () => {
    const refresh = vi.fn();
    mockHook.mockReturnValue({
      data: null,
      loading: false,
      error: '無法取得核身碼，請稍後再試',
      refresh,
    });
    render(<MemberVerifyQrTab active accountStatus="active" />);
    expect(screen.queryByTestId('member-verify-qrcode')).toBeNull();
    expect(screen.getByText('無法取得核身碼，請稍後再試')).toBeTruthy();
    expect(screen.getByRole('button', { name: /重試/ })).toBeTruthy();
  });
});
