// @vitest-environment jsdom
//
// 任務中心的四顆徽章＝本輪進度（畫面稿，業主 2026-10-05；plan.md §4 第 13 點）：
// 取代進度條與舊的等級小標籤。亮度由 medalFills 換算（那邊有表格案例），這裡驗：
// 名稱與順序、亮度有沒有真的畫出來、不只靠顏色（文字也說）、漸層只用核准的 token。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MEDAL_GRADIENT_CLASS, TaskMedals } from './TaskMedals';

afterEach(cleanup);

const items = () => screen.getAllByRole('listitem');
const fills = () => items().map((li) => li.getAttribute('data-fill'));

describe('TaskMedals', () => {
  it('四顆徽章依序是見習推薦、推薦新星、推薦達人、推薦王', () => {
    render(<TaskMedals roundCount={0} target={8} />);
    const names = items().map((li) => li.querySelector('[data-testid="medal-name"]')?.textContent);
    expect(names).toEqual(['見習推薦', '推薦新星', '推薦達人', '推薦王']);
  });

  it('門檻 8、本輪 3 人：第 1 顆全亮、第 2 顆半亮、其餘暗', () => {
    render(<TaskMedals roundCount={3} target={8} />);
    expect(fills()).toEqual(['1', '0.5', '0', '0']);
  });

  it('本輪 8 人（滿一輪）：四顆全亮', () => {
    render(<TaskMedals roundCount={8} target={8} />);
    expect(fills()).toEqual(['1', '1', '1', '1']);
  });

  it('門檻不是 4 的倍數時仍是連續比例（門檻 5、本輪 2 人）', () => {
    render(<TaskMedals roundCount={2} target={5} />);
    expect(fills()).toEqual(['1', '0.5', '0', '0']);
  });

  it('亮度也寫成文字，不只靠顏色（WCAG 1.4.1）', () => {
    render(<TaskMedals roundCount={3} target={8} />);
    const state = (i: number) => items()[i].textContent;
    expect(state(0)).toContain('已點亮');
    expect(state(1)).toContain('亮一半');
    expect(state(2)).toContain('未點亮');
  });

  it('清單的可及名稱說出本輪進度', () => {
    render(<TaskMedals roundCount={3} target={8} />);
    expect(screen.getByRole('list', { name: '本輪進度 3 / 8' })).toBeTruthy();
  });

  it('亮的徽章填核准的品牌色漸層（§12.4 唯一核准的漸層），暗的沒有', () => {
    render(<TaskMedals roundCount={3} target={8} />);
    const face = (i: number) =>
      items()[i].querySelector('[data-testid="medal-face"]') as HTMLElement;
    expect(face(0).className).toContain(MEDAL_GRADIENT_CLASS);
    expect(face(1).className).toContain(MEDAL_GRADIENT_CLASS);
    expect(face(2).className).not.toContain(MEDAL_GRADIENT_CLASS);
  });

  it('半亮只填左半、全亮填滿', () => {
    render(<TaskMedals roundCount={3} target={8} />);
    const face = (i: number) =>
      items()[i].querySelector('[data-testid="medal-face"]') as HTMLElement;
    expect(face(0).className).toContain('bg-[length:100%_100%]');
    expect(face(1).className).toContain('bg-[length:50%_100%]');
  });

  it('徽章下只放名稱：沒有人數、等級小標籤與鼓勵文案', () => {
    render(<TaskMedals roundCount={3} target={8} />);
    const text = screen.getByRole('list').textContent ?? '';
    expect(text).not.toMatch(/\d+ 人|等級|恭喜|加油|再推薦/);
  });
});
