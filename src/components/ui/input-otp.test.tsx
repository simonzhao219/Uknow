// @vitest-environment jsdom
//
// OTP 目前格＝有框元件的選取態（ui-ux-guidelines §12.12）：框線變灰字 --sel，外加 1px
// 同色環合成單圈 2px；不疊 3px 焦點環（焦點與選中同一種外觀）。slots 由 OTPInputContext
// 直接提供，不靠 jsdom 模擬輸入焦點——那條路依賴瀏覽器的選取事件，測的會是函式庫而不是
// 這裡的樣式契約。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { OTPInputContext } from 'input-otp';
import { InputOTPSlot } from './input-otp';

afterEach(cleanup);

function renderSlots() {
  const { container } = render(
    <OTPInputContext.Provider
      value={{
        isFocused: true,
        isHovering: false,
        slots: [
          { char: '4', placeholderChar: null, hasFakeCaret: false, isActive: false },
          { char: null, placeholderChar: null, hasFakeCaret: true, isActive: true },
        ],
      }}
    >
      <InputOTPSlot index={0} />
      <InputOTPSlot index={1} />
    </OTPInputContext.Provider>,
  );
  const [filled, current] = Array.from(
    container.querySelectorAll<HTMLElement>('[data-slot="input-otp-slot"]'),
  );
  return { filled, current };
}

describe('InputOTPSlot', () => {
  it('目前格標 data-active，其他格不標', () => {
    const { filled, current } = renderSlots();
    expect(current.dataset.active).toBe('true');
    expect(filled.dataset.active).toBe('false');
  });

  it('目前格是灰字框線加 1px 同色環的單圈 2px', () => {
    const { current } = renderSlots();
    for (const c of [
      'data-[active=true]:border-sel',
      'data-[active=true]:ring-sel',
      'data-[active=true]:ring-1',
    ]) {
      expect(current.classList.contains(c), c).toBe(true);
    }
  });

  it('目前格不疊 3px 焦點環，也不改用 --ring 的顏色', () => {
    const { current } = renderSlots();
    expect(current.classList.contains('data-[active=true]:ring-[3px]')).toBe(false);
    expect(current.className).not.toMatch(/data-\[active=true\]:(border|ring)-ring/);
  });
});
