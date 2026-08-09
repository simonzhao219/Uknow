// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hapticAlert, hapticSuccess } from './haptics';

/**
 * 讓 navigator.vibrate 依指定行為回應，並記下收到的樣式。
 *
 * jsdom 沒有 vibrate（那是行動裝置 API），所以三種情境都靠 defineProperty
 * 接管——與 MemberVerifyScanner.test.tsx 接管 mediaDevices 的手法一致。
 */
function stubVibrate(behavior: 'ok' | 'throws' | 'absent') {
  const calls: (number | number[])[] = [];
  if (behavior === 'absent') {
    Reflect.deleteProperty(navigator, 'vibrate');
    return calls;
  }
  Object.defineProperty(navigator, 'vibrate', {
    configurable: true,
    writable: true,
    value: vi.fn((pattern: number | number[]) => {
      calls.push(pattern);
      if (behavior === 'throws') throw new Error('vibrate blocked');
      return true;
    }),
  });
  return calls;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'vibrate');
  vi.clearAllMocks();
});

describe('haptics', () => {
  it('hapticSuccess 送出震動', () => {
    const calls = stubVibrate('ok');
    hapticSuccess();
    expect(calls).toHaveLength(1);
  });

  it('hapticAlert 送出的震動樣式與 hapticSuccess 可分辨', () => {
    // 這是本模組存在的理由：櫃檯人員舉著手機對客人的碼、眼睛不在螢幕上，
    // 觸覺是當下唯一能分辨「OK」與「有問題」的通道。兩者若震得一樣，
    // 這個功能就只剩「有掃到」而失去「結果如何」。
    const calls = stubVibrate('ok');
    hapticSuccess();
    hapticAlert();
    expect(calls).toHaveLength(2);
    expect(calls[0]).not.toEqual(calls[1]);
  });

  it('裝置沒有 vibrate 時靜默略過而不擲錯', () => {
    // iOS Safari 完全不支援 navigator.vibrate——那是常態，不是例外情境。
    stubVibrate('absent');
    expect(() => hapticSuccess()).not.toThrow();
    expect(() => hapticAlert()).not.toThrow();
  });

  it('vibrate 實作擲錯時吞掉而不冒到呼叫端', () => {
    // 部分瀏覽器在缺少使用者手勢的情境下會直接擲錯。驗證結果是主線功能，
    // 不能因為震動失敗而中斷。
    stubVibrate('throws');
    expect(() => hapticSuccess()).not.toThrow();
    expect(() => hapticAlert()).not.toThrow();
  });
});
