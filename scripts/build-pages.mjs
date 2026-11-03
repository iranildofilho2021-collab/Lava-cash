import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'dist');
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(path.join(root, 'site'), destination, { recursive: true });
await writeFile(path.join(destination, '.nojekyll'), '');
console.log('GitHub Pages: arquivos públicos preparados em dist/.');
