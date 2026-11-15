import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import svgr from 'vite-plugin-svgr';

// API_TARGET lets a second dev server proxy to a server on another port,
// e.g. `API_TARGET=http://localhost:3200 npx vite --port 5180`.
const apiTarget = process.env.API_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
    svgr({
      // Enable both component and URL imports
      svgrOptions: {
        exportType: 'named',
        ref: true,
        svgo: false,
        titleProp: true,
      },
      include: '**/*.svg',
    }),
  ],
  server: {
    proxy: {
      '/api': apiTarget,
      '/mcp': apiTarget,
      '/ws': {
        target: apiTarget.replace(/^http/, 'ws'),
        ws: true,
      },
    },
  },
});
