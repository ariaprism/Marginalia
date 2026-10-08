import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // 固定本地书房用 Node 原生 test runner 单独验收；不要让 Vitest 二次收集。
    exclude: ['local-library/**', 'node_modules/**', 'dist/**'],
  },
})
