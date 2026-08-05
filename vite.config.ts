import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages 项目站点发布在 /Marginalia/；本地开发仍保持根路径。
  base: command === 'build' ? '/Marginalia/' : '/',
  plugins: [react()],
}))
