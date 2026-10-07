// 「最後意圖勝出」的請求序號，與全 repo 唯一的整數戳。
//
// 整數戳的唯一性是後台快取 fence 的前提：請求送出與寫入失效都從同一條序列
// 取號，「請求戳 < fence」才等於「請求在失效之前送出」。兩個核心各自從 0 起算
// 的話，這個比較就失去意義，而且只有到真 hook 接上真 store 才會被發現——所以
// 第一條直接釘住「跨實例仍在同一條序列上」。
import { describe, expect, it } from 'vitest';
import { createLatestRequest, nextStamp } from './useLatestRequest';

describe('nextStamp', () => {
  it('兩個核心實例取到的戳記落在同一條單調遞增的序列上', () => {
    const a = createLatestRequest();
    const b = createLatestRequest();
    const stamps = [
      a.begin().stamp,
      b.begin().stamp,
      nextStamp(),
      a.begin().stamp,
      b.begin().stamp,
    ];
    for (let i = 1; i < stamps.length; i += 1) {
      expect(stamps[i]).toBeGreaterThan(stamps[i - 1]);
    }
  });
});

describe('createLatestRequest', () => {
  it('begin 之後先前的 ticket 不再是最新', () => {
    const requests = createLatestRequest();
    const first = requests.begin();
    const second = requests.begin();
    expect(requests.isLatest(first)).toBe(false);
    expect(requests.isLatest(second)).toBe(true);
  });

  it('peek 取到目前的 ticket，且不會作廢它', () => {
    const requests = createLatestRequest();
    requests.begin();
    const current = requests.begin();
    expect(requests.peek().seq).toBe(current.seq);
    expect(requests.isLatest(current)).toBe(true);
  });

  it('changedSince 只對 ticket 發出後被標記過的對象成立', () => {
    const requests = createLatestRequest();
    const forA = requests.begin('a');
    requests.markChanged('b');
    expect(requests.changedSince(forA)).toBe(false);
    requests.markChanged('a');
    expect(requests.changedSince(forA)).toBe(true);
    // 標記之後才發出的 ticket 從新的版本起算。
    expect(requests.changedSince(requests.begin('a'))).toBe(false);
  });

  it('沒有帶對象的 ticket 不受任何標記影響', () => {
    const requests = createLatestRequest();
    const plain = requests.begin();
    requests.markChanged('a');
    expect(requests.changedSince(plain)).toBe(false);
  });
});
