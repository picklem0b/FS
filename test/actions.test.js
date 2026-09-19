import test from 'node:test';
import assert from 'node:assert/strict';

import { BatchActions } from '../src/actions/batch.js';
import { CleanupInsights } from '../src/actions/cleanup.js';

/**
 * Build a recording file-operations stub.
 * @returns {{ ops: any, calls: any[] }} Stub and its call log.
 */
function makeFileOps() {
  const calls = [];
  const ops = {
    rename: async (item, newName) => { calls.push(['rename', item.name, newName]); },
    move: async (item, destination) => { calls.push(['move', item.name, destination]); },
    copy: async (item, destination) => { calls.push(['copy', item.name, destination]); },
    remove: async (item) => { calls.push(['remove', item.name]); },
  };
  return { ops, calls };
}

test('batch rename reports per-item outcomes', async () => {
  const { ops, calls } = makeFileOps();
  const batch = new BatchActions(ops);

  const result = await batch.rename(
    [{ name: 'a.txt' }, { name: 'b.txt' }],
    (item) => item.name.toUpperCase(),
  );

  assert.equal(result.successCount, 2);
  assert.equal(result.errorCount, 0);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ['rename', 'a.txt', 'A.TXT']);
});

test('batch rename refuses colliding target names', async () => {
  const { ops, calls } = makeFileOps();
  const batch = new BatchActions(ops);

  const result = await batch.rename(
    [{ name: 'a.txt' }, { name: 'b.txt' }],
    () => 'same.txt',
  );

  assert.equal(result.successCount, 0);
  assert.equal(result.errorCount, 2);
  assert.equal(calls.length, 0);
  assert.equal(result.results[0].reason, 'conflict');
});

test('batch rename skips unchanged and rejects invalid names', async () => {
  const { ops, calls } = makeFileOps();
  const batch = new BatchActions(ops);

  const result = await batch.rename(
    [{ name: 'keep.txt' }, { name: 'bad.txt' }],
    (item) => (item.name === 'keep.txt' ? item.name : 'nested/name.txt'),
  );

  assert.equal(result.skippedCount, 1);
  assert.equal(result.errorCount, 1);
  assert.equal(result.results[1].reason, 'invalid_name');
  assert.equal(calls.length, 0);
});

test('batch changeExtension rewrites only the extension', async () => {
  const { ops, calls } = makeFileOps();
  const batch = new BatchActions(ops);

  await batch.changeExtension([{ name: 'report.txt' }], 'md');
  assert.deepEqual(calls[0], ['rename', 'report.txt', 'report.md']);
});

test('name validation rejects unsafe names', () => {
  const batch = new BatchActions(makeFileOps().ops);

  assert.equal(batch._validateName('').ok, false);
  assert.equal(batch._validateName('a/b.txt').ok, false);
  assert.equal(batch._validateName('a:b.txt').ok, false);
  assert.equal(batch._validateName('CON').ok, false);
  assert.equal(batch._validateName('trailing.').ok, false);
  assert.equal(batch._validateName('trailing ').ok, false);
  assert.equal(batch._validateName('a'.repeat(256)).ok, false);
  assert.equal(batch._validateName('normal-name_1.md').ok, true);
});

test('naming patterns generate the expected names', () => {
  const batch = new BatchActions(makeFileOps().ops);

  const sequential = batch.createSequentialPattern('shot', 1);
  assert.equal(sequential(), 'shot_001');
  assert.equal(sequential(), 'shot_002');

  assert.equal(batch.createSuffixPattern('_backup')({ name: 'app.js' }), 'app_backup.js');
  assert.equal(batch.createPrefixPattern('old_')({ name: 'app.js' }), 'old_app.js');
});

test('cleanup summary builds an ordered extension breakdown', () => {
  const insights = new CleanupInsights([
    { name: 'a.tmp', isFile: true, size: 100, modified: 2000, kind: 'text' },
    { name: '.env', isFile: true, size: 10, kind: 'text' },
    { name: 'b.txt', isFile: true, size: 50, kind: 'text' },
    { name: 'c.txt', isFile: true, size: 20, kind: 'text' },
    { name: 'docs', isDirectory: true },
  ]);

  // Regression: this used to throw because .sort() was called on an object.
  const summary = insights.summary();

  assert.equal(typeof summary.byExtension, 'object');
  assert.equal(Array.isArray(summary.byExtension), false);
  assert.equal(Object.keys(summary.byExtension)[0], 'txt');
  assert.equal(summary.byExtension.txt, 2);
  assert.equal(summary.totalFiles, 4);
  assert.equal(summary.totalFolders, 1);
  assert.equal(summary.totalSize, 180);
});

test('cleanup candidates list temp and backup files but not dotfiles', () => {
  const insights = new CleanupInsights([
    { name: 'a.tmp', isFile: true, size: 100, kind: 'text' },
    { name: 'b.bak', isFile: true, size: 30, kind: 'text' },
    { name: '.env', isFile: true, size: 10, kind: 'text' },
    { name: 'keep.txt', isFile: true, size: 5, kind: 'text' },
  ]);

  const names = insights.allCandidates().map((entry) => entry.name).sort();
  assert.deepEqual(names, ['a.tmp', 'b.bak']);
});

test('cleanup search and filters narrow the listing', () => {
  const insights = new CleanupInsights([
    { name: 'photo.jpg', isFile: true, size: 900, kind: 'image', modified: 1000 },
    { name: 'notes.md', isFile: true, size: 20, kind: 'text', modified: 5000 },
  ]);

  assert.equal(insights.search('photo').length, 1);
  assert.equal(insights.filterByType('text').length, 1);
  assert.equal(insights.filterBySize({ min: 100 }).length, 1);
  assert.equal(insights.bySize(1)[0].name, 'photo.jpg');
});
