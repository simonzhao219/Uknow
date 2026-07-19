import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Reuse the app's Vite config (react-swc plugin + path aliases) so tests
// transform TS/TSX exactly like the app does.
//
// Two projects:
//  - `node`: pure-function unit tests (the historical default). Fast, no DOM.
//  - `dom` : component/hook tests that need a DOM. Opt-in via the `*.dom.test.*`
//            filename suffix so pure-function tests never pay the jsdom cost.
//
// Both scope strictly to src/** so they never pick up the Deno suite under
// supabase/functions/**/*.test.ts (a different runtime entirely).
const shared = {
  exclude: ['node_modules', 'build', 'e2e', 'supabase'],
};

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'node',
            environment: 'node',
            include: ['src/**/*.test.{ts,tsx}'],
            exclude: ['**/*.dom.test.{ts,tsx}', ...shared.exclude],
          },
        },
        {
          extends: true,
          test: {
            name: 'dom',
            environment: 'jsdom',
            include: ['src/**/*.dom.test.{ts,tsx}'],
            setupFiles: ['./src/test/setup.dom.ts'],
            exclude: [...shared.exclude],
          },
        },
      ],
    },
  }),
);
