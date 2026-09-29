import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@pixelmon/shared': resolve(__dirname, '../../packages/shared/src'),
    },
  },
  root: '.',
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:2567',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
