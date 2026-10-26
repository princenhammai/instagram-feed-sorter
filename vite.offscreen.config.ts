import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: 'dist',
    rollupOptions: {
      input: resolve(__dirname, 'src/offscreen/offscreen.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'offscreen.js',
        inlineDynamicImports: true,
      },
    },
  },
})
