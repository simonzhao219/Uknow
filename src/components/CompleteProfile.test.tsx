// @vitest-environment jsdom
//
// 「完善資料」表單的姓名欄位契約。這些斷言釘住的是規劃書 §4 的 UI 決策,
// 不是實作細節:
//   1. 模式切換是**兩個選項同時可見**的 segmented control(不是單顆變態鈕)
//      ——外文姓名的使用者必須一眼看到有這個出口,否則會卡在錯誤訊息裡出不去,
//      而註冊是營收入口。
//   2. 切換保留已輸入文字,只換上限與提示。
//   3. 分隔符號在輸入當下就**主動轉成半形空格**並顯示提示(不靜默代換)
//      ——原住民漢字音譯姓名的身分證上帶間隔號,純被動的錯誤訊息要使用者
//      自己走六個步驟才能過關。
//   4. 送出前確認**只跳一個**對話框,且同時列出姓名與推薦碼(不疊兩個 modal)。
//   5. 確認過後改姓名再送出,確認框必須**重新出現**——否則新姓名從未被實際
//      確認就送出去了,加確認框的意義被架空。
//   6. 送出時後端回 403(註冊已完成,例如另一個分頁剛付完款):先確認最新
//      狀態真的是 step 3,才清草稿、帶回會員中心並說明資料已鎖定;確認不了
//      (閘道層 403、refresh 失敗)就留在表單、草稿不動。
//   7. 編輯模式重新整理後發現已是 step 3:同一則鎖定說明、立即帶回會員中心。
//   8. 確認框揭露「付款完成後鎖定」,不再說推薦碼「永久綁定」(續費選新約
//      仍可換推薦人,永久是錯誤陳述)。
//   9. 推薦碼驗證打 `GET /referrals/validate/<碼>`(需登入、有限流的那一支);
//      匿名別名 `POST /listings/verify-referral-code` 已移除。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createContext } from 'react';
import { ApiError } from '../utils/apiClient';

// radix 的 Checkbox 走 useSize → ResizeObserver,jsdom 沒有這個 API。
// 只需要「存在且不炸」,不需要真的量測。
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const showNotification = vi.fn();
const showToast = vi.fn();
const refreshUser = vi.fn(async (): Promise<unknown> => null);
// 預設**永不 resolve**:本檔多數測的是姓名欄位行為,不是 session 流程。
// 若讓它 resolve,checkSession 會在測試結束、jsdom 已拆掉之後才跑到
// navigate(),React 於 teardown 後 commit 就會擲 `window is not defined`
// ——那是假陽性噪音,不是產品問題。要走送出流程的測試自行改成 resolve 並 await 到底。
const getSession = vi.fn(() => new Promise<unknown>(() => {}));

vi.mock('../App', () => ({
  UserContext: createContext<any>({ setUser: () => {}, refreshUser }),
}));

const signOut = vi.fn(async () => ({ error: null }));
vi.mock('../utils/supabase/client', () => ({
  createClient: () => ({ auth: { getSession, signOut } }),
}));

vi.mock('./notifications/NotificationContext', () => ({
  useNotification: () => ({
    showToast,
    showSuccess: vi.fn(),
    showNotification,
  }),
}));

vi.mock('./LegalDialog', () => ({ LegalDialog: () => null }));

// 只換掉發請求的 apiRequestJson(上面的 getSession 永不 resolve,真的走
// apiClient 會卡在取 token);buildApiUrl 照用真的,斷言才看得到實際路徑。
const apiRequestJson = vi.fn();
vi.mock('../utils/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/apiClient')>()),
  apiRequestJson: (...args: unknown[]) => apiRequestJson(...args),
}));

const { CompleteProfile } = await import('./CompleteProfile');
const { loadProfileDraft } = await import('../utils/formDraft');

function renderForm() {
  return render(
    <MemoryRouter>
      <CompleteProfile />
    </MemoryRouter>,
  );
}

const nameInput = () => screen.getByLabelText('姓名 *') as HTMLInputElement;

function fillValidForm() {
  fireEvent.change(nameInput(), { target: { value: '王小明' } });
  fireEvent.change(screen.getByLabelText('身份證字號 *'), {
    target: { value: 'A123456789' },
  });
  fireEvent.change(screen.getByLabelText('手機號碼 *'), { target: { value: '0933333333' } });
  fireEvent.change(screen.getByLabelText('出生年月日 *'), { target: { value: '2000-01-01' } });
  fireEvent.click(screen.getByRole('checkbox'));
}
const modeButton = (label: string) => screen.getByRole('button', { name: label });

afterEach(cleanup);

beforeEach(() => {
  cleanup();
  showNotification.mockClear();
  apiRequestJson.mockReset();
  showToast.mockClear();
  refreshUser.mockReset();
  refreshUser.mockResolvedValue(null);
  getSession.mockImplementation(() => new Promise<unknown>(() => {}));
  signOut.mockClear();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
});

describe('姓名模式切換鈕', () => {
  it('兩個選項同時可見,預設中文且以 aria-pressed 標示', () => {
    renderForm();
    expect(modeButton('中文姓名').getAttribute('aria-pressed')).toBe('true');
    expect(modeButton('外文姓名').getAttribute('aria-pressed')).toBe('false');
  });

  it('切換模式保留已輸入文字,只換計數器上限', () => {
    renderForm();
    fireEvent.change(nameInput(), { target: { value: 'John Smith' } });
    expect(screen.getByText('10/10')).toBeTruthy();

    fireEvent.click(modeButton('外文姓名'));
    expect(nameInput().value).toBe('John Smith'); // 文字沒被清掉
    expect(screen.getByText('10/50')).toBeTruthy();
    expect(modeButton('外文姓名').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('姓名欄位的分隔符號與長度', () => {
  it('輸入間隔號會自動轉成半形空格並顯示提示', () => {
    renderForm();
    fireEvent.change(nameInput(), { target: { value: '谷辣斯·尤達卡' } });
    expect(nameInput().value).toBe('谷辣斯 尤達卡');
    expect(screen.getByText('已將分隔符號轉換為半形空格')).toBeTruthy();
  });

  it('視覺相近的其他分隔符號同樣被轉換', () => {
    renderForm();
    for (const sep of ['‧', '・', '•', '･']) {
      fireEvent.change(nameInput(), { target: { value: `谷辣斯${sep}尤達卡` } });
      expect(nameInput().value, `分隔符號 ${sep}`).toBe('谷辣斯 尤達卡');
    }
  });

  it('中文模式下超過上限仍打得進去,計數器顯示實際字數與該模式上限', () => {
    // maxLength 一律用較寬鬆的 50,不隨模式收緊——否則外文使用者在預設中文
    // 模式下打到第 10 字會發現按鍵被靜默吞掉卻找不到任何提示。
    renderForm();
    fireEvent.change(nameInput(), { target: { value: '王'.repeat(12) } });
    expect(nameInput().value).toHaveLength(12);
    expect(screen.getByText('12/10')).toBeTruthy();
  });

  it('超長時計數器套用警示色,不只是數字變了', () => {
    // 只斷言「12/10」這串文字的話,nameOverLimit 邏輯日後被誤刪測試仍全綠。
    renderForm();
    fireEvent.change(nameInput(), { target: { value: '王'.repeat(12) } });
    const counter = screen.getByText('12/10');
    expect(counter.className).toContain('text-destructive-subtle-foreground');
  });

  it('缺字姓名走專屬的客服出口,不是誤導的「須為中文字」', () => {
    // HAN_RANGE 不含造字區與擴充 B 區(戶政「缺字」問題)。那種輸入既非拉丁
    // 字母也非數字,拿「姓名須為中文字」回應一個明明在打中文的人是誤導。
    renderForm();
    fireEvent.change(nameInput(), { target: { value: '\u{20000}\u{20001}' } });
    fireEvent.blur(nameInput());
    expect(screen.getByRole('alert').textContent).toContain('客服');
  });

  it('錯誤時 aria-invalid 與 aria-describedby 指向錯誤訊息', () => {
    renderForm();
    fireEvent.change(nameInput(), { target: { value: 'Peter' } });
    fireEvent.blur(nameInput());
    expect(nameInput().getAttribute('aria-invalid')).toBe('true');
    expect(nameInput().getAttribute('aria-describedby')).toBe('name-error');
    expect(screen.getByRole('alert').getAttribute('id')).toBe('name-error');
  });

  it('離開欄位時字元合法但超長回長度訊息,不是字元訊息', () => {
    renderForm();
    fireEvent.change(nameInput(), { target: { value: '王'.repeat(12) } });
    fireEvent.blur(nameInput());
    expect(screen.getByText('姓名最多 10 個字元')).toBeTruthy();
  });

  it('中文模式的字元錯誤訊息指出切換到外文模式的出口', () => {
    renderForm();
    fireEvent.change(nameInput(), { target: { value: 'Peter' } });
    fireEvent.blur(nameInput());
    // 用 role=alert 精準取錯誤訊息——「外文姓名」四個字同時是切換鈕的文案。
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('中文字');
    expect(alert.textContent).toContain('外文姓名');
  });
});

// iPhone Safari + 內建注音的實測災情:注音符號整串累積殘留(8 → 32 字)、
// 選出來的漢字接在垃圾後面、轉換提示對著還沒組完的字播報。
// 根因是「組字期間改寫受控值」——見 docs/plans/friction-log.md 的 2026-08-07 條。
describe('姓名欄位的 IME 組字', () => {
  it('注音組字期間不改寫值也不提示,選字完成後才套用轉換', () => {
    // 組字緩衝以全形空格分隔音節(影片裡的欄位就長這樣,也正是「已將分隔符號
    // 轉換為半形空格」那句提示在使用者還沒選字時就冒出來的原因)。U+3000 屬
    // \p{Z},會被轉換規則命中——這是舊實作真正踩到的地雷。
    renderForm();
    fireEvent.compositionStart(nameInput());
    fireEvent.change(nameInput(), { target: { value: 'ㄍㄨˇ' } });
    fireEvent.change(nameInput(), { target: { value: 'ㄍㄨˇ　ㄌㄚˋ' } });

    // 組字中的注音必須原樣留在欄位裡:值一被改寫,iOS 的組字狀態就毀了。
    expect(nameInput().value).toBe('ㄍㄨˇ　ㄌㄚˋ');
    expect(screen.queryByText('已將分隔符號轉換為半形空格')).toBeNull();

    fireEvent.compositionEnd(nameInput(), { target: { value: '谷辣斯·尤達卡' } });
    expect(nameInput().value).toBe('谷辣斯 尤達卡');
    expect(screen.getByText('已將分隔符號轉換為半形空格')).toBeTruthy();
  });

  it('推薦碼組字期間不轉小寫,組字結束才轉', () => {
    // 轉小寫對注音與漢字是 identity,所以中文 IME 打不中這個欄位——但**全形
    // 英數**打得中(Ａ → ａ 是真的變了),而全形是中文輸入法的標準功能。
    // 規則不容許「這個欄位大概沒人用 IME」這種例外:那種判斷無法機械把關。
    renderForm();
    const code = () => screen.getByLabelText('推薦碼 (選填)') as HTMLInputElement;
    fireEvent.compositionStart(code());
    fireEvent.change(code(), { target: { value: 'ＡＢ' } });
    expect(code().value).toBe('ＡＢ');

    fireEvent.compositionEnd(code(), { target: { value: 'ABC123' } });
    expect(code().value).toBe('abc123');
  });

  it('推薦碼的全形數字在組字結束後摺成半形', () => {
    // toLowerCase() 對全形數字是 identity('８'.toLowerCase() === '８')——
    // 摺全形靠的是 NFKC。推薦碼自 2026-09 起是純數字流水號(規格書 §7.1),
    // 碼短、可口述,手動輸入從邊緣路徑變成主要路徑,全形命中率隨之上升。
    // 沒有這一步,全形碼會靜默變成「推薦碼不存在或已失效」,與真的打錯碼同形。
    renderForm();
    const code = () => screen.getByLabelText('推薦碼 (選填)') as HTMLInputElement;

    fireEvent.compositionStart(code());
    fireEvent.change(code(), { target: { value: '８０４' } });
    // 組字期間照舊原樣收下——摺全形是改寫,同樣不能在組字中做。
    expect(code().value).toBe('８０４');

    fireEvent.compositionEnd(code(), { target: { value: '８０４８８７６' } });
    expect(code().value).toBe('8048876');
  });

  it('推薦碼貼上全形數字時也摺成半形', () => {
    // 沒在組字的一般輸入/貼上走 onChange 的 else 分支,與 compositionend
    // 是兩條路徑;口述推薦碼後貼上是真實路徑,兩條都要釘。
    renderForm();
    const code = () => screen.getByLabelText('推薦碼 (選填)') as HTMLInputElement;

    fireEvent.change(code(), { target: { value: '８０４８８７６' } });
    expect(code().value).toBe('8048876');
  });

  it('組字期間的聲調符號不被當成分隔符號吃掉', () => {
    // 聲調 ˊˇˋ 是 Lm、輕聲 ˙ 是 Sk,都不在 \p{P}/\p{Z} 裡,本來就不該被轉換。
    // 釘住它是因為「加大轉換範圍」是這個 bug 最誘人也最錯的修法方向。
    renderForm();
    fireEvent.compositionStart(nameInput());
    fireEvent.change(nameInput(), { target: { value: 'ㄔㄣˊㄗˇㄢ' } });
    expect(nameInput().value).toBe('ㄔㄣˊㄗˇㄢ');
  });
});

describe('送出前確認對話框', () => {
  it('只跳一個對話框,且同時列出姓名與推薦碼資訊', () => {
    renderForm();
    fillValidForm();
    fireEvent.click(screen.getByTestId('profile-submit-button'));

    expect(showNotification).toHaveBeenCalledTimes(1);
    const arg = showNotification.mock.calls[0][0];
    expect(arg.details.some((d: string) => d.includes('姓名：王小明'))).toBe(true);
    expect(arg.details.some((d: string) => d.includes('推薦碼'))).toBe(true);
    // 姓名付款前可重填、註冊完成後才鎖定(規格書 §4.1),不可沿用推薦碼那句
    // 「永久綁定,無法修改」涵蓋姓名——那會是錯誤陳述。
    expect(arg.message).toContain('姓名');
    expect(arg.message).toContain('核對身分');
    // 付款前揭露鎖定;「永久綁定」是錯誤陳述(續費選新約可換推薦人)。
    expect(arg.message).toContain('付款完成後');
    expect(arg.message).toContain('聯繫客服');
    expect(arg.message).not.toContain('永久綁定');
  });

  it('確認後改姓名再送出,確認框重新出現', () => {
    renderForm();
    fillValidForm();
    const submit = screen.getByTestId('profile-submit-button');
    fireEvent.click(submit);
    expect(showNotification).toHaveBeenCalledTimes(1);

    // 模擬使用者按下「確認無誤」
    showNotification.mock.calls[0][0].onConfirm();
    showNotification.mockClear();

    // 回頭改姓名——確認旗標必須被撤銷
    fireEvent.change(nameInput(), { target: { value: '李大華' } });
    fireEvent.click(submit);
    expect(showNotification).toHaveBeenCalledTimes(1);
    const arg = showNotification.mock.calls[0][0];
    expect(arg.details.some((d: string) => d.includes('姓名：李大華'))).toBe(true);
  });

  it('切換姓名模式也會撤銷已確認狀態', () => {
    renderForm();
    fillValidForm();
    const submit = screen.getByTestId('profile-submit-button');
    fireEvent.click(submit);
    showNotification.mock.calls[0][0].onConfirm();
    showNotification.mockClear();

    // 切去外文再切回中文:姓名「王小明」全程未變且在中文模式下合法,
    // 所以走得到確認框——這樣才是隔離「切換模式會不會撤銷旗標」這件事本身。
    // (只切去外文的話,中文姓名在外文模式不合法,表單驗證會先擋下。)
    fireEvent.click(modeButton('外文姓名'));
    fireEvent.click(modeButton('中文姓名'));
    fireEvent.click(submit);
    expect(showNotification).toHaveBeenCalledTimes(1);
  });
});

// T1-B §2.6（R8b）：/auth/register 回 503 PROFILE_UNAVAILABLE＝已寫入、讀不到。不說「註冊失敗」、
// 不重送；refreshUser 接續成功路徑，拿不到就留本頁、持久提示＋重新載入、送出鈕停用（防重送遇 403）。
describe('送出後資料已寫入但讀不回（503 PROFILE_UNAVAILABLE）', () => {
  function stubRegister503() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/auth/register')
          ? new Response(
              JSON.stringify({ error: { code: 'PROFILE_UNAVAILABLE', message: '暫時無法讀取' } }),
              { status: 503 },
            )
          : new Response('{}', { status: 500 }),
      ),
    );
  }

  function renderWithCheckout() {
    render(
      <MemoryRouter initialEntries={['/auth/complete-profile']}>
        <Routes>
          <Route path="/auth/complete-profile" element={<CompleteProfile />} />
          <Route path="/payment/checkout" element={<p>結帳頁</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  function submitConfirmed() {
    fillValidForm();
    fireEvent.click(screen.getByTestId('profile-submit-button'));
    showNotification.mock.calls[0][0].onConfirm();
  }

  beforeEach(() => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'token' } } });
    stubRegister503();
  });

  it('refreshUser 拿到資料時照成功路徑進結帳頁，不顯示註冊失敗', async () => {
    refreshUser.mockResolvedValue({ registrationStep: 1, name: '王小明' });
    renderWithCheckout();
    submitConfirmed();
    expect(await screen.findByText('結帳頁')).toBeTruthy();
    expect(showToast).not.toHaveBeenCalledWith(expect.anything(), 'error');
  });

  it('refreshUser 也拿不到時留本頁、持久提示可重新載入、送出鈕停用、草稿保留', async () => {
    refreshUser.mockResolvedValue(null);
    renderWithCheckout();
    submitConfirmed();
    expect(await screen.findByTestId('profile-saved-unconfirmed')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重新載入資料' })).toBeTruthy();
    expect(screen.getByTestId('profile-submit-button').getAttribute('aria-disabled')).toBe('true');
    expect(loadProfileDraft().name).toBe('王小明');
    expect(showToast).not.toHaveBeenCalledWith(expect.anything(), 'error');
    const registerCalls = () =>
      (fetch as unknown as { mock: { calls: [string][] } }).mock.calls.filter(([u]) =>
        String(u).includes('/auth/register'),
      );
    fireEvent.click(screen.getByTestId('profile-submit-button'));
    expect(registerCalls()).toHaveLength(1);
  });

  it('按重新載入資料拿到資料時進結帳頁', async () => {
    refreshUser.mockResolvedValueOnce(null).mockResolvedValueOnce({ registrationStep: 1 });
    renderWithCheckout();
    submitConfirmed();
    fireEvent.click(await screen.findByRole('button', { name: '重新載入資料' }));
    expect(await screen.findByText('結帳頁')).toBeTruthy();
  });
});

describe('送出時註冊已完成（403）', () => {
  // 掛載時的 profile 讀取讓它失敗 → 留在本頁(與本案無關,只為了不被導走)
  function stubRegister403() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/auth/register')
          ? new Response(JSON.stringify({ error: '註冊已完成，資料變更請聯繫客服' }), {
              status: 403,
            })
          : new Response('{}', { status: 500 }),
      ),
    );
  }

  function renderWithDashboard() {
    render(
      <MemoryRouter initialEntries={['/auth/complete-profile']}>
        <Routes>
          <Route path="/auth/complete-profile" element={<CompleteProfile />} />
          <Route path="/dashboard" element={<p>會員中心頁</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  function submitConfirmed() {
    fillValidForm();
    fireEvent.click(screen.getByTestId('profile-submit-button'));
    showNotification.mock.calls[0][0].onConfirm();
  }

  beforeEach(() => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'token' } } });
    stubRegister403();
  });

  it('確認已是 step 3 才清草稿，帶回會員中心並說明修改沒有儲存', async () => {
    refreshUser.mockResolvedValue({ registrationStep: 3 });
    renderWithDashboard();
    submitConfirmed();

    expect(await screen.findByText('會員中心頁')).toBeTruthy();
    expect(refreshUser).toHaveBeenCalledTimes(1);
    expect(loadProfileDraft().name).toBeUndefined();
    await waitFor(() => {
      const last = showNotification.mock.calls.at(-1)?.[0];
      expect(last?.title).toBe('資料已鎖定');
      expect(last?.message).toContain('您剛才送出的修改沒有儲存');
      expect(last?.details.some((d: string) => d.includes('LINE'))).toBe(true);
    });
  });

  it('最新狀態回來之前不導頁，也不清草稿', async () => {
    let resolveRefresh: (value: unknown) => void = () => {};
    refreshUser.mockImplementation(() => new Promise((resolve) => (resolveRefresh = resolve)));
    renderWithDashboard();
    submitConfirmed();

    await waitFor(() => expect(refreshUser).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('會員中心頁')).toBeNull();
    expect(loadProfileDraft().name).toBe('王小明');

    resolveRefresh({ registrationStep: 3 });
    expect(await screen.findByText('會員中心頁')).toBeTruthy();
  });

  it('最新狀態不是 step 3（閘道層 403 等）→ 留在表單、草稿保留、顯示伺服器訊息', async () => {
    refreshUser.mockResolvedValue({ registrationStep: 0 });
    renderWithDashboard();
    submitConfirmed();

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('註冊已完成，資料變更請聯繫客服', 'error'),
    );
    expect(screen.queryByText('會員中心頁')).toBeNull();
    expect(loadProfileDraft().name).toBe('王小明');
    // 送出鈕要復位，否則人留在表單前卻再也按不了。
    await waitFor(() =>
      expect((screen.getByTestId('profile-submit-button') as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
  });

  it('拿不到最新狀態（refreshUser 回 null）→ 同樣留在表單、草稿保留', async () => {
    refreshUser.mockResolvedValue(null);
    renderWithDashboard();
    submitConfirmed();

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('註冊已完成，資料變更請聯繫客服', 'error'),
    );
    expect(screen.queryByText('會員中心頁')).toBeNull();
    expect(loadProfileDraft().name).toBe('王小明');
  });

  it('403 回應不是 JSON 時仍確認最新狀態，step 3 照樣帶回會員中心', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/auth/register')
          ? new Response('Forbidden', { status: 403 })
          : new Response('{}', { status: 500 }),
      ),
    );
    refreshUser.mockResolvedValue({ registrationStep: 3 });
    renderWithDashboard();
    submitConfirmed();

    expect(await screen.findByText('會員中心頁')).toBeTruthy();
    expect(refreshUser).toHaveBeenCalledTimes(1);
  });
});

describe('編輯模式載入時已是 step 3', () => {
  it('立即帶回會員中心並顯示同一則資料鎖定說明', async () => {
    // 先 refreshUser 再導頁：會員中心的守衛讀的是 UserContext，拿到舊會籍會
    // 把人彈回結帳頁。refresh 回來之前不能導頁。
    let resolveRefresh: (value: unknown) => void = () => {};
    refreshUser.mockImplementation(() => new Promise((resolve) => (resolveRefresh = resolve)));
    getSession.mockResolvedValue({ data: { session: { access_token: 'token' } } });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              registrationStep: 3,
              name: '王小明',
              phone: '0933333333',
              birthDate: '2000-01-01',
            }),
            { status: 200 },
          ),
      ),
    );
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/auth/complete-profile', state: { editing: true } }]}
      >
        <Routes>
          <Route path="/auth/complete-profile" element={<CompleteProfile />} />
          <Route path="/dashboard" element={<p>會員中心頁</p>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(refreshUser).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('會員中心頁')).toBeNull();

    resolveRefresh({ registrationStep: 3 });
    expect(await screen.findByText('會員中心頁', {}, { timeout: 500 })).toBeTruthy();
    const last = showNotification.mock.calls.at(-1)?.[0];
    expect(last?.title).toBe('資料已鎖定');
    expect(last?.details.some((d: string) => d.includes('LINE'))).toBe(true);
  });
});

describe('推薦碼驗證', () => {
  const code = () => screen.getByLabelText('推薦碼 (選填)') as HTMLInputElement;

  it('打 GET /referrals/validate/<碼>,推薦人姓名取自 referrer.userName', async () => {
    apiRequestJson.mockResolvedValueOnce({
      valid: true,
      referrer: { userName: '陳推薦', listingName: null },
    });
    renderForm();
    fireEvent.change(code(), { target: { value: '8048876' } });
    fireEvent.click(screen.getByRole('button', { name: '驗證' }));

    await waitFor(() =>
      expect(screen.getByTestId('referral-code-status').textContent).toBe('推薦人：陳推薦'),
    );
    expect(apiRequestJson).toHaveBeenCalledTimes(1);
    const [url, options] = apiRequestJson.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toMatch(/\/referrals\/validate\/8048876$/);
    // 沒帶 method 就是 GET;帶了也只能是 GET。
    expect(options?.method ?? 'GET').toBe('GET');
  });

  // 端點需登入且有限流(#380 必修 3、4):429 是「暫時不能查」,不是「碼無效」。
  it('按驗證遇到 429 時顯示稍後再試,不說推薦碼無效', async () => {
    apiRequestJson.mockRejectedValueOnce(
      new ApiError('請求過於頻繁，請稍後再試', 429, 'rate_limited'),
    );
    renderForm();
    fireEvent.change(code(), { target: { value: '8048876' } });
    fireEvent.click(screen.getByRole('button', { name: '驗證' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('請求過於頻繁'));
    expect(screen.queryByText('推薦碼無效')).toBeNull();
  });

  // #380 增量審查 P2-2:503 的後端訊息「服務暫時無法使用」像整站掛了,只有 429 用後端訊息。
  it('按驗證遇到 503 時顯示暫時無法驗證,不外露服務暫時無法使用', async () => {
    apiRequestJson.mockRejectedValueOnce(new ApiError('服務暫時無法使用', 503));
    renderForm();
    fireEvent.change(code(), { target: { value: '8048876' } });
    fireEvent.click(screen.getByRole('button', { name: '驗證' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('推薦碼暫時無法驗證'),
    );
    expect(screen.queryByText(/服務暫時無法使用/)).toBeNull();
  });

  it('送出前重驗遇到 429 時保留已驗證的推薦人,不清掉驗證狀態', async () => {
    apiRequestJson
      .mockResolvedValueOnce({ valid: true, referrer: { userName: '陳推薦', listingName: null } })
      .mockRejectedValueOnce(new ApiError('請求過於頻繁，請稍後再試', 429, 'rate_limited'));
    renderForm();
    fireEvent.change(nameInput(), { target: { value: '王小明' } });
    fireEvent.change(screen.getByLabelText('身份證字號 *'), { target: { value: 'A123456789' } });
    fireEvent.change(screen.getByLabelText('手機號碼 *'), { target: { value: '0933333333' } });
    fireEvent.change(screen.getByLabelText('出生年月日 *'), { target: { value: '2000-01-01' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(code(), { target: { value: '8048876' } });
    fireEvent.click(screen.getByRole('button', { name: '驗證' }));
    await waitFor(() =>
      expect(screen.getByTestId('referral-code-status').textContent).toBe('推薦人：陳推薦'),
    );

    // 送出 → 確認框 → 確認後才進到「送出前重驗」。取「本次」的確認框：同檔前面的
    // 測試按過確認後留下 100ms 的 setTimeout(handleSubmit)，可能落在本測試期間、
    // 由已卸載的元件再呼叫一次 showNotification，calls[0] 不一定是這裡觸發的。
    fireEvent.click(screen.getByTestId('profile-submit-button'));
    const confirmation = showNotification.mock.calls
      .map(([arg]) => arg)
      .find((arg) => arg.details?.includes('推薦人：陳推薦'));
    expect(confirmation).toBeTruthy();
    confirmation.onConfirm();
    await waitFor(() => expect(apiRequestJson).toHaveBeenCalledTimes(2));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('請求過於頻繁'));
    // 剛驗好的推薦人不能因為「暫時不能查」就消失、逼使用者等窗口過後重驗。
    expect(screen.getByTestId('referral-code-status').textContent).toBe('推薦人：陳推薦');
  });
});

// Email 邀請（R2）建立的帳號：換瀏覽器續填時 localStorage 的 pending code 不在，
// 改讀 session 的 app_metadata.referral_invite.code 當後備——只作預填、仍走 validate，
// 使用者已開始輸入就不覆蓋。
describe('邀請帳號的推薦碼後備預填', () => {
  const referralField = () => document.querySelector('#referralCode') as HTMLInputElement;
  const sessionWith = (code?: string) => ({
    data: {
      session: {
        access_token: 'token',
        user: { app_metadata: code ? { referral_invite: { code } } : { provider: 'email' } },
      },
    },
  });
  const validateCalls = () =>
    apiRequestJson.mock.calls.filter(([url]) => String(url).includes('/referrals/validate/'));

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 404 })),
    );
    apiRequestJson.mockResolvedValue({ valid: true, referrer: { userName: '推薦人測試' } });
  });

  it('pending 為空且 app_metadata 有碼時預填並驗證', async () => {
    getSession.mockResolvedValue(sessionWith('8048876'));
    renderForm();
    await waitFor(() => expect(referralField().value).toBe('8048876'));
    await waitFor(() => expect(validateCalls()).toHaveLength(1));
    expect(String(validateCalls()[0][0])).toMatch(/\/referrals\/validate\/8048876$/);
  });

  it('pending 有值時用 pending，不被 app_metadata 的碼蓋掉', async () => {
    localStorage.setItem('pending_referral_code', 'abc123');
    getSession.mockResolvedValue(sessionWith('8048876'));
    renderForm();
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(referralField().value).toBe('abc123');
    expect(validateCalls().every(([url]) => !String(url).includes('8048876'))).toBe(true);
  });

  it('使用者已開始輸入推薦碼時不覆蓋', async () => {
    let release: (v: unknown) => void = () => {};
    getSession.mockImplementation(() => new Promise((r) => (release = r)));
    renderForm();
    fireEvent.change(referralField(), { target: { value: '777' } });
    await act(async () => release(sessionWith('8048876')));
    await new Promise((r) => setTimeout(r, 0));
    expect(referralField().value).toBe('777');
    expect(validateCalls().every(([url]) => !String(url).includes('8048876'))).toBe(true);
  });

  it('pending 與 app_metadata 都沒有碼時不預填', async () => {
    getSession.mockResolvedValue(sessionWith());
    renderForm();
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(referralField().value).toBe('');
    expect(validateCalls()).toHaveLength(0);
  });
});

// 「稍後註冊」會刪掉帳號（cancel-signup）。頁首另有不刪帳號的「登出」，兩顆並存容易誤按：
// 先跳確認框說出後果並指向登出（業主裁決 W3-12，Q7）。只有「確定刪除」才刪；返回、Esc 都不刪。
describe('稍後註冊的刪除確認', () => {
  /** session 可用、/profile 回 404（新註冊者）、其餘請求記下 URL 並回 200。 */
  function wireSession(
    cancel: () => Promise<Response> = async () => new Response('{}', { status: 200 }),
  ) {
    const urls: string[] = [];
    getSession.mockImplementation(() =>
      Promise.resolve({ data: { session: { access_token: 'tok', user: { id: 'u1' } } } }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(String(url));
        if (/\/profile$/.test(String(url))) return new Response('{}', { status: 404 });
        if (String(url).endsWith('/auth/cancel-signup')) return cancel();
        return new Response('{}', { status: 200 });
      }),
    );
    return urls;
  }
  const deleted = (urls: string[]) => urls.some((u) => u.endsWith('/auth/cancel-signup'));

  it('按稍後註冊先跳確認框說明會刪除帳號並指向右上角登出，尚未刪除', async () => {
    const urls = wireSession();
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: '稍後註冊' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain(
      '稍後註冊會刪除目前的帳號資料。只是想先離開，請用右上角『登出』，資料會保留。',
    );
    expect(deleted(urls)).toBe(false);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('預設焦點在返回', async () => {
    wireSession();
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: '稍後註冊' }));
    await screen.findByRole('alertdialog');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '返回' })),
    );
  });

  it('按返回時關閉確認框、不刪帳號也不登出', async () => {
    const urls = wireSession();
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: '稍後註冊' }));
    fireEvent.click(await screen.findByRole('button', { name: '返回' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deleted(urls)).toBe(false);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('按 Esc 時關閉確認框、不刪帳號', async () => {
    const urls = wireSession();
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: '稍後註冊' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deleted(urls)).toBe(false);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('按確定刪除才刪帳號並登出', async () => {
    const urls = wireSession();
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: '稍後註冊' }));
    fireEvent.click(await screen.findByRole('button', { name: '確定刪除' }));
    await waitFor(() => expect(deleted(urls)).toBe(true));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  it('刪除成功時如實告知已刪除、可用同一個 Email 重新註冊', async () => {
    wireSession();
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: '稍後註冊' }));
    fireEvent.click(await screen.findByRole('button', { name: '確定刪除' }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        '已刪除帳號資料，之後可以用同一個 Email 重新註冊',
        'info',
      ),
    );
  });

  it('刪除失敗時顯示後端原因、停在原頁、不登出', async () => {
    const urls = wireSession(
      async () =>
        new Response(
          JSON.stringify({ error: '已完成付款的帳號無法取消註冊，如需刪除帳號請聯繫客服' }),
          {
            status: 400,
          },
        ),
    );
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: '稍後註冊' }));
    fireEvent.click(await screen.findByRole('button', { name: '確定刪除' }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        '已完成付款的帳號無法取消註冊，如需刪除帳號請聯繫客服',
        'error',
      ),
    );
    expect(deleted(urls)).toBe(true);
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '稍後註冊' })).toBeTruthy();
  });

  it('刪除請求進行中兩顆鈕停用並顯示處理中，不會重複送出', async () => {
    let finish!: () => void;
    const urls = wireSession(
      () =>
        new Promise<Response>((resolve) => {
          finish = () => resolve(new Response('{}', { status: 200 }));
        }),
    );
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: '稍後註冊' }));
    fireEvent.click(await screen.findByRole('button', { name: '確定刪除' }));
    const busy = await screen.findByRole('button', { name: '處理中…' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '下一步' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(busy);
    expect(urls.filter((u) => u.endsWith('/auth/cancel-signup'))).toHaveLength(1);
    finish();
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  it('刪除回 401（帳號已不存在）時清本機並登出，不顯示失敗', async () => {
    wireSession(async () => new Response('{}', { status: 401 }));
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: '稍後註冊' }));
    fireEvent.click(await screen.findByRole('button', { name: '確定刪除' }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(showToast).not.toHaveBeenCalledWith(expect.anything(), 'error');
  });

  it('刪除請求斷線時提示稍後再試、不登出', async () => {
    wireSession(async () => {
      throw new TypeError('Failed to fetch');
    });
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: '稍後註冊' }));
    fireEvent.click(await screen.findByRole('button', { name: '確定刪除' }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('暫時無法刪除帳號資料，請稍後再試', 'error'),
    );
    expect(signOut).not.toHaveBeenCalled();
  });

  it('觸發鈕是破壞性的紅框字，確認鈕是紅實心', async () => {
    wireSession();
    renderForm();
    const trigger = screen.getByRole('button', { name: '稍後註冊' });
    expect(trigger.className).toMatch(/text-destructive/);
    fireEvent.click(trigger);
    const confirm = await screen.findByRole('button', { name: '確定刪除' });
    expect(confirm.className).toMatch(/bg-destructive/);
  });
});
