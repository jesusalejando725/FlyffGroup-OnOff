import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { build as bundleWorker } from 'esbuild';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { terrainTextures } from './tools/world/terrain-textures.mjs';
import { VitePWA } from 'vite-plugin-pwa';

// Use the same public build configuration in the window and background worker.
let workerEnv: Record<string, string> = {};

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    terrainTextures(),
    {
      name: 'bundle-admin-config',
      generateBundle() {
        for (const name of ['world-rules', 'monsters', 'items', 'item-options', 'npcs', 'classes-skills', 'live-world']) {
          const fileName = `ADMIN/${name}.json`;
          this.emitFile({ type: 'asset', fileName, source: readFileSync(new URL(fileName, import.meta.url)) });
        }
      },
    },
    {
      name: 'bundle-account-sync',
      apply: 'build',
      configResolved(config) { workerEnv = config.env; },
      async generateBundle() {
        const result = await bundleWorker({
          entryPoints: ['src/services/accountSyncWorker.ts'], bundle: true, format: 'iife',
          target: 'es2022', minify: true, write: false,
          define: { 'import.meta.env.VITE_BACKUP_URL': JSON.stringify(workerEnv.VITE_BACKUP_URL || ''),
            'import.meta.env.VITE_WORLD_SERVER_URL': JSON.stringify(workerEnv.VITE_WORLD_SERVER_URL || '') },
        });
        this.emitFile({type:'asset',fileName:'account-sync.js',source:result.outputFiles[0].contents});
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'icon.svg', 'ota-manifest.json'],
      workbox: {
        importScripts: ['./account-sync.js'],
        navigateFallbackDenylist: [/\.apk(?:\?|$)/i, /\/api\//],
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,webp,svg,json,wav,ogg,glb,f32,u8,wasm}'],
        manifestTransforms: [async entries => {
          const urls = [...new Map(entries.filter(e => e.url !== 'offline-files.json').map(e => [e.url, e])).values()];
          const index = JSON.stringify(urls.map(({ url, revision }) => [url, revision]));
          writeFileSync(new URL('./dist/offline-files.json', import.meta.url), index);
          return { manifest: [...urls, { url: 'offline-files.json', revision: createHash('sha256').update(index).digest('hex'), size: Buffer.byteLength(index) }], warnings: [] };
        }],
        globIgnores: ['assets/aistudio/**'],
        runtimeCaching: [
          {
            urlPattern: /\/mugroup\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mugroup-assets-cache',
              expiration: {
                maxEntries: 600,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: /\/ADMIN\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mugroup-admin-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
            },
          },
        ],
      },
      manifest: {
        name: "MuGro-up' · APK-WEB",
        short_name: "APK-WEB",
        description: "Juego Web3D MuGro-up' Offline-First con Babylon.js, Dexie IndexedDB y salas en red local.",
        theme_color: '#0c1018',
        background_color: '#0c1018',
        display: 'standalone',
        orientation: 'landscape',
        start_url: './',
        icons: [
          {
            src: './icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
          {
            src: './pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          { src: './pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: './pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  build: {
    chunkSizeWarningLimit: 5500,
  },
});
