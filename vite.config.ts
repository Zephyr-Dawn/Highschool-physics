import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'EM Physics Lab｜高中电磁学交互实验室',
        short_name: 'EM Physics Lab',
        description: '平板优先的高中电磁学交互实验室：磁场运动、有限/多区域磁场、多级束线、线框进出磁场、分步讲解与原创练习。',
        lang: 'zh-CN',
        start_url: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f4f6f8',
        theme_color: '#14213d',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2,ttf}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  server: {
    port: 5173,
  },
});
