import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatSize,
  formatRelativeTime,
  formatCount,
  fileKind,
  typeLabel,
} from '../src/utils/format.js';
import { sortFiles, countByKind } from '../src/utils/sort.js';
import {
  globToRegExp,
  makePatternMatcher,
  duplicateNameGroup,
  isCleanupCandidate,
  getExtension,
  stripExtension,
} from '../src/utils/patterns.js';

test('formatSize handles normal, zero, and invalid input', () => {
  assert.equal(formatSize(0), '0 B');
  assert.equal(formatSize(1024), '1.0 KB');
  assert.equal(formatSize(1536), '1.5 KB');
  assert.equal(formatSize(1048576), '1.0 MB');
  assert.equal(formatSize(-5), '—');
  assert.equal(formatSize(undefined), '—');
  assert.equal(formatSize(Number.NaN), '—');
});

test('formatRelativeTime covers past, near, and future timestamps', () => {
  const now = 1_700_000_000_000;
  assert.equal(formatRelativeTime(now - 5_000, now), 'just now');
  assert.equal(formatRelativeTime(now - 90_000, now), '1 min ago');
  assert.equal(formatRelativeTime(now - 3 * 3600_000, now), '3 h ago');
  assert.equal(formatRelativeTime(now - 2 * 86400_000, now), '2 d ago');
  // Regression: the "just now" window used to swallow negative offsets.
  assert.equal(formatRelativeTime(now + 60_000, now), 'in the future');
  assert.equal(formatRelativeTime(0, now), '—');
});

test('formatCount never returns NaN', () => {
  assert.equal(formatCount(0), '0');
  assert.equal(formatCount(undefined), '0');
});

test('fileKind classifies by extension, mime, and directory flag', () => {
  assert.equal(fileKind('notes.txt'), 'text');
  assert.equal(fileKind('app.json'), 'text');
  assert.equal(fileKind('photo.PNG'), 'image');
  assert.equal(fileKind('song.mp3'), 'media');
  assert.equal(fileKind('anything', null, true), 'folder');
  assert.equal(fileKind('archive.xyz'), 'other');
  assert.equal(fileKind('noextension'), 'unknown');
  assert.equal(fileKind('blob', 'application/pdf'), 'binary');
  assert.equal(fileKind('blob', 'text/plain'), 'text');
  assert.equal(typeLabel('media'), 'Media');
});

test('sortFiles uses natural ordering and keeps folders first', () => {
  const items = [
    { name: 'file10.txt', size: 30 },
    { name: 'folderB', isDirectory: true },
    { name: 'file2.txt', size: 10 },
    { name: 'folderA', isDirectory: true },
  ];

  const asc = sortFiles(items, 'name', 'asc').map((item) => item.name);
  assert.deepEqual(asc, ['folderA', 'folderB', 'file2.txt', 'file10.txt']);

  // Folders stay on top, but the direction still applies inside each group.
  const desc = sortFiles(items, 'name', 'desc').map((item) => item.name);
  assert.deepEqual(desc, ['folderB', 'folderA', 'file10.txt', 'file2.txt']);

  const bySize = sortFiles(items, 'size', 'desc').map((item) => item.name);
  assert.deepEqual(bySize.slice(2), ['file10.txt', 'file2.txt']);
});

test('sortFiles does not mutate the input array', () => {
  const items = [{ name: 'b' }, { name: 'a' }];
  sortFiles(items, 'name', 'asc');
  assert.deepEqual(items.map((item) => item.name), ['b', 'a']);
});

test('countByKind groups directories under a single folder bucket', () => {
  const counts = countByKind([
    { isDirectory: true },
    { kind: 'text' },
    { kind: 'text' },
    { kind: 'image' },
  ]);

  assert.equal(counts[0].kind, 'text');
  assert.equal(counts[0].count, 2);
  assert.equal(counts.find((entry) => entry.kind === 'folder').count, 1);
});

test('globToRegExp treats dots literally and does not cross slashes', () => {
  const pattern = globToRegExp('*.log');
  assert.equal(pattern.test('app.log'), true);
  assert.equal(pattern.test('app.log.bak'), false);
  assert.equal(pattern.test('nested/app.log'), false);

  const deep = globToRegExp('build/**');
  assert.equal(deep.test('build/output/app.js'), true);
});

test('makePatternMatcher does not over-match on the default ignore list', () => {
  const matcher = makePatternMatcher([]);
  assert.equal(matcher.matches('.DS_Store'), true);
  // Regression: treating the entry as raw regex made this match.
  assert.equal(matcher.matches('xDS_Store'), false);
  assert.equal(matcher.matches('Thumbs.db'), true);
  assert.equal(matcher.matches('notes.txt'), false);
});

test('makePatternMatcher honours user globs and ignores blanks', () => {
  const matcher = makePatternMatcher(['*.tmp', '  ', 'drafts/**']);
  assert.equal(matcher.matches('scratch.tmp'), true);
  assert.equal(matcher.matches('scratch.txt'), false);
  assert.equal(matcher.matches('drafts/one/two.md'), true);
  assert.equal(matcher.globs.length, 7); // 5 defaults + 2 real patterns
});

test('duplicateNameGroup finds case-insensitive collisions', () => {
  const groups = duplicateNameGroup([
    { name: 'Photo.jpg' },
    { name: 'photo.jpg' },
    { name: 'unique.txt' },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].length, 2);
});

test('cleanup detection excludes ordinary dotfiles', () => {
  assert.equal(isCleanupCandidate('app.tmp'), true);
  assert.equal(isCleanupCandidate('notes.bak'), true);
  assert.equal(isCleanupCandidate('notes.txt'), false);
  // A hidden config file is not junk.
  assert.equal(isCleanupCandidate('.env'), false);
  assert.equal(isCleanupCandidate('folder.tmp', 'folder'), false);
});

test('getExtension and stripExtension handle multi-dot names', () => {
  assert.equal(getExtension('archive.tar.gz'), 'gz');
  assert.equal(getExtension('none'), null);
  assert.equal(stripExtension('archive.tar.gz'), 'archive.tar');
  assert.equal(stripExtension('.bashrc'), '.bashrc');
});
