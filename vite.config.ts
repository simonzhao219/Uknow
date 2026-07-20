
  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react-swc';
  import tailwindcss from '@tailwindcss/vite';
  import path from 'path';

  export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
      alias: {
        'lucide-react@0.487.0': 'lucide-react',
        'input-otp@1.4.2': 'input-otp',
        'figma:asset/1f99716ab54515df4eecc150e3746c995a4a44b8.png': path.resolve(__dirname, './src/assets/1f99716ab54515df4eecc150e3746c995a4a44b8.png'),
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