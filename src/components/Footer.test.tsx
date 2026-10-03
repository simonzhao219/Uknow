// @vitest-environment jsdom
//
// 頁尾「聯絡我們」的聯絡管道契約。這裡釘的是「使用者找得到官方窗口」這件事：
//   1. 官方客服（LINE）、官方信箱皆以純文字呈現（不是連結），代稱/位址仍
//      取自 utils/constants 的共用常數——顯示處自己寫死位址正是 LINE 帳號
//      曾經大小寫漂移的原因。
//   2. 信箱位址的換行機會固定落在 "@" 之後（見下方第二個測試），這個排版
//      需求跟信箱是否可點無關。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LINE_OFFICIAL_ACCOUNT_HANDLE, OFFICIAL_EMAIL } from '../utils/constants';
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

/** node 之前／之後的所有同層文字（React 會把相鄰字串拆成多個 text node）。 */
function textUpTo(node: Element): string {
  let out = '';
  for (let sib = node.previousSibling; sib; sib = sib.previousSibling) {
    out = (sib.textContent ?? '') + out;
  }
  return out;
}

function textFrom(node: Element): string {
  let out = '';
  for (let sib = node.nextSibling; sib; sib = sib.nextSibling) {
    out += sib.textContent ?? '';
  }
  return out;
}

describe('Footer 聯絡我們', () => {
  it('官方信箱以純文字呈現（不是連結）', () => {
    const section = contactSection();
    expect(section.getByText(`官方信箱：${OFFICIAL_EMAIL}`)).toBeTruthy();
    expect(section.queryByRole('link', { name: `官方信箱：${OFFICIAL_EMAIL}` })).toBeNull();
  });

  it('位址的換行機會固定落在 @ 之後', () => {
    // 回歸釘。窄螢幕溢出本身有 e2e 的 375px 巡檢守著，但**斷在哪裡**沒有任何
    // 閘門——瀏覽器自己挑的斷點（實測 "admin@u" / "know.com.tw"）照樣不溢出，
    // 巡檢一樣全綠。拿掉這顆 <wbr> 時三道閘門都不會紅，只有使用者看到網域
    // 被切成兩半。這條就是那個缺口的第二道網。
    const section = contactSection();
    const emailText = section.getByText(`官方信箱：${OFFICIAL_EMAIL}`);
    const wbr = emailText.querySelector('wbr');
    expect(wbr, '位址少了 <wbr>，換行點會退回瀏覽器自選').not.toBeNull();

    const before = textUpTo(wbr as Element);
    const [local, domain] = OFFICIAL_EMAIL.split('@');
    expect(before).toBe(`官方信箱：${local}@`);
    expect(textFrom(wbr as Element)).toBe(domain);
  });

  it('官方 LINE 客服以純文字呈現（不是連結），且未被信箱取代', () => {
    const section = contactSection();
    expect(section.getByText(`官方客服：${LINE_OFFICIAL_ACCOUNT_HANDLE}`)).toBeTruthy();
    expect(
      section.queryByRole('link', { name: `官方客服：${LINE_OFFICIAL_ACCOUNT_HANDLE}` }),
    ).toBeNull();
  });
});
