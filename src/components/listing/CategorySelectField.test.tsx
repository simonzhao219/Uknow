// @vitest-environment jsdom
//
// 刊登表單的服務類別欄位(Create 與 Edit 共用)。這裡釘住三件事:
//
//   1. **A9:當前值一定配得到選項。** 編輯一筆自訂類別的刊登時,若 SelectContent
//      只映射內建 30 項,Radix 會把 <Select value="寵物美容"> 顯示成未選擇的
//      placeholder。使用者以為類別被清空而手動重選,原本的自訂類別就被覆蓋掉
//      ——那是真實的資料損失,不是視覺瑕疵。而自訂類別清單是**非同步**載入的,
//      所以「載入完成前」是常態不是邊界(LINE 內建瀏覽器等高延遲環境尤其)。
//   2. **A2:IME 安全。** 自訂輸入框的 onChange 必須原樣收下 e.target.value。
//      這裡用 compositionstart/end 走一遍組字生命週期——`scripts/check-ime-safe-inputs.py`
//      只看得到靜態形狀,看不到「組字期間值有沒有被改寫」那是執行期狀態。
//   3. **A4 的使用者可見面:收斂提示。** 輸入被歸進既有類別時要講出來,
//      否則使用者不知道自己打的字被換掉了。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CategorySelectField } from './CategorySelectField';
import { CUSTOM_CATEGORY_MAX_LENGTH } from '../../utils/serviceCategories';

afterEach(cleanup);

// Radix Select 依賴 jsdom 沒有的三個瀏覽器 API。補上這些替身之後,下拉是
// **真的可以用鍵盤驅動的**——A1(選「自訂類別…」→ 出現輸入框)因此測得到
// 真實的 handleSelect,不必靠 startInCustomMode 接縫繞過去。
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
HTMLElement.prototype.hasPointerCapture ??= () => false;
HTMLElement.prototype.releasePointerCapture ??= () => {};
HTMLElement.prototype.scrollIntoView ??= () => {};

function renderField(props: Partial<React.ComponentProps<typeof CategorySelectField>> = {}) {
  const onChange = vi.fn();
  const result = render(
    <CategorySelectField value="" onChange={onChange} customCategories={[]} {...props} />,
  );
  return { onChange, ...result };
}

/** 目前選到的類別(Radix 把它渲染進 trigger)。 */
function triggerText() {
  return screen.getByRole('combobox').textContent;
}

function customInput() {
  return screen.getByLabelText(/自訂類別名稱/) as HTMLInputElement;
}

describe('CategorySelectField 選項集合', () => {
  it('內建類別可選', () => {
    renderField({ value: '美髮' });
    expect(triggerText()).toContain('美髮');
  });

  it('別人建立的自訂類別出現在選項裡（A5：類別是全站共享詞彙）', () => {
    renderField({ value: '寵物美容', customCategories: ['寵物美容'] });
    expect(triggerText()).toContain('寵物美容');
  });

  it('自訂類別清單尚未載入時，當前值仍正確顯示而非顯示成未選擇（A9）', () => {
    // 這正是編輯頁的競態:formData.category 來自 listings,選項來自另一條
    // 非同步查詢。少了 A9 不變式,這裡會退回 placeholder。
    renderField({ value: '寵物美容', customCategories: [] });
    expect(triggerText()).toContain('寵物美容');
    expect(triggerText()).not.toContain('選擇服務類別');
  });

  it('沒有選任何類別時顯示 placeholder', () => {
    renderField({ value: '' });
    expect(triggerText()).toContain('選擇服務類別');
  });
});

// A1 的真實路徑:透過下拉選單選到「自訂類別…」。這一組刻意**不用**
// startInCustomMode 接縫——用接縫的話,handleSelect(判斷 sentinel、清空
// customText/matchedExisting、決定 onChange('') 還是 onChange(selected))
// 整個函式一行都不會被執行,而它正是 A1 的實作本體。
describe('CategorySelectField 下拉選取（A1 真實路徑）', () => {
  function openMenu() {
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
  }

  it('選「自訂類別…」後出現輸入框', () => {
    renderField();
    openMenu();
    fireEvent.click(screen.getByRole('option', { name: '自訂類別…' }));
    expect(screen.getByLabelText(/自訂類別名稱/)).toBeTruthy();
  });

  it('選「自訂類別…」當下先清空類別值，讓空白的自訂輸入不會悄悄通過', () => {
    const { onChange } = renderField({ value: '美髮' });
    openMenu();
    fireEvent.click(screen.getByRole('option', { name: '自訂類別…' }));
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('選內建類別時直接回拋該類別，不進自訂模式', () => {
    const { onChange } = renderField();
    openMenu();
    fireEvent.click(screen.getByRole('option', { name: '按摩' }));
    expect(onChange).toHaveBeenLastCalledWith('按摩');
    expect(screen.queryByLabelText(/自訂類別名稱/)).toBeNull();
  });

  it('別人建立的自訂類別可直接從下拉選取（A5）', () => {
    const { onChange } = renderField({ customCategories: ['寵物美容'] });
    openMenu();
    fireEvent.click(screen.getByRole('option', { name: '寵物美容' }));
    expect(onChange).toHaveBeenLastCalledWith('寵物美容');
  });

  it('自訂模式下改選內建類別，殘留的輸入文字不會跟著回來', () => {
    renderField();
    openMenu();
    fireEvent.click(screen.getByRole('option', { name: '自訂類別…' }));
    fireEvent.change(screen.getByLabelText(/自訂類別名稱/), { target: { value: '寵物溝通' } });

    openMenu();
    fireEvent.click(screen.getByRole('option', { name: '美髮' }));
    expect(screen.queryByLabelText(/自訂類別名稱/)).toBeNull();

    openMenu();
    fireEvent.click(screen.getByRole('option', { name: '自訂類別…' }));
    expect((screen.getByLabelText(/自訂類別名稱/) as HTMLInputElement).value).toBe('');
  });
});

describe('CategorySelectField 自訂輸入', () => {
  it('預設不顯示自訂輸入框（漸進揭露）', () => {
    renderField();
    expect(screen.queryByLabelText(/自訂類別名稱/)).toBeNull();
  });

  it('編輯既有自訂類別的刊登時，不會誤判成正在自訂而彈出輸入框', () => {
    renderField({ value: '寵物美容', customCategories: ['寵物美容'] });
    expect(screen.queryByLabelText(/自訂類別名稱/)).toBeNull();
  });

  it('切到自訂模式後顯示輸入框並取得焦點', () => {
    renderField({ startInCustomMode: true });
    expect(customInput()).toBeTruthy();
    expect(document.activeElement).toBe(customInput());
  });

  it('輸入新類別時原樣回拋給父層', () => {
    const { onChange } = renderField({ startInCustomMode: true });
    fireEvent.change(customInput(), { target: { value: '寵物溝通' } });
    expect(onChange).toHaveBeenLastCalledWith('寵物溝通');
  });

  it('輸入前後空白時回拋正規化後的值', () => {
    const { onChange } = renderField({ startInCustomMode: true });
    fireEvent.change(customInput(), { target: { value: '  寵物溝通  ' } });
    expect(onChange).toHaveBeenLastCalledWith('寵物溝通');
  });

  it('輸入等價於既有類別時收斂過去', () => {
    const { onChange } = renderField({ startInCustomMode: true });
    fireEvent.change(customInput(), { target: { value: '美髮 ' } });
    expect(onChange).toHaveBeenLastCalledWith('美髮');
  });

  it('收斂發生時明講將歸入哪個既有類別', () => {
    renderField({ startInCustomMode: true });
    fireEvent.change(customInput(), { target: { value: '美髮 ' } });
    expect(screen.getByText(/既有類別/)).toBeTruthy();
    expect(screen.getByText(/美髮/)).toBeTruthy();
  });

  it('沒有收斂時不顯示提示（沒改寫就不必說）', () => {
    renderField({ startInCustomMode: true });
    fireEvent.change(customInput(), { target: { value: '寵物溝通' } });
    expect(screen.queryByText(/既有類別/)).toBeNull();
  });

  it('清空輸入時回拋空值，讓送出前的驗證擋得住', () => {
    const { onChange } = renderField({ startInCustomMode: true });
    fireEvent.change(customInput(), { target: { value: '寵物溝通' } });
    fireEvent.change(customInput(), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('輸入框有 maxLength 屬性，長度上限交給 DOM 而非 JS 拒收', () => {
    // JS 拒收會在 IME 組字期間把值倒帶(比改寫更糟);瀏覽器不對組字中的
    // 文字套用 maxLength,所以這個屬性是 IME 安全的。見 PR #212。
    renderField({ startInCustomMode: true });
    // 期望值從常數推導而不是寫死:上限是產品規則、會被調整(2026-09-01 由
    // 10 收到 6),而這兩條斷言驗的是「屬性等於上限」與「計數器顯示 n/上限」
    // ——那兩件事與上限的具體數字無關。寫死只會讓調數字連帶弄紅無關的測試。
    expect(customInput().getAttribute('maxLength')).toBe(String(CUSTOM_CATEGORY_MAX_LENGTH));
  });

  it('顯示字數計數器', () => {
    renderField({ startInCustomMode: true });
    fireEvent.change(customInput(), { target: { value: '寵物溝通' } });
    expect(screen.getByText(`4/${CUSTOM_CATEGORY_MAX_LENGTH}`)).toBeTruthy();
  });
});

describe('CategorySelectField IME 組字', () => {
  it('注音組字期間輸入框的值原樣保留，不被正規化改寫', () => {
    renderField({ startInCustomMode: true });
    const input = customInput();

    fireEvent.compositionStart(input);
    // 組字中的注音帶空白也不能被 trim——值一被改寫,iOS 的組字狀態就毀了
    fireEvent.change(input, { target: { value: 'ㄔㄨㄥˇ ㄨㄨˋ' } });
    expect(input.value).toBe('ㄔㄨㄥˇ ㄨㄨˋ');

    fireEvent.compositionEnd(input, { target: { value: '寵物溝通' } });
    expect(input.value).toBe('寵物溝通');
  });

  it('組字結束後才把正規化的值交給父層', () => {
    const { onChange } = renderField({ startInCustomMode: true });
    const input = customInput();

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'ㄔㄨㄥˇ' } });
    fireEvent.compositionEnd(input, { target: { value: ' 寵物溝通 ' } });

    expect(onChange).toHaveBeenLastCalledWith('寵物溝通');
  });
});

describe('CategorySelectField 錯誤態', () => {
  // ⚠️ 這一組刻意**不**用 error prop 灌訊息進去。用 prop 灌只證明「元件收到
  // 字串會顯示」,證明不了真實流程產得出那個字串——而原本的實作正是把
  // validateCustomCategory 的 error 算出來就丟掉,那些訊息從未到達任何畫面。
  // 更糟的是送出鈕在 !formData.category 時是 disabled 的,父層那句通用訊息
  // 連被觸發的機會都沒有:使用者只看到一顆按不下去的鈕,沒有任何線索。
  it('輸入後又清空時，自己講出「請輸入自訂類別」', () => {
    renderField({ startInCustomMode: true });
    fireEvent.change(customInput(), { target: { value: '寵物溝通' } });
    fireEvent.change(customInput(), { target: { value: '' } });
    expect(screen.getByText('請輸入自訂類別')).toBeTruthy();
  });

  it('剛切到自訂模式、還沒動過時不預先報錯', () => {
    // 對著還沒犯錯的人喊「請輸入」是噪音。
    renderField({ startInCustomMode: true });
    expect(screen.queryByText('請輸入自訂類別')).toBeNull();
  });

  it('冒用保留字時講出理由，而不是靜默拒絕', () => {
    renderField({ startInCustomMode: true });
    fireEvent.change(customInput(), { target: { value: '全部類別' } });
    expect(screen.getByRole('alert').textContent).toContain('保留');
  });

  it('自訂模式下的具體理由優先於父層的通用訊息', () => {
    renderField({ startInCustomMode: true, error: '請選擇或輸入服務類別' });
    fireEvent.change(customInput(), { target: { value: '寵物溝通' } });
    fireEvent.change(customInput(), { target: { value: '  ' } });
    expect(screen.getByText('請輸入自訂類別')).toBeTruthy();
    expect(screen.queryByText('請選擇或輸入服務類別')).toBeNull();
  });

  it('有錯誤時顯示訊息', () => {
    renderField({ startInCustomMode: true, error: '請輸入自訂類別' });
    expect(screen.getByText('請輸入自訂類別')).toBeTruthy();
  });

  it('內建模式下的下拉觸發器也標記 aria-invalid（錯誤只被宣讀一次就沒了）', () => {
    renderField({ error: '請選擇或輸入服務類別' });
    const trigger = screen.getByRole('combobox');
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
    expect(trigger.getAttribute('aria-describedby')).toBe('listing-category-error');
  });

  it('有錯誤時輸入框標記 aria-invalid 並指向錯誤訊息', () => {
    renderField({ startInCustomMode: true, error: '請輸入自訂類別' });
    const input = customInput();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('listing-category-error');
  });

  it('沒有錯誤時不留空殼錯誤區', () => {
    renderField({ startInCustomMode: true });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
