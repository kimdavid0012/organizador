import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'robots.txt'],
            manifest: {
                name: 'Organizador Moda CELAVIE',
                short_name: 'Organizador',
                description: 'Dashboard de gestión para CELAVIE',
                theme_color: '#1a1a2e',
                background_color: '#0f0f23',
                display: 'standalone',
                start_url: '/',
                icons: [
                    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
                    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
                ]
            },
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 4 MiB
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/firestore\.googleapis\.com/,
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: 'firebase-cache',
                            expiration: { maxEntries: 50, maxAgeSeconds: 86400 }
                        }
                    }
                ]
            }
        })
    ],
    server: {
        port: 3000,
        open: true
    }
})
