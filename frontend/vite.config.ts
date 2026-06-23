import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',

  envDir: path.resolve(__dirname, '..'),

  plugins: [react()],

  esbuild: {
    target: 'esnext',
  },

  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },

  build: {
    target: 'esnext',

    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
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
    allowedHosts: [
      '.trycloudflare.com',
      '.loca.lt'
    ],
  },

  preview: {
    port: 4173,
  },
});