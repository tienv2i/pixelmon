import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    open: true,
    fs: {
      // Cho phép serve file từ packages/shared (data + assets)
      allow: ['../../packages/shared'],
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
  resolve: {
    alias: {
      '@pixelmon/shared': path.resolve(__dirname, '../../packages/shared'),
    },
  },
  assetsInclude: ['**/*.tmj'], // Treat .tmj như JSON asset
  optimizeDeps: {
    include: ['@pixelmon/shared'],
  },
  json: {
    namedExports: false, // TMJ là JSON object lớn, dùng default import
  },
  define: {
    __VITE_SERVER_URL__: JSON.stringify(process.env.VITE_SERVER_URL ?? 'ws://localhost:2567'),
  },
});
