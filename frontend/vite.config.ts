import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const BACKEND_PORT = process.env.VITE_BACKEND_PORT || '4890';
const FRONTEND_PORT = Number(process.env.PORT || '4891');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@auspex/shared': '../shared/src/index.ts',
    },
  },
  server: {
    port: FRONTEND_PORT,
    strictPort: true, // Fail if port is occupied rather than silently picking random port
    proxy: {
      '/api': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://localhost:${BACKEND_PORT}`,
        ws: true,
      },
    },
  },
});
