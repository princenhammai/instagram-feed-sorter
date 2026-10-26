import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    emptyOutDir: false,
    outDir: 'dist',
    rollupOptions: {
      input: resolve(__dirname, 'src/page/main-world.ts'),
      output: {
        format: 'iife',
        entryFileNames: 'main-world.js',
        inlineDynamicImports: true,
      },
    },
  },
})
