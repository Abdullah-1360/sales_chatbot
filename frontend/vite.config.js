import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Allow external access
    allowedHosts: [
      'localhost',
      '.ngrok-free.dev', // Allow all ngrok hosts
      '.ngrok.io', // Allow legacy ngrok hosts
      'granularly-meticulous-sarahi.ngrok-free.dev', // Your specific ngrok host
    ],
    proxy: {
      // Proxy API calls to backend when in development
      '/api': {
        target: 'https://middleware.hostbreak.com',
        changeOrigin: true,
        secure: true
      },
      '/chats': {
        target: 'https://middleware.hostbreak.com',
        changeOrigin: true,
        secure: true
      },
      '/chat-notifications': {
        target: 'https://middleware.hostbreak.com',
        changeOrigin: true,
        secure: true
      }
    }
  },
})
