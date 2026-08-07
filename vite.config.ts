import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

import { resolveSupabaseTarget } from './config/supabaseTarget';

// 分支感知的 Supabase 目標：只有 main 打正式站，其餘分支（develop 與各種
// 預覽）指向 develop 的分支 DB。規則、理由與覆蓋順序見 config/supabaseTarget.ts；
// 這裡只負責把結果餵給 Vite 的 env（projectConfig.ts 讀 VITE_SUPABASE_*）。
const supabaseTarget = resolveSupabaseTarget(process.env);
if (supabaseTarget) {
  process.env.VITE_SUPABASE_PROJECT_ID = supabaseTarget.projectId;
  process.env.VITE_SUPABASE_ANON_KEY = supabaseTarget.anonKey;
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    alias: {
      'lucide-react@0.487.0': 'lucide-react',
      'input-otp@1.4.2': 'input-otp',
      'figma:asset/1f99716ab54515df4eecc150e3746c995a4a44b8.png': path.resolve(
        __dirname,
        './src/assets/1f99716ab54515df4eecc150e3746c995a4a44b8.png',
      ),
      'class-variance-authority@0.7.1': 'class-variance-authority',
      '@supabase/supabase-js@2': '@supabase/supabase-js',
      '@radix-ui/react-tabs@1.1.3': '@radix-ui/react-tabs',
      '@radix-ui/react-slot@1.1.2': '@radix-ui/react-slot',
      '@radix-ui/react-select@2.1.6': '@radix-ui/react-select',
      '@radix-ui/react-radio-group@1.2.3': '@radix-ui/react-radio-group',
      '@radix-ui/react-label@2.1.2': '@radix-ui/react-label',
      '@radix-ui/react-dropdown-menu@2.1.6': '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-dialog@1.1.6': '@radix-ui/react-dialog',
      '@radix-ui/react-collapsible@1.1.3': '@radix-ui/react-collapsible',
      '@radix-ui/react-checkbox@1.1.4': '@radix-ui/react-checkbox',
      '@radix-ui/react-avatar@1.1.3': '@radix-ui/react-avatar',
      '@radix-ui/react-alert-dialog@1.1.6': '@radix-ui/react-alert-dialog',
      '@': path.resolve(__dirname, './src'),
      // 契約 SSOT：前後端共用同一份 API 型別定義（見
      // supabase/functions/_shared/api-contract.ts 檔頭說明）。
      '@contract': path.resolve(__dirname, './supabase/functions/_shared/api-contract.ts'),
      // 姓名格式規則的共用案例表。與 @contract 同理:檔案物理放在 Deno 側,
      // 前端經 alias 讀入——反過來(放 src/、Deno 用 ../../../ 爬進來)會打破
      // 「Deno 只依賴 supabase/functions/**」的邊界。
      '@name-cases': path.resolve(
        __dirname,
        './supabase/functions/_shared/name-validation-cases.ts',
      ),
      // 補繳計畫的共用案例表。同上:物理放 Deno 側,前端經 alias 讀入。
      '@backfill-cases': path.resolve(__dirname, './supabase/functions/_shared/backfill-cases.ts'),
    },
  },
  build: {
    target: 'esnext',
    outDir: 'build',
  },
  // Strip debug logging from production bundles only.
  // console.error / console.warn are kept so real problems still surface.
  // Dev builds are not minified, so all logs remain available locally.
  esbuild: {
    pure: ['console.log', 'console.info', 'console.debug'],
  },
  server: {
    port: 3000,
    open: true,
  },
});
