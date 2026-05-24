import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: '0.0.0.0',
    port: 8787,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    process.env.ANALYZE && visualizer({ open: true, gzipSize: true, template: 'treemap' }),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@ost-builder/shared': path.resolve(__dirname, '../shared/dist'),
    },
  },
}));
