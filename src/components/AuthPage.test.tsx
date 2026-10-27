// @vitest-environment jsdom
//
// 註冊頁的 Email 邀請模式（/register?invite=<token>）。釘住的是規劃書的入口與分流契約：
//   1. 入口等既有 session 驗證的結果：沒登入才進「設定密碼」（帶入 email 與推薦碼）；
//      已登入只提示、不寫推薦碼；結果出來前畫骨架，不先閃 Email 步驟；4 秒沒結果視為未登入。
//   2. 網址上的 token 立刻清掉、改記在 sessionStorage，重新整理仍回到設定密碼。
//   3. accept 的錯誤依 code 分流、文案只依 code（不顯示後端或 GoTrue 的原文）。
//   4. 提示同一個位置、換步驟即清；登入步驟的靜態提示在持久提示出現時隱藏。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { createContext } from 'react';

const showToast = vi.fn();
const getSession = vi.fn();
const signOut = vi.fn(async () => ({ error: null }));
const signInWithPassword = vi.fn();
const signUp = vi.fn();

vi.mock('../App', () => ({
  UserContext: createContext<any>({ user: null, setUser: () => {} }),
}));
vi.mock('../utils/supabase/client', () => ({
  createClient: () => ({ auth: { getSession, signOut, signInWithPassword, signUp } }),
}));
vi.mock('./notifications/NotificationContext', () => ({
  useNotification: () => ({ showToast, showSuccess: vi.fn(), showNotification: vi.fn() }),
}));

const { AuthPage } = await import('./AuthPage');
const { getPendingReferral } = await import('../utils/referralInvite');
const { REFERRAL_INVITE_TOKEN_TTL_SECONDS } = await import('@referral-invite-payload');

const b64url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const VALID = `${b64url(JSON.stringify({ v: 1, e: 'invitee@example.com', c: '8048876', x: 4102444800 }))}.sig`;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let acceptResponse: () => Promise<Response>;
const fetchMock = vi.fn(async (url: string | URL | Request) => {
  const href = String(url);
  if (href.endsWith('/auth/invite/accept')) return acceptResponse();
  if (href.endsWith('/auth/profile')) return json(200, { registrationStep: 0 });
  if (href.endsWith('/auth/check-email')) return json(200, { exists: true });
  throw new Error(`unexpected ${href}`);
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <AuthPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const signedOut = () => getSession.mockResolvedValue({ data: { session: null } });
const errorBody = (code: string) =>
  json(400, { success: false, error: { code, message: 'English fallback' } });

async function landOnSetPassword() {
  signedOut();
  renderAt(`/register?invite=${VALID}`);
  await screen.findByLabelText('設定密碼');
}

async function submitPassword(password = 'Passw0rdX') {
  fireEvent.change(screen.getByLabelText('設定密碼'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('確認密碼'), { target: { value: password } });
  fireEvent.click(screen.getByTestId('auth-signup-button'));
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
  acceptResponse = async () => json(200, { accepted: true });
  signInWithPassword.mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AuthPage 邀請入口', () => {
  it('未登入時進設定密碼步驟、帶入 email 與推薦碼並清掉網址上的 token', async () => {
    await landOnSetPassword();
    expect(screen.getByText('invitee@example.com', { exact: false })).toBeTruthy();
    expect(getPendingReferral()).toBe('8048876');
    expect(screen.getByTestId('location').textContent).toBe('/register');
    expect(sessionStorage.getItem('pending_invite_token')).toBe(VALID);
  });

  it('session 驗證結果出來前畫骨架、不先閃 Email 步驟', async () => {
    getSession.mockReturnValue(new Promise(() => {}));
    renderAt(`/register?invite=${VALID}`);
    expect(screen.getByRole('status', { name: '載入中' }).getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('已登入時只提示你已登入、不寫推薦碼也不進設定密碼', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    renderAt(`/register?invite=${VALID}`);
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('你已登入', 'info'));
    expect(getPendingReferral()).toBeNull();
    expect(screen.queryByLabelText('設定密碼')).toBeNull();
  });

  it('session 驗證 4 秒沒有結果時視為未登入、進設定密碼', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    getSession.mockReturnValue(new Promise(() => {}));
    renderAt(`/register?invite=${VALID}`);
    await act(async () => {
      vi.advanceTimersByTime(4_000);
    });
    expect(await screen.findByLabelText('設定密碼')).toBeTruthy();
  });

  it('token 無法解碼時留在 Email 步驟並顯示無法辨識提示', async () => {
    signedOut();
    renderAt('/register?invite=garbage');
    expect((await screen.findByRole('alert')).textContent).toContain('邀請連結無法辨識');
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(sessionStorage.getItem('pending_invite_token')).toBeNull();
  });

  it('重新整理後從 sessionStorage 還原 token 回到設定密碼', async () => {
    sessionStorage.setItem('pending_invite_token', VALID);
    signedOut();
    renderAt('/register');
    expect(await screen.findByLabelText('設定密碼')).toBeTruthy();
  });

  it('非註冊頁不從 sessionStorage 還原 token', async () => {
    sessionStorage.setItem('pending_invite_token', VALID);
    signedOut();
    renderAt('/login');
    expect(await screen.findByLabelText('Email')).toBeTruthy();
  });
});

describe('AuthPage 邀請送出分流', () => {
  it('accept 成功時以剛設的密碼登入並導向下一步', async () => {
    await landOnSetPassword();
    await submitPassword();
    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/auth/complete-profile'),
    );
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'invitee@example.com',
      password: 'Passw0rdX',
    });
  });

  it('密碼不符規則時前端先擋、不打 accept', async () => {
    await landOnSetPassword();
    await submitPassword('short');
    await screen.findByText('密碼需包含：', { exact: false });
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/invite\/accept$/),
      expect.anything(),
    );
  });

  it('weak_password 時留在設定密碼並以中文標在密碼欄', async () => {
    acceptResponse = async () => errorBody('weak_password');
    await landOnSetPassword();
    await submitPassword();
    expect(await screen.findByText('此密碼曾出現在資料外洩名單中', { exact: false })).toBeTruthy();
    expect(screen.queryByText('English fallback')).toBeNull();
    expect(screen.getByLabelText('設定密碼')).toBeTruthy();
  });

  it.each([
    ['rate_limited', '請稍後再試'],
    ['unavailable', '請稍後再試'],
    ['disabled', '請稍後再試'],
  ])('%s 時留在設定密碼並提示可重試', async (code, text) => {
    acceptResponse = async () => errorBody(code);
    await landOnSetPassword();
    await submitPassword();
    expect((await screen.findByRole('alert')).textContent).toContain(text);
    expect(screen.getByLabelText('設定密碼')).toBeTruthy();
    expect(screen.queryByText('English fallback')).toBeNull();
  });

  it.each([
    ['invalid_token', '可能被 LINE 或郵件截斷'],
    ['expired', '已過期'],
    ['gone', '已失效'],
  ])('%s 時轉登入步驟、帶入 email 並顯示對應提示', async (code, text) => {
    acceptResponse = async () => errorBody(code);
    await landOnSetPassword();
    await submitPassword();
    expect((await screen.findByRole('alert')).textContent).toContain(text);
    expect(screen.getByTestId('auth-login-button')).toBeTruthy();
    expect(screen.getByText('invitee@example.com', { exact: false })).toBeTruthy();
    expect(sessionStorage.getItem('pending_invite_token')).toBeNull();
  });

  it('already_accepted 時轉登入步驟、清空密碼並說明用先前的密碼登入', async () => {
    acceptResponse = async () =>
      json(409, { success: false, error: { code: 'already_accepted', message: '' } });
    await landOnSetPassword();
    await submitPassword();
    expect((await screen.findByRole('alert')).textContent).toBe(
      '此邀請已完成設定，請用先前設定的密碼登入',
    );
    expect((screen.getByLabelText('密碼') as HTMLInputElement).value).toBe('');
  });

  it('accept 成功但登入失敗時轉登入步驟並提示用剛設的密碼登入', async () => {
    signInWithPassword.mockResolvedValueOnce({ data: { session: null }, error: { message: 'x' } });
    await landOnSetPassword();
    await submitPassword();
    expect((await screen.findByRole('alert')).textContent).toContain('剛設定的密碼');
    expect(screen.getByTestId('auth-login-button')).toBeTruthy();
  });

  it('改用其他 Email 註冊時回 Email 步驟、清 token、保留推薦碼', async () => {
    await landOnSetPassword();
    fireEvent.click(screen.getByRole('button', { name: '改用其他 Email 註冊' }));
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('');
    expect(sessionStorage.getItem('pending_invite_token')).toBeNull();
    expect(getPendingReferral()).toBe('8048876');
  });

  it('換步驟時清掉提示', async () => {
    acceptResponse = async () => errorBody('expired');
    await landOnSetPassword();
    await submitPassword();
    await screen.findByRole('alert');
    fireEvent.click(screen.getByTestId('auth-back-button'));
    await screen.findByLabelText('Email');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('AuthPage 登入步驟的邀請信提示', () => {
  const HINT = '透過邀請信加入的話，請用信中連結；還沒設定密碼請用忘記密碼';

  it('一般登入步驟顯示靜態提示並掛在忘記密碼鈕的描述', async () => {
    signedOut();
    renderAt('/login');
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.click(screen.getByTestId('auth-continue-button'));
    const hint = await screen.findByText(HINT);
    const forgot = screen.getByTestId('forgot-password-link');
    expect(forgot.getAttribute('aria-describedby')).toBe(hint.id);
  });

  it('有持久提示時隱藏靜態提示', async () => {
    acceptResponse = async () => errorBody('expired');
    await landOnSetPassword();
    await submitPassword();
    await screen.findByRole('alert');
    expect(screen.queryByText(HINT)).toBeNull();
  });
});

describe('AuthPage 實作審查補測', () => {
  it('清理過期 session 觸發登出時仍保住邀請 token，重新整理回得到設定密碼', async () => {
    // App.tsx 的 SIGNED_OUT 會清 token；這裡讓 signOut 模擬那個副作用。
    signOut.mockImplementation(async () => {
      sessionStorage.removeItem('pending_invite_token');
      return { error: null };
    });
    getSession.mockResolvedValue({ data: { session: { access_token: 'stale' } } });
    fetchMock.mockImplementationOnce(async () => json(401, {}));
    renderAt(`/register?invite=${VALID}`);
    await screen.findByLabelText('設定密碼');
    await waitFor(() => expect(sessionStorage.getItem('pending_invite_token')).toBe(VALID));
  });

  it('過期提示的天數綁連結效期常數', async () => {
    acceptResponse = async () => errorBody('expired');
    await landOnSetPassword();
    await submitPassword();
    const days = REFERRAL_INVITE_TOKEN_TTL_SECONDS / 86400;
    expect((await screen.findByRole('alert')).textContent).toContain(`${days} 天內有效`);
  });

  it('invalid_token 提示請回到信件重新點連結', async () => {
    acceptResponse = async () => errorBody('invalid_token');
    await landOnSetPassword();
    await submitPassword();
    expect((await screen.findByRole('alert')).textContent).toContain('回到信件重新點');
  });

  it('骨架期間不先顯示 Email 步驟的標題', () => {
    getSession.mockReturnValue(new Promise(() => {}));
    renderAt(`/register?invite=${VALID}`);
    expect(screen.queryByText('請輸入您的 Email')).toBeNull();
  });
});

describe('AuthPage 主 session 預審補測', () => {
  it('密碼超過 72 位元組時以與後端同一句擋下、不打 accept', async () => {
    await landOnSetPassword();
    await submitPassword(`Aa1${'密'.repeat(30)}`);
    expect(await screen.findByText('密碼太長，請縮短後再試')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/invite\/accept$/),
      expect.anything(),
    );
  });

  it('同分頁改開帶推薦碼的註冊連結時不還原舊的邀請 token', async () => {
    sessionStorage.setItem('pending_invite_token', VALID);
    signedOut();
    renderAt('/register?ref=abc123');
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(screen.queryByLabelText('設定密碼')).toBeNull();
  });
});
