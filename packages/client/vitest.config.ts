import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
export default defineConfig({
  optimizeDeps: {
    include: [
      '@awesome.me/webawesome/dist/components/button/button.js',
      '@awesome.me/webawesome/dist/components/spinner/spinner.js',
      '@awesome.me/webawesome/dist/components/icon/icon.js',
    ],
  },
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
  },
});
