/**
 * Folder snapshots and comparison.
 *
 * A snapshot is a small JSON record of one folder listing: entry names, sizes,
 * and modified timestamps. Comparing two snapshots yields an exact diff —
 * added, removed, changed, and renamed entries plus byte deltas — so a user
 * can answer "what changed in here?" without a VCS.
 */

import { formatSize } from '../utils/format.js';

/** Current snapshot format version. */
export const SNAPSHOT_VERSION = 1;

/**
 * @typedef {import('../platform.js').FileEntry} FileEntry
 */

/**
 * Capture a snapshot record from a listing.
 *
 * @param {string} rootUrl - Folder url.
 * @param {string} title - Display title.
 * @param {FileEntry[]} entries - Flat listing (recursive when the scan was).
 * @param {{ recursive?: boolean }} [options] - Capture options.
 * @returns {{ version: number, created: number, rootUrl: string, title: string, recursive: boolean, entries: Array<{ name: string, size: number, modified: number, isDirectory: boolean }> }} Snapshot.
 */
export function captureSnapshot(rootUrl, title, entries, options = {}) {
  return {
    version: SNAPSHOT_VERSION,
    created: Date.now(),
    rootUrl,
    title: title || rootUrl,
    recursive: options.recursive === true,
    entries: (entries || []).map((entry) => ({
      name: entry.name,
      size: Number(entry.size) || 0,
      modified: Number(entry.modified) || 0,
      isDirectory: Boolean(entry.isDirectory),
    })),
  };
}

/**
 * Serialize a snapshot to a JSON string.
 * @param {ReturnType<typeof captureSnapshot>} snapshot - Snapshot.
 * @returns {string} JSON.
 */
export function serializeSnapshot(snapshot) {
  return JSON.stringify(snapshot);
}

/**
 * Parse a snapshot from JSON. Returns null for anything that is not a
 * readable snapshot rather than throwing.
 *
 * @param {string} json - Serialized snapshot.
 * @returns {ReturnType<typeof captureSnapshot>|null} Snapshot, or null.
 */
export function parseSnapshot(json) {
  try {
    const value = JSON.parse(json);
    if (!value || !Array.isArray(value.entries)) return null;
    return value;
  } catch {
    return null;
  }
}

/**
 * Compare two snapshots.
 *
 * @param {ReturnType<typeof captureSnapshot>} before - Older snapshot.
 * @param {ReturnType<typeof captureSnapshot>} after - Newer snapshot.
 * @returns {{
 *   added: Array<{ name: string, size: number, modified: number, isDirectory: boolean }>,
 *   removed: Array<{ name: string, size: number, modified: number, isDirectory: boolean }>,
 *   changed: Array<{ name: string, sizeBefore: number, sizeAfter: number, modifiedBefore: number, modifiedAfter: number }>,
 *   renamed: Array<{ from: string, to: string, size: number }>,
 *   bytesAdded: number, bytesRemoved: number,
 * }} Diff.
 */
export function compareSnapshots(before, after) {
  const beforeMap = indexEntries(before?.entries);
  const afterMap = indexEntries(after?.entries);

  /** @type {Array<{ name: string, size: number, modified: number, isDirectory: boolean }>} */
  const added = [];
  /** @type {Array<{ name: string, size: number, modified: number, isDirectory: boolean }>} */
  const removed = [];
  /** @type {Array<{ name: string, sizeBefore: number, sizeAfter: number, modifiedBefore: number, modifiedAfter: number }>} */
  const changed = [];

  for (const [name, entry] of afterMap) {
    const previous = beforeMap.get(name);
    if (!previous) {
      added.push(entry);
      continue;
    }
    if (previous.size !== entry.size || previous.modified !== entry.modified) {
      changed.push({
        name,
        sizeBefore: previous.size,
        sizeAfter: entry.size,
        modifiedBefore: previous.modified,
        modifiedAfter: entry.modified,
      });
    }
  }

  for (const [name, entry] of beforeMap) {
    if (!afterMap.has(name)) removed.push(entry);
  }

  // A rename is an entry that disappeared and one that appeared with the same
  // size (and near-same timestamp); pairing them avoids noisy add+remove rows.
  const renamed = pairRenames(added, removed);
  const remainingAdded = added.filter((entry) => !renamed.some((pair) => pair.to === entry.name));
  const remainingRemoved = removed.filter((entry) => !renamed.some((pair) => pair.from === entry.name));

  const bytesAdded = remainingAdded.reduce((sum, entry) => sum + (entry.size || 0), 0)
    + changed.reduce((sum, change) => sum + Math.max(0, change.sizeAfter - change.sizeBefore), 0);
  const bytesRemoved = remainingRemoved.reduce((sum, entry) => sum + (entry.size || 0), 0)
    + changed.reduce((sum, change) => sum + Math.max(0, change.sizeBefore - change.sizeAfter), 0);

  return {
    added: remainingAdded,
    removed: remainingRemoved,
    changed,
    renamed,
    bytesAdded,
    bytesRemoved,
  };
}

/**
 * Index snapshot entries by name.
 * @param {Array<{ name: string, size: number, modified: number, isDirectory: boolean }>} entries - Entries.
 * @returns {Map<string, { name: string, size: number, modified: number, isDirectory: boolean }>} Map.
 */
function indexEntries(entries) {
  const map = new Map();
  for (const entry of entries || []) {
    if (entry?.name) map.set(entry.name, entry);
  }
  return map;
}

/**
 * Pair adds and removes that look like renames: same size, modified within
 * two seconds, and each entry consumed at most once.
 *
 * @param {Array<{ name: string, size: number, modified: number, isDirectory: boolean }>} added - New entries.
 * @param {Array<{ name: string, size: number, modified: number, isDirectory: boolean }>} removed - Gone entries.
 * @returns {Array<{ from: string, to: string, size: number }>} Rename pairs.
 */
function pairRenames(added, removed) {
  /** @type {Array<{ from: string, to: string, size: number }>} */
  const pairs = [];
  const usedRemoved = new Set();

  for (const entry of added) {
    let best = null;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (const candidate of removed) {
      if (usedRemoved.has(candidate.name)) continue;
      if (candidate.isDirectory || entry.isDirectory) continue;
      if (candidate.size !== entry.size) continue;

      const delta = Math.abs((candidate.modified || 0) - (entry.modified || 0));
      if (delta <= 2000 && delta < bestDelta) {
        best = candidate;
        bestDelta = delta;
      }
    }

    if (best) {
      usedRemoved.add(best.name);
      pairs.push({ from: best.name, to: entry.name, size: entry.size });
    }
  }

  return pairs;
}

/**
 * Human-readable multi-line diff summary.
 *
 * @param {ReturnType<typeof captureSnapshot>} before - Older snapshot.
 * @param {ReturnType<typeof compareSnapshots>} diff - Computed diff.
 * @param {string} afterTitle - Label for the current state.
 * @returns {string} Report text.
 */
export function formatDiffReport(before, diff, afterTitle = 'now') {
  const lines = [];
  const title = before?.title || 'folder';

  lines.push(`Snapshot diff — ${title}`);
  lines.push(`Before: ${new Date(before?.created || 0).toLocaleString()}`);
  lines.push(`After:  ${afterTitle} (${new Date().toLocaleString()})`);
  lines.push('');

  lines.push(
    `Added: ${diff.added.length} (+${formatSize(diff.bytesAdded)}) · `
    + `Removed: ${diff.removed.length} (−${formatSize(diff.bytesRemoved)}) · `
    + `Changed: ${diff.changed.length} · Renamed: ${diff.renamed.length}`,
  );

  const section = (heading, rows) => {
    if (!rows.length) return;
    lines.push('');
    lines.push(`${heading}:`);
    for (const row of rows.slice(0, 100)) lines.push(`  ${row}`);
  };

  section('Added', diff.added.map((entry) => `${entry.isDirectory ? '[dir] ' : ''}${entry.name} (${formatSize(entry.size)})`));
  section('Removed', diff.removed.map((entry) => `${entry.isDirectory ? '[dir] ' : ''}${entry.name} (${formatSize(entry.size)})`));
  section('Renamed', diff.renamed.map((pair) => `${pair.from} → ${pair.to}`));
  section('Changed', diff.changed.map((change) =>
    `${change.name} ${formatSize(change.sizeBefore)} → ${formatSize(change.sizeAfter)}`));

  return lines.join('\n');
}
