import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : './',
  root: path.resolve(__dirname, 'desktop'),
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'core/src'),
      '@android': path.resolve(__dirname, 'android/src'),
      '@ios': path.resolve(__dirname, 'ios/src')
    }
  },
  define: {
    'import.meta.env.VITE_MODEL_PORT': JSON.stringify(process.env.VITE_MODEL_PORT || '5005')
  }
}));
