import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  optimizeDeps: {
    exclude: ['@react-three/rapier'],
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          'three':    ['three'],
          'r3f':      ['@react-three/fiber', '@react-three/drei'],
          'rapier':   ['@react-three/rapier'],
          'react':    ['react', 'react-dom'],
        },
      },
    },
  },
})
