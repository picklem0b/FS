/**
 * Storage analyzer.
 *
 * Walks a folder tree once and aggregates sizes so the UI can show where the
 * bytes actually live: which subfolders and files dominate, with rollups for
 * every directory along the way.
 */

/**
 * @typedef {import('../platform.js').FileEntry} FileEntry
 */

/**
 * @typedef {Object} DirRollup
 * @property {string} url - Directory url.
 * @property {string|null} parent - Parent directory url, or null for the root.
 * @property {string} name - Directory name.
 * @property {number} depth - Distance from the analyzed root.
 * @property {number} own - Bytes of files directly inside.
 * @property {number} total - Bytes of everything beneath, including own.
 */

/**
 * @typedef {Object} AnalysisResult
 * @property {string} rootUrl - Analyzed root.
 * @property {number} totalSize - Total bytes under the root.
 * @property {number} fileCount - Files found.
 * @property {number} folderCount - Folders found.
 * @property {number} truncated - Whether the entry cap stopped the walk.
 * @property {Map<string, number>} dirTotals - Rolled-up bytes per directory url.
 * @property {DirRollup[]} directories - Rollups, deepest first during rollup.
 * @property {FileEntry[]} rootFiles - Files directly inside the analyzed root.
 * @property {FileEntry[]} largestFiles - Largest files, biggest first.
 */

/**
 * Aggregate folder sizes across a whole tree.
 *
 * @param {import('../fs/access.js').FolderAccess} access - Folder accessor.
 * @param {string} rootUrl - Directory to analyze.
 * @param {{ maxDepth?: number, maxEntries?: number, largest?: number, onProgress?: (done: number) => void }} [options] - Options.
 * @returns {Promise<AnalysisResult>} Analysis.
 */
export async function analyzeTree(access, rootUrl, options = {}) {
  // `|| fallback` would swallow a deliberate 0, so check finiteness instead.
  const requestedDepth = Number(options.maxDepth);
  const maxDepth = Number.isFinite(requestedDepth) ? Math.max(0, Math.floor(requestedDepth)) : 6;
  const maxEntries = Math.max(1, Number(options.maxEntries) || 5000);
  const largest = Math.max(1, Number(options.largest) || 15);

  /** @type {DirRollup[]} */
  const directories = [];
  /** @type {Map<string, DirRollup>} */
  const byUrl = new Map();
  /** @type {FileEntry[]} */
  const files = [];
  /** @type {FileEntry[]} */
  const rootFiles = [];

  let fileCount = 0;
  let folderCount = 0;
  let visited = 0;
  let truncated = false;

  /** @type {Array<{ url: string, parent: string|null, name: string, depth: number }>} */
  const queue = [{ url: rootUrl, parent: null, name: '', depth: 0 }];
  /** @type {Set<string>} */
  const seen = new Set();

  while (queue.length) {
    const dir = /** @type {{ url: string, parent: string|null, name: string, depth: number }} */ (queue.shift());
    if (seen.has(dir.url)) continue;
    seen.add(dir.url);

    let entries = [];
    try {
      entries = await access.scan(dir.url, {});
    } catch {
      continue; // unreadable folders contribute nothing
    }

    visited += entries.length;
    if (visited >= maxEntries) truncated = true;

    const rollup = {
      url: dir.url,
      parent: dir.parent,
      name: dir.name || lastSegment(dir.url),
      depth: dir.depth,
      own: 0,
      total: 0,
    };
    directories.push(rollup);
    byUrl.set(dir.url, rollup);

    for (const entry of entries) {
      if (entry.isDirectory) {
        folderCount++;
        if (dir.depth < maxDepth && !seen.has(entry.url)) {
          queue.push({ url: entry.url, parent: dir.url, name: entry.name, depth: dir.depth + 1 });
        }
        continue;
      }

      fileCount++;
      const size = Number(entry.size) || 0;
      rollup.own += size;
      files.push(entry);
      if (dir.depth === 0) rootFiles.push(entry);
    }

    options.onProgress?.(visited);

    if (truncated) {
      // Drain the queue without scanning more folders.
      queue.length = 0;
    }
  }

  // Roll child totals into parents, deepest directories first.
  directories.sort((a, b) => b.depth - a.depth);
  for (const rollup of directories) {
    rollup.total = rollup.own;
    if (rollup.parent && byUrl.has(rollup.parent)) {
      byUrl.get(rollup.parent).own += 0; // no-op; keeps the shape explicit
    }
  }
  for (const rollup of directories) {
    if (rollup.parent && byUrl.has(rollup.parent)) {
      byUrl.get(rollup.parent).total = (byUrl.get(rollup.parent).total || 0) + rollup.total;
    }
  }

  // Root was seeded with total = own; after rollup it is the grand total.
  const rootRollup = byUrl.get(rootUrl);
  const totalSize = rootRollup ? rootRollup.total : 0;

  files.sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0));

  return {
    rootUrl,
    totalSize,
    fileCount,
    folderCount,
    truncated,
    dirTotals: new Map(directories.map((rollup) => [rollup.url, rollup.total])),
    directories,
    rootFiles,
    largestFiles: files.slice(0, largest),
  };
}

/**
 * Bytes attributable to each direct child of the analyzed root.
 *
 * @param {AnalysisResult} analysis - Result from {@link analyzeTree}.
 * @param {FileEntry[]} rootEntries - Direct children of the root.
 * @returns {Array<{ entry: FileEntry, bytes: number }>} Children with sizes, biggest first.
 */
export function breakdownForChildren(analysis, rootEntries) {
  const rows = (rootEntries || []).map((entry) => ({
    entry,
    bytes: entry.isDirectory
      ? analysis.dirTotals.get(entry.url) || 0
      : Number(entry.size) || 0,
  }));

  rows.sort((a, b) => b.bytes - a.bytes);
  return rows;
}

/**
 * @param {string} url - Any url.
 * @returns {string} Last path segment.
 */
function lastSegment(url) {
  const parts = String(url || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || url;
}
