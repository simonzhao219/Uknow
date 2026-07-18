import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Reuse the app's Vite config (react-swc plugin + path aliases) so unit tests
// transform TS/TSX exactly like the app does. Tests are pure-function only, so
// the default `node` environment is enough — no jsdom / testing-library.
//
// Scope strictly to src/** so this never picks up the Deno test suite under
// supabase/functions/**/*.test.ts (a different runtime entirely).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['src/**/*.test.{ts,tsx}'],
      exclude: ['node_modules', 'build', 'e2e', 'supabase'],
    },
  }),
);
