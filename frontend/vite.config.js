import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In dev mode, proxy fight_log.json from the Python server on 8080
    proxy: {
      '/fight_log.json': 'http://localhost:8080',
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    // Output directly to static/ so python serve.py works unchanged
    outDir: resolve(__dirname, '../static'),
    emptyOutDir: false,   // preserve fight_log.json
    assetsDir: 'assets',
  },
})
