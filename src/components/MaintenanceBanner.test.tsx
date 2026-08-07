// @vitest-environment jsdom
//
// 全站公告橫幅的「被看到」契約。
//
// bug 的形狀：橫幅本身是滿版列，但訊息被 flex-1 釘在版面一側、關閉鈕釘在
// 另一側，中間留下數百 px 空白。頁面主體（卡片、表單）都在中軸上，於是
// 公告落在使用者視線動線之外——「有顯示」不等於「被看到」。同一個根因
// （只顧著把元素塞進列，沒顧「訊息要抵達誰」）還牽出兩處：嚴重度只靠
// 顏色與一個寫死的 Info 圖示傳達，以及公告非同步注入時沒有任何 live region。
//
// jsdom 沒有排版引擎、量不到座標，所以版面那幾條釘的是「產生該排版的
// class 意圖」（置中、行長上限、訊息不再吃掉整列）。這是唯一能機械把關
// 純 CSS 決策的方式；壞掉時測試名會直接說出是哪一條版面決策被改掉。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../utils/auth', () => ({ isAuthenticated: async () => true }));
vi.mock('../utils/apiClient', () => ({ buildApiUrl: (path: string) => `https://api.test${path}` }));

const { MaintenanceBanner } = await import('./MaintenanceBanner');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

const BASE = {
  id: 'ann-1',
  title: '系統維護預告',
  message: '8/10 02:00–04:00 暫停服務',
  type: 'info',
  startsAt: '2026-08-01T00:00:00Z',
  endsAt: null,
};

/** 渲染橫幅並等公告載入完成（元件在 fetch resolve 前回 null）。 */
async function renderBanner(overrides: Partial<typeof BASE> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: { announcements: [{ ...BASE, ...overrides }] } }),
    })),
  );
  render(
    <MemoryRouter initialEntries={['/member']}>
      <MaintenanceBanner />
    </MemoryRouter>,
  );
  return await screen.findByRole('status');
}

/** 訊息列＝段落的父層 flex 容器。版面決策都掛在它與它的兩個子項上。 */
function messageRow(banner: HTMLElement) {
  const paragraph = banner.querySelector('p');
  if (!paragraph?.parentElement) throw new Error('找不到公告訊息段落');
  return { paragraph, row: paragraph.parentElement };
}

describe('MaintenanceBanner', () => {
  it('公告非同步載入後以 live region 呈現，螢幕閱讀器才知道它出現了', async () => {
    const banner = await renderBanner();
    expect(banner.textContent).toContain('系統維護預告');
    expect(banner.textContent).toContain('8/10 02:00–04:00 暫停服務');
  });

  it('寬螢幕上訊息置中，落在版面中軸而不是貼齊邊緣', async () => {
    const { row } = messageRow(await renderBanner());
    expect(row.className).toContain('sm:justify-center');
  });

  it('訊息不再撐滿整列——撐滿等於把文字推離中軸', async () => {
    const { paragraph } = messageRow(await renderBanner());
    expect(paragraph.className).toContain('sm:flex-initial');
  });

  it('長公告有行長上限，不會在寬螢幕拉成一整列', async () => {
    const { paragraph } = messageRow(await renderBanner());
    expect(paragraph.className).toContain('sm:max-w-3xl');
  });

  it('關閉鈕的觸控熱區達 44px（準則 §1）', async () => {
    await renderBanner();
    const close = screen.getByRole('button', { name: '關閉公告' });
    expect(close.className).toContain('h-11');
    expect(close.className).toContain('w-11');
  });

  it('error 公告的嚴重度以文字傳達，不是只靠顏色', async () => {
    const banner = await renderBanner({ type: 'error' });
    expect(banner.textContent).toContain('網站公告（重要）');
  });

  it('warning 與 info 各自帶得出自己的嚴重度措辭', async () => {
    const warning = await renderBanner({ type: 'warning' });
    expect(warning.textContent).toContain('網站公告（注意）');
    cleanup();

    const info = await renderBanner({ type: 'info' });
    expect(info.textContent).toContain('網站公告');
  });

  it('關閉後橫幅消失，並記入 sessionStorage 讓同一則不再出現', async () => {
    await renderBanner();
    fireEvent.click(screen.getByRole('button', { name: '關閉公告' }));

    expect(screen.queryByRole('status')).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('dismissedAnnouncements') ?? '[]')).toContain('ann-1');
  });
});
