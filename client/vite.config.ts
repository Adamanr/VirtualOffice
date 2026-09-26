/// <reference types="vitest/config" />
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const phoenix = process.env.PHOENIX_URL ?? 'http://127.0.0.1:4000'
const livekit = process.env.LIVEKIT_URL ?? 'http://127.0.0.1:7880'
const browser = process.env.BROWSER_URL ?? 'http://127.0.0.1:4100'

// HTTPS is mandatory in dev too: getUserMedia/getDisplayMedia need a secure
// context once you open the page from another machine on the LAN.
// HTTP=1 disables it (http://localhost is still a secure context).
const https = process.env.HTTP !== '1'

export default defineConfig({
  plugins: [react(), ...(https ? [basicSsl()] : [])],
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) },
  },
  server: {
    host: true,
    port: 5173,
    fs: { allow: ['..'] },
    proxy: {
      '/api': { target: phoenix, changeOrigin: true },
      '/socket': { target: phoenix, ws: true, changeOrigin: true },
      // Shared headless browser for office computers (browser/ service).
      '/browser': { target: browser, ws: true, changeOrigin: true },
      // LiveKit signalling under the same origin: wss://<host>/lk/rtc -> livekit:7880/rtc
      '/lk': {
        target: livekit,
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/lk/, ''),
      },
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
})
