/**
 * PreviewService — safe, size-limited previews that never open the editor.
 */

/** Largest file read into memory for a text preview. */
export const MAX_TEXT_PREVIEW_BYTES = 256 * 1024;

/** Largest image resolved for an inline preview. */
export const MAX_IMAGE_PREVIEW_BYTES = 10 * 1024 * 1024;

export class PreviewService {
  /**
   * @param {import('./fileReader.js').FileReader} reader - Reader bound to the active source.
   */
  constructor(reader) {
    this.reader = reader;
    /** @type {Map<string, any>} */
    this.cache = new Map();
  }

  /**
   * Preview a text file.
   *
   * @param {any} item - Entry.
   * @param {{ maxSize?: number }} [options] - Preview options.
   * @returns {Promise<{ ok: boolean, text?: string, bytes?: number, truncated?: boolean, reason?: string, message?: string }>} Preview result.
   */
  async readText(item, options = {}) {
    const maxSize = Number(options.maxSize) || MAX_TEXT_PREVIEW_BYTES;

    if (!this.reader.canRead(item)) {
      return { ok: false, reason: 'unreadable', message: 'This entry cannot be read' };
    }

    const known = this.reader.getSize(item);
    if (known > maxSize) {
      return {
        ok: false,
        reason: 'too_large',
        bytes: known,
        message: `File is larger than the ${Math.round(maxSize / 1024)} KB preview limit`,
      };
    }

    try {
      const text = await this.reader.readText(item);
      const bytes = known || text.length;

      if (bytes > maxSize) {
        return {
          ok: false,
          reason: 'too_large',
          bytes,
          message: `File is larger than the ${Math.round(maxSize / 1024)} KB preview limit`,
        };
      }

      return { ok: true, text, bytes, truncated: false };
    } catch (err) {
      return { ok: false, reason: 'read_error', message: String(err?.message || err) };
    }
  }

  /**
   * Preview an image.
   * @param {any} item - Entry.
   * @param {{ maxSize?: number }} [options] - Preview options.
   * @returns {Promise<{ ok: boolean, url?: string, bytes?: number, reason?: string, message?: string }>} Preview result.
   */
  async readImage(item, options = {}) {
    const maxSize = Number(options.maxSize) || MAX_IMAGE_PREVIEW_BYTES;

    if (!this.reader.canRead(item)) {
      return { ok: false, reason: 'unreadable', message: 'This entry cannot be read' };
    }

    const known = this.reader.getSize(item);
    if (known > maxSize) {
      return {
        ok: false,
        reason: 'too_large',
        bytes: known,
        message: `Image is larger than the ${Math.round(maxSize / (1024 * 1024))} MB preview limit`,
      };
    }

    try {
      const url = await this.reader.displayUrl(item);
      if (!url) return { ok: false, reason: 'no_url', message: 'No preview url available' };
      return { ok: true, url, bytes: known };
    } catch (err) {
      return { ok: false, reason: 'read_error', message: String(err?.message || err) };
    }
  }

  /**
   * Resolve the right preview for an entry.
   * @param {any} item - Entry.
   * @returns {Promise<{ type: 'text'|'image'|'info', ok?: boolean, text?: string, url?: string, reason?: string, message?: string }>} Preview.
   */
  async getPreview(item) {
    if (item?.kind === 'text') return { type: 'text', ...(await this.readText(item)) };
    if (item?.kind === 'image') return { type: 'image', ...(await this.readImage(item)) };

    return {
      type: 'info',
      ok: true,
      message: `${item?.name || 'Entry'} — no inline preview for this type`,
    };
  }

  /** Drop cached text previews. */
  clear() {
    this.cache.clear();
  }
}
