import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeTree, breakdownForChildren } from '../src/actions/analyze.js';
import { findDuplicateContents, fingerprintBytes } from '../src/actions/duplicates.js';
import { createZip, Crc32, toDosDateTime } from '../src/actions/zip.js';
import { exportFolderAsZip as createZipExport } from '../src/actions/exportFolder.js';
import {
  deepSearch,
  buildMatcher,
  matchContentLines,
  contentCandidates,
  isTextualName,
} from '../src/actions/deepSearch.js';
import {
  captureSnapshot,
  serializeSnapshot,
  parseSnapshot,
  compareSnapshots,
  formatDiffReport,
} from '../src/actions/snapshots.js';
import { WatchService, clampInterval } from '../src/actions/watch.js';
import { Places, MAX_PINNED } from '../src/actions/places.js';
import { FolderAccess } from '../src/fs/access.js';
import { createMemorySource } from '../src/fs/source.js';

/**
 * A small tree for analyzer tests.
 * @returns {any[]} Entries.
 */
function tree() {
  return [
    { url: '/root', name: 'root', isDirectory: true },
    { url: '/root/big.bin', name: 'big.bin', size: 1000, modified: 100 },
    { url: '/root/small.txt', name: 'small.txt', size: 10, modified: 200 },
    { url: '/root/sub', name: 'sub', isDirectory: true },
    { url: '/root/sub/medium.dat', name: 'medium.dat', size: 500, modified: 300 },
    { url: '/root/sub/deep', name: 'deep', isDirectory: true },
    { url: '/root/sub/deep/tiny.txt', name: 'tiny.txt', size: 5, modified: 400 },
  ];
}

test('analyzeTree rolls sizes up through the tree', async () => {
  const access = new FolderAccess(createMemorySource(tree()));
  const analysis = await analyzeTree(access, '/root', { maxDepth: 6 });

  assert.equal(analysis.totalSize, 1515);
  assert.equal(analysis.fileCount, 4);
  assert.equal(analysis.folderCount, 2);
  assert.equal(analysis.truncated, false);

  const sub = analysis.directories.find((rollup) => rollup.url === '/root/sub');
  assert.equal(sub.total, 505);
  assert.equal(sub.own, 500);

  const root = analysis.directories.find((rollup) => rollup.url === '/root');
  assert.equal(root.total, 1515);

  // dirTotals mirrors directories.
  assert.equal(analysis.dirTotals.get('/root/sub'), 505);

  // Largest file first.
  assert.equal(analysis.largestFiles[0].name, 'big.bin');
});

test('analyzeTree respects the depth cap and reports truncation', async () => {
  const access = new FolderAccess(createMemorySource(tree()));
  const shallow = await analyzeTree(access, '/root', { maxDepth: 0 });

  assert.equal(shallow.fileCount, 2); // only direct files
  assert.equal(shallow.dirTotals.get('/root'), 1010);

  const capped = await analyzeTree(access, '/root', { maxDepth: 6, maxEntries: 3 });
  assert.equal(capped.truncated, true);
});

test('breakdownForChildren ranks children by rolled-up bytes', async () => {
  const access = new FolderAccess(createMemorySource(tree()));
  const analysis = await analyzeTree(access, '/root', { maxDepth: 6 });
  const rootEntries = await access.scan('/root');

  const rows = breakdownForChildren(analysis, rootEntries);
  assert.deepEqual(
    rows.map((row) => row.entry.name),
    ['big.bin', 'sub', 'small.txt'],
  );
  assert.equal(rows[1].bytes, 505);
});

test('fingerprintBytes separates different and identical content', () => {
  const encoder = new TextEncoder();
  const a = encoder.encode('hello world hello world');
  const b = encoder.encode('hello world hello world');
  const c = encoder.encode('hello worlds hello world');

  assert.equal(fingerprintBytes(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength)).length > 0, true);
  const fa = fingerprintBytes(a.buffer.slice(0));
  const fb = fingerprintBytes(b.buffer.slice(0));
  const fc = fingerprintBytes(c.buffer.slice(0));
  assert.equal(fa, fb);
  assert.notEqual(fa, fc);
});

test('findDuplicateContents groups identical files and counts waste', async () => {
  const entries = [
    { url: '/d', name: 'd', isDirectory: true },
    { url: '/d/a.txt', name: 'a.txt', size: 5, content: 'alpha' },
    { url: '/d/b.txt', name: 'b.txt', size: 5, content: 'alpha' },
    { url: '/d/c.txt', name: 'c.txt', size: 5, content: 'other' },
    { url: '/d/sub', name: 'sub', isDirectory: true },
    { url: '/d/sub/a2.txt', name: 'a2.txt', size: 5, content: 'alpha' },
    { url: '/d/big.bin', name: 'big.bin', size: 2048, content: 'x'.repeat(2048) },
    { url: '/d/big2.bin', name: 'big2.bin', size: 2048, content: 'x'.repeat(2048) },
  ];
  const access = new FolderAccess(createMemorySource(entries));
  // The duplicate scan needs a recursive listing; a2.txt lives in /d/sub.
  const files = [
    ...(await access.scan('/d', {})),
    ...(await access.scan('/d/sub', {})),
  ].filter((entry) => entry.isFile);

  const result = await findDuplicateContents(files, access.source);

  assert.equal(result.groups.length, 2);
  assert.equal(result.wastedBytes, 2058); // a.txt trio (5×2) + big pair (2048)

  const textGroup = result.groups.find((group) => group.files[0].name === 'a.txt');
  assert.equal(textGroup.files.length, 3);
});

test('findDuplicateContents skips unique sizes without reading them', async () => {
  const entries = [
    { url: '/u', name: 'u', isDirectory: true },
    { url: '/u/one.txt', name: 'one.txt', size: 3, content: 'aaa' },
    { url: '/u/two.txt', name: 'two.txt', size: 7, content: 'bbbbbbb' },
  ];
  const access = new FolderAccess(createMemorySource(entries));
  const files = await access.scan('/u', {});

  const result = await findDuplicateContents(files, access.source);
  assert.equal(result.groups.length, 0);
  assert.equal(result.scanned, 0);
  assert.equal(result.skipped, 2);
});

test('Crc32 matches known vectors', () => {
  const crc = new Crc32();
  crc.push(new TextEncoder().encode('123456789'));
  assert.equal(crc.value(), 0xcbf43926);
});

test('toDosDateTime encodes fields in range', () => {
  const { date, time } = toDosDateTime(new Date(2026, 8, 19, 12, 34, 56));
  assert.equal(date > 0, true);
  assert.equal(time > 0, true);
  assert.equal(time & 0x1f, 28); // 56 / 2
});

test('createZip produces a well-formed store-only archive', () => {
  const encoder = new TextEncoder();
  const bytes = createZip([
    { name: 'hello.txt', bytes: encoder.encode('hello'), modified: 1700000000000 },
    { name: 'dir/nested.txt', bytes: encoder.encode('world'), modified: 1700000000000 },
  ]);

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Local header signature.
  assert.equal(view.getUint32(0, true), 0x04034b50);
  // EOCD signature at the end.
  const eocd = bytes.length - 22;
  assert.equal(view.getUint32(eocd, true), 0x06054b50);
  assert.equal(view.getUint16(eocd + 10, true), 2); // entry count

  // First entry is stored uncompressed.
  assert.equal(view.getUint16(8, true), 0);
  const text = new TextDecoder().decode(bytes.slice(30, 35));
  assert.equal(text, 'hello');
});

test('createZipExport bundles a folder tree with relative paths', async () => {
  const entries = [
    { url: '/e', name: 'e', isDirectory: true },
    { url: '/e/a.txt', name: 'a.txt', size: 5, content: 'alpha' },
    { url: '/e/sub', name: 'sub', isDirectory: true },
    { url: '/e/sub/b.txt', name: 'b.txt', size: 5, content: 'beta' },
  ];
  const access = new FolderAccess(createMemorySource(entries));

  const result = await createZipExport(access, access.source, '/e');
  assert.equal(result.ok, true);
  assert.equal(result.count, 2);
  assert.equal(result.truncated, false);

  const names = [];
  const view = new DataView(result.bytes.buffer, result.bytes.byteOffset, result.bytes.byteLength);
  let offset = 0;
  while (offset < result.bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) break;
    const nameLength = view.getUint16(offset + 26, true);
    names.push(new TextDecoder().decode(result.bytes.slice(offset + 30, offset + 30 + nameLength)));
    const size = view.getUint32(offset + 18, true);
    offset += 30 + nameLength + size;
  }
  assert.deepEqual(names.sort(), ['a.txt', 'sub/b.txt']);
});

test('deepSearch matches names and file contents with line hits', async () => {
  const entries = [
    { url: '/s', name: 's', isDirectory: true },
    { url: '/s/code.js', name: 'code.js', size: 30, content: 'const alpha = 1;\nconst beta = alpha;\n' },
    { url: '/s/readme.md', name: 'readme.md', size: 12, content: '# alpha doc\n' },
    { url: '/s/skip.png', name: 'skip.png', size: 10 },
    { url: '/s/other.txt', name: 'unrelated.txt', size: 5, content: 'nothing' },
  ];
  const access = new FolderAccess(createMemorySource(entries));
  const all = await access.scan('/s', {});

  const result = await deepSearch(
    all,
    { query: 'alpha', inContents: true, maxResults: 10 },
    { readText: (url) => access.source.readText(url) },
  );

  // 'alpha' appears in file contents, not in any name.
  assert.deepEqual(result.nameMatches.map((entry) => entry.name), []);
  assert.equal(result.contentMatches.length, 2);

  const codeHit = result.contentMatches.find((match) => match.entry.name === 'code.js');
  assert.equal(codeHit.hits[0].line, 1);
  assert.equal(codeHit.hits[1].line, 2);
});

test('deepSearch supports regex and case sensitivity', async () => {
  const entries = [
    { url: '/r', name: 'r', isDirectory: true },
    { url: '/r/A1.txt', name: 'A1.txt', size: 3, content: 'x' },
    { url: '/r/a2.txt', name: 'a2.txt', size: 3, content: 'x' },
  ];
  const access = new FolderAccess(createMemorySource(entries));
  const all = await access.scan('/r', {});

  const regex = await deepSearch(all, { query: '^a\\d', regex: true, maxResults: 10 }, {});
  assert.equal(regex.nameMatches.length, 2); // names starting with a+digit

  const caseSensitive = await deepSearch(all, { query: 'A', caseSensitive: true }, {});
  assert.deepEqual(caseSensitive.nameMatches.map((entry) => entry.name), ['A1.txt']);
});

test('deepSearch honours limits and invalid regexes', async () => {
  assert.equal(buildMatcher({ query: '  ' }), null); // blank queries never match
  // Invalid regex patterns are treated as "matches nothing" rather than errors.
  const broken = buildMatcher({ query: '([invalid' });
  assert.equal(typeof broken, 'function');
  assert.equal(broken('anything'), false);

  const hits = matchContentLines('one\ntwo two\nthree', /two/g);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 2);

  const entries = [{ url: '/x/a.txt', name: 'a.txt', isFile: true, size: 5 }];
  assert.equal(contentCandidates(entries, { maxFileBytes: 3 }).length, 0);
  assert.equal(isTextualName('photo.jpg'), false);
  assert.equal(isTextualName('main.rs'), true);
});

test('snapshots round-trip and compare correctly', () => {
  const before = captureSnapshot('/p', 'proj', [
    { name: 'kept.txt', size: 10, modified: 100, isDirectory: false },
    { name: 'gone.txt', size: 20, modified: 100, isDirectory: false },
    { name: 'old.txt', size: 5, modified: 100, isDirectory: false },
  ]);
  const after = captureSnapshot('/p', 'proj', [
    { name: 'kept.txt', size: 12, modified: 200, isDirectory: false },
    { name: 'new.txt', size: 30, modified: 200, isDirectory: false },
    { name: 'old.txt', size: 5, modified: 100, isDirectory: false },
  ]);

  const diff = compareSnapshots(before, after);
  assert.deepEqual(diff.added.map((entry) => entry.name), ['new.txt']);
  assert.deepEqual(diff.removed.map((entry) => entry.name), ['gone.txt']);
  assert.equal(diff.changed.length, 1);
  assert.equal(diff.changed[0].name, 'kept.txt');
  // gone.txt's 20 bytes count as removed; kept.txt grew, so its 2 extra
  // bytes are added (net growth), not removed.
  assert.equal(diff.bytesAdded, 32);
  assert.equal(diff.bytesRemoved, 20);

  const parsed = parseSnapshot(serializeSnapshot(before));
  assert.equal(parsed.version, 1);
  assert.equal(parsed.entries.length, 3);
  assert.equal(parseSnapshot('not json'), null);
});

test('snapshots pair renames instead of add+remove noise', () => {
  const before = captureSnapshot('/q', 'q', [
    { name: 'before.txt', size: 100, modified: 1000, isDirectory: false },
  ]);
  const after = captureSnapshot('/q', 'q', [
    { name: 'after.txt', size: 100, modified: 1100, isDirectory: false },
  ]);

  const diff = compareSnapshots(before, after);
  assert.equal(diff.renamed.length, 1);
  assert.equal(diff.renamed[0].from, 'before.txt');
  assert.equal(diff.renamed[0].to, 'after.txt');
  assert.equal(diff.added.length, 0);
  assert.equal(diff.removed.length, 0);

  const report = formatDiffReport(before, diff);
  assert.match(report, /before\.txt → after\.txt/);
});

test('WatchService detects changes and pauses on demand', async () => {
  let paused = false;
  let call = 0;
  /** @type {any[]} */
  const scans = [
    [{ name: 'a', size: 1, modified: 1, isDirectory: false }],
    [{ name: 'a', size: 1, modified: 1, isDirectory: false }],
    [{ name: 'a', size: 2, modified: 2, isDirectory: false }],
  ];

  const watch = new WatchService({
    scan: async () => scans[Math.min(call++, scans.length - 1)],
    isPaused: () => paused,
  });

  /** @type {boolean[]} */
  const events = [];
  watch.onChange(({ changed }) => events.push(changed));

  const first = await watch.refreshNow();
  assert.equal(first.changed, false); // baseline

  const second = await watch.refreshNow();
  assert.equal(second.changed, false);

  const third = await watch.refreshNow();
  assert.equal(third.changed, true);
  assert.equal(watch.lastChangeInfo.removes, 1); // the old "a" entry
  assert.equal(watch.lastChangeInfo.adds, 1); // the new "a" entry

  paused = true;
  await watch.tick(); // paused ticks do nothing
  assert.equal(events.length, 1);

  watch.stop();
});

test('clampInterval bounds the poll cadence', () => {
  assert.equal(clampInterval(1), 2000); // below the floor
  assert.equal(clampInterval(999999), 60000); // above the ceiling
  assert.equal(clampInterval(10000), 10000); // in-range values pass through
  assert.equal(clampInterval(Number.NaN), 5000); // garbage gets the default
});

test('Places pins, ranks recents, and persists through the store', () => {
  /** @type {Map<string, any>} */
  const backing = new Map();
  const store = {
    get: (key, fallback) => (backing.has(key) ? backing.get(key) : fallback),
    set: (key, value) => backing.set(key, value),
  };

  const places = new Places(store, { pinnedKey: 'pins', recentsKey: 'recents' });

  places.touch('/a', 'Alpha', 1000);
  places.touch('/b', 'Beta', 2000);
  places.touch('/a', 'Alpha', 3000);
  assert.deepEqual(places.recents().map((place) => place.url), ['/a', '/b']);
  assert.equal(places.recents()[0].useCount, 2);

  places.pin('/c', 'Gamma');
  assert.equal(places.isPinned('/c'), true);
  places.unpin('/c');
  assert.equal(places.isPinned('/c'), false);

  // Pin cap.
  for (let i = 0; i < MAX_PINNED + 2; i++) places.pin(`/p${i}`, `P${i}`);
  assert.equal(places.pinned().length, MAX_PINNED);

  places.forgetRecent('/b');
  assert.equal(places.recents().some((place) => place.url === '/b'), false);

  // Values were actually persisted.
  assert.equal(backing.has('pins'), true);
  assert.equal(backing.has('recents'), true);
});
