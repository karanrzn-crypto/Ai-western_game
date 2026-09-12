import { mkdirSync, cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';

const outdir = 'site';
rmSync(outdir, { recursive: true, force: true });
mkdirSync(join(outdir, 'game'), { recursive: true });

const result = await build({
  entryPoints: ['game/playable-map.ts'],
  outdir: join(outdir, 'game'),
  bundle: true,
  splitting: false,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
  metafile: true,
  loader: { '.json': 'copy' },
});

cpSync('examples', join(outdir, 'examples'), { recursive: true });
cpSync('vercel.json', join(outdir, 'vercel.json'));

const html = readFileSync('index.html', 'utf8')
  .replace('./game/playable-map.ts', './game/playable-map.js');
writeFileSync(join(outdir, 'index.html'), html);
writeFileSync(join(outdir, 'build-meta.json'), JSON.stringify(result.metafile, null, 2));

if (!existsSync(join(outdir, 'index.html'))) throw new Error('build failed to emit index.html');
console.log(`Built runtime bundle in ${outdir}/`);
