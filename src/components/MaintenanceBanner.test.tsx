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
//
// 〈顯示對象〉那一組不是版面契約，是元件原本就有、卻從未被測到的產品規則
// （公告只對會員相關用戶顯示）。本次補上——這個檔案一被載入，v8 就會用
// 執行期的分支圖取代靜態估算，不補等於讓覆蓋率棘輪替一段沒人測的邏輯背書。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// 登入態要能逐測試切換，故用 vi.hoisted 讓 mock factory 讀得到可變狀態
const authState = vi.hoisted(() => ({ loggedIn: true }));
vi.mock('../utils/auth', () => ({ isAuthenticated: async () => authState.loggedIn }));
vi.mock('../utils/apiClient', () => ({ buildApiUrl: (path: string) => `https://api.test${path}` }));

const { MaintenanceBanner } = await import('./MaintenanceBanner');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  authState.loggedIn = true;
});

const BASE = {
  id: 'ann-1',
  title: '系統維護預告',
  message: '8/10 02:00–04:00 暫停服務',
  type: 'info',
  startsAt: '2026-08-01T00:00:00Z',
  endsAt: null,
};

interface MountOptions {
  announcement?: Partial<typeof BASE> | null;
  /** 端點回非 2xx（元件的設計是失敗就不打擾使用者） */
  httpError?: boolean;
  /** fetch 本身拋錯（離線、CORS） */
  networkError?: boolean;
  path?: string;
  loggedIn?: boolean;
}

function mountBanner({
  announcement = {},
  httpError = false,
  networkError = false,
  path = '/member',
  loggedIn = true,
}: MountOptions = {}) {
  authState.loggedIn = loggedIn;
  const list = announcement === null ? [] : [{ ...BASE, ...announcement }];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (networkError) throw new Error('offline');
      return { ok: !httpError, json: async () => ({ data: { announcements: list } }) };
    }),
  );
  render(
    <MemoryRouter initialEntries={[path]}>
      <MaintenanceBanner />
    </MemoryRouter>,
  );
}

/**
 * 放行 fetch → res.json() → setState 這串 promise。
 * 「不該顯示」的斷言沒有可等待的正向信號，只能確定鏈已走完再查 DOM。
 */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

async function renderBanner(options: MountOptions = {}) {
  mountBanner(options);
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
    const banner = await renderBanner({ announcement: { type: 'error' } });
    expect(banner.textContent).toContain('網站公告（重要）');
  });

  it('warning 與 info 各自帶得出自己的嚴重度措辭', async () => {
    const warning = await renderBanner({ announcement: { type: 'warning' } });
    expect(warning.textContent).toContain('網站公告（注意）');
    cleanup();

    const info = await renderBanner({ announcement: { type: 'info' } });
    expect(info.textContent).toContain('網站公告');
  });

  it('未知 type 降級成 info 呈現，不讓沒對到的嚴重度炸掉整頁', async () => {
    const banner = await renderBanner({ announcement: { type: 'critical' } });
    expect(banner.className).toContain('bg-blue-50');
  });

  it('關閉後橫幅消失，並記入 sessionStorage 讓同一則不再出現', async () => {
    await renderBanner();
    fireEvent.click(screen.getByRole('button', { name: '關閉公告' }));

    expect(screen.queryByRole('status')).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('dismissedAnnouncements') ?? '[]')).toContain('ann-1');
  });

  it('sessionStorage 存了壞資料時視同沒關閉過，公告照常顯示', async () => {
    sessionStorage.setItem('dismissedAnnouncements', '{壞掉的 JSON');
    const banner = await renderBanner();
    expect(banner.textContent).toContain('系統維護預告');
  });

  describe('顯示對象', () => {
    it('訪客在登入頁看得到公告', async () => {
      const banner = await renderBanner({ loggedIn: false, path: '/login' });
      expect(banner.textContent).toContain('系統維護預告');
    });

    it('訪客在首頁看不到公告——首頁是給還沒進入會員流程的人看的', async () => {
      mountBanner({ loggedIn: false, path: '/' });
      await settle();
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('訪客在刊登詳情頁看不到公告', async () => {
      mountBanner({ loggedIn: false, path: '/service-providers/abc' });
      await settle();
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('訪客在會員區以外的其他頁也看不到公告', async () => {
      mountBanner({ loggedIn: false, path: '/rewards' });
      await settle();
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('已登入者連首頁都看得到公告', async () => {
      const banner = await renderBanner({ loggedIn: true, path: '/' });
      expect(banner.textContent).toContain('系統維護預告');
    });
  });

  describe('取不到公告時', () => {
    it('沒有生效中的公告就不顯示橫幅', async () => {
      mountBanner({ announcement: null });
      await settle();
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('端點回非 2xx 時不顯示橫幅，不拿後端故障打擾使用者', async () => {
      mountBanner({ httpError: true });
      await settle();
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('fetch 直接拋錯（離線）時不顯示橫幅', async () => {
      mountBanner({ networkError: true });
      await settle();
      expect(screen.queryByRole('status')).toBeNull();
    });
  });
});
