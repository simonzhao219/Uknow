// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { browseKeyDirection } from './browseKeys';

afterEach(() => {
  document.body.innerHTML = '';
});

const on = (el: Element | null, key: string, extra: object = {}) =>
  browseKeyDirection({ key, target: el, ...extra });

describe('browseKeyDirection', () => {
  it('← 是上一篇、→ 是下一篇', () => {
    expect(on(document.body, 'ArrowLeft')).toBe('prev');
    expect(on(document.body, 'ArrowRight')).toBe('next');
  });

  it('其他按鍵不處理', () => {
    expect(on(document.body, 'ArrowUp')).toBeNull();
    expect(on(document.body, 'Enter')).toBeNull();
  });

  it('帶修飾鍵（Ctrl、Cmd、Alt、Shift）時不處理，避開瀏覽器與輔助科技的快捷鍵', () => {
    for (const mod of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
      expect(on(document.body, 'ArrowRight', { [mod]: true })).toBeNull();
    }
  });

  it('事件已被別處 preventDefault 時不處理', () => {
    expect(on(document.body, 'ArrowRight', { defaultPrevented: true })).toBeNull();
  });

  it('焦點在輸入欄、文字區、下拉選單、可編輯區時不處理', () => {
    document.body.innerHTML =
      '<input id="i"><textarea id="t"></textarea><select id="s"></select><div id="c" contenteditable="true"></div>';
    for (const id of ['i', 't', 's', 'c']) {
      expect(on(document.getElementById(id), 'ArrowLeft')).toBeNull();
    }
  });

  it('焦點在輪播捲動容器內時不處理（← → 是換照片）', () => {
    document.body.innerHTML = '<div data-carousel-scroller tabindex="0"><span id="x"></span></div>';
    expect(on(document.getElementById('x'), 'ArrowRight')).toBeNull();
  });

  it('焦點在滑桿、分頁籤、選單等自帶方向鍵語意的元件時不處理', () => {
    document.body.innerHTML =
      '<div role="slider" id="a"></div><div role="tab" id="b"></div><div role="menu" id="c"></div><div role="radiogroup"><input id="d" type="radio"></div>';
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(on(document.getElementById(id), 'ArrowRight')).toBeNull();
    }
  });

  it('頁面上有開啟中的對話框時不處理', () => {
    document.body.innerHTML = '<div role="dialog"></div><button id="b">x</button>';
    expect(on(document.getElementById('b'), 'ArrowRight')).toBeNull();
    document.body.innerHTML = '<div aria-modal="true"></div><button id="b">x</button>';
    expect(on(document.getElementById('b'), 'ArrowRight')).toBeNull();
  });
});
