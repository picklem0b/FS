/**
 * Folder export — bundles a folder tree into a ZIP.
 *
 * Uses the store-only writer in `zip.js`: entries are copied byte for byte,
 * which is fast enough for folder-sized archives and keeps the bundle free of
 * a deflate implementation.
 */

import { createZip } from './zip.js';

/**
 * @typedef {import('../platform.js').FileEntry} FileEntry
 */

/** Default cap on total exported bytes. */
export const MAX_EXPORT_BYTES = 96 * 1024 * 1024;

/** Default cap on exported file count. */
export const MAX_EXPORT_FILES = 2000;

/**
 * Read one file's bytes.
 * @param {any} source - Source adapter with readBytes.
 * @param {string} url - File url.
 * @returns {Promise<Uint8Array|null>} Bytes, or null when unreadable.
 */
async function readBytes(source, url) {
  if (typeof source?.readBytes !== 'function') return null;
  try {
    const buffer = await source.readBytes(url);
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

/**
 * Collect files from a tree, breadth-first, honouring caps.
 *
 * @param {import('../fs/access.js').FolderAccess} access - Folder accessor.
 * @param {string} rootUrl - Folder to export.
 * @param {{ maxDepth?: number, maxFiles?: number, maxBytes?: number }} [options] - Caps.
 * @returns {Promise<{ files: Array<{ entry: FileEntry, path: string }>, truncated: boolean, totalBytes: number }>} Collected files with archive-relative paths.
 */
export async function collectExportFiles(access, rootUrl, options = {}) {
  const maxDepth = Math.max(0, Number(options.maxDepth) || 6);
  const maxFiles = Math.max(1, Number(options.maxFiles) || MAX_EXPORT_FILES);
  const maxBytes = Math.max(1, Number(options.maxBytes) || MAX_EXPORT_BYTES);

  /** @type {Array<{ entry: FileEntry, path: string }>} */
  const files = [];
  /** @type {Array<{ url: string, path: string, depth: number }>} */
  const queue = [{ url: rootUrl, path: '', depth: 0 }];
  let totalBytes = 0;
  let truncated = false;

  while (queue.length) {
    const dir = /** @type {{ url: string, path: string, depth: number }} */ (queue.shift());

    let entries = [];
    try {
      entries = await access.scan(dir.url, {});
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) {
        truncated = true;
        queue.length = 0;
        break;
      }

      const path = dir.path ? `${dir.path}/${entry.name}` : entry.name;

      if (entry.isDirectory) {
        if (dir.depth < maxDepth) {
          queue.push({ url: entry.url, path, depth: dir.depth + 1 });
        }
        continue;
      }

      const size = Number(entry.size) || 0;
      if (totalBytes + size > maxBytes) {
        truncated = true;
        queue.length = 0;
        break;
      }

      totalBytes += size;
      files.push({ entry, path });
    }
  }

  return { files, truncated, totalBytes };
}

/**
 * Export a folder tree as ZIP bytes.
 *
 * @param {import('../fs/access.js').FolderAccess} access - Folder accessor.
 * @param {any} source - Source adapter with readBytes.
 * @param {string} rootUrl - Folder to export.
 * @param {{ maxDepth?: number, maxFiles?: number, maxBytes?: number, onProgress?: (done: number, total: number) => void }} [options] - Options.
 * @returns {Promise<{ ok: boolean, bytes?: Uint8Array, count?: number, truncated?: boolean, message?: string }>} Result.
 */
export async function exportFolderAsZip(access, source, rootUrl, options = {}) {
  if (!rootUrl) return { ok: false, message: 'No folder to export' };

  const { files, truncated, totalBytes } = await collectExportFiles(access, rootUrl, options);

  if (!files.length) {
    return { ok: false, message: truncated ? 'Folder exceeds the export limits' : 'Folder is empty' };
  }

  /** @type {Array<{ name: string, bytes: Uint8Array, modified?: number }>} */
  const entries = [];
  let done = 0;

  for (const { entry, path } of files) {
    const bytes = await readBytes(source, entry.url);
    done++;
    options.onProgress?.(done, files.length);

    // Unreadable files are skipped rather than failing the whole archive.
    if (!bytes) continue;
    entries.push({ name: path, bytes, modified: entry.modified });
  }

  if (!entries.length) {
    return { ok: false, message: 'No files could be read for the archive' };
  }

  const bytes = createZip(entries);
  return { ok: true, bytes, count: entries.length, truncated, totalBytes };
}
