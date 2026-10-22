import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Khi dev, mọi request /api và /ws được chuyển tới ZenPanel Agent (mặc định cổng 2083)
const agent = process.env.ZENPANEL_AGENT ?? 'http://127.0.0.1:2083';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: agent, changeOrigin: true },
      '/ws': { target: agent.replace(/^http/, 'ws'), ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
