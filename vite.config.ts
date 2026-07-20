import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The backend runs on :8123 (uvicorn). Proxy /api there so the browser makes
// same-origin requests — no CORS, and SSE / file downloads just work in dev.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8123',
        changeOrigin: true,
      },
    },
  },
})
