import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  define: {
    // amazon-cognito-identity-js가 Node.js 'global' 객체를 참조하므로 polyfill
    global: 'globalThis',
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'evscrap 사용자',
        short_name: 'evscrap',
        theme_color: '#1976d2',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});
