import { build } from 'esbuild';
import { chmod, copyFile } from 'node:fs/promises';
await build({ entryPoints: ['src/cli.mjs'], bundle: true, platform: 'node', target: 'node22', format: 'esm', outfile: 'dist/cli.mjs', legalComments: 'eof' });
await chmod('dist/cli.mjs', 0o755);
await copyFile('node_modules/croner/LICENSE', 'dist/CRONER-LICENSE');
