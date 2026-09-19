/**
 * Actions Module - Cleanup Insights
 * 
 * CleanupInsights analyzes folder contents to provide cleanup suggestions:
 * - Largest files
 * - Oldest files
 * - Duplicate names
 * - Temporary files
 * - Summary statistics
 * 
 * Usage:
 * import { CleanupInsights } from './actions/cleanup.js';
 * const insights = new CleanupInsights(items);
 * const largest = insights.bySize(10);
 */

import { duplicateNameGroup, looksLikeTemp, looksLikeBackup, isCleanupCandidate } from '../utils/patterns.js';
import { formatSize } from '../utils/format.js';

/**
 * CleanupInsights - Analyzes folder contents for cleanup opportunities
 */
export class CleanupInsights {
  /**
   * @param {Array} items - Array of file entries to analyze
   */
  constructor(items = []) {
    this.items = items;
    this._cache = new Map();
  }

  /**
   * Get files only from items
   * @returns {Array} File entries
   */
  get files() {
    if (this._cache.has('files')) {
      return this._cache.get('files');
    }
    const files = this.items.filter((i) => i.isFile);
    this._cache.set('files', files);
    return files;
  }

  /**
   * Get folders only from items
   * @returns {Array} Folder entries
   */
  get folders() {
    if (this._cache.has('folders')) {
      return this._cache.get('folders');
    }
    const folders = this.items.filter((i) => i.isDirectory);
    this._cache.set('folders', folders);
    return folders;
  }

  /**
   * Get largest files
   * @param {number} limit - Maximum number to return
   * @returns {Array} Largest files sorted by size descending
   */
  bySize(limit = 10) {
    return this.files
      .filter((i) => typeof i.size === 'number' && i.size > 0)
      .sort((a, b) => (b.size || 0) - (a.size || 0))
      .slice(0, limit);
  }

  /**
   * Get oldest files (by modification date)
   * @param {number} limit - Maximum number to return
   * @param {number} maxAgeMs - Optional max age in ms (e.g., 30 days)
   * @returns {Array} Oldest files sorted by date ascending
   */
  byAge(limit = 10, maxAgeMs = null) {
    const now = Date.now();
    let files = this.files
      .filter((i) => typeof i.modified === 'number')
      .sort((a, b) => (a.modified || 0) - (b.modified || 0));

    if (maxAgeMs) {
      const cutoff = now - maxAgeMs;
      files = files.filter((f) => (f.modified || 0) < cutoff);
    }

    return files.slice(0, limit);
  }

  /**
   * Get files grouped by duplicate names (case-insensitive)
   * @returns {Array<Array>} Groups of files with same base name
   */
  duplicateNames() {
    return duplicateNameGroup(this.files);
  }

  /**
   * Get files that look like temporary files
   * @returns {Array} Temp file candidates
   */
  tempFiles() {
    return this.files.filter((i) => looksLikeTemp(i.name));
  }

  /**
   * Get files that look like backup files
   * @returns {Array} Backup file candidates
   */
  backupFiles() {
    return this.files.filter((i) => looksLikeBackup(i.name));
  }

  /**
   * Get all cleanup candidates
   * @returns {Array} Files that could be cleaned up
   */
  allCandidates() {
    const candidates = new Map();

    for (const file of this.files) {
      // Dotfiles alone are never suggested: a hidden config file is not junk.
      if (!isCleanupCandidate(file.name, 'file')) continue;

      const reasons = [];
      if (looksLikeTemp(file.name)) reasons.push('temporary');
      if (looksLikeBackup(file.name)) reasons.push('backup');

      if (reasons.length > 0) {
        candidates.set(file.path || file.name, {
          ...file,
          cleanupReasons: reasons,
        });
      }
    }

    return Array.from(candidates.values());
  }

  /**
   * Get summary statistics for the folder
   * @returns {Object} Summary object
   */
  summary() {
    const files = this.files;
    const folders = this.folders;
    
    const totalSize = files.reduce((acc, i) => acc + (i.size || 0), 0);
    
    // Group by type
    const byType = new Map();
    for (const file of files) {
      const kind = file.kind || 'other';
      byType.set(kind, (byType.get(kind) || 0) + 1);
    }

    // Group by extension
    const byExtension = new Map();
    for (const file of files) {
      const ext = file.name?.split('.').pop()?.toLowerCase() || 'no_ext';
      byExtension.set(ext, (byExtension.get(ext) || 0) + 1);
    }

    return {
      totalFiles: files.length,
      totalFolders: folders.length,
      totalItems: this.items.length,
      totalSize,
      totalSizeFormatted: formatSize(totalSize),
      byType: Object.fromEntries(byType.entries()),
      // Object.fromEntries returns an object, so the ordering has to be applied
      // to the entries *before* conversion, otherwise .sort() throws.
      byExtension: Object.fromEntries(
        [...byExtension.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
      ),
      largestFiles: this.bySize(5),
      oldestFiles: this.byAge(5),
      hasDuplicates: this.duplicateNames().length > 0,
      duplicateGroups: this.duplicateNames(),
    };
  }

  /**
   * Find files matching a search query
   * @param {string} query - Search query
   * @returns {Array} Matching files
   */
  search(query) {
    if (!query || query.trim() === '') return [];
    
    const q = query.toLowerCase();
    
    return this.items.filter((item) => {
      return (
        item.name?.toLowerCase().includes(q) ||
        item.path?.toLowerCase().includes(q) ||
        item.kind?.toLowerCase().includes(q)
      );
    });
  }

  /**
   * Filter files by type
   * @param {string|Array<string>} kinds - Kind(s) to filter by
   * @returns {Array} Filtered files
   */
  filterByType(kinds) {
    const kindList = Array.isArray(kinds) ? kinds : [kinds];
    return this.items.filter((i) => kindList.includes(i.kind));
  }

  /**
   * Filter files by size range
   * @param {Object} options - Size options
   * @param {number} options.min - Minimum size in bytes
   * @param {number} options.max - Maximum size in bytes
   * @returns {Array} Filtered files
   */
  filterBySize({ min = 0, max = Infinity } = {}) {
    return this.files.filter((f) => {
      const size = f.size || 0;
      return size >= min && size <= max;
    });
  }

  /**
   * Get files modified within a date range
   * @param {Object} options - Date options
   * @param {number} options.since - Unix timestamp (ms) for earliest modification
   * @param {number} options.until - Unix timestamp (ms) for latest modification
   * @returns {Array} Filtered files
   */
  filterByDate({ since = 0, until = Date.now() } = {}) {
    return this.files.filter((f) => {
      const modified = f.modified || 0;
      return modified >= since && modified <= until;
    });
  }

  /**
   * Clear analysis cache
   */
  clearCache() {
    this._cache.clear();
  }

  /**
   * Refresh with new items
   * @param {Array} items - New items to analyze
   */
  refresh(items) {
    this.items = items;
    this.clearCache();
  }
}

/**
 * Create a CleanupInsights instance
 * @param {Array} items - File entries
 * @returns {CleanupInsights} Insights instance
 */
export function createCleanupInsights(items = []) {
  return new CleanupInsights(items);
}
