import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true, // bind 0.0.0.0 so the dev server is reachable from the host
    port: 5173,
    strictPort: true,
    proxy: {
      // Same-origin /api so the httpOnly auth cookie flows without CORS.
      "/api": process.env.VITE_API_PROXY || "http://api:8080",
    },
  },
})
