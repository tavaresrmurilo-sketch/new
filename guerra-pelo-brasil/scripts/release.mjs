// Copia o build em arquivo único para jogar/GuerraPeloBrasil.html
// (abre com duplo clique no Windows 11, sem servidor e sem instalar nada).
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(resolve(root, 'jogar'), { recursive: true });
const target = resolve(root, 'jogar/GuerraPeloBrasil.html');
copyFileSync(resolve(root, 'dist/index.html'), target);
console.log(`OK: ${target} (${(statSync(target).size / 1e6).toFixed(2)} MB)`);
