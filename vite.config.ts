import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Cube Game',
        short_name: 'Cube',
        description: 'Destroy the cube. Orbit. Fire. Ascend.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'landscape',
        start_url: './',
        scope: './',
        icons: [
          {
            src: 'icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Music streams from disk; do not precache multi‑MB OGGs in the SW.
        globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2}'],
        globIgnores: ['**/audio/**', '**/music/**'],
        navigateFallback: 'index.html',
        // Allow large non-music assets if needed without failing the build
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
});
