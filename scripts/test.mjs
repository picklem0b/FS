/**
 * Test runner.
 *
 * The plugin source is ESM and the package is CommonJS, so the tests are
 * bundled with esbuild first and then executed by Node. This keeps the plugin
 * bundle free of any test-only dependency.
 */

import { rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import * as esbuild from 'esbuild';

const OUT_DIR = '.test';
const OUT_FILE = `${OUT_DIR}/index.cjs`;

await rm(OUT_DIR, { recursive: true, force: true });

await esbuild.build({
  entryPoints: ['test/index.test.js'],
  outfile: OUT_FILE,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: ['node18'],
  logLevel: 'warning',
});

const result = spawnSync(process.execPath, [OUT_FILE], { stdio: 'inherit' });
process.exit(result.status ?? 1);
