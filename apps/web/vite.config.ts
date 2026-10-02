import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    manifest: { name: 'Investibet', short_name: 'Investibet', display: 'standalone', background_color: '#F2F3F7', theme_color: '#F2F3F7', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }] }
  })]
});
