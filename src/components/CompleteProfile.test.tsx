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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createContext } from 'react';

// radix 的 Checkbox 走 useSize → ResizeObserver,jsdom 沒有這個 API。
// 只需要「存在且不炸」,不需要真的量測。
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const showNotification = vi.fn();

vi.mock('../App', () => ({
  UserContext: createContext<any>({ setUser: () => {} }),
}));

vi.mock('../utils/supabase/client', () => ({
  createClient: () => ({
    auth: {
      // 刻意**永不 resolve**:本檔測的是姓名欄位行為,不是 session 流程。
      // 若讓它 resolve,checkSession 會在測試結束、jsdom 已拆掉之後才跑到
      // navigate(),React 於 teardown 後 commit 就會擲 `window is not defined`
      // ——那是假陽性噪音,不是產品問題。
      getSession: () => new Promise<never>(() => {}),
    },
  }),
}));

vi.mock('./notifications/NotificationContext', () => ({
  useNotification: () => ({
    showToast: vi.fn(),
    showSuccess: vi.fn(),
    showNotification,
  }),
}));

vi.mock('./LegalDialog', () => ({ LegalDialog: () => null }));

const { CompleteProfile } = await import('./CompleteProfile');

function renderForm() {
  return render(
    <MemoryRouter>
      <CompleteProfile />
    </MemoryRouter>,
  );
}

const nameInput = () => screen.getByLabelText('姓名 *') as HTMLInputElement;
const modeButton = (label: string) => screen.getByRole('button', { name: label });

afterEach(cleanup);

beforeEach(() => {
  cleanup();
  showNotification.mockClear();
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
    expect(counter.className).toContain('text-destructive');
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
  function fillValidForm() {
    fireEvent.change(nameInput(), { target: { value: '王小明' } });
    fireEvent.change(screen.getByLabelText('身份證字號 *'), {
      target: { value: 'A123456789' },
    });
    fireEvent.change(screen.getByLabelText('手機號碼 *'), { target: { value: '0933333333' } });
    fireEvent.change(screen.getByLabelText('出生年月日 *'), { target: { value: '2000-01-01' } });
    fireEvent.click(screen.getByRole('checkbox'));
  }

  it('只跳一個對話框,且同時列出姓名與推薦碼資訊', () => {
    renderForm();
    fillValidForm();
    fireEvent.click(screen.getByTestId('profile-submit-button'));

    expect(showNotification).toHaveBeenCalledTimes(1);
    const arg = showNotification.mock.calls[0][0];
    expect(arg.details.some((d: string) => d.includes('姓名：王小明'))).toBe(true);
    expect(arg.details.some((d: string) => d.includes('推薦碼'))).toBe(true);
    // 姓名是可以改的(規格書 §4.2),不可沿用推薦碼那句「永久綁定,無法修改」
    // 涵蓋姓名——那會是錯誤陳述。
    expect(arg.message).toContain('姓名');
    expect(arg.message).toContain('核對身分');
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
