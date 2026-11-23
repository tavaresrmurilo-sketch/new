import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

/**
 * Embute o JS e o CSS gerados dentro do index.html.
 * Resultado: dist/index.html é um arquivo único que abre com duplo clique
 * no Windows 11 (file://), sem servidor.
 */
function singleFile(): Plugin {
  return {
    name: 'gpb-single-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      const htmlKey = Object.keys(bundle).find((k) => k.endsWith('.html'));
      if (!htmlKey) return;
      const html = bundle[htmlKey];
      if (html.type !== 'asset') return;
      let source = String(html.source);
      for (const [key, item] of Object.entries(bundle)) {
        if (item.type === 'chunk' && item.isEntry) {
          const code = item.code.replace(/<\/script/gi, '<\\/script');
          const re = new RegExp(`<script[^>]*src="[^"]*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*></script>`);
          source = source.replace(re, () => `<script type="module">${code}</script>`);
          delete bundle[key];
        } else if (item.type === 'asset' && key.endsWith('.css')) {
          const re = new RegExp(`<link[^>]*href="[^"]*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`);
          source = source.replace(re, () => `<style>${String(item.source)}</style>`);
          delete bundle[key];
        }
      }
      html.source = source;
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [singleFile()],
  build: {
    target: 'es2020',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 180_000,
  },
});
