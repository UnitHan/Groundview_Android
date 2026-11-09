import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['core/src/**/*.test.{ts,tsx}', 'desktop/src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    globals: true
  },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'core/src')
    }
  }
});
