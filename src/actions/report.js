/**
 * Folder report builder.
 *
 * Pure functions: given a listing they return a string. Nothing here touches
 * the DOM or the host API, which keeps every format unit testable. HTML output
 * lives in `report-html.js`.
 */

import { CleanupInsights } from './cleanup.js';
import { buildHtml } from './report-html.js';
import { formatSize, formatDate, typeLabel } from '../utils/format.js';

/** Formats a report can be exported in. */
export const REPORT_FORMATS = [
  { value: 'text', label: 'Plain text', extension: 'txt', mime: 'text/plain' },
  { value: 'markdown', label: 'Markdown', extension: 'md', mime: 'text/markdown' },
  { value: 'csv', label: 'CSV', extension: 'csv', mime: 'text/csv' },
  { value: 'html', label: 'HTML page', extension: 'html', mime: 'text/html' },
];

/** Number of largest files listed in a report. */
const LARGEST_LIMIT = 10;

/** Rows written to the full listing before it is truncated. */
const LISTING_LIMIT = 2000;

/** Double quote, from its code point, so no quoting trap exists in source. */
const DQUOTE = String.fromCharCode(34);

/** Line feed. */
const NEWLINE = String.fromCharCode(10);

/** Carriage return. */
const CARRIAGE = String.fromCharCode(13);

/** Vertical bar. */
const PIPE = String.fromCharCode(124);

/** Backslash. */
const BACKSLASH = String.fromCharCode(92);

/**
 * @param {'text'|'markdown'|'csv'|'html'} [format] - Report format.
 * @returns {{ value: string, label: string, extension: string, mime: string }} Format descriptor.
 */
export function reportFormat(format) {
  return REPORT_FORMATS.find((entry) => entry.value === format) || REPORT_FORMATS[0];
}

/**
 * Build a report for a folder.
 *
 * @param {Object} context - Report context.
 * @param {string} [context.rootTitle] - Folder display name.
 * @param {string} [context.rootUrl] - Folder url.
 * @param {any[]} context.entries - Folder listing.
 * @param {any} [context.summary] - Pre-computed summary, otherwise derived.
 * @param {any[]} [context.cleanup] - Pre-computed cleanup candidates, otherwise derived.
 * @param {'text'|'markdown'|'csv'|'html'} [context.format] - Output format.
 * @param {boolean} [context.includePaths] - Include full paths in the listing.
 * @param {boolean} [context.includeListing] - Include the per-file listing.
 * @param {number} [context.now] - Reference timestamp.
 * @returns {string} The report.
 */
export function buildReport(context) {
  const {
    rootTitle = 'folder',
    rootUrl = '',
    entries = [],
    format = 'text',
    includePaths = false,
    includeListing = true,
    now = Date.now(),
  } = context || {};

  const insights = new CleanupInsights(entries);
  const summary = context?.summary || insights.summary();
  const cleanup = context?.cleanup || insights.allCandidates();

  if (format === 'csv') {
    return buildCsv(entries, includePaths);
  }

  const parts = [`${rootTitle} — folder report`, `Generated ${formatDate(now)}`];
  if (includePaths && rootUrl) parts.push(`Location ${rootUrl}`);

  if (format === 'html') {
    return buildHtml({
      title: rootTitle,
      parts,
      summary,
      cleanup,
      entries,
      includePaths,
      includeListing,
      now,
    });
  }

  const body =
    format === 'markdown'
      ? buildMarkdown(parts, summary, cleanup, entries, includePaths, includeListing)
      : buildText(parts, summary, cleanup, entries, includePaths, includeListing);

  return `${body}${NEWLINE}`;
}

/**
 * Plain-text report.
 * @param {string[]} header - Title lines.
 * @param {any} summary - Folder summary.
 * @param {any[]} cleanup - Cleanup candidates.
 * @param {any[]} entries - Listing.
 * @param {boolean} includePaths - Include paths.
 * @param {boolean} includeListing - Include the listing.
 * @returns {string} Report body.
 */
function buildText(header, summary, cleanup, entries, includePaths, includeListing) {
  const lines = [header[0], ...header.slice(1)];
  lines.push('');
  lines.push('SUMMARY');
  lines.push(pad('  Files', 18) + summary.totalFiles);
  lines.push(pad('  Folders', 18) + summary.totalFolders);
  lines.push(pad('  Total size', 18) + formatSize(summary.totalSize, { precise: true }));
  lines.push(pad('  Duplicate names', 18) + (summary.hasDuplicates ? 'yes' : 'no'));

  const types = Object.entries(summary.byType || {});
  if (types.length) {
    lines.push('');
    lines.push('TYPE BREAKDOWN');
    for (const [kind, count] of types.sort((a, b) => b[1] - a[1])) {
      lines.push(pad(`  ${typeLabel(kind)}`, 18) + count);
    }
  }

  const largest = (summary.largestFiles || []).slice(0, LARGEST_LIMIT);
  if (largest.length) {
    lines.push('');
    lines.push('LARGEST FILES');
    for (const file of largest) {
      lines.push(`  ${pad(formatSize(file.size), 10)} ${file.name}`);
    }
  }

  lines.push('');
  lines.push('CLEANUP SUGGESTIONS');
  if (!cleanup.length) {
    lines.push('  None found.');
  } else {
    const reclaimable = cleanup.reduce((total, file) => total + (file.size || 0), 0);
    for (const file of cleanup) {
      const reasons = (file.cleanupReasons || []).join(', ') || 'candidate';
      lines.push(`  ${pad(formatSize(file.size), 10)} ${pad(file.name, 30)} (${reasons})`);
    }
    lines.push(`  Reclaimable: ${formatSize(reclaimable)} across ${cleanup.length} file(s)`);
  }

  if (includeListing) {
    lines.push('');
    lines.push('FILES');
    const rows = entries.slice(0, LISTING_LIMIT);
    const sizeWidth = Math.max(6, ...rows.map((entry) => formatSize(entry.size).length));

    for (const entry of rows) {
      const kind = entry.isDirectory ? 'folder' : typeLabel(entry.kind).toLowerCase();
      lines.push(
        `  ${pad(entry.isDirectory ? '—' : formatSize(entry.size), sizeWidth)}  ` +
          `${pad(formatDate(entry.modified), 20)}  ${pad(kind, 8)}  ${entry.name}` +
          (includePaths ? `  ${entry.url || ''}` : ''),
      );
    }

    if (entries.length > rows.length) {
      lines.push(`  … and ${entries.length - rows.length} more`);
    }
  }

  return lines.join(NEWLINE);
}

/**
 * Markdown report.
 * @param {string[]} header - Title lines.
 * @param {any} summary - Folder summary.
 * @param {any[]} cleanup - Cleanup candidates.
 * @param {any[]} entries - Listing.
 * @param {boolean} includePaths - Include paths.
 * @param {boolean} includeListing - Include the listing.
 * @returns {string} Report body.
 */
function buildMarkdown(header, summary, cleanup, entries, includePaths, includeListing) {
  const [title, ...meta] = header;
  const lines = [`# ${title}`, '', ...meta.map((line) => `_${line}_`), ''];

  lines.push('## Summary', '');
  lines.push('| Metric | Value |', '| --- | --- |');
  lines.push(`| Files | ${summary.totalFiles} |`);
  lines.push(`| Folders | ${summary.totalFolders} |`);
  lines.push(`| Total size | ${formatSize(summary.totalSize, { precise: true })} |`);
  lines.push(`| Duplicate names | ${summary.hasDuplicates ? 'yes' : 'no'} |`);
  lines.push('');

  const types = Object.entries(summary.byType || {});
  if (types.length) {
    lines.push('## Type breakdown', '');
    lines.push('| Type | Count |', '| --- | --- |');
    for (const [kind, count] of types.sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${typeLabel(kind)} | ${count} |`);
    }
    lines.push('');
  }

  const largest = (summary.largestFiles || []).slice(0, LARGEST_LIMIT);
  if (largest.length) {
    lines.push('## Largest files', '');
    lines.push('| Size | File |', '| --- | --- |');
    for (const file of largest) {
      lines.push(`| ${formatSize(file.size)} | ${escapeMarkdown(file.name)} |`);
    }
    lines.push('');
  }

  lines.push('## Cleanup suggestions', '');
  if (!cleanup.length) {
    lines.push('None found.', '');
  } else {
    const reclaimable = cleanup.reduce((total, file) => total + (file.size || 0), 0);
    lines.push('| Size | File | Reason |', '| --- | --- | --- |');
    for (const file of cleanup) {
      const reasons = (file.cleanupReasons || []).join(', ') || 'candidate';
      lines.push(`| ${formatSize(file.size)} | ${escapeMarkdown(file.name)} | ${reasons} |`);
    }
    lines.push('');
    lines.push(
      `Reclaimable: **${formatSize(reclaimable)}** across ${cleanup.length} file(s).`,
      '',
    );
  }

  if (includeListing) {
    const rows = entries.slice(0, LISTING_LIMIT);
    lines.push('## Files', '');
    lines.push(
      includePaths ? '| Size | Modified | Type | Name | Path |' : '| Size | Modified | Type | Name |',
      includePaths ? '| --- | --- | --- | --- | --- |' : '| --- | --- | --- | --- |',
    );

    for (const entry of rows) {
      const kind = entry.isDirectory ? 'folder' : typeLabel(entry.kind).toLowerCase();
      const size = entry.isDirectory ? '—' : formatSize(entry.size);
      const cell = `${size} | ${formatDate(entry.modified)} | ${kind} | ${escapeMarkdown(entry.name)}`;
      lines.push(includePaths ? `| ${cell} | ${escapeMarkdown(entry.url || '')} |` : `| ${cell} |`);
    }

    lines.push('');
    if (entries.length > rows.length) {
      lines.push(`_… and ${entries.length - rows.length} more._`, '');
    }
  }

  return lines.join(NEWLINE);
}

/**
 * CSV listing, one row per entry.
 * @param {any[]} entries - Listing.
 * @param {boolean} includePaths - Include a path column.
 * @returns {string} CSV document.
 */
function buildCsv(entries, includePaths) {
  const header = ['name', 'type', 'size_bytes', 'size', 'modified', 'isDirectory'];
  if (includePaths) header.push('path');

  const rows = entries.map((entry) => {
    const row = [
      entry.name,
      entry.isDirectory ? 'folder' : entry.kind || 'unknown',
      entry.isDirectory ? '' : entry.size || 0,
      entry.isDirectory ? '' : formatSize(entry.size),
      entry.modified ? new Date(entry.modified).toISOString() : '',
      entry.isDirectory ? 'true' : 'false',
    ];
    if (includePaths) row.push(entry.url || '');
    return row.map(csvCell).join(',');
  });

  return [header.join(','), ...rows].join(NEWLINE);
}

/**
 * Quote a CSV cell only when it would otherwise break the row.
 * @param {any} value - Cell value.
 * @returns {string} Escaped cell.
 */
function csvCell(value) {
  const text = value == null ? '' : String(value);
  const needsQuotes =
    text.includes(',') ||
    text.includes(DQUOTE) ||
    text.includes(NEWLINE) ||
    text.includes(CARRIAGE);

  if (!needsQuotes) return text;
  return DQUOTE + text.split(DQUOTE).join(DQUOTE + DQUOTE) + DQUOTE;
}

/**
 * Escape a Markdown table cell.
 * @param {string} value - Raw text.
 * @returns {string} Escaped text.
 */
export function escapeMarkdown(value) {
  return String(value ?? '').split(PIPE).join(BACKSLASH + PIPE);
}

/**
 * Right-pad a value to a fixed width.
 * @param {any} value - Value to pad.
 * @param {number} width - Target width.
 * @returns {string} Padded string.
 */
function pad(value, width) {
  const text = String(value ?? '');
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

/**
 * Build a timestamped report file name.
 * @param {string} title - Folder name.
 * @param {string} format - Report format.
 * @param {number} [now] - Reference timestamp.
 * @returns {string} File name such as `src-report-20260911-1430.txt`.
 */
export function reportFileName(title, format, now = Date.now()) {
  const safeTitle =
    String(title || 'folder')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'folder';

  const date = new Date(now);
  const stamp = [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
    '-',
    pad2(date.getHours()),
    pad2(date.getMinutes()),
  ].join('');

  return `${safeTitle}-report-${stamp}.${reportFormat(format).extension}`;
}

/**
 * @param {number} value - Number to pad.
 * @returns {string} Two-digit string.
 */
function pad2(value) {
  return String(value).padStart(2, '0');
}
