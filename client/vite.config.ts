import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  define: {
    // Provide polyfill for packages (like @weave-design) referencing process.env directly
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    'process.env': {},
  },
  server: {
    port: 1420,
    strictPort: true,
    host: true, // Listens on all local addresses (localhost, 127.0.0.1, ::1)
  },
  envPrefix: ['VITE_', 'TAURI_'],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/__tests__/**', 'src/main.tsx', 'src/types/**', '**/*.d.ts'],
    },
  },
});

