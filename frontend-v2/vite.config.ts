/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { careersSitemapPlugin } from './tooling/careersSitemap.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, '..')
  const env = loadEnv(mode, envDir, 'VITE_')

  return {
    envDir,

    plugins: [
      react(),
      tailwindcss(),
      careersSitemapPlugin({
        siteUrl: env.VITE_SITE_URL || 'http://localhost:5173',
        supabaseUrl: env.VITE_SUPABASE_URL || undefined,
        supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY || undefined,
      }),
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },

    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      // Fixed test-only Supabase config so `hasSupabaseConfig` is true and the
      // MSW handlers' base URL (`test/msw/handlers.ts`) matches what the app
      // actually calls — never real credentials, this project has no browser
      // mock in dev (only in tests, per ticket 05/gaps-and-recommendations).
      env: {
        VITE_SUPABASE_URL: 'https://test.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      },
    },
  }
})
