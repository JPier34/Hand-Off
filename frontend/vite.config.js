import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import { fileURLToPath } from "url";
import path from "path";
var __dirname = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
    plugins: [react()],
    base: "/",
    // Expose these env var prefixes to client via import.meta.env
    // NOTE: UNISWAP_API_KEY is NOT here — it stays server-side (Netlify Function)
    envPrefix: ["VITE_", "DYNAMIC_", "CHAIN_", "MOCK", "REPUTATION_", "FACTORY_", "SUBNAME_", "UNIVERSAL_"],
    css: {
        postcss: {
            plugins: [tailwindcss, autoprefixer],
        },
    },
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
    build: {
        outDir: "dist",
        sourcemap: true,
        rollupOptions: {
            output: {
                manualChunks: function (id) {
                    if (id.includes('node_modules/react') || id.includes('react-router-dom'))
                        return 'vendor';
                    if (id.includes('wagmi') || id.includes('viem') || id.includes('@tanstack'))
                        return 'web3';
                    return undefined;
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
                rewrite: function (p) { return p.replace(/^\/api\/uniswap/, ''); },
                configure: function (proxy) {
                    proxy.on('proxyReq', function (proxyReq) {
                        var _a;
                        var key = (_a = process.env.UNISWAP_API_KEY) !== null && _a !== void 0 ? _a : '';
                        if (key)
                            proxyReq.setHeader('x-api-key', key);
                        proxyReq.setHeader('x-universal-router-version', '2.0');
                    });
                },
            },
        },
    },
});
