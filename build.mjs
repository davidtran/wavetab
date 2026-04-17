import { cp, mkdir, rm } from 'node:fs/promises';

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
  'content.css',
  'offscreen.html',
  'sandbox.html',
  'popup.html',
  'popup.css',
  'onboarding.html',
  'onboarding.css',
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
  staticFiles.map((file) => cp(file, `${DIST_DIR}/${file}`)),
);

await cp('icons', `${DIST_DIR}/icons`, { recursive: true });

console.log('Build complete -> dist/');
