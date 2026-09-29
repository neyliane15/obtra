/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react(), tailwind()],
  root: 'web',
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: { '@': fileURLToPath(new URL('./web/src', import.meta.url)) },
  },
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 1200 },
  test: {
    environment: 'node',
    include: ['web/src/**/*.test.ts', 'web/src/**/*.test.tsx'],
    root: '.',
  },
})
