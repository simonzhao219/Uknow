// @vitest-environment jsdom
//
// 法遵文件的清單渲染契約。
//
// 事故：/referral-reward-rules 同一份文件裡出現兩種列點外觀——第五、六節是
// 「1. 內容」同一行，第四節卻是「1.」自己一行、內容掉到下一行。文件寫法沒問題，
// 壞在渲染層：markdown 的清單分「緊湊」與「鬆散」兩種，項目之間有空行、或項目
// 內含巢狀清單時，react-markdown 會把每個 <li> 的內容包進 <p>。<p> 是區塊元素，
// 配上原本的 list-inside（標記算在內容流裡）就把標記擠成獨立一行。
//
// 這裡守的是「兩種清單長得一樣」：鬆散清單的 <li> 仍然直接帶標記排版類別，
// 且那層 <p> 的下邊距被抵銷（間距一律交給清單的 space-y-1）。
//
// 為什麼用類別斷言而不是量座標：jsdom 不做版面計算，offsetTop 永遠是 0，
// 量不出「標記有沒有落單」。真正的視覺防線在 e2e 的 overflow sweep（真瀏覽器）；
// 這支釘的是「list-outside 是刻意選的，不是隨手寫的」——有人改回 list-inside
// 就會紅，並在這段註解裡讀到原因。
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { LegalMarkdown } from './LegalMarkdown';

// 鬆散清單：項目間有空行，且第 1 項含巢狀清單——正是推薦獎勵規則第四節的形狀。
const LOOSE_LIST = `1. 第一項，後面接巢狀清單：
   * 巢狀一
   * 巢狀二

2. 第二項
3. 第三項
`;

// 緊湊清單：項目之間沒有空行——推薦獎勵規則第五節的形狀。
const TIGHT_LIST = `1. 第一項
2. 第二項
`;

describe('LegalMarkdown', () => {
  it('鬆散與緊湊清單都用 list-outside，標記不會被擠成獨立一行', () => {
    const loose = render(<LegalMarkdown content={LOOSE_LIST} />);
    const tight = render(<LegalMarkdown content={TIGHT_LIST} />);

    // 有序與無序都要守：兩者的 <li> 都可能被包成 <p>，壞法一模一樣。
    // （巢狀的 * 項目會渲染成 <ul>，所以鬆散 fixture 同時涵蓋兩種清單。）
    for (const [name, view] of [
      ['鬆散', loose],
      ['緊湊', tight],
    ] as const) {
      const lists = [...view.container.querySelectorAll('ol, ul')];
      expect(lists.length, `${name}清單應渲染出清單元素`).toBeGreaterThan(0);
      for (const list of lists) {
        const tag = list.tagName.toLowerCase();
        expect(
          list.className,
          `${name}清單的 <${tag}> 不得用 list-inside——區塊內容會把標記擠成獨立一行`,
        ).not.toContain('list-inside');
        expect(list.className, `${name}清單的 <${tag}> 應用 list-outside`).toContain(
          'list-outside',
        );
      }
    }
  });

  it('鬆散清單那層 <p> 的下邊距被抵銷，項目間距與緊湊清單一致', () => {
    const { container } = render(<LegalMarkdown content={LOOSE_LIST} />);
    const ol = container.querySelector('ol');

    // 先確認這份輸入真的是鬆散的（<li> 內容被包成 <p>），否則本測試是空轉。
    expect(ol?.querySelector('li > p'), '這份 fixture 應產生鬆散清單').toBeTruthy();
    // 間距交給清單的 space-y-1，不是 <p> 自己的 mb-4。
    expect(ol?.className).toContain('[&>li>p]:mb-0');
    expect(ol?.className).toContain('space-y-1');
  });
});
