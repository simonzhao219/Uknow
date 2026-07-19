import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

// 證明 jsdom + testing-library 測試環境可運作（Phase 1 骨架）。
describe('jsdom 測試環境 smoke', () => {
  it('可渲染元件並以 role 查詢', () => {
    render(<button>hello</button>);
    expect(screen.getByRole('button', { name: 'hello' })).toBeInTheDocument();
  });
});
