import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildReport,
  reportFileName,
  reportFormat,
  escapeMarkdown,
  REPORT_FORMATS,
} from '../src/actions/report.js';
import { escapeHtml } from '../src/actions/report-html.js';

const NOW = new Date(2026, 8, 11, 14, 30).getTime();

/** A representative listing. */
function fixture() {
  return [
    {
      name: 'main.js',
      url: 'file:///project/main.js',
      isFile: true,
      isDirectory: false,
      kind: 'text',
      size: 4096,
      modified: NOW - 86400_000,
    },
    {
      name: 'photo.png',
      url: 'file:///project/photo.png',
      isFile: true,
      isDirectory: false,
      kind: 'image',
      size: 2048,
      modified: NOW - 3600_000,
    },
    {
      name: 'notes.bak',
      url: 'file:///project/notes.bak',
      isFile: true,
      isDirectory: false,
      kind: 'text',
      size: 512,
      modified: NOW,
    },
    {
      name: 'sub',
      url: 'file:///project/sub',
      isFile: false,
      isDirectory: true,
      kind: 'folder',
      size: 0,
      modified: NOW,
    },
  ];
}

test('text report includes summary, largest files, cleanup, and listing', () => {
  const report = buildReport({
    rootTitle: 'project',
    rootUrl: 'file:///project',
    entries: fixture(),
    format: 'text',
    now: NOW,
  });

  assert.match(report, /^project — folder report/);
  assert.match(report, /SUMMARY/);
  assert.match(report, /LARGEST FILES/);
  assert.match(report, /CLEANUP SUGGESTIONS/);
  assert.match(report, /FILES/);
  assert.match(report, /main\.js/);
  assert.match(report, /notes\.bak/);
  // The backup is flagged with its reason and totalled.
  assert.match(report, /backup/);
  assert.match(report, /Reclaimable: 512 B across 1 file/);
});

test('text report omits the listing when disabled and hides paths by default', () => {
  const report = buildReport({
    rootTitle: 'project',
    rootUrl: 'file:///project',
    entries: fixture(),
    includeListing: false,
    now: NOW,
  });

  // Check the section header itself: "FILES" also appears in "LARGEST FILES".
  assert.equal(report.includes('\nFILES\n'), false);
  assert.equal(report.includes('file:///project/main.js'), false);
});

test('includePaths adds the full url to the report', () => {
  const report = buildReport({
    rootTitle: 'project',
    rootUrl: 'file:///project',
    entries: fixture(),
    includePaths: true,
    now: NOW,
  });

  assert.match(report, /file:\/\/\/project\/main\.js/);
});

test('clean report says so instead of listing nothing', () => {
  const report = buildReport({
    rootTitle: 'clean',
    rootUrl: 'file:///clean',
    entries: [
      {
        name: 'readme.md',
        url: 'file:///clean/readme.md',
        isFile: true,
        isDirectory: false,
        kind: 'text',
        size: 10,
        modified: NOW,
      },
    ],
    now: NOW,
  });

  assert.match(report, /CLEANUP SUGGESTIONS\n {2}None found\./);
});

test('markdown report uses headings and tables', () => {
  const report = buildReport({
    rootTitle: 'project',
    rootUrl: 'file:///project',
    entries: fixture(),
    format: 'markdown',
    now: NOW,
  });

  assert.match(report, /^# project — folder report/);
  assert.match(report, /## Summary/);
  assert.match(report, /## Type breakdown/);
  assert.match(report, /## Cleanup suggestions/);
  assert.match(report, /## Files/);
  assert.match(report, /\| Files \| 3 \|/);
  assert.match(report, /\| Folders \| 1 \|/);
});

test('csv report emits a header and one row per entry', () => {
  const report = buildReport({
    rootTitle: 'project',
    entries: [
      ...fixture(),
      {
        name: 'odd,name"quoted.txt',
        url: 'file:///project/odd.txt',
        isFile: true,
        isDirectory: false,
        kind: 'text',
        size: 1,
        modified: 0,
      },
    ],
    format: 'csv',
    now: NOW,
  });

  const lines = report.split('\n');
  assert.equal(lines[0], 'name,type,size_bytes,size,modified,isDirectory');
  assert.equal(lines.length, 6); // header + 5 entries
  // Commas and quotes inside names are escaped.
  assert.equal(lines[5], '"odd,name""quoted.txt",text,1,1 B,,false');
});

test('csv report can include paths', () => {
  const report = buildReport({
    rootTitle: 'project',
    entries: fixture().slice(0, 1),
    format: 'csv',
    includePaths: true,
    now: NOW,
  });

  assert.match(report.split('\n')[0], /,path$/);
  assert.match(report.split('\n')[1], /file:\/\/\/project\/main\.js/);
});

test('reportFileName sanitises the folder name and picks the extension', () => {
  assert.equal(reportFileName('My Folder!', 'text', NOW), 'My-Folder-report-20260911-1430.txt');
  assert.equal(reportFileName('src', 'markdown', NOW), 'src-report-20260911-1430.md');
  assert.equal(reportFileName('', 'csv', NOW), 'folder-report-20260911-1430.csv');
});

test('reportFormat falls back to plain text for unknown values', () => {
  assert.equal(reportFormat('csv').extension, 'csv');
  assert.equal(reportFormat('html').extension, 'html');
  assert.equal(reportFormat('nonsense').value, 'text');
  assert.equal(reportFormat().mime, 'text/plain');
  assert.equal(REPORT_FORMATS.length, 4);
});

test('escaping covers quotes, markup, and Markdown pipes', () => {
  // Regression: the quote replacement once compiled to /\\"/ and did nothing.
  assert.equal(escapeHtml('a"b'), 'a&quot;b');
  assert.equal(escapeHtml("a'b"), 'a&#39;b');
  assert.equal(escapeHtml('a&b'), 'a&amp;b');
  assert.equal(
    escapeHtml('<img src=x onerror=alert(1)>'),
    '&lt;img src=x onerror=alert(1)&gt;',
  );
  assert.equal(escapeMarkdown('a|b'), 'a' + String.fromCharCode(92) + '|b');
});

test('csv does not quote cells that only look risky', () => {
  const report = buildReport({
    rootTitle: 'names',
    entries: [
      { name: 'notes.txt', isFile: true, isDirectory: false, kind: 'text', size: 1, modified: 0 },
      { name: 'report.md', isFile: true, isDirectory: false, kind: 'text', size: 2, modified: 0 },
      { name: 'plain.txt', isFile: true, isDirectory: false, kind: 'text', size: 3, modified: 0 },
    ],
    format: 'csv',
    now: NOW,
  });

  const lines = report.split('\n');
  // Regression: a corrupted character class used to quote any name with n or r.
  assert.equal(lines[1].startsWith('notes.txt,'), true);
  assert.equal(lines[2].startsWith('report.md,'), true);
  assert.equal(lines[3].startsWith('plain.txt,'), true);
});

test('html report is a complete, self-contained document', () => {
  const report = buildReport({
    rootTitle: 'project',
    rootUrl: 'file:///project',
    entries: fixture(),
    format: 'html',
    now: NOW,
  });

  assert.match(report, /^<!doctype html>/);
  assert.match(report, /<html lang="en">/);
  assert.match(report, /<meta charset="utf-8">/);
  assert.match(report, /<title>project — folder report<\/title>/);
  assert.match(report, /<style>/);
  assert.match(report, /Type breakdown/);
  assert.match(report, /Largest files/);
  assert.match(report, /Cleanup suggestions/);
  assert.match(report, /class="badge">backup</);
  assert.match(report, /Reclaimable:/);
  assert.match(report, /main\.js/);
  assert.match(report, /Generated by FS/);
  assert.match(report, /<\/html>$/);
});

test('html report makes no external requests', () => {
  const report = buildReport({
    rootTitle: 'project',
    entries: fixture(),
    format: 'html',
    now: NOW,
  });

  assert.equal(report.includes('http://'), false);
  assert.equal(report.includes('https://'), false);
  assert.equal(report.toLowerCase().includes('<script'), false);
  assert.equal(report.toLowerCase().includes('<link'), false);
});

test('html report escapes hostile file names', () => {
  const report = buildReport({
    rootTitle: '<b>bold</b>',
    entries: [
      {
        name: '<img src=x onerror=alert(1)>.txt',
        url: 'file:///x',
        isFile: true,
        isDirectory: false,
        kind: 'text',
        size: 12,
        modified: NOW,
      },
    ],
    format: 'html',
    now: NOW,
  });

  assert.equal(report.includes('<img src=x'), false);
  assert.equal(report.includes('&lt;img src=x onerror=alert(1)&gt;.txt'), true);
  assert.equal(report.includes('<title><b>bold</b>'), false);
  assert.equal(report.includes('&lt;b&gt;bold&lt;/b&gt;'), true);
});

test('markdown report escapes pipes in names', () => {
  const report = buildReport({
    rootTitle: 'pipes',
    entries: [
      {
        name: 'a|b.txt',
        url: 'file:///a',
        isFile: true,
        isDirectory: false,
        kind: 'text',
        size: 1,
        modified: NOW,
      },
    ],
    format: 'markdown',
    now: NOW,
  });

  const backslash = String.fromCharCode(92);
  assert.equal(report.includes(`a${backslash}|b.txt`), true);
  // The unescaped name must not survive into the table.
  assert.equal(report.includes('| a|b.txt |'), false);
});
