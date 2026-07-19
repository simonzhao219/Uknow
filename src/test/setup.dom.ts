// jsdom 測試環境的全域 setup：載入 jest-dom 的 matcher（toBeInTheDocument 等），
// 並在每個測試後自動清理 render 出來的 DOM。
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
