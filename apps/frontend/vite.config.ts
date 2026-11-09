import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const proxy = { '/graphql': { target: 'http://127.0.0.1:4000', changeOrigin: true } };

export default defineConfig({
    plugins: [react()],
    server: {
        host: '127.0.0.1',
        port: 5173,
        strictPort: true,
        proxy,
    },
    preview: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
    test: {
        environment: 'jsdom',
        setupFiles: ['./tests/setup.ts'],
        include: ['tests/**/*.{test,spec}.{ts,tsx}'],
        css: true,
    },
});
