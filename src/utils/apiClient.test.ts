import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  apiErrorFromBody,
  apiRequest,
  apiRequestJson,
  buildApiUrl,
  extractApiErrorMessage,
} from './apiClient';
import { projectId } from './supabase/info';

const refreshSession = vi.fn();
vi.mock('./auth', () => ({ getAccessToken: () => Promise.resolve('tok') }));
const signOut = vi.fn(async () => ({ error: null }));
vi.mock('./supabase/client', () => ({
  createClient: () => ({ auth: { refreshSession: () => refreshSession(), signOut } }),
}));
const clearAuthHint = vi.fn();
vi.mock('./authHint', () => ({ clearAuthHint: () => clearAuthHint() }));

const BASE = `https://${projectId}.supabase.co/functions/v1/api`;

describe('buildApiUrl', () => {
  it('路徑本來就有前導斜線時原樣接上', () => {
    expect(buildApiUrl('/rewards')).toBe(`${BASE}/rewards`);
  });

  it('路徑缺前導斜線時補上', () => {
    expect(buildApiUrl('rewards')).toBe(`${BASE}/rewards`);
  });

  it('不產生重複斜線', () => {
    expect(buildApiUrl('/listings/upload-photo')).toBe(`${BASE}/listings/upload-photo`);
  });

  it('空路徑視為 api 根路徑', () => {
    expect(buildApiUrl('')).toBe(`${BASE}/`);
  });
});

// 後端錯誤信封有兩種並存格式（index.ts 有 69 處字串形、38 處物件形）：
//   { error: '已有有效訂閱，請到期後再續約' }   ← 字串形
//   { error: { message: '...' } }               ← 物件形
// 前端必須兩種都解析得出訊息，否則金流節點的具體錯誤原因會退化成
// 「請求失敗 (400)」這類通用文案。
describe('extractApiErrorMessage', () => {
  it('解析字串形信封 { error: string }', () => {
    expect(extractApiErrorMessage({ error: '已有有效訂閱，請到期後再續約' }, 'fallback')).toBe(
      '已有有效訂閱，請到期後再續約',
    );
  });

  it('解析物件形信封 { error: { message } }', () => {
    expect(extractApiErrorMessage({ error: { message: '未授權' } }, 'fallback')).toBe('未授權');
  });

  it('解析頂層 message 欄位', () => {
    expect(extractApiErrorMessage({ message: '身分證字號不正確' }, 'fallback')).toBe(
      '身分證字號不正確',
    );
  });

  it('無法辨識時回傳 fallback', () => {
    expect(extractApiErrorMessage({}, '請求失敗 (500)')).toBe('請求失敗 (500)');
    expect(extractApiErrorMessage(null, '請求失敗 (500)')).toBe('請求失敗 (500)');
    expect(extractApiErrorMessage({ error: { code: 42 } }, 'fb')).toBe('fb');
  });

  it('空字串錯誤視為無訊息、回傳 fallback', () => {
    expect(extractApiErrorMessage({ error: '' }, 'fb')).toBe('fb');
  });
});

// 錯誤**碼**是另一件事：訊息給人看，碼給程式分流。ApiError 一直有 code 欄位，
// 但 apiRequestJson 從來沒填過它——所以呼叫端想針對特定錯誤換一套 UI（掃描頁
// 的「您目前無法掃描」vs「掃描過於頻繁」vs 通用「無法驗證」）就只能比對中文
// 訊息字串，而訊息是隨時會被改文案的東西。
describe('apiErrorFromBody', () => {
  it('物件形信封的 code 會被帶進 ApiError', () => {
    const err = apiErrorFromBody({ error: { code: 'rate_limited', message: '太頻繁' } }, 429);
    expect(err.code).toBe('rate_limited');
    expect(err.message).toBe('太頻繁');
    expect(err.status).toBe(429);
  });

  it('沒有 code 時 code 為 undefined，訊息與狀態照樣帶出', () => {
    const err = apiErrorFromBody({ error: '已有有效訂閱，請到期後再續約' }, 400);
    expect(err.code).toBeUndefined();
    expect(err.message).toBe('已有有效訂閱，請到期後再續約');
  });

  it('無法辨識的信封退回帶狀態碼的通用訊息', () => {
    const err = apiErrorFromBody(null, 500);
    expect(err.message).toBe('請求失敗 (500)');
    expect(err.code).toBeUndefined();
  });

  it('code 不是字串時當作沒有 code', () => {
    expect(apiErrorFromBody({ error: { code: 42, message: 'x' } }, 400).code).toBeUndefined();
  });
});

// multipart 上傳（刊登照片）必須讓瀏覽器自己帶 boundary：若 apiRequest 預設的
// `Content-Type: application/json` 跟著 FormData 送出，後端 formData() 會解析失敗。
// 改這裡牽動共用核心——FormData 不設 Content-Type（T1 日後 rebase 請保留此分支）。
describe('apiRequest 送 FormData', () => {
  const fetchMock = vi.fn();
  const headersOf = (callIndex = 0) =>
    new Headers(fetchMock.mock.calls[callIndex][1].headers as HeadersInit);

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    refreshSession.mockReset();
  });

  it('body 是 FormData 時不設 Content-Type，但仍附 Authorization', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const form = new FormData();
    form.append('file', new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    await apiRequest(buildApiUrl('/listings/upload-photo'), { method: 'POST', body: form });
    expect(headersOf().has('Content-Type')).toBe(false);
    expect(headersOf().get('Authorization')).toBe('Bearer tok');
  });

  it('JSON body 仍預設 application/json', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await apiRequest(buildApiUrl('/x'), { method: 'POST', body: JSON.stringify({ a: 1 }) });
    expect(headersOf().get('Content-Type')).toBe('application/json');
  });

  it('呼叫端傳入的 headers 仍可覆寫預設值', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await apiRequest(buildApiUrl('/x'), {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(headersOf().get('Content-Type')).toBe('text/plain');
  });

  it('401 refresh 成功後重送同一份 FormData，仍不帶 Content-Type', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'new' } }, error: null });
    const form = new FormData();
    form.append('file', new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
    const res = await apiRequest(buildApiUrl('/listings/upload-photo'), {
      method: 'POST',
      body: form,
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(headersOf(1).has('Content-Type')).toBe(false);
    expect(fetchMock.mock.calls[1][1].body).toBe(form);
  });
});

// session 真的過期（refresh 也失敗）：signOut 網路失敗時 SIGNED_OUT 不一定觸發，
// 這裡自清本機狀態時要一併清首繪提示，否則下次開站仍畫已登入頭像。
describe('apiRequestJson 的 session 過期分支', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    refreshSession.mockReset();
    clearAuthHint.mockReset();
  });

  it('401 且 refresh 失敗時清首繪提示並拋出登入過期', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    );
    vi.stubGlobal('localStorage', { removeItem: vi.fn() });
    refreshSession.mockResolvedValue({ data: { session: null }, error: new Error('expired') });
    await expect(apiRequestJson(buildApiUrl('/x'))).rejects.toMatchObject({ status: 401 });
    expect(clearAuthHint).toHaveBeenCalledTimes(1);
  });

  // T1-B W4-13：session 確認無效時只做本機登出（endInvalidSession），不撤銷其他裝置。
  it('401 且 refresh 判無效時只做本機登出並拋出登入過期', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    );
    vi.stubGlobal('localStorage', { removeItem: vi.fn() });
    refreshSession.mockResolvedValue({ data: { session: null }, error: new Error('expired') });
    signOut.mockClear();
    await expect(apiRequestJson(buildApiUrl('/x'))).rejects.toMatchObject({ status: 401 });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(clearAuthHint).toHaveBeenCalledTimes(1);
  });
});

// T1-B §2.7（R15）：401 先兩層確認再登出——Auth 抖動或端點自己的 401 都不能把人登出。
describe('apiRequestJson 的 401 兩層確認', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    refreshSession.mockReset();
    clearAuthHint.mockReset();
    signOut.mockClear();
  });

  /** 一般端點回 401，/profile 依參數回應。 */
  function stubFetch(profileStatus: number) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        /\/profile(\?|$)/.test(String(url))
          ? new Response(JSON.stringify({ id: 'u1' }), { status: profileStatus })
          : new Response('{}', { status: 401 }),
      ),
    );
    vi.stubGlobal('localStorage', { removeItem: vi.fn() });
  }

  it.each([
    ['網路層錯誤', { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }],
    ['Auth 5xx', { name: 'AuthApiError', status: 503, message: 'unavailable' }],
    ['Auth 429', { name: 'AuthApiError', status: 429, message: 'rate limited' }],
  ])('refresh 遇%s時不登出，拋 503 AUTH_UNAVAILABLE', async (_label, error) => {
    stubFetch(200);
    refreshSession.mockResolvedValue({ data: { session: null }, error });
    await expect(apiRequestJson(buildApiUrl('/x'))).rejects.toMatchObject({
      status: 503,
      code: 'AUTH_UNAVAILABLE',
    });
    expect(signOut).not.toHaveBeenCalled();
    expect(clearAuthHint).not.toHaveBeenCalled();
  });

  it('refresh 成功、重打仍 401、/profile 暫時讀不到時不登出，拋 AUTH_UNAVAILABLE', async () => {
    stubFetch(503);
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'new' } }, error: null });
    await expect(apiRequestJson(buildApiUrl('/x'))).rejects.toMatchObject({
      code: 'AUTH_UNAVAILABLE',
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('refresh 成功、重打仍 401、/profile 也 401 時本機登出並拋登入過期', async () => {
    stubFetch(401);
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'new' } }, error: null });
    await expect(apiRequestJson(buildApiUrl('/x'))).rejects.toMatchObject({ status: 401 });
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(clearAuthHint).toHaveBeenCalledTimes(1);
  });

  it('refresh 成功、重打仍 401、但 /profile 正常時是端點自己的 401：不登出', async () => {
    stubFetch(200);
    refreshSession.mockResolvedValue({ data: { session: { access_token: 'new' } }, error: null });
    await expect(apiRequestJson(buildApiUrl('/x'))).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
    expect(signOut).not.toHaveBeenCalled();
    expect(clearAuthHint).not.toHaveBeenCalled();
  });

  it('直接用 apiRequest 時 refresh 遇網路層錯誤也拋 AUTH_UNAVAILABLE（不登出）', async () => {
    stubFetch(200);
    refreshSession.mockResolvedValue({
      data: { session: null },
      error: { name: 'AuthRetryableFetchError', status: 0, message: 'x' },
    });
    await expect(apiRequest(buildApiUrl('/listings/photos'))).rejects.toMatchObject({
      status: 503,
      code: 'AUTH_UNAVAILABLE',
    });
    expect(signOut).not.toHaveBeenCalled();
  });
});
