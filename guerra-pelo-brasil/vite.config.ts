import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

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

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r('./client'),
  base: './',
  envDir: r('.'),
  publicDir: r('./public'),
  resolve: { alias: { '@shared': r('./shared') } },
  plugins: [singleFile()],
  server: { port: 5173 },
  build: {
    outDir: r('./dist'),
    emptyOutDir: true,
    target: 'es2020',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
