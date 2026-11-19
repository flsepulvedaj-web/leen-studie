import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// El sitio se sirve desde https://<usuario>.github.io/leen-studie/
// Si cambias el nombre del repo, cambia esta constante.
const BASE = '/leen-studie/'

export default defineConfig(({ mode }) => {
  // `vite build --mode desktop` → interfaz para la app de escritorio (Electron):
  // rutas relativas y sin service worker (Electron no lo necesita ni lo soporta
  // sobre su protocolo propio).
  const desktop = mode === 'desktop'

  return {
    base: desktop ? './' : BASE,
    build: desktop ? { outDir: 'dist-desktop', emptyOutDir: true } : {},
    plugins: [
      react(),
      tailwindcss(),
      ...(desktop
        ? []
        : [
            VitePWA({
              registerType: 'autoUpdate',
              includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
              manifest: {
                name: 'LEEN STUDIE',
                short_name: 'LEEN STUDIE',
                description: 'Fichas de estudio con glosario a mano y ejercicios guiados.',
                theme_color: '#1c3f5f',
                background_color: '#f4f7f8',
                display: 'standalone',
                orientation: 'any',
                start_url: BASE,
                scope: BASE,
                icons: [
                  { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                  { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                  { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
              },
              workbox: {
                globPatterns: ['**/*.{js,css,html,woff,woff2,png,svg}'],
                // La generación de contenido siempre va a la red; nunca se cachea una respuesta de la API.
                navigateFallbackDenylist: [/^\/api/],
              },
            }),
          ]),
    ],
  }
})
