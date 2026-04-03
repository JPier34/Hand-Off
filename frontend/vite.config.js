import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        proxy: {
            '/api/uniswap': {
                target: 'https://trade-api.gateway.uniswap.org/v1',
                changeOrigin: true,
                rewrite: function (p) { return p.replace(/^\/api\/uniswap/, ''); },
            },
        },
    },
});
