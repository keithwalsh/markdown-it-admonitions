import { defineConfig } from 'vite';
import { copyFileSync } from 'fs';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'MarkdownItAdmonitions',
      formats: ['es', 'cjs'],
      fileName: (format) => {
        if (format === 'es') return 'index.js';
        if (format === 'cjs') return 'index.cjs';
        return `index.${format}.js`;
      }
    },
    rollupOptions: {
      // Externalize peer dependencies
      external: ['markdown-it'],
      output: {
        exports: 'named',
        globals: {
          'markdown-it': 'MarkdownIt'
        }
      }
    }
  },
  plugins: [
    dts({
      include: ['src'],
      outDir: 'dist',
      // Bundle the declarations into one file, then copy it to index.d.cts
      // so CommonJS consumers get types that match the require() entry
      rollupTypes: true,
      afterBuild: () => {
        copyFileSync(resolve(__dirname, 'dist/index.d.ts'), resolve(__dirname, 'dist/index.d.cts'));
      }
    })
  ]
});

