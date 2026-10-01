import { defineConfig, searchForWorkspaceRoot } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:2567',
        changeOrigin: true,
      },
      '/assets': {
        target: 'http://localhost:2567',
        changeOrigin: true,
      },
      '/sprites': {
        target: 'http://localhost:2567',
        changeOrigin: true,
      },
    },
    fs: {
      // Cho phép serve file từ packages/shared (data + assets).
      // LƯU Ý: khai báo `allow` sẽ GHI ĐÈ danh sách mặc định của Vite (vốn cho
      // phép workspace root + project root). Thiếu workspace root ở đây sẽ khiến
      // chính apps/client/index.html trả 403. Vì vậy phải liệt kê đầy đủ.
      allow: [searchForWorkspaceRoot(process.cwd()), '../../packages/shared'],
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
