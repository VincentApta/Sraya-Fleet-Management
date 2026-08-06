import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // bind 0.0.0.0 so the dev server is reachable from the host
    port: 5173,
    strictPort: true,
    proxy: {
      // Same-origin /api so the httpOnly auth cookie flows without CORS.
      "/api": "http://localhost:8080",
    },
  },
})
