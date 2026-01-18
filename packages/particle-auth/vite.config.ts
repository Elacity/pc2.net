import { defineConfig, loadEnv } from 'vite';
import path from 'path';
import react from '@vitejs/plugin-react';
import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const particleWasmPlugin = {
  name: 'particle-wasm',
  apply: (_: unknown, env: { mode: string; }) => env.mode === 'development',
  buildStart: () => {
    const copiedPath = path.join(
      __dirname,
      'node_modules/@particle-network/thresh-sig/wasm/thresh_sig_wasm_bg.wasm'
    );
    const dir = path.join(__dirname, 'node_modules/.vite/wasm');
    const resultPath = path.join(dir, 'thresh_sig_wasm_bg.wasm');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    copyFileSync(copiedPath, resultPath);
  },
};

// https:vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    base: '/particle-auth/',
    plugins: [
      react(),
      nodePolyfills({
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
      }),
      // Only include particleWasmPlugin in development mode
      ...(env.NODE_ENV === 'development' ? [particleWasmPlugin] : [])
    ],
  };
});
