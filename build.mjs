import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import * as esbuild from 'esbuild';

const DIST_DIR = 'dist';
const entryPoints = [
  { entryPoints: ['src/background.ts'], outfile: 'dist/background.js' },
  { entryPoints: ['src/content.ts'], outfile: 'dist/content.js' },
  { entryPoints: ['src/offscreen.ts'], outfile: 'dist/offscreen.js' },
  { entryPoints: ['src/popup.ts'], outfile: 'dist/popup.js' },
  { entryPoints: ['src/sandbox.ts'], outfile: 'dist/sandbox.js' },
];
const staticFiles = [
  'manifest.json',
  'src/static/content.css',
  'src/static/offscreen.html',
  'src/static/sandbox.html',
  'src/static/popup.html',
  'src/static/popup.css',
  'src/static/onboarding.html',
  'src/static/onboarding.css',
];

await rm(DIST_DIR, { recursive: true, force: true });
await mkdir(DIST_DIR, { recursive: true });

await Promise.all(
  entryPoints.map((build) =>
    esbuild.build({
      ...build,
      bundle: true,
      format: 'iife',
      target: 'chrome120',
      minify: false,
      sourcemap: false,
      logLevel: 'info',
    }),
  ),
);

await Promise.all(
  staticFiles.map((file) => cp(file, `${DIST_DIR}/${path.basename(file)}`)),
);

await cp('icons', `${DIST_DIR}/icons`, { recursive: true });

console.log('Build complete -> dist/');
