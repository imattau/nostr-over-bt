import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'window',
    process: { env: {} }
  },
  resolve: {
    alias: {
      // Ensure we use the browser-compatible version of webtorrent
      webtorrent: 'webtorrent/dist/webtorrent.min.js'
    }
  }
})
