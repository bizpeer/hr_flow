import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // GitHub Pages, Firebase 등 다양한 환경에서의 하위 디렉토리 호환성을 위해 base를 './'로 설정
  base: './',
})
