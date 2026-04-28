import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-globe.gl')) return 'react-globe'
          if (id.includes('node_modules/three')) return 'three'
          if (id.includes('node_modules/maplibre-gl') || id.includes('node_modules/react-map-gl')) return 'maplibre'
          if (id.includes('node_modules/@supabase')) return 'supabase'
        },
      },
    },
  },
})
