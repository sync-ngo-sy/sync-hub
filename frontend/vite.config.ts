import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  envDir: path.resolve(__dirname, '..'),
  plugins: [react()],
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (id.includes('/@supabase/')) {
            return 'supabase';
          }

          if (id.includes('/@tanstack/')) {
            return 'query';
          }

          if (id.includes('/lucide-react/')) {
            return 'icons';
          }

          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router') || id.includes('/scheduler/')) {
            return 'react-vendor';
          }

          return 'vendor';
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['.trycloudflare.com', '.loca.lt']
  },
  preview: {
    port: 4173,
  },
});
