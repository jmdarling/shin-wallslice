import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': `http://localhost:${process.env.PORT ?? 3000}`,
    },
  },
  build: {
    target: 'es2023',
    sourcemap: true,
  },
});
