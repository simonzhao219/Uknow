// @vitest-environment jsdom
//
// 底部導覽的資訊架構契約。這些斷言釘住的是 UI/UX 決策，不是實作細節：
//   1. 只有五格——超過就開始壓縮拇指熱區。
//   2. 順序固定為 首頁 → 任務 → 推薦 → 獎勵 → 會員（發現 → 做事賺 →
//      拉人賺 → 收錢 → 我），首頁最左、會員最右。
//   3. feature flag 只會讓中間的格子消失，絕不改變剩下項目的相對順序
//      ——導覽列在不同帳號狀態下漂移，使用者的位置記憶就失效了。
//   4. 刊登不在導覽列裡（主入口在會員中心）。
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// vi.hoisted 的內容會被提到所有 import 之前執行，所以 React 要在區塊內
// 自己 import——用檔案頂端那個 binding 會踩到 TDZ。
const { flags, UserCtx } = await vi.hoisted(async () => {
  const { createContext } = await import('react');
  return {
    flags: {
      serviceProviderManagement: true,
      referralManagement: true,
      taskCenter: true,
      rewardSystem: true,
    } as Record<string, boolean>,
    // BottomNav 從 '../App' 取 UserContext；在這裡替身掉，測試才不用把整個
    // App 模組（含所有路由與 provider）拉進來。
    UserCtx: createContext<any>({ isLoggedIn: true }),
  };
});

vi.mock('../App', () => ({ UserContext: UserCtx }));
vi.mock('../contexts/FeatureContext', () => ({
  useFeatures: () => ({
    features: flags,
    isFeatureEnabled: (key: string) => flags[key],
    refreshFeatures: () => {},
    isLoading: false,
  }),
}));

import { BottomNav } from './BottomNav';

function renderNav(isLoggedIn = true) {
  return render(
    <MemoryRouter>
      <UserCtx.Provider value={{ isLoggedIn }}>
        <BottomNav />
      </UserCtx.Provider>
    </MemoryRouter>
  );
}

/** 導覽列目前實際呈現的標籤，依畫面順序。 */
function labels() {
  return screen
    .getAllByRole('link')
    .map((el) => el.textContent?.trim() ?? '');
}

beforeEach(() => {
  Object.assign(flags, {
    serviceProviderManagement: true,
    referralManagement: true,
    taskCenter: true,
    rewardSystem: true,
  });
});
afterEach(cleanup);

describe('BottomNav', () => {
  it('未登入時不呈現（底部導覽是會員區的東西）', () => {
    const { container } = renderNav(false);
    expect(container.firstChild).toBeNull();
  });

  it('全功能開啟時剛好五格，且依動線排序', () => {
    renderNav();
    expect(labels()).toEqual(['首頁', '任務', '推薦', '獎勵', '會員']);
  });

  it('首頁固定最左、會員固定最右', () => {
    renderNav();
    const shown = labels();
    expect(shown[0]).toBe('首頁');
    expect(shown[shown.length - 1]).toBe('會員');
  });

  it('推薦管理有自己的一格，直達 /referrals（不必先進會員中心）', () => {
    renderNav();
    const referral = screen.getByRole('link', { name: '推薦' });
    expect(referral.getAttribute('href')).toBe('/referrals');
  });

  it('刊登不佔用導覽列（服務提供者專屬且低頻，主入口在會員中心）', () => {
    renderNav();
    expect(labels()).not.toContain('刊登');
    expect(screen.queryByRole('link', { name: '刊登' })).toBeNull();
  });

  it('關掉中間任一功能只會少一格，剩下項目的相對順序不變', () => {
    flags.referralManagement = false;
    renderNav();
    expect(labels()).toEqual(['首頁', '任務', '獎勵', '會員']);

    cleanup();
    flags.referralManagement = true;
    flags.taskCenter = false;
    renderNav();
    expect(labels()).toEqual(['首頁', '推薦', '獎勵', '會員']);
  });

  it('中間功能全關時仍保有首頁與會員兩個固定端點', () => {
    flags.referralManagement = false;
    flags.taskCenter = false;
    flags.rewardSystem = false;
    renderNav();
    expect(labels()).toEqual(['首頁', '會員']);
  });

  it('刊登的 feature flag 不影響導覽列（它已不在這裡）', () => {
    flags.serviceProviderManagement = false;
    renderNav();
    expect(labels()).toEqual(['首頁', '任務', '推薦', '獎勵', '會員']);
  });
});
