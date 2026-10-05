// S2b（D4）：globals.test.ts 只驗 token 的值，抓不到「元件把 token 用錯形狀」——
// 例如把 shadcn 預設的 `text-white` 貼回 destructive 變體：A 色改亮後白字對比
// 只剩 2.77:1，token 測試全綠、畫面卻讀不清。這裡釘住元件端的契約。
import { describe, expect, it } from 'vitest';
import { buttonVariants } from './button';

describe('buttonVariants', () => {
  it('destructive 用 destructive-foreground 配字，不寫死白字', () => {
    const cls = buttonVariants({ variant: 'destructive' });
    expect(cls).toContain('text-destructive-foreground');
    expect(cls).not.toContain('text-white');
  });

  it('destructive 深色模式不疊六成透明底（淺紅配黑字過不了對比）', () => {
    expect(buttonVariants({ variant: 'destructive' })).not.toContain('dark:bg-destructive/60');
  });

  it('brand 是 brand 實心底配 brand-foreground，hover 降透明度', () => {
    const cls = buttonVariants({ variant: 'brand' });
    expect(cls).toContain('bg-brand');
    expect(cls).toContain('text-brand-foreground');
    expect(cls).toContain('hover:bg-brand/90');
  });

  it('link 用強調色 brand 並常駐底線，不只靠顏色（1.4.1）', () => {
    const cls = buttonVariants({ variant: 'link' });
    expect(cls).toContain('text-brand');
    expect(cls).not.toContain('text-primary');
    expect(cls.split(' ')).toContain('underline');
  });

  it('焦點環全不透明，不用 /50（brand/50 對白底不到 3:1）', () => {
    const cls = buttonVariants({});
    expect(cls.split(' ')).toContain('focus-visible:ring-ring');
    expect(cls).not.toContain('ring-ring/50');
  });

  it('default 主按鈕維持 primary 黑', () => {
    expect(buttonVariants({}).split(' ')).toContain('bg-primary');
  });

  it('表單錯誤邊框用 destructive-border，不用 A 色 destructive', () => {
    const cls = buttonVariants({});
    expect(cls).toContain('aria-invalid:border-destructive-border');
    expect(cls).not.toMatch(/aria-invalid:border-destructive(?![\w-])/);
  });
});
