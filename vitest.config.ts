import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true
  },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'core/src')
    }
  }
});
