import { mkdirSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const localEsbuild = join(__dirname, '..', 'tools', 'esbuild.exe');

async function loadEsbuild() {
  try {
    return await import('esbuild');
  } catch {
    if (!existsSync(localEsbuild)) {
      throw new Error(
        'esbuild not found. Run: npm install OR download tools/esbuild.exe (see SETUP.md)',
      );
    }
    return null;
  }
}

function runLocalEsbuild(watch) {
  const args = [
    'src/main.ts',
    '--bundle',
    '--outfile=js/app.bundle.js',
    '--format=iife',
    '--target=chrome79',
    '--sourcemap',
    watch ? '--watch' : '',
  ].filter(Boolean);
  const result = spawnSync(localEsbuild, args, {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

mkdirSync('js', { recursive: true });

const watch = process.argv.includes('--watch');
const esbuildMod = await loadEsbuild();

if (!esbuildMod) {
  runLocalEsbuild(watch);
  if (!watch) {
    console.log('Built js/app.bundle.js (local esbuild.exe)');
  }
  process.exit(0);
}

const esbuild = esbuildMod.default ?? esbuildMod;

const ctx = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'js/app.bundle.js',
  format: 'iife',
  target: ['chrome79'],
  sourcemap: true,
  logLevel: 'info',
});

if (watch) {
  await ctx.watch();
  console.log('Watching src/...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('Built js/app.bundle.js');
}
