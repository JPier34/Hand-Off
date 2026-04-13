import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/',
  envPrefix: 'VITE_',
  css: {
    postcss: {
      plugins: [tailwindcss, autoprefixer],
    },
  },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/react') || id.includes('react-router-dom')) return 'vendor'
          if (id.includes('wagmi') || id.includes('viem') || id.includes('@tanstack')) return 'web3'
          return undefined
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api/uniswap': {
        target: 'https://trade-api.gateway.uniswap.org/v1',
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api\/uniswap/, ''),
        headers: process.env.UNISWAP_API_KEY
          ? {
              'x-api-key': process.env.UNISWAP_API_KEY,
              'x-universal-router-version': '2.0',
            }
          : {
              'x-universal-router-version': '2.0',
            },
      },
    },
  },
})
