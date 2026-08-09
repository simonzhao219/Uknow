// @vitest-environment jsdom
//
// 刊登建立表單的「服務者名稱」欄位契約。
//
// 為什麼這個看似瑣碎的屬性值得一個測試:2026-08-08 的 journey f40/f60 六連敗
// 就是踩在它上面——測試往這個欄位填 17 字,瀏覽器依 maxLength 靜默截成 10 字,
// 表單照樣通過驗證、刊登照樣建得起來,只有名字短了一截,失敗因此出現在
// 30 秒後的遠處(某個 get_by_text 找不到東西),完全指不回這裡。
//
// 上限的**數值**由 src/utils/constants.ts 的 NAME_MAX_LENGTH 定義,
// e2e/journey/tools/test_listing_name.py 也直接讀那份常數來確保測試資料填得進來。
// 這一檔補的是中間那一段:**元件真的把那個常數套上去了嗎**。少了它,
// 有人把 maxLength 改回字面量或整個拿掉時,constants.ts 沒變、journey 的
// 離線測試照樣綠,兩邊各自「正確」而中間裂開——那正是本次 bug 的形狀。
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createContext } from 'react';

import { NAME_MAX_LENGTH } from '../utils/constants';

// Radix Select 依賴 jsdom 沒有的四個瀏覽器 API(同 CategorySelectField.test.tsx)。
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
HTMLElement.prototype.hasPointerCapture ??= () => false;
HTMLElement.prototype.releasePointerCapture ??= () => {};
HTMLElement.prototype.scrollIntoView ??= () => {};

const invalidate = vi.fn();
const insert = vi.fn(() => Promise.resolve({ error: null }));

vi.mock('../contexts/DataCacheContext', () => ({
  useDataCache: () => ({ invalidate }),
}));

vi.mock('../App', () => ({
  UserContext: createContext<any>({ user: { id: 'u1' } }),
}));

// 掛載時的 checkExistingListing 會查「這個人是不是已經有刊登」——回一筆
// 空結果代表「還沒有」,元件才會留在建立表單上。鏈式 API 要完整補齊,
// 否則它會走進 catch 印一串堆疊,把真正的失敗訊息淹掉。
vi.mock('../utils/supabase/client', () => ({
  createClient: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 't' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
      insert,
    }),
  }),
}));

vi.mock('./notifications/NotificationContext', () => ({
  useNotification: () => ({
    showToast: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}));

// 自訂類別清單來自後端;本檔只測名稱欄位,給一份空清單即可。
vi.mock('../hooks/useCustomCategories', () => ({
  useCustomCategories: () => ({ customCategories: [], loading: false, error: null }),
}));

const { CreateServiceProvider } = await import('./CreateServiceProvider');

function nameInput(): HTMLInputElement {
  return screen.getByLabelText(/服務者名稱/) as HTMLInputElement;
}

function renderForm() {
  return render(
    <MemoryRouter>
      <CreateServiceProvider />
    </MemoryRouter>,
  );
}

/** 從 Radix SelectTrigger 選一個選項(trigger 的可及名稱來自 aria-labelledby)。
 *
 * Radix 除了可見的 trigger,還會渲染一個隱藏的原生 <select> 以相容表單送出,
 * 兩者都是 combobox role——所以要挑出 <button> 那個,不能用 getByRole 直取。 */
function selectOption(triggerName: RegExp, option: string) {
  const trigger = screen
    .getAllByRole('combobox', { name: triggerName, hidden: true })
    .find((el) => el.tagName === 'BUTTON');
  if (!trigger) throw new Error(`找不到 ${triggerName} 的 SelectTrigger 按鈕`);
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('option', { name: option }));
}

/** 把表單填到「建立刊登」可按的狀態:名稱、類別、性別、城市、3 張照片、1 個聯絡方式。 */
async function fillCompleteForm() {
  renderForm();
  fireEvent.change(nameInput(), { target: { value: '美髮師' } });
  selectOption(/服務類別/, '美髮');
  selectOption(/性別/, '女');
  selectOption(/服務城市/, '台北市'); // 連帶自動勾選全區

  const files = [0, 1, 2].map(
    (i) => new File([new Uint8Array([0xff, 0xd8, 0xff])], `p${i}.jpg`, { type: 'image/jpeg' }),
  );
  fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
    target: { files },
  });
  fireEvent.change(screen.getByLabelText(/Instagram/i), { target: { value: 'valid_ig' } });

  // 送出鈕要等三張照片都**上傳完**(photos.length === 3)才會 enabled,
  // 且至少要有一個聯絡方式——所以這個等待必須排在聯絡方式填完之後。
  await waitFor(() =>
    expect((screen.getByRole('button', { name: '建立刊登' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
}

describe('CreateServiceProvider', () => {
  afterEach(cleanup);

  beforeEach(() => {
    invalidate.mockClear();
    insert.mockClear();
    // 照片上傳走 fetch(buildApiUrl('/listings/upload-photo'))
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ photoUrl: 'https://example.test/p.jpg' }),
      }),
    ) as unknown as typeof fetch;
  });

  it('服務者名稱欄位的 maxLength 取自 NAME_MAX_LENGTH，不是字面量', () => {
    renderForm();
    // 比對常數而非硬寫的 '10':產品調整上限時這條要跟著動,而不是變成
    // 另一個需要有人記得同步的地方。
    expect(nameInput().getAttribute('maxLength')).toBe(String(NAME_MAX_LENGTH));
  });

  it('字數計數器的分母是 NAME_MAX_LENGTH', () => {
    renderForm();
    fireEvent.change(nameInput(), { target: { value: '美髮師' } });
    expect(screen.getByText(`3/${NAME_MAX_LENGTH}`)).toBeTruthy();
  });

  it('建立成功後清掉 userListing 快取，管理頁才不會沿用「還沒有刊登」', async () => {
    // journey f40「A0 透過 GUI 建立刊登」在真後端連敗的第二個根因(run
    // 31234221750):建立成功後 navigate('/service-providers'),管理頁的
    // useUserListing 讀到**進建立頁之前**快取的 null(SOFT_TTL 30 秒內不會
    // 重新請求),於是顯示「尚未刊登服務者」與建立 CTA——使用者剛建好的
    // 刊登看不見,會以為沒成功而再建一次。
    //
    // 同一場 run 的鑑別證據:同樣斷言那個名字的「一個帳號僅能有一筆刊登」
    // 情境**通過**——它是整頁重載、快取是空的。差別只在「同一個 SPA session
    // 內建立完直接導頁」這條路徑。
    //
    // DataCacheContext 早就備好 `listingChange: ['userListing']` 這組,
    // 只是沒有任何寫入流程呼叫它(payment / rewardClaim / withdrawal 都有)。
    await fillCompleteForm();
    fireEvent.click(screen.getByRole('button', { name: '建立刊登' }));

    await waitFor(() => expect(insert).toHaveBeenCalled());
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith('listingChange'));
  });

  it('上限交給 maxLength 屬性，onChange 原樣收下不做 JS 拒收', () => {
    // JS 拒收會在 IME 組字期間把值倒帶(「專業美髮師」的注音是 13 字,
    // 一超過就整串被拒),見 PR #212 與 friction-log 的 2026-08-07 條。
    // jsdom 不套用 maxLength,所以這裡送得進超長值——正好用來證明
    // 元件本身沒有另一層長度拒收。
    renderForm();
    const tooLong = '一二三四五六七八九十十一十二';
    fireEvent.change(nameInput(), { target: { value: tooLong } });
    expect(nameInput().value).toBe(tooLong);
  });
});
