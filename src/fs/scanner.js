/**
 * FolderScanner — turns a folder (optionally recursively) into a filtered list.
 *
 * The recursive walk is breadth-first with an explicit depth limit and a hard
 * entry cap, so pointing it at a huge tree cannot exhaust memory or block the
 * UI thread indefinitely.
 */

import {
  makePatternMatcher,
  isCleanupCandidate,
  duplicateNameGroup,
} from '../utils/patterns.js';

/**
 * @typedef {import('../platform.js').FileEntry} FileEntry
 */

export class FolderScanner {
  /**
   * @param {import('./access.js').FolderAccess} access - Folder accessor.
   * @param {Object} [settings] - Scanner settings.
   * @param {string[]} [settings.ignoreList] - Extra ignore globs.
   * @param {number} [settings.maxFiles] - Hard cap on returned entries.
   * @param {number} [settings.maxDepth] - Recursion depth cap.
   */
  constructor(access, settings = {}) {
    this.access = access;
    this.setIgnoreList(settings.ignoreList || []);
    this.maxFiles = Math.max(1, Number(settings.maxFiles) || 5000);
    this.maxDepth = Math.max(0, Number(settings.maxDepth) || 5);
  }

  /**
   * @param {string[]} list - Ignore globs.
   */
  setIgnoreList(list) {
    this.matcher = makePatternMatcher(list || []);
  }

  /**
   * @param {number} limit - Hard cap on returned entries.
   */
  setMaxFiles(limit) {
    this.maxFiles = Math.max(1, Math.floor(Number(limit) || 1));
  }

  /**
   * @param {number} depth - Maximum recursion depth.
   */
  setMaxDepth(depth) {
    this.maxDepth = Math.max(0, Math.floor(Number(depth) || 0));
  }

  /**
   * Collect entries from a folder.
   *
   * @param {string} root - Root directory url.
   * @param {Object} [options] - Scan options.
   * @param {boolean} [options.recursive] - Walk subdirectories.
   * @param {boolean} [options.hideIgnored] - Apply the ignore matcher.
   * @param {boolean} [options.includeFolders] - Include directories.
   * @param {boolean} [options.includeFiles] - Include files.
   * @param {number} [options.maxDepth] - Override the depth cap.
   * @param {number} [options.limit] - Override the entry cap.
   * @param {(done: number, total: number) => void} [options.onProgress] - Progress callback.
   * @returns {Promise<FileEntry[]>} Matching entries.
   */
  async getFiles(root, options = {}) {
    const {
      recursive = false,
      hideIgnored = true,
      includeFolders = true,
      includeFiles = true,
      maxDepth = this.maxDepth,
      limit = this.maxFiles,
      onProgress,
    } = options;

    if (!root) return [];

    /** @type {FileEntry[]} */
    const results = [];
    /** @type {Array<{ url: string, depth: number }>} */
    const queue = [{ url: root, depth: 0 }];
    let scanned = 0;

    while (queue.length && results.length < limit) {
      const { url, depth } = /** @type {{ url: string, depth: number }} */ (queue.shift());
      let entries;

      try {
        entries = await this.access.scan(url, { onProgress });
      } catch (err) {
        // A folder we cannot read must not abort the whole scan.
        console.warn(`[FolderScanner] Cannot read ${url}`, err);
        continue;
      }

      scanned += entries.length;

      for (const entry of entries) {
        if (results.length >= limit) break;

        if (hideIgnored && this.matcher.matches(entry.name)) continue;
        if (entry.isDirectory && !includeFolders) continue;
        if (entry.isFile && !includeFiles) continue;

        results.push(entry);

        if (recursive && entry.isDirectory && depth < maxDepth) {
          queue.push({ url: entry.url, depth: depth + 1 });
        }
      }
    }

    if (results.length >= limit && queue.length) {
      console.warn(`[FolderScanner] Result cap of ${limit} reached after ${scanned} entries`);
    }

    return results;
  }

  /**
   * @param {string} root - Root directory url.
   * @param {Object} [options] - Scan options.
   * @returns {Promise<FileEntry[]>} Files only.
   */
  async getFilesOnly(root, options = {}) {
    return this.getFiles(root, { ...options, includeFolders: false });
  }

  /**
   * @param {string} root - Root directory url.
   * @param {Object} [options] - Scan options.
   * @returns {Promise<FileEntry[]>} Directories only.
   */
  async getFoldersOnly(root, options = {}) {
    return this.getFiles(root, { ...options, includeFiles: false });
  }

  /**
   * @param {string} root - Root directory url.
   * @param {Object} [options] - Scan options.
   * @returns {Promise<FileEntry[]>} Entries that look safe to clean up.
   */
  async getCleanupCandidates(root, options = {}) {
    const files = await this.getFilesOnly(root, options);
    return files.filter((file) => isCleanupCandidate(file.name, 'file'));
  }

  /**
   * @param {string} root - Root directory url.
   * @param {Object} [options] - Scan options.
   * @returns {Promise<FileEntry[][]>} Groups of entries sharing a base name.
   */
  async getDuplicates(root, options = {}) {
    const files = await this.getFilesOnly(root, options);
    return duplicateNameGroup(files);
  }

  /**
   * @param {string} root - Root directory url.
   * @param {Object} [options] - Scan options.
   * @returns {Promise<FileEntry[]>} A fresh scan that bypasses the access cache.
   */
  async refresh(root, options = {}) {
    this.access.invalidate(root);
    return this.getFiles(root, options);
  }
}
