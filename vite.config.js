import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/proxy': {
        target: 'https://api.anychat.one/public/v1',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/proxy/, '')
      },
      '/api/storage': {
        target: 'https://api.anychat.one',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/storage/, '/storage')
      }
    }
  }
})
