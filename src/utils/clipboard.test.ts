// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyToClipboard } from './clipboard';

/** 讓 document.execCommand 依指定行為回應，並回傳呼叫當下的 textarea 內容。 */
function stubExecCommand(behavior: 'ok' | 'refused' | 'throws') {
  const seen: { value: string | null } = { value: null };
  document.execCommand = vi.fn(() => {
    const active = document.activeElement as HTMLTextAreaElement | null;
    seen.value = active?.value ?? null;
    if (behavior === 'throws') throw new Error('execCommand unavailable');
    return behavior === 'ok';
  });
  return seen;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('copyToClipboard', () => {
  it('execCommand 回報複製完成時回傳 true', () => {
    stubExecCommand('ok');
    expect(copyToClipboard('UK1234')).toBe(true);
  });

  it('execCommand 擲錯時回傳 false 而不是讓例外冒出去', () => {
    stubExecCommand('throws');
    expect(copyToClipboard('UK1234')).toBe(false);
  });

  it('execCommand 回報拒絕時也回傳 false', () => {
    stubExecCommand('refused');
    expect(copyToClipboard('UK1234')).toBe(false);
  });

  it('把要複製的文字放進暫存 textarea', () => {
    const seen = stubExecCommand('ok');
    copyToClipboard('012-3456789');
    expect(seen.value).toBe('012-3456789');
  });

  it('複製完成後移除暫存 textarea,不留 DOM 殘渣', () => {
    stubExecCommand('ok');
    copyToClipboard('UK1234');
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  it('複製完把焦點還給原本的元素，鍵盤使用者不會掉到頁首', () => {
    stubExecCommand('ok');
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    copyToClipboard('UK1234');
    expect(document.activeElement).toBe(button);
  });

  it('暫存 textarea 唯讀且 16px：iOS 聚焦時不跳鍵盤、不放大整頁', () => {
    let seen: { readOnly: boolean; fontSize: string } | null = null;
    document.execCommand = vi.fn(() => {
      const active = document.activeElement as HTMLTextAreaElement;
      seen = { readOnly: active.readOnly, fontSize: active.style.fontSize };
      return true;
    });
    copyToClipboard('UK1234');
    expect(seen).toEqual({ readOnly: true, fontSize: '16px' });
  });

  it('execCommand 擲錯時仍移除暫存 textarea', () => {
    stubExecCommand('throws');
    copyToClipboard('UK1234');
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });
});
