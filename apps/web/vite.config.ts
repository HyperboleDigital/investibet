import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    manifest: { name: 'Investibet', short_name: 'Investibet', display: 'standalone', background_color: '#0E1220', theme_color: '#0E1220', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }] }
  })]
});
