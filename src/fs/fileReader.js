/**
 * FileReader — reads entry contents through a source adapter.
 *
 * Acode already knows how to open `content://` and `file://` urls, so reads go
 * through the source rather than through browser File handles.
 */

export class FileReader {
  /**
   * @param {any} source - Source adapter (see `source.js`).
   */
  constructor(source) {
    this.source = source;
  }

  /**
   * @param {any} item - Entry.
   * @returns {boolean} Whether the entry looks readable.
   */
  canRead(item) {
    if (!item) return false;
    if (item.isDirectory) return false;
    return Boolean(item.url && this.source);
  }

  /**
   * @param {any} item - Entry.
   * @returns {number} Known size in bytes, or 0.
   */
  getSize(item) {
    const size = Number(item?.size);
    return Number.isFinite(size) && size > 0 ? size : 0;
  }

  /**
   * Read an entry as UTF-8 text.
   * @param {any} item - Entry.
   * @returns {Promise<string>} File contents.
   */
  async readText(item) {
    if (!this.canRead(item)) throw new Error('Entry cannot be read');
    if (typeof this.source.readText !== 'function') {
      throw new Error('Source does not support text reads');
    }
    return await this.source.readText(item.url);
  }

  /**
   * Read an entry as bytes.
   * @param {any} item - Entry.
   * @returns {Promise<ArrayBuffer>} File contents.
   */
  async readBytes(item) {
    if (!this.canRead(item)) throw new Error('Entry cannot be read');
    if (typeof this.source.readBytes !== 'function') {
      throw new Error('Source does not support byte reads');
    }
    return await this.source.readBytes(item.url);
  }

  /**
   * Resolve a url the WebView can render directly.
   * @param {any} item - Entry.
   * @returns {Promise<string|null>} Displayable url.
   */
  async displayUrl(item) {
    if (!item?.url) return null;
    if (typeof this.source.displayUrl !== 'function') return item.url;
    try {
      return await this.source.displayUrl(item.url);
    } catch {
      return item.url;
    }
  }
}

/**
 * @param {any} source - Source adapter.
 * @returns {FileReader} Reader bound to the source.
 */
export function createFileReader(source) {
  return new FileReader(source);
}
