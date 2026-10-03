// S2b（D4）：與 button.test.tsx 同理——token 測試抓不到元件寫死白字。
import { describe, expect, it } from 'vitest';
import { badgeVariants } from './badge';

describe('badgeVariants', () => {
  it('destructive 用 destructive-foreground 配字，不寫死白字', () => {
    const cls = badgeVariants({ variant: 'destructive' });
    expect(cls).toContain('text-destructive-foreground');
    expect(cls).not.toContain('text-white');
  });

  it('destructive 深色模式不疊六成透明底', () => {
    expect(badgeVariants({ variant: 'destructive' })).not.toContain('dark:bg-destructive/60');
  });

  it('表單錯誤邊框用 destructive-border，不用 A 色 destructive', () => {
    const cls = badgeVariants({});
    expect(cls).toContain('aria-invalid:border-destructive-border');
    expect(cls).not.toMatch(/aria-invalid:border-destructive(?![\w-])/);
  });
});
