import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Relative asset paths, so the build works from a domain root or a project
  // subpath (GitHub Pages) without being rebuilt for each.
  base: './',
  plugins: [react(), tailwindcss()],
})
