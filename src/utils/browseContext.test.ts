import { describe, expect, it } from 'vitest';
import { getNeighbors, resolveBrowseContext } from './browseContext';

describe('getNeighbors', () => {
  const ids = ['a', 'b', 'c'];

  it('中間一篇有上一篇與下一篇', () => {
    expect(getNeighbors(ids, 'b')).toEqual({ index: 1, total: 3, prevId: 'a', nextId: 'c' });
  });

  it('第一篇沒有上一篇', () => {
    expect(getNeighbors(ids, 'a')).toEqual({ index: 0, total: 3, prevId: null, nextId: 'b' });
  });

  it('最後一篇沒有下一篇', () => {
    expect(getNeighbors(ids, 'c')).toEqual({ index: 2, total: 3, prevId: 'b', nextId: null });
  });

  it('只有一篇時兩邊都沒有', () => {
    expect(getNeighbors(['a'], 'a')).toEqual({ index: 0, total: 1, prevId: null, nextId: null });
  });

  it('目前這篇不在清單內時回 null', () => {
    expect(getNeighbors(ids, 'x')).toBeNull();
  });

  it('清單為空時回 null', () => {
    expect(getNeighbors([], 'a')).toBeNull();
  });
});

describe('resolveBrowseContext', () => {
  const frozen = { ids: ['a', 'b', 'c'], version: 'v1-1' };
  const state = { browseFrom: 'home', ctx: 'v1-1' };

  it('旗標、版本與目前這篇都吻合時回鄰篇', () => {
    expect(resolveBrowseContext(state, 'b', frozen)).toEqual({
      index: 1,
      total: 3,
      prevId: 'a',
      nextId: 'c',
    });
  });

  it('沒有 history state（直接開連結、重新整理）時回 null', () => {
    expect(resolveBrowseContext(null, 'b', frozen)).toBeNull();
    expect(resolveBrowseContext(undefined, 'b', frozen)).toBeNull();
  });

  it('旗標不是 home（從推薦網絡或後台進來）時回 null', () => {
    expect(resolveBrowseContext({ browseFrom: 'network', ctx: 'v1-1' }, 'b', frozen)).toBeNull();
  });

  it('ctx 與目前凍結的版本不同（Forward 回舊條目）時回 null', () => {
    expect(resolveBrowseContext({ browseFrom: 'home', ctx: 'v1-0' }, 'b', frozen)).toBeNull();
  });

  it('模組內沒有凍結脈絡（重新整理後）時回 null', () => {
    expect(resolveBrowseContext(state, 'b', null)).toBeNull();
  });

  it('目前這篇不在凍結清單內時回 null', () => {
    expect(resolveBrowseContext(state, 'x', frozen)).toBeNull();
  });

  it('沒有目前 id 時回 null', () => {
    expect(resolveBrowseContext(state, undefined, frozen)).toBeNull();
  });
});
