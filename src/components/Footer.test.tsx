// @vitest-environment jsdom
//
// 頁尾「聯絡我們」的聯絡管道契約。這裡釘的是「使用者找得到官方窗口」這件事：
//   1. 每個管道都是可點的連結（不是純文字），且位址取自 utils/constants
//      的共用常數——顯示處自己寫死位址正是 LINE 帳號曾經大小寫漂移的原因。
//   2. 信箱走 mailto:，點了直接開郵件程式，不換頁也不開新分頁
//      （新分頁由 repoHygiene 的「外部連結一律在原分頁開啟」另外把關）。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  LINE_OFFICIAL_ACCOUNT_HANDLE,
  LINE_OFFICIAL_ACCOUNT_URL,
  OFFICIAL_EMAIL,
  OFFICIAL_EMAIL_URL,
} from '../utils/constants';
import { Footer } from './Footer';

afterEach(cleanup);

/** 「聯絡我們」那一區塊（用標題定位，不依賴 DOM 結構）。 */
function contactSection() {
  render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  );
  const heading = screen.getByRole('heading', { name: '聯絡我們' });
  const section = heading.closest('div');
  if (!section) throw new Error('找不到「聯絡我們」區塊');
  return within(section);
}

describe('Footer 聯絡我們', () => {
  it('官方信箱以 mailto 連結呈現', () => {
    const link = contactSection().getByRole('link', { name: `官方信箱：${OFFICIAL_EMAIL}` });
    expect(link.getAttribute('href')).toBe(OFFICIAL_EMAIL_URL);
  });

  it('官方 LINE 客服連結未被信箱取代', () => {
    const link = contactSection().getByRole('link', {
      name: `官方客服：${LINE_OFFICIAL_ACCOUNT_HANDLE}`,
    });
    expect(link.getAttribute('href')).toBe(LINE_OFFICIAL_ACCOUNT_URL);
  });
});
