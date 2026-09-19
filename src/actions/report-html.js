/**
 * HTML report renderer.
 *
 * Produces a complete, self-contained page: it embeds its own stylesheet and
 * makes no external requests (no fonts, scripts, or images), so it renders
 * identically offline, inside an iframe, or opened from a file.
 *
 * File names are user controlled and may contain markup, so every interpolated
 * value passes through {@link escapeHtml}.
 */

import { formatSize, formatCount, formatDate, typeLabel } from '../utils/format.js';

/** Rows written to the listing before it is truncated. */
const LISTING_LIMIT = 2000;

/** Double quote, built from its code point to avoid quoting traps in source. */
const DQUOTE = String.fromCharCode(34);

/** Single quote, built from its code point to avoid quoting traps in source. */
const SQUOTE = String.fromCharCode(39);

/**
 * Escape text so it is safe in HTML content or a quoted attribute.
 * @param {any} value - Raw value.
 * @returns {string} Escaped value.
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .split('&')
    .join('&amp;')
    .split('<')
    .join('&lt;')
    .split('>')
    .join('&gt;')
    .split(DQUOTE)
    .join('&quot;')
    .split(SQUOTE)
    .join('&#39;');
}

/**
 * Render the HTML report page.
 *
 * @param {Object} context - Report content.
 * @param {string} context.title - Folder name.
 * @param {string[]} context.parts - Header lines (`title`, then meta lines).
 * @param {any} context.summary - Folder summary.
 * @param {any[]} context.cleanup - Cleanup candidates.
 * @param {any[]} context.entries - Listing.
 * @param {boolean} context.includePaths - Include paths.
 * @param {boolean} context.includeListing - Include the listing.
 * @param {number} context.now - Reference timestamp.
 * @returns {string} Complete HTML document.
 */
export function buildHtml(context) {
  const {
    title,
    parts,
    summary,
    cleanup,
    entries,
    includePaths,
    includeListing,
    now,
  } = context;

  const [heading, ...meta] = parts;
  const reclaimable = cleanup.reduce((total, file) => total + (file.size || 0), 0);

  const cards = [
    ['Files', formatCount(summary.totalFiles)],
    ['Folders', formatCount(summary.totalFolders)],
    ['Total size', formatSize(summary.totalSize, { precise: true })],
    ['Duplicate names', summary.hasDuplicates ? 'Yes' : 'No'],
  ];

  const types = Object.entries(summary.byType || {}).sort((a, b) => b[1] - a[1]);
  const largest = summary.largestFiles || [];
  const rows = entries.slice(0, LISTING_LIMIT);

  const body = [
    '<header class="head">',
    `<h1>${escapeHtml(title)}</h1>`,
    `<p class="meta">${meta.map((line) => escapeHtml(line)).join(' · ')}</p>`,
    '</header>',
    '',
    '<section class="cards">',
    ...cards.map(
      ([label, value]) =>
        `<div class="card"><span class="k">${escapeHtml(label)}</span>` +
        `<span class="v">${escapeHtml(value)}</span></div>`,
    ),
    '</section>',
  ];

  if (types.length) {
    body.push(
      '',
      '<section>',
      '<h2>Type breakdown</h2>',
      '<div class="scroll"><table>',
      '<thead><tr><th>Type</th><th class="num">Count</th></tr></thead>',
      '<tbody>',
    );
    for (const [kind, count] of types) {
      body.push(
        `<tr><td>${escapeHtml(typeLabel(kind))}</td>` +
          `<td class="num">${escapeHtml(formatCount(count))}</td></tr>`,
      );
    }
    body.push('</tbody>', '</table></div>', '</section>');
  }

  if (largest.length) {
    body.push(
      '',
      '<section>',
      '<h2>Largest files</h2>',
      '<div class="scroll"><table>',
      '<thead><tr><th>File</th><th class="num">Size</th></tr></thead>',
      '<tbody>',
    );
    for (const file of largest) {
      body.push(
        `<tr><td class="name">${escapeHtml(file.name)}</td>` +
          `<td class="num">${escapeHtml(formatSize(file.size))}</td></tr>`,
      );
    }
    body.push('</tbody>', '</table></div>', '</section>');
  }

  body.push('', '<section>', '<h2>Cleanup suggestions</h2>');
  if (!cleanup.length) {
    body.push('<p class="note">No temporary or backup files found.</p>');
  } else {
    body.push(
      '<div class="scroll"><table>',
      '<thead><tr><th>File</th><th>Reason</th><th class="num">Size</th></tr></thead>',
      '<tbody>',
    );
    for (const file of cleanup) {
      const reasons = (file.cleanupReasons || []).join(', ') || 'candidate';
      body.push(
        `<tr><td class="name">${escapeHtml(file.name)}</td>` +
          `<td><span class="badge">${escapeHtml(reasons)}</span></td>` +
          `<td class="num">${escapeHtml(formatSize(file.size))}</td></tr>`,
      );
    }
    body.push('</tbody>', '</table></div>');
    body.push(
      `<p class="note">Reclaimable: <strong>${escapeHtml(formatSize(reclaimable))}</strong> ` +
        `across ${escapeHtml(formatCount(cleanup.length))} file(s).</p>`,
    );
  }
  body.push('</section>');

  if (includeListing) {
    body.push(
      '',
      '<section>',
      '<h2>Files</h2>',
      '<div class="scroll"><table>',
      includePaths
        ? '<thead><tr><th>Name</th><th>Type</th><th>Modified</th><th class="num">Size</th><th>Path</th></tr></thead>'
        : '<thead><tr><th>Name</th><th>Type</th><th>Modified</th><th class="num">Size</th></tr></thead>',
      '<tbody>',
    );

    for (const entry of rows) {
      const kind = entry.isDirectory ? 'folder' : typeLabel(entry.kind).toLowerCase();
      const size = entry.isDirectory ? '—' : formatSize(entry.size);
      const cells = [
        `<td class="name">${escapeHtml(entry.name)}</td>`,
        `<td><span class="kind">${escapeHtml(kind)}</span></td>`,
        `<td class="date">${escapeHtml(formatDate(entry.modified))}</td>`,
        `<td class="num">${escapeHtml(size)}</td>`,
      ];
      if (includePaths) cells.push(`<td class="path">${escapeHtml(entry.url || '')}</td>`);
      body.push(`<tr>${cells.join('')}</tr>`);
    }

    body.push('</tbody>', '</table></div>');
    if (entries.length > rows.length) {
      body.push(
        `<p class="note">… and ${escapeHtml(formatCount(entries.length - rows.length))} more.</p>`,
      );
    }
    body.push('</section>');
  }

  body.push(
    '',
    '<footer class="foot">',
    '<span>Generated by FS — Folder Workspace</span>',
    `<span>${escapeHtml(formatDate(now))}</span>`,
    '</footer>',
  );

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(heading)}</title>`,
    '<style>',
    HTML_STYLES,
    '</style>',
    '</head>',
    '<body>',
    '<main class="page">',
    ...body,
    '</main>',
    '</body>',
    '</html>',
  ].join('\n');
}

/** Stylesheet embedded in every HTML report. */
const HTML_STYLES = `
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --fg: #1c1d21;
  --muted: #5c6070;
  --border: #e2e4ea;
  --card: #f6f7fa;
  --warn: #8a4b00;
  --warn-bg: #fff3e0;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16171a;
    --fg: #e8e8ea;
    --muted: #a8acb8;
    --border: #2c2f36;
    --card: #1e2026;
    --warn: #ffc078;
    --warn-bg: #3a2c17;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  -webkit-text-size-adjust: 100%;
}
.page { max-width: 1020px; margin: 0 auto; padding: 24px 18px 48px; }
.head h1 { margin: 0 0 4px; font-size: 24px; line-height: 1.25; word-break: break-word; }
.meta { margin: 0; color: var(--muted); font-size: 13px; }
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  margin: 22px 0 8px;
}
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.card .k { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
.card .v { font-size: 20px; font-weight: 600; }
section { margin-top: 28px; }
h2 { font-size: 15px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 0 0 10px; }
.scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
th { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); font-weight: 600; white-space: nowrap; }
tbody tr:nth-child(even) { background: var(--card); }
.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.date { white-space: nowrap; color: var(--muted); }
.name { word-break: break-word; }
.path { color: var(--muted); font-size: 12px; word-break: break-all; }
.kind { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--warn);
  background: var(--warn-bg);
}
.note { color: var(--muted); font-size: 13px; margin: 10px 0 0; }
.foot {
  margin-top: 36px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 12px;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
@media print {
  body { background: #fff; color: #000; }
  .cards { grid-template-columns: repeat(4, 1fr); }
  section { break-inside: avoid; }
}
`;
