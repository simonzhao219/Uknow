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
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createContext } from 'react';

import { NAME_MAX_LENGTH } from '../utils/constants';

// radix 的 Select/Checkbox 走 useSize → ResizeObserver,jsdom 沒有這個 API。
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

vi.mock('../App', () => ({
  UserContext: createContext<any>({ user: { id: 'u1' } }),
}));

// 掛載時的 checkExistingListing 會查「這個人是不是已經有刊登」——回一筆
// 空結果代表「還沒有」,元件才會留在建立表單上。鏈式 API 要完整補齊,
// 否則它會走進 catch 印一串堆疊,把真正的失敗訊息淹掉。
vi.mock('../utils/supabase/client', () => ({
  createClient: () => ({
    auth: { getSession: () => new Promise<never>(() => {}) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      }),
      insert: () => new Promise<never>(() => {}),
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

describe('CreateServiceProvider', () => {
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
