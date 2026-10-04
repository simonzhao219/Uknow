// @vitest-environment jsdom
//
// 狀態圖示跟著 variant 走（ui-ux-guidelines §12.3）：呼叫端不傳 icon 時四種
// variant 各有固定圖示，傳了才覆寫（只給 Shield、UserCog 這類非狀態圖示用）。
// 圖示用 classList.contains 比對：lucide-circle-check 是 lucide-circle-check-big
// 的字串前綴，用 toContain 比 class 字串會誤判通過。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Shield } from 'lucide-react';
import { StatusCallout } from './status-callout';

afterEach(cleanup);

function iconOf(container: HTMLElement) {
  const svg = container.querySelector('[data-slot="status-callout"] > svg');
  if (!svg) throw new Error('沒有圖示');
  return svg.classList;
}

describe('StatusCallout', () => {
  it('success 不傳 icon 時用 CircleCheck', () => {
    const { container } = render(<StatusCallout variant="success" title="完成" />);
    expect(iconOf(container).contains('lucide-circle-check')).toBe(true);
  });

  it('warning 不傳 icon 時用 TriangleAlert', () => {
    const { container } = render(<StatusCallout variant="warning" title="注意" />);
    expect(iconOf(container).contains('lucide-triangle-alert')).toBe(true);
  });

  it('destructive 不傳 icon 時用 CircleAlert', () => {
    const { container } = render(<StatusCallout variant="destructive" title="失敗" />);
    expect(iconOf(container).contains('lucide-circle-alert')).toBe(true);
  });

  it('neutral 與未指定 variant 時用 Info', () => {
    const a = render(<StatusCallout variant="neutral" title="說明" />);
    expect(iconOf(a.container).contains('lucide-info')).toBe(true);
    const b = render(<StatusCallout title="說明" />);
    expect(iconOf(b.container).contains('lucide-info')).toBe(true);
  });

  it('傳入非狀態圖示時覆寫預設', () => {
    const { container } = render(<StatusCallout variant="warning" icon={Shield} title="安全" />);
    const icon = iconOf(container);
    expect(icon.contains('lucide-shield')).toBe(true);
    expect(icon.contains('lucide-triangle-alert')).toBe(false);
  });

  it('圖示對輔助技術隱藏', () => {
    const { container } = render(<StatusCallout variant="success" title="完成" />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
