import { defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        target: 'node22',
        ssr: true,
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: { index: 'src/index.ts', manage: 'src/manage.ts' },
            output: {
                format: 'es',
                entryFileNames: '[name].js',
                // Keep shared setup chunks beside the entries so root asset URLs
                // resolve identically from src/ and dist/.
                chunkFileNames: '[name]-[hash].js',
            },
        },
    },
    test: {
        environment: 'node',
        include: ['src/**/*.{test,spec}.ts', 'tests/*.{test,spec}.ts'],
        testTimeout: 15000,
    },
});
