import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'css', 'js', 'images', 'fonts', '2023', 'archives', 'tags', 'lib']) {
  await cp(path.join(root, name), path.join(output, name), { recursive: true });
}
console.log('Static website built successfully in dist/.');
