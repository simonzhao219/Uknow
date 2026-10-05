// globals.test.ts 只驗 token 的值，抓不到「元件把 token 用錯形狀」——例如把 shadcn 預設的
// `text-white` 貼回 destructive 變體、或把引導鈕的品牌色疊在黑底上。這裡釘住元件端的契約：
// S2b（D4）的 foreground 規則，加上 S2e（D6）的按鈕三分法（tone × container）。
// 比對 class 一律拆成 token 再比：`toContain` 比整串時，`bg-brand` 也會吃到
// `hover:bg-brand-subtle` 這類較長的 class，誤判通過。
import { describe, expect, it } from 'vitest';
import { buttonVariants } from './button';

const classesOf = (cls: string) => cls.split(/\s+/);

describe('buttonVariants', () => {
  it('不給 tone 時是流程主要動作：primary 墨黑實心', () => {
    const cls = classesOf(buttonVariants({}));
    expect(cls).toContain('bg-primary');
    expect(cls).toContain('text-primary-foreground');
  });

  it('guide 是品牌色實心，字串裡不殘留 primary 黑底', () => {
    const cls = classesOf(buttonVariants({ tone: 'guide' }));
    expect(cls).toContain('bg-brand');
    expect(cls).toContain('text-brand-foreground');
    expect(cls).toContain('hover:bg-brand/90');
    expect(cls).not.toContain('bg-primary');
  });

  it('secondary 是白底框線墨字', () => {
    const secondary = classesOf(buttonVariants({ tone: 'secondary' }));
    expect(secondary).toEqual(expect.arrayContaining(['border', 'bg-card', 'text-foreground']));
    expect(secondary).not.toContain('bg-primary');
  });

  // #354 二次審查裁決 #11：全站 outline 搬到 tone="secondary" 後移除 outline variant——
  // 主次只有 tone 一種寫法，不留兩條路畫同一個外觀。
  it('outline variant 已移除，主次只能用 tone 表達', () => {
    // @ts-expect-error outline 不再是合法的 variant
    const cls = classesOf(buttonVariants({ variant: 'outline' }));
    expect(cls).not.toContain('bg-card');
  });

  it('destructive tone 是紅框字，不是紅實心', () => {
    const cls = classesOf(buttonVariants({ tone: 'destructive' }));
    expect(cls).toContain('border-destructive-border');
    expect(cls).toContain('text-destructive-subtle-foreground');
    expect(cls).not.toContain('bg-destructive');
    expect(cls).not.toContain('bg-primary');
  });

  it('有色容器裡的引導鈕取容器的實心色，不用品牌色', () => {
    const cls = classesOf(buttonVariants({ tone: 'guide', container: 'warning' }));
    expect(cls).toEqual(expect.arrayContaining(['bg-warning', 'text-warning-foreground']));
    expect(cls).not.toContain('bg-brand');
  });

  it('有色容器裡的次要鈕取容器的框線與深字', () => {
    const cls = classesOf(buttonVariants({ tone: 'secondary', container: 'success' }));
    expect(cls).toEqual(
      expect.arrayContaining(['bg-card', 'border-success-border', 'text-success-subtle-foreground']),
    );
    expect(cls).not.toContain('text-foreground');
  });

  it('重點淡底裡的次要鈕用品牌色框與淡底深字', () => {
    const cls = classesOf(buttonVariants({ tone: 'secondary', container: 'brand' }));
    expect(cls).toEqual(expect.arrayContaining(['border-brand', 'text-brand-subtle-foreground']));
  });

  it('tone 只作用在 default 形狀，ghost 不會被塗上實心底', () => {
    expect(classesOf(buttonVariants({ variant: 'ghost', tone: 'guide' }))).not.toContain('bg-brand');
  });

  it('variant destructive 紅實心配 destructive-foreground，不寫死白字', () => {
    const cls = classesOf(buttonVariants({ variant: 'destructive' }));
    expect(cls).toContain('bg-destructive');
    expect(cls).toContain('text-destructive-foreground');
    expect(cls).not.toContain('text-white');
    expect(cls).not.toContain('dark:bg-destructive/60');
  });

  it('link 是墨色常駐底線，不再用品牌色（顏色與內文相同，靠底線區分）', () => {
    const cls = classesOf(buttonVariants({ variant: 'link' }));
    expect(cls).toContain('text-primary');
    expect(cls).toContain('underline');
    expect(cls).not.toContain('text-brand');
  });

  it('焦點只有鍵盤焦點環：3px ring-ring，不另改框線色', () => {
    const cls = classesOf(buttonVariants({}));
    expect(cls).toContain('focus-visible:ring-ring');
    expect(cls).toContain('focus-visible:ring-[3px]');
    expect(cls).not.toContain('focus-visible:border-ring');
  });

  it('破壞性鈕的焦點環不再換成兩成透明的紅，與全站同一個灰環', () => {
    expect(classesOf(buttonVariants({ variant: 'destructive' }))).not.toContain(
      'focus-visible:ring-destructive/20',
    );
  });

  it('表單錯誤邊框用 destructive-border，不用 A 色 destructive', () => {
    const cls = buttonVariants({});
    expect(cls).toContain('aria-invalid:border-destructive-border');
    expect(cls).not.toMatch(/aria-invalid:border-destructive(?![\w-])/);
  });

  it('錯誤態聚焦環用全不透明的 destructive-border，不留兩成透明的紅', () => {
    const cls = classesOf(buttonVariants({}));
    expect(cls).toContain('aria-invalid:ring-destructive-border');
    expect(cls.filter((c) => /destructive\/\d/.test(c))).toEqual([]);
  });

  // #354 二次審查 #16：compoundVariants 每一列都釘住——token 名打錯不會報錯，只會畫不出來。
  it.each([
    ['flow', 'neutral', ['bg-primary', 'text-primary-foreground']],
    ['flow', 'brand', ['bg-brand', 'text-brand-foreground']],
    ['flow', 'warning', ['bg-warning', 'text-warning-foreground']],
    ['flow', 'success', ['bg-success', 'text-success-foreground']],
    ['flow', 'destructive', ['bg-destructive', 'text-destructive-foreground']],
    ['guide', 'neutral', ['bg-brand', 'text-brand-foreground']],
    ['guide', 'brand', ['bg-brand', 'text-brand-foreground']],
    ['guide', 'warning', ['bg-warning', 'text-warning-foreground']],
    ['guide', 'success', ['bg-success', 'text-success-foreground']],
    ['guide', 'destructive', ['bg-destructive', 'text-destructive-foreground']],
    ['secondary', 'neutral', ['bg-card', 'text-foreground']],
    ['secondary', 'brand', ['bg-card', 'border-brand', 'text-brand-subtle-foreground']],
    ['secondary', 'warning', ['bg-card', 'border-warning-border', 'text-warning-subtle-foreground']],
    ['secondary', 'success', ['bg-card', 'border-success-border', 'text-success-subtle-foreground']],
    ['secondary', 'destructive', ['bg-card', 'border-destructive-border', 'text-destructive-subtle-foreground']],
    ['destructive', 'neutral', ['bg-card', 'border-destructive-border', 'text-destructive-subtle-foreground']],
    ['destructive', 'warning', ['bg-card', 'border-destructive-border', 'text-destructive-subtle-foreground']],
  ] as const)('tone %s 放在 %s 容器時畫出預期的底色與字色', (tone, container, expected) => {
    const cls = classesOf(buttonVariants({ tone, container }));
    for (const c of expected) {
      expect(cls, c).toContain(c);
    }
    if (!(tone === 'flow' && container === 'neutral')) {
      expect(cls).not.toContain('bg-primary');
    }
  });
});
