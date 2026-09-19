/**
 * Acode platform bridge.
 *
 * Every host API is reached through a guarded accessor so a missing or renamed
 * module on an older Acode build degrades into a clear error instead of a boot
 * crash. Nothing else in the plugin touches `acode.*` directly.
 */

/**
 * @typedef {Object} FileEntry
 * @property {string} name
 * @property {string} url
 * @property {string} parent
 * @property {boolean} isFile
 * @property {boolean} isDirectory
 * @property {boolean} isLink
 * @property {number} size
 * @property {number} modified
 * @property {string|null} mime
 * @property {string} kind
 * @property {any} raw
 */

/** @returns {any} The Acode host object, or null outside Acode. */
export function getHost() {
  return typeof window !== 'undefined' && window.acode ? window.acode : null;
}

/** @returns {boolean} True when running inside Acode. */
export function isHostAvailable() {
  return Boolean(getHost());
}

/**
 * Resolve an Acode module or global by name.
 * @param {string} name - Module name, e.g. `fs`, `fileindex`.
 * @returns {any} The module, or null when unavailable.
 */
export function req(name) {
  const host = getHost();
  if (!host || typeof host.require !== 'function') return null;
  try {
    return host.require(name) || null;
  } catch {
    return null;
  }
}

/** @returns {any} The Acode `fs`/`fsOperation` factory, or null. */
export function getFsFactory() {
  return req('fs') || req('fsoperation');
}

/** @returns {any} The global editor manager, or null. */
export function getEditorManager() {
  return (typeof window !== 'undefined' && window.editorManager) || null;
}

/* ------------------------------------------------------------------ *
 * Concurrency
 * ------------------------------------------------------------------ */

/**
 * Run an async mapper over items with a bounded number of workers.
 * @template T, R
 * @param {T[]} items - Input items.
 * @param {number} limit - Maximum concurrent tasks.
 * @param {(item: T, index: number) => Promise<R>} mapper - Async mapper.
 * @returns {Promise<R[]>} Results in input order.
 */
export async function mapLimit(items, limit, mapper) {
  const list = items || [];
  const size = Math.max(1, Math.min(Number(limit) || 1, list.length || 1));
  const results = new Array(list.length);
  let cursor = 0;

  async function worker() {
    while (cursor < list.length) {
      const index = cursor++;
      results[index] = await mapper(list[index], index);
    }
  }

  await Promise.all(Array.from({ length: size }, worker));
  return results;
}

/* ------------------------------------------------------------------ *
 * Layout / environment
 * ------------------------------------------------------------------ */

/**
 * Describe the current layout so the UI can pick mobile or desktop chrome.
 *
 * `auto` uses the viewport width: a phone in portrait or landscape gets the
 * full-screen sheet, a tablet or desktop window gets the docked panel.
 *
 * @param {'auto'|'mobile'|'desktop'} [mode] - User override from settings.
 * @returns {{ mode: 'mobile'|'desktop', width: number, height: number, desktopMode: boolean, touch: boolean }}
 */
export function getLayoutContext(mode = 'auto') {
  const width = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const height = typeof window !== 'undefined' ? window.innerHeight : 768;

  const settings = req('settings');
  const desktopMode = Boolean(settings?.value?.desktopMode);
  const touch =
    typeof window !== 'undefined' &&
    (Boolean(window.matchMedia?.('(pointer: coarse)').matches) || 'ontouchstart' in window);

  const resolved =
    mode === 'mobile' || mode === 'desktop'
      ? mode
      : width >= 820
        ? 'desktop'
        : 'mobile';

  return { mode: resolved, width, height, desktopMode, touch };
}

/**
 * Subscribe to host resize events plus native window resizes.
 * @param {() => void} listener - Called whenever the viewport may have changed.
 * @returns {() => void} Unsubscribe function.
 */
export function onResize(listener) {
  const resize = req('windowresize');
  const handler = () => listener();

  if (resize && typeof resize.on === 'function') resize.on('resize', handler);
  window.addEventListener('resize', handler);
  window.addEventListener('orientationchange', handler);

  return () => {
    if (resize && typeof resize.off === 'function') resize.off('resize', handler);
    window.removeEventListener('resize', handler);
    window.removeEventListener('orientationchange', handler);
  };
}

/* ------------------------------------------------------------------ *
 * Dialog helpers
 * ------------------------------------------------------------------ */

/** @param {string} message - Toast text. */
export function toast(message) {
  const host = getHost();
  try {
    if (typeof window !== 'undefined' && typeof window.toast === 'function') {
      window.toast(message);
      return;
    }
    if (host && typeof host.pushNotification === 'function') {
      host.pushNotification('FS', message);
      return;
    }
  } catch {
    /* fall through */
  }
  console.log(`[FS] ${message}`);
}

/**
 * @param {string} title - Dialog title.
 * @param {string} [message] - Dialog body.
 * @returns {Promise<boolean>} Whether the user confirmed.
 */
export async function confirm(title, message = '') {
  const dialog = req('confirm');
  if (!dialog) return false;
  try {
    return Boolean(await dialog(title, message));
  } catch {
    return false;
  }
}

/**
 * @param {string} message - Prompt label.
 * @param {string} [defaultValue] - Initial value.
 * @param {string} [type] - Input type.
 * @returns {Promise<string|null>} Entered value, or null when cancelled.
 */
export async function prompt(message, defaultValue = '', type = 'text') {
  const dialog = req('prompt');
  if (!dialog) return null;
  try {
    const value = await dialog(message, defaultValue, type, {
      required: true,
      placeholder: defaultValue,
    });
    return value == null ? null : String(value);
  } catch {
    return null;
  }
}

/**
 * @param {string} title - Sheet title.
 * @param {Array<string|{value:string,text:string,icon?:string,disabled?:boolean}>} items - Options.
 * @param {string} [defaultValue] - Pre-selected value.
 * @returns {Promise<string|null>} Selected value, or null when dismissed.
 */
export async function select(title, items, defaultValue) {
  const dialog = req('select');
  if (!dialog) return null;
  try {
    const value = await dialog(title, items, { default: defaultValue });
    return value == null ? null : String(value);
  } catch {
    return null;
  }
}

/**
 * Show the host blocking loader with an auto-dismiss timeout.
 * @param {string} title - Loader title.
 * @param {string} [message] - Loader message.
 * @param {number} [timeout] - Auto-dismiss in ms.
 * @returns {{ hide: () => void }} Handle used to dismiss early.
 */
export function showLoader(title, message = '', timeout = 15000) {
  const loader = req('loader');
  const hide = () => {
    try {
      loader?.destroy?.();
    } catch {
      /* ignore */
    }
  };

  try {
    loader?.create?.(title, message, { timeout, callback: hide });
  } catch {
    /* ignore */
  }

  return { hide };
}

/* ------------------------------------------------------------------ *
 * Workspace roots and pickers
 * ------------------------------------------------------------------ */

/**
 * @typedef {Object} WorkspaceRoot
 * @property {string} url
 * @property {string} title
 */

/**
 * Folders currently open in the Acode sidebar, plus any indexed roots.
 * @returns {Promise<WorkspaceRoot[]>} Deduplicated roots.
 */
export async function getWorkspaceRoots() {
  const roots = [];
  const seen = new Set();

  /** @param {string} url @param {string} title */
  const push = (url, title) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    roots.push({ url, title: title || url.split('/').filter(Boolean).pop() || url });
  };

  const added = typeof window !== 'undefined' ? window.addedFolder : null;
  if (Array.isArray(added)) {
    for (const folder of added) push(folder?.url, folder?.title);
  }

  if (!roots.length) {
    const index = req('fileindex');
    if (index && typeof index.query === 'function') {
      try {
        const result = await index.query({ includeDirectories: true, limit: 1000 });
        for (const entry of result?.entries || []) {
          if (entry.isDirectory && entry.path === entry.name) {
            push(entry.rootUrl || entry.url, entry.name);
          }
        }
      } catch {
        /* no index available */
      }
    }
  }

  return roots;
}

/**
 * Ask the user to choose a folder.
 * @returns {Promise<WorkspaceRoot|null>} Selected folder, or null.
 */
export async function pickFolder() {
  const browser = req('filebrowser');
  if (!browser) return null;
  try {
    const selected = await browser('folder', 'Choose a folder to inspect', true);
    if (!selected?.url) return null;
    return { url: selected.url, title: selected.name || selected.url };
  } catch {
    return null;
  }
}

/**
 * Ask the user to choose a destination folder (used by batch move/copy).
 * @returns {Promise<string|null>} Destination url, or null.
 */
export async function pickDestination() {
  const folder = await pickFolder();
  return folder ? folder.url : null;
}

/**
 * Hand a url to an external or in-app browser.
 *
 * Used to open a generated HTML report as a real page. Acode's system helper
 * lives in a bundled plugin, so it is resolved defensively.
 *
 * @param {string} url - Url to open.
 * @returns {boolean} Whether a browser was launched.
 */
export function openExternal(url) {
  if (!url) return false;

  // The system helper ships as a bundled plugin, so resolve it defensively:
  // first through the module registry, then as a global.
  const helper =
    req('system') || /** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis.system : null);

  try {
    if (helper && typeof helper.openInBrowser === 'function') {
      helper.openInBrowser(url);
      return true;
    }
    if (helper && typeof helper.inAppBrowser === 'function') {
      helper.inAppBrowser(url, 'Folder report', true);
      return true;
    }
  } catch (err) {
    console.warn('[FS] Could not open the report in a browser', err);
  }

  return false;
}

/**
 * App-private storage, used for generated files that should not be written
 * into the folder the user is inspecting.
 * @returns {string|null} Storage url, or null when unavailable.
 */
export function getDataStorageUrl() {
  try {
    if (typeof DATA_STORAGE === 'string' && DATA_STORAGE) return DATA_STORAGE;
    if (typeof CACHE_STORAGE === 'string' && CACHE_STORAGE) return CACHE_STORAGE;
  } catch {
    /* not running inside Acode */
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * File system adapter
 * ------------------------------------------------------------------ */

/** MIME types inferred from common extensions, used for previews. */
const MIME_BY_EXTENSION = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
  svg: 'image/svg+xml',
};

/**
 * @param {string} name - File name.
 * @returns {string|null} Inferred MIME type.
 */
export function mimeForName(name) {
  const dot = String(name || '').lastIndexOf('.');
  if (dot < 0) return null;
  return MIME_BY_EXTENSION[String(name).slice(dot + 1).toLowerCase()] || null;
}

/**
 * Thin, promise-based wrapper over Acode's `fs` factory.
 *
 * Metadata is expensive on Android (one host round-trip per entry), so callers
 * batch through {@link AcodeFileSystem.listWithStats} which bounds concurrency.
 */
export class AcodeFileSystem {
  constructor() {
    const factory = getFsFactory();
    if (!factory) throw new Error('Acode file system API is unavailable');
    /** @type {any} */
    this.factory = factory;
  }

  /**
   * @param {string} url - File or directory url.
   * @returns {any} Acode FileSystem handle.
   */
  handle(url) {
    const value = this.factory(url);
    if (!value || typeof value.lsDir !== 'function') {
      throw new Error(`No file system handler for ${url}`);
    }
    return value;
  }

  /**
   * List a directory's direct children (no metadata).
   * @param {string} url - Directory url.
   * @returns {Promise<FileEntry[]>} Normalised entries sorted folders-first.
   */
  async list(url) {
    const handle = this.handle(url);
    const children = (await handle.lsDir()) || [];
    const parent = url.endsWith('/') ? url.slice(0, -1) : url;

    return children.map((child) => this.normalize(child, parent));
  }

  /**
   * List a directory with size and modified date resolved.
   * @param {string} url - Directory url.
   * @param {{ concurrency?: number, onProgress?: (done: number, total: number) => void }} [options] - Options.
   * @returns {Promise<FileEntry[]>} Entries with metadata.
   */
  async listWithStats(url, options = {}) {
    const { concurrency = 8, onProgress } = options;
    const entries = await this.list(url);
    let done = 0;

    const enriched = await mapLimit(entries, concurrency, async (entry) => {
      if (entry.isDirectory) return entry;
      try {
        const stat = await this.stat(entry.url);
        entry.size = stat.size;
        entry.modified = stat.modified || entry.modified;
        entry.mime = entry.mime || stat.mime || null;
      } catch {
        /* keep whatever lsDir gave us */
      }
      done++;
      onProgress?.(done, entries.length);
      return entry;
    });

    return enriched;
  }

  /**
   * Read metadata for a single entry.
   * @param {string} url - Entry url.
   * @returns {Promise<{ size: number, modified: number, canRead: boolean, canWrite: boolean, mime: string|null, isFile: boolean, isDirectory: boolean, name: string }>} Stat result.
   */
  async stat(url) {
    const handle = this.handle(url);
    const stat = await handle.stat();
    const name = stat?.name || url.split('/').filter(Boolean).pop() || url;

    return {
      name,
      isFile: Boolean(stat?.isFile),
      isDirectory: Boolean(stat?.isDirectory),
      size: Number(stat?.size) || 0,
      modified: Number(stat?.modifiedDate) || 0,
      canRead: stat?.canRead !== false,
      canWrite: stat?.canWrite !== false,
      mime: mimeForName(name),
    };
  }

  /**
   * @param {string} url - Entry url.
   * @returns {Promise<boolean>} Whether the entry exists.
   */
  async exists(url) {
    try {
      return Boolean(await this.handle(url).exists());
    } catch {
      return false;
    }
  }

  /**
   * Read a file as UTF-8 text.
   * @param {string} url - File url.
   * @returns {Promise<string>} File contents.
   */
  async readText(url) {
    return await this.handle(url).readFile('utf-8');
  }

  /**
   * Read a file as bytes.
   * @param {string} url - File url.
   * @returns {Promise<ArrayBuffer>} File contents.
   */
  async readBytes(url) {
    return await this.handle(url).readFile();
  }

  /**
   * Resolve a URL the WebView can render directly (images, media).
   *
   * Preferring the host's internal URL avoids buffering a whole image in
   * memory, which matters on low-end Android devices.
   *
   * @param {string} url - File url.
   * @returns {Promise<string|null>} Displayable url.
   */
  async displayUrl(url) {
    const host = getHost();
    try {
      if (host && typeof host.toInternalUrl === 'function') {
        return await host.toInternalUrl(url);
      }
    } catch {
      /* fall back below */
    }
    return url || null;
  }

  /**
   * Rename an entry in place.
   * @param {string} url - Entry url.
   * @param {string} newName - New base name.
   * @returns {Promise<string>} New url reported by the host.
   */
  async rename(url, newName) {
    return await this.handle(url).renameTo(newName);
  }

  /**
   * Move an entry into a directory.
   * @param {string} url - Entry url.
   * @param {string} destination - Destination directory url.
   * @returns {Promise<string>} New url.
   */
  async move(url, destination) {
    return await this.handle(url).moveTo(destination);
  }

  /**
   * Copy an entry into a directory.
   * @param {string} url - Entry url.
   * @param {string} destination - Destination directory url.
   * @returns {Promise<string>} New url.
   */
  async copy(url, destination) {
    return await this.handle(url).copyTo(destination);
  }

  /**
   * Delete an entry.
   * @param {string} url - Entry url.
   * @returns {Promise<void>} Resolves when deleted.
   */
  async remove(url) {
    await this.handle(url).delete();
  }

  /**
   * Create a file inside a directory.
   * @param {string} dirUrl - Directory url.
   * @param {string} name - File name.
   * @param {string} [content] - Initial contents.
   * @returns {Promise<string>} New url.
   */
  async createFile(dirUrl, name, content = '') {
    return await this.handle(dirUrl).createFile(name, content);
  }

  /**
   * Create a subdirectory.
   * @param {string} dirUrl - Parent directory url.
   * @param {string} name - Directory name.
   * @returns {Promise<string>} New url.
   */
  async createDirectory(dirUrl, name) {
    return await this.handle(dirUrl).createDirectory(name);
  }

  /**
   * Open a file in an editor tab.
   * @param {FileEntry} entry - Entry to open.
   * @returns {boolean} Whether a tab was created.
   */
  openInEditor(entry) {
    const host = getHost();
    if (!host) return false;

    try {
      const EditorFile = req('editorfile');
      if (EditorFile) {
        // eslint-disable-next-line new-cap
        const file = new EditorFile(entry.name, { uri: entry.url });
        if (file && typeof file.makeActive === 'function') file.makeActive();
        return true;
      }
      if (typeof host.newEditorFile === 'function') {
        host.newEditorFile(entry.name, { uri: entry.url });
        return true;
      }
    } catch (err) {
      console.warn('[FS] Unable to open file in editor', err);
    }
    return false;
  }

  /**
   * @param {any} child - Raw entry from `lsDir`.
   * @param {string} parent - Parent url.
   * @returns {FileEntry} Normalised entry.
   */
  normalize(child, parent) {
    const name = child?.name || '';
    return {
      name,
      url: child?.url || '',
      parent,
      isFile: Boolean(child?.isFile),
      isDirectory: Boolean(child?.isDirectory),
      isLink: Boolean(child?.isLink),
      size: 0,
      modified: 0,
      mime: mimeForName(name),
      kind: child?.isDirectory ? 'folder' : 'file',
      raw: child,
    };
  }
}
