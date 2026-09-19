/**
 * Source adapters.
 *
 * A source exposes a small, uniform contract over a storage backend:
 * `list`, `stat`, `readText`, `readBytes`, `displayUrl`, plus write operations
 * when the backend supports them. `FolderAccess` and the action layer only ever
 * talk to this contract.
 */

import { mimeForName } from '../platform.js';
import { fileKind } from '../utils/format.js';

/**
 * Wrap an {@link import('../platform.js').AcodeFileSystem} as a source.
 * @param {any} fs - AcodeFileSystem instance.
 * @returns {any} File source backed by the device file system.
 */
export function createAcodeSource(fs) {
  return {
    async list(dirUrl, options = {}) {
      const { withStats = true, onProgress } = options;
      const entries = withStats
        ? await fs.listWithStats(dirUrl, { onProgress })
        : await fs.list(dirUrl);

      return entries.map((entry) => ({
        ...entry,
        kind: fileKind(entry.name, entry.mime, entry.isDirectory),
      }));
    },

    stat: (url) => fs.stat(url),
    readText: (url) => fs.readText(url),
    readBytes: (url) => fs.readBytes(url),
    displayUrl: (url) => fs.displayUrl(url),
    rename: (url, name) => fs.rename(url, name),
    move: (url, destination) => fs.move(url, destination),
    copy: (url, destination) => fs.copy(url, destination),
    remove: (url) => fs.remove(url),
    createFile: (dirUrl, name, content) => fs.createFile(dirUrl, name, content),
    createDirectory: (dirUrl, name) => fs.createDirectory(dirUrl, name),
    openInEditor: (entry) => fs.openInEditor(entry),
  };
}

/**
 * In-memory source for tests and for previewing a captured listing.
 *
 * Entries are keyed by url; `list(url)` returns the direct children.
 *
 * @param {Array<Record<string, any>>} entries - Flat entry list.
 * @returns {any} File source backed by memory.
 */
export function createMemorySource(entries = []) {
  const byUrl = new Map();
  const contents = new Map();

  for (const entry of entries) {
    const url = entry.url || entry.path;
    if (!url) continue;

    const name = entry.name || url.split('/').filter(Boolean).pop() || url;
    const isDirectory = Boolean(entry.isDirectory);

    byUrl.set(url, {
      name,
      url,
      parent: entry.parent || url.split('/').slice(0, -1).join('/'),
      isFile: !isDirectory,
      isDirectory,
      isLink: Boolean(entry.isLink),
      size: Number(entry.size) || 0,
      modified: Number(entry.modified ?? entry.modifiedDate) || 0,
      mime: entry.mime ?? mimeForName(name),
      kind: fileKind(name, entry.mime ?? mimeForName(name), isDirectory),
      raw: entry,
    });

    if (typeof entry.content === 'string') contents.set(url, entry.content);
  }

  /** @param {string} url */
  const normalize = (url) => (url.endsWith('/') && url.length > 1 ? url.slice(0, -1) : url);

  return {
    async list(dirUrl) {
      const base = normalize(dirUrl);
      const prefix = base === '/' ? '/' : `${base}/`;
      const out = [];

      for (const [url, entry] of byUrl) {
        if (url === base || !url.startsWith(prefix)) continue;
        const rest = url.slice(prefix.length);
        if (rest.includes('/')) continue;
        out.push({ ...entry });
      }

      return out;
    },

    async stat(url) {
      const entry = byUrl.get(normalize(url));
      if (!entry) throw new Error(`Not found: ${url}`);
      return {
        name: entry.name,
        isFile: entry.isFile,
        isDirectory: entry.isDirectory,
        size: entry.size,
        modified: entry.modified,
        canRead: true,
        canWrite: true,
        mime: entry.mime,
      };
    },

    async readText(url) {
      const value = contents.get(normalize(url));
      if (value == null) throw new Error(`No text content for ${url}`);
      return value;
    },

    async readBytes(url) {
      const value = contents.get(normalize(url));
      if (value == null) throw new Error(`No binary content for ${url}`);
      return new TextEncoder().encode(value).buffer;
    },

    async displayUrl(url) {
      return contents.has(normalize(url)) ? `memory://${url}` : null;
    },

    async remove(url) {
      byUrl.delete(normalize(url));
      contents.delete(normalize(url));
    },

    async rename(url, name) {
      const entry = byUrl.get(normalize(url));
      if (!entry) throw new Error(`Not found: ${url}`);
      byUrl.delete(entry.url);
      const next = entry.url.replace(/[^/]*$/, name);
      byUrl.set(next, { ...entry, name, url: next });
      return next;
    },
  };
}

/**
 * Build a source from a declarative config. Kept for callers that describe
 * their backend rather than passing one in.
 *
 * @param {{ type: 'acode'|'memory', fs?: any, entries?: any[] }} config - Source config.
 * @returns {any} File source.
 */
export function createSource(config) {
  const { type, fs, entries } = config;

  if (type === 'memory') return createMemorySource(entries || []);
  if (type === 'acode') {
    if (!fs) throw new Error('createSource({ type: "acode" }) requires an fs instance');
    return createAcodeSource(fs);
  }

  throw new Error(`Unknown source type: ${type}`);
}
