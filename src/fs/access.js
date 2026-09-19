/**
 * FolderAccess — the single entry point for reading a folder.
 *
 * It wraps a *source* (see `source.js`) so the rest of the plugin never cares
 * whether entries come from the device file system or an in-memory fixture.
 */

import { fileKind } from '../utils/format.js';

/**
 * @typedef {import('../platform.js').FileEntry} FileEntry
 */

/**
 * @typedef {Object} FileSource
 * @property {(dirUrl: string, options?: { withStats?: boolean, onProgress?: (done: number, total: number) => void }) => Promise<FileEntry[]>} list
 * @property {(url: string) => Promise<any>} [stat]
 * @property {(url: string) => Promise<string>} [readText]
 * @property {(url: string) => Promise<ArrayBuffer>} [readBytes]
 * @property {(url: string) => Promise<string|null>} [displayUrl]
 * @property {(url: string, name: string) => Promise<string>} [rename]
 * @property {(url: string, destination: string) => Promise<string>} [move]
 * @property {(url: string, destination: string) => Promise<string>} [copy]
 * @property {(url: string) => Promise<void>} [remove]
 * @property {(entry: FileEntry) => boolean} [openInEditor]
 */

/** @type {FileEntry[]} */
const EMPTY = [];

export class FolderAccess {
  /**
   * @param {FileSource} source - Backing source adapter.
   * @param {{ cache?: boolean }} [options] - Access options.
   */
  constructor(source, options = {}) {
    if (!source || typeof source.list !== 'function') {
      throw new TypeError('FolderAccess requires a source with a list() method');
    }

    this.source = source;
    this.caching = options.cache !== false;
    /** @type {Map<string, FileEntry[]>} */
    this.cache = new Map();
    /** @type {Map<string, Promise<FileEntry[]>>} */
    this.inflight = new Map();
  }

  /**
   * List a directory.
   *
   * Concurrent calls for the same directory share one in-flight request, so
   * double-tapping a folder does not scan it twice.
   *
   * @param {string} dirUrl - Directory url.
   * @param {{ withStats?: boolean, force?: boolean, onProgress?: (done: number, total: number) => void }} [options] - Scan options.
   * @returns {Promise<FileEntry[]>} Classified entries.
   */
  async scan(dirUrl, options = {}) {
    if (!dirUrl) return EMPTY;

    const { withStats = true, force = false, onProgress } = options;
    const key = `${withStats ? 'meta' : 'plain'}:${dirUrl}`;

    if (this.caching && !force && this.cache.has(key)) {
      return this.cache.get(key);
    }
    if (this.inflight.has(key)) return this.inflight.get(key);

    const task = (async () => {
      const entries = await this.source.list(dirUrl, { withStats, onProgress });
      const classified = (entries || []).map((entry) => this.classify(entry));

      if (this.caching) this.cache.set(key, classified);
      return classified;
    })();

    this.inflight.set(key, task);

    try {
      return await task;
    } finally {
      this.inflight.delete(key);
    }
  }

  /**
   * Read metadata for a single entry.
   * @param {string} url - Entry url.
   * @returns {Promise<any>} Stat result.
   */
  async stat(url) {
    if (!this.source.stat) throw new Error('Source does not support stat()');
    return await this.source.stat(url);
  }

  /**
   * Drop cached listings. Pass a directory to invalidate one, omit it to clear all.
   * @param {string} [dirUrl] - Directory url.
   */
  invalidate(dirUrl) {
    if (!dirUrl) {
      this.cache.clear();
      return;
    }
    for (const key of [...this.cache.keys()]) {
      if (key.endsWith(dirUrl)) this.cache.delete(key);
    }
  }

  /**
   * Attach a display kind to a raw entry.
   * @param {FileEntry} entry - Entry to classify.
   * @returns {FileEntry} The same entry, classified.
   */
  classify(entry) {
    entry.kind = fileKind(entry.name, entry.mime, entry.isDirectory);
    return entry;
  }
}

/**
 * @param {FileSource} source - Backing source.
 * @param {{ cache?: boolean }} [options] - Options.
 * @returns {FolderAccess} New access instance.
 */
export function createFolderAccess(source, options = {}) {
  return new FolderAccess(source, options);
}
