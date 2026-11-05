// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BLOCK_SELECTOR } from './analyticsConfig';

describe('BLOCK_SELECTOR catch-all', () => {
  it('命中 tel、password、生日、信用卡自動填入與標記欄位，不誤擋一般輸入', () => {
    document.body.innerHTML = `
      <input id="a" type="tel">
      <input id="b" type="password">
      <input id="c" type="text" autocomplete="bday">
      <input id="d" type="text" autocomplete="cc-number">
      <input id="e" type="text" autocomplete="tel">
      <div id="f" data-sensitive></div>
      <div id="g" class="ph-no-capture"></div>
      <input id="plain" type="text" autocomplete="off">
      <input id="search" type="search">`;
    const hit = [...document.querySelectorAll(BLOCK_SELECTOR)].map((el) => el.id);
    expect(hit).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });
});
