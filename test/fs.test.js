import test from 'node:test';
import assert from 'node:assert/strict';

import { FolderAccess } from '../src/fs/access.js';
import { FolderScanner } from '../src/fs/scanner.js';
import { createMemorySource } from '../src/fs/source.js';
import { FileReader } from '../src/fs/fileReader.js';
import { PreviewService } from '../src/fs/previews.js';

/**
 * A small fixture tree.
 * @returns {any[]} Entries.
 */
function fixture() {
  return [
    { url: '/root', name: 'root', isDirectory: true },
    { url: '/root/a.txt', name: 'a.txt', size: 10, content: 'hello', modified: 2000 },
    { url: '/root/photo.png', name: 'photo.png', size: 2048, modified: 3000 },
    { url: '/root/notes.bak', name: 'notes.bak', size: 64, modified: 1000 },
    { url: '/root/sub', name: 'sub', isDirectory: true },
    { url: '/root/sub/nested.txt', name: 'nested.txt', size: 5, content: 'deep' },
  ];
}

test('FolderAccess lists only direct children and classifies them', async () => {
  const access = new FolderAccess(createMemorySource(fixture()));
  const entries = await access.scan('/root');

  const names = entries.map((entry) => entry.name).sort();
  assert.deepEqual(names, ['a.txt', 'notes.bak', 'photo.png', 'sub']);

  const byName = Object.fromEntries(entries.map((entry) => [entry.name, entry]));
  assert.equal(byName['a.txt'].kind, 'text');
  assert.equal(byName['photo.png'].kind, 'image');
  assert.equal(byName['sub'].kind, 'folder');
  assert.equal(byName['sub'].isDirectory, true);
});

test('FolderAccess caches listings until invalidated', async () => {
  const source = createMemorySource(fixture());
  let calls = 0;
  const spied = {
    ...source,
    list: (url, options) => {
      calls++;
      return source.list(url, options);
    },
  };

  const access = new FolderAccess(spied);
  await access.scan('/root');
  await access.scan('/root');
  assert.equal(calls, 1);

  access.invalidate('/root');
  await access.scan('/root');
  assert.equal(calls, 2);
});

test('FolderAccess coalesces concurrent scans of the same folder', async () => {
  const source = createMemorySource(fixture());
  let calls = 0;
  const slow = {
    ...source,
    list: async (url, options) => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return source.list(url, options);
    },
  };

  const access = new FolderAccess(slow);
  const [first, second] = await Promise.all([access.scan('/root'), access.scan('/root')]);

  assert.equal(calls, 1);
  assert.equal(first.length, second.length);
});

test('scanner walks subfolders only when asked', async () => {
  const access = new FolderAccess(createMemorySource(fixture()));
  const scanner = new FolderScanner(access, { maxFiles: 100, maxDepth: 3 });

  const flat = await scanner.getFiles('/root');
  assert.equal(flat.some((entry) => entry.name === 'nested.txt'), false);

  const recursive = await scanner.getFiles('/root', { recursive: true });
  assert.equal(recursive.some((entry) => entry.name === 'nested.txt'), true);
});

test('scanner enforces the entry cap and ignore patterns', async () => {
  const access = new FolderAccess(createMemorySource(fixture()));
  const scanner = new FolderScanner(access, { maxFiles: 2, maxDepth: 2 });
  const limited = await scanner.getFiles('/root');
  assert.equal(limited.length, 2);

  const filtering = new FolderScanner(access, { ignoreList: ['*.bak'], maxFiles: 100 });
  const filtered = await filtering.getFiles('/root');
  assert.equal(filtered.some((entry) => entry.name === 'notes.bak'), false);
});

test('scanner exposes files, folders, and cleanup candidates separately', async () => {
  const access = new FolderAccess(createMemorySource(fixture()));
  const scanner = new FolderScanner(access, { maxFiles: 100 });

  const files = await scanner.getFilesOnly('/root');
  assert.equal(files.every((entry) => entry.isFile), true);

  const folders = await scanner.getFoldersOnly('/root');
  assert.deepEqual(folders.map((entry) => entry.name), ['sub']);

  const candidates = await scanner.getCleanupCandidates('/root');
  assert.deepEqual(candidates.map((entry) => entry.name), ['notes.bak']);
});

test('previews read text and respect the size limit', async () => {
  const source = createMemorySource(fixture());
  const preview = new PreviewService(new FileReader(source));

  const entry = {
    name: 'a.txt',
    url: '/root/a.txt',
    size: 10,
    isFile: true,
    kind: 'text',
  };

  const result = await preview.readText(entry);
  assert.equal(result.ok, true);
  assert.equal(result.text, 'hello');

  const limited = await preview.readText(entry, { maxSize: 1 });
  assert.equal(limited.ok, false);
  assert.equal(limited.reason, 'too_large');
});

test('previews report a missing url instead of throwing', async () => {
  const preview = new PreviewService(new FileReader(createMemorySource(fixture())));
  const result = await preview.readImage({ name: 'photo.png', isFile: true, kind: 'image' });
  assert.equal(result.ok, false);
});
