// @vitest-environment jsdom
//
// Popover 面板的**高度界限**。這支測試的存在理由與 CategoryBadge.test.tsx 同型:
// 界限要由建構保證,不是靠每個呼叫點自己記得補。
//
// 為什麼是缺陷而不只是缺漏:同一份 shadcn 基底裡,`select.tsx` 早就帶著
// `max-h-(--radix-select-content-available-height) overflow-y-auto`,`popover.tsx`
// 卻沒有對應的一條。於是「面板會不會長過視窗」變成逐呼叫點的自律——首頁三個
// 篩選面板裡,「服務地區」記得自己補 `max-h-[70vh] overflow-y-auto`,「服務類別」
// 沒有。而類別面板的高度**不由開發者決定**:自訂類別是全站共享詞彙、數量無上限
// (實測 560px 面板下,30 個內建 chip 約 314px,再加 30 個自訂 chip 就到 794px)。
// PopoverContent 是 portal + fixed,長過視窗又沒有捲軸時,底部的 chip 點不到——
// 那不是視覺瑕疵,是篩選條件永久不可及。
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

afterEach(cleanup);

function panelOf(className?: string) {
  render(
    <Popover open>
      <PopoverTrigger>開啟</PopoverTrigger>
      <PopoverContent className={className}>面板內容</PopoverContent>
    </Popover>,
  );
  return screen.getByText('面板內容');
}

describe('PopoverContent', () => {
  it('預設把高度封頂在 Radix 算出的可用高度', () => {
    // 可用高度 = 觸發器到視窗邊緣的實際空間,比任何寫死的 vh 都準。
    expect(panelOf().className).toContain('max-h-(--radix-popover-content-available-height)');
  });

  it('預設允許縱向捲動——封頂而不給捲軸只是把溢出換成裁切', () => {
    expect(panelOf().className).toContain('overflow-y-auto');
  });

  it('呼叫端自訂 max-h 時只留一條，不與預設疊出未定義的勝負', () => {
    // 兩條 max-h 同時進 class 時,誰贏取決於 Tailwind 產生的 CSS 順序,
    // 那不是呼叫端能推理的事。tailwind-merge 必須把同族收斂成一條。
    const className = panelOf('max-h-[70vh]').className;
    expect(className).toContain('max-h-[70vh]');
    expect(className).not.toContain('max-h-(--radix-popover-content-available-height)');
  });
});
