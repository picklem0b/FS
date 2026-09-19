/**
 * ActionService — the single place that mutates the file system.
 *
 * Keeping every write path here means the UI never talks to the platform file
 * API directly, so confirmation prompts and cache invalidation stay consistent.
 */

import * as platform from '../platform.js';
import { CleanupInsights } from './cleanup.js';

/**
 * @typedef {import('../platform.js').FileEntry} FileEntry
 */

export class ActionService {
  /**
   * @param {Object} deps - Services.
   * @param {any} deps.fileOps - Low level file operations.
   * @param {any} deps.access - FolderAccess instance.
   * @param {any} deps.batch - BatchActions instance.
   * @param {any} deps.preview - PreviewService instance.
   * @param {any} [deps.settings] - Settings store.
   */
  constructor(deps) {
    this.fileOps = deps.fileOps;
    this.access = deps.access;
    this.batch = deps.batch;
    this.preview = deps.preview;
    this.settings = deps.settings || null;

    /** @type {Map<string, any>} */
    this.operations = new Map();
  }

  /**
   * Open an entry in an editor tab, refreshing metadata if the entry is stale.
   * @param {FileEntry} entry - Entry to open.
   * @returns {Promise<boolean>} Whether the tab opened.
   */
  async open(entry) {
    if (!entry || entry.isDirectory) return false;
    try {
      return Boolean(this.fileOps.open(entry));
    } catch (err) {
      platform.toast(`Could not open ${entry.name}`);
      console.warn('[FS] open failed', err);
      return false;
    }
  }

  /**
   * Resolve an inline preview.
   * @param {FileEntry} entry - Entry to preview.
   * @returns {Promise<any>} Preview result.
   */
  async previewEntry(entry) {
    if (!entry || entry.isDirectory) {
      return { ok: false, reason: 'not_a_file', message: 'Folders have no preview' };
    }
    return await this.preview.getPreview(entry);
  }

  /**
   * Copy text to the clipboard, falling back to the host's copy helper.
   * @param {string} text - Text to copy.
   * @returns {Promise<boolean>} Whether the copy succeeded.
   */
  async copyText(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* fall through to the manual path */
    }

    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }

  /**
   * @param {FileEntry} entry - Entry.
   * @returns {Promise<boolean>} Whether the path was copied.
   */
  async copyPath(entry) {
    const ok = await this.copyText(entry?.url || entry?.path || '');
    if (ok) platform.toast('Path copied');
    return ok;
  }

  /**
   * @param {FileEntry} entry - Entry.
   * @returns {Promise<boolean>} Whether the name was copied.
   */
  async copyName(entry) {
    const ok = await this.copyText(entry?.name || '');
    if (ok) platform.toast('Name copied');
    return ok;
  }

  /**
   * Rename an entry, prompting for confirmation first when configured.
   * @param {FileEntry} entry - Entry to rename.
   * @param {string} newName - New base name.
   * @returns {Promise<boolean>} Whether the rename happened.
   */
  async renameEntry(entry, newName) {
    if (!entry || !newName || newName === entry.name) return false;

    if (this.settings?.get('behavior_confirmDestructive') !== false) {
      const ok = await platform.confirm(
        'Rename',
        `Rename "${entry.name}" to "${newName}"?`,
      );
      if (!ok) return false;
    }

    try {
      await this.fileOps.rename(entry.url, newName);
      this.access?.invalidate(entry.parent);
      platform.toast(`Renamed to ${newName}`);
      return true;
    } catch (err) {
      platform.toast(`Rename failed: ${err?.message || err}`);
      return false;
    }
  }

  /**
   * Delete an entry.
   * @param {FileEntry} entry - Entry to delete.
   * @returns {Promise<boolean>} Whether the delete happened.
   */
  async deleteEntry(entry) {
    if (!entry) return false;

    if (this.settings?.get('behavior_confirmDestructive') !== false) {
      const ok = await platform.confirm(
        'Delete',
        `Delete "${entry.name}"? This cannot be undone.`,
      );
      if (!ok) return false;
    }

    try {
      await this.fileOps.remove(entry.url);
      this.access?.invalidate(entry.parent);
      platform.toast(`Deleted ${entry.name}`);
      return true;
    } catch (err) {
      platform.toast(`Delete failed: ${err?.message || err}`);
      return false;
    }
  }

  /**
   * Create a new file inside a directory.
   * @param {string} dirUrl - Directory url.
   * @param {string} [suggestedName] - Initial name in the prompt.
   * @returns {Promise<boolean>} Whether the file was created.
   */
  async createFile(dirUrl, suggestedName = 'untitled.txt') {
    const name = await platform.prompt('New file name', suggestedName, 'text');
    if (!name) return false;

    try {
      await this.fileOps.createFile(dirUrl, name, '');
      this.access?.invalidate(dirUrl);
      platform.toast(`Created ${name}`);
      return true;
    } catch (err) {
      platform.toast(`Could not create file: ${err?.message || err}`);
      return false;
    }
  }

  /**
   * Create a new folder inside a directory.
   * @param {string} dirUrl - Directory url.
   * @param {string} [suggestedName] - Initial name in the prompt.
   * @returns {Promise<boolean>} Whether the folder was created.
   */
  async createFolder(dirUrl, suggestedName = 'New folder') {
    const name = await platform.prompt('New folder name', suggestedName, 'text');
    if (!name) return false;

    try {
      await this.fileOps.createDirectory(dirUrl, name);
      this.access?.invalidate(dirUrl);
      platform.toast(`Created ${name}`);
      return true;
    } catch (err) {
      platform.toast(`Could not create folder: ${err?.message || err}`);
      return false;
    }
  }

  /**
   * Move entries into a destination folder chosen by the user.
   * @param {FileEntry[]} entries - Entries to move.
   * @returns {Promise<any>} Batch result, or null when cancelled.
   */
  async moveEntries(entries) {
    const files = (entries || []).filter((entry) => entry && !entry.isDirectory);
    if (!files.length) {
      platform.toast('Select at least one file');
      return null;
    }

    const destination = await platform.pickDestination();
    if (!destination) return null;

    const result = await this.batch.move(files, destination);
    for (const parent of new Set(files.map((file) => file.parent))) {
      this.access?.invalidate(parent);
    }
    this.access?.invalidate(destination);
    platform.toast(`Moved ${result.successCount} of ${result.total}`);
    return result;
  }

  /**
   * Copy entries into a destination folder chosen by the user.
   * @param {FileEntry[]} entries - Entries to copy.
   * @returns {Promise<any>} Batch result, or null when cancelled.
   */
  async copyEntries(entries) {
    const files = (entries || []).filter((entry) => entry && !entry.isDirectory);
    if (!files.length) {
      platform.toast('Select at least one file');
      return null;
    }

    const destination = await platform.pickDestination();
    if (!destination) return null;

    const result = await this.batch.copy(files, destination);
    this.access?.invalidate(destination);
    platform.toast(`Copied ${result.successCount} of ${result.total}`);
    return result;
  }

  /**
   * Delete several entries behind a single confirmation.
   * @param {FileEntry[]} entries - Entries to delete.
   * @returns {Promise<any>} Batch result, or null when cancelled.
   */
  async deleteEntries(entries) {
    const files = (entries || []).filter(Boolean);
    if (!files.length) return null;

    if (this.settings?.get('behavior_confirmDestructive') !== false) {
      const ok = await platform.confirm(
        'Delete files',
        `Delete ${files.length} item(s)? This cannot be undone.`,
      );
      if (!ok) return null;
    }

    const result = await this.batch.delete(files);
    for (const parent of new Set(files.map((file) => file.parent))) {
      this.access?.invalidate(parent);
    }
    platform.toast(`Deleted ${result.successCount} of ${result.total}`);
    return result;
  }

  /**
   * Batch rename using a naming function.
   * @param {FileEntry[]} entries - Entries to rename.
   * @param {(entry: FileEntry, index: number) => string} nameFn - Name generator.
   * @returns {Promise<any>} Batch result.
   */
  async renameEntries(entries, nameFn) {
    const result = await this.batch.rename(entries || [], nameFn);
    for (const parent of new Set((entries || []).map((entry) => entry.parent))) {
      this.access?.invalidate(parent);
    }
    platform.toast(`Renamed ${result.successCount} of ${result.total}`);
    return result;
  }

  /**
   * Write generated content into a folder.
   * @param {string} dirUrl - Destination folder url.
   * @param {string} name - File name.
   * @param {string} content - File contents.
   * @returns {Promise<{ ok: boolean, url?: string, message?: string }>} Result.
   */
  async saveTextFile(dirUrl, name, content) {
    if (!dirUrl) return { ok: false, message: 'No destination folder' };

    try {
      const url = await this.fileOps.createFile(dirUrl, name, content);
      this.access?.invalidate(dirUrl);
      return { ok: true, url: typeof url === 'string' ? url : undefined };
    } catch (err) {
      return { ok: false, message: String(err?.message || err) };
    }
  }

  /**
   * Share in-memory text through the platform share sheet.
   *
   * A `File` is constructed from the text so nothing has to be written to disk
   * first, and a dismissed share sheet is not treated as a failure.
   *
   * @param {string} text - Content to share.
   * @param {string} name - Suggested file name.
   * @param {string} mime - Content type.
   * @returns {Promise<boolean>} Whether the share sheet was opened.
   */
  async shareText(text, name, mime) {
    try {
      if (typeof navigator === 'undefined' || !navigator.share || typeof File === 'undefined') {
        return false;
      }

      const file = new File([text], name, { type: mime });
      if (navigator.canShare && !navigator.canShare({ files: [file] })) return false;

      await navigator.share({ files: [file], title: name });
      return true;
    } catch (err) {
      // A cancelled share throws AbortError; that is not a failure to report.
      if (/** @type {any} */ (err)?.name === 'AbortError') return true;
      console.warn('[FS] share failed', err);
      return false;
    }
  }

  /**
   * Resolve a url the WebView can render directly.
   * @param {string} url - File url.
   * @returns {Promise<string>} Displayable url.
   */
  async displayUrl(url) {
    try {
      if (this.fileOps.displayUrl) return await this.fileOps.displayUrl(url);
    } catch {
      /* fall back to the raw url */
    }
    return url;
  }

  /**
   * Summarise a listing into folder statistics.
   * @param {FileEntry[]} entries - Entries to analyse.
   * @returns {any} Summary object.
   */
  summarize(entries) {
    return new CleanupInsights(entries || []).summary();
  }

  /**
   * Entries that look safe to clean up (temporary files and backups).
   * @param {FileEntry[]} entries - Entries to inspect.
   * @returns {FileEntry[]} Cleanup candidates, largest first.
   */
  cleanupCandidates(entries) {
    if (this.settings?.get('tools_cleanupEnabled') === false) return [];
    return new CleanupInsights(entries || [])
      .allCandidates()
      .sort((a, b) => (b.size || 0) - (a.size || 0));
  }

  /**
   * Build the action list for a single entry.
   * @param {FileEntry} entry - Entry.
   * @returns {Array<{ id: string, label: string, danger?: boolean }>} Actions.
   */
  getActionsFor(entry) {
    if (!entry) return [];

    if (entry.isDirectory) {
      return [
        { id: 'open', label: 'Open folder' },
        { id: 'detail', label: 'Folder summary' },
        { id: 'rename', label: 'Rename folder' },
        { id: 'delete', label: 'Delete folder', danger: true },
      ];
    }

    const actions = [
      { id: 'open', label: 'Open in editor' },
      { id: 'preview', label: 'Quick preview' },
      { id: 'copy_path', label: 'Copy path' },
      { id: 'copy_name', label: 'Copy name' },
      { id: 'rename', label: 'Rename' },
    ];

    if (this.settings?.get('tools_batchEnabled') !== false) {
      actions.push({ id: 'batch', label: 'Batch actions' });
    }

    actions.push({ id: 'delete', label: 'Delete', danger: true });
    return actions;
  }

  /**
   * @param {string} id - Operation id.
   * @param {any} operation - Operation descriptor.
   */
  trackOperation(id, operation) {
    this.operations.set(id, { ...operation, status: 'pending', startedAt: Date.now() });
  }

  /**
   * @param {string} id - Operation id.
   * @param {string} status - New status.
   */
  updateOperation(id, status) {
    const operation = this.operations.get(id);
    if (operation) {
      operation.status = status;
      operation.completedAt = Date.now();
    }
  }

  /** Release cached preview state. */
  dispose() {
    this.operations.clear();
    this.preview?.clear?.();
  }
}

/**
 * @param {Object} options - Service dependencies.
 * @returns {ActionService} Configured service.
 */
export function createActionService(options = {}) {
  return new ActionService(options);
}
