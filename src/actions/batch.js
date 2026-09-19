/**
 * Actions Module - Batch Operations
 * 
 * BatchActions provides paid batch file operations:
 * - Batch rename
 * - Batch extension change
 * - Batch move/copy
 * - Batch delete
 * 
 * Usage:
 * import { BatchActions } from './actions/batch.js';
 * const batch = new BatchActions(fileOps);
 * const results = await batch.rename(items, (item) => `new_${item.name}`);
 */

/**
 * BatchActions - Handles batch file operations
 */
export class BatchActions {
  /**
   * @param {Object} fileOps - File operations backend
   * @param {Function} fileOps.rename - Rename a file
   * @param {Function} fileOps.move - Move a file
   * @param {Function} fileOps.remove - Delete a file
   * @param {Function} fileOps.copy - Copy a file
   */
  constructor(fileOps) {
    this.fileOps = fileOps;
    this.operationId = 0;
  }

  /**
   * Generate unique operation ID
   * @returns {number} Operation ID
   */
  _nextId() {
    return ++this.operationId;
  }

  /**
   * Rename multiple files
   * @param {Array} items - Files to rename
   * @param {Function} nameFn - Function that returns new name for an item
   * @param {Object} options - Options
   * @param {boolean} options.force - Force rename without confirmation
   * @returns {Promise<Array<Object>>} Results for each item
   */
  async rename(items, nameFn, options = {}) {
    const results = [];
    const operationId = this._nextId();
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      try {
        const newName = nameFn(item, i);
        
        if (!newName || newName === item.name) {
          results.push({
            item,
            index: i,
            status: 'skipped',
            reason: 'no_change',
          });
          continue;
        }
        
        // Validate new name
        const validation = this._validateName(newName);
        if (!validation.ok) {
          results.push({
            item,
            index: i,
            status: 'error',
            reason: 'invalid_name',
            message: validation.message,
          });
          continue;
        }
        
        // Check for conflicts within the batch
        const conflict = items.some((other, j) => {
          if (j === i) return false;
          const otherNewName = nameFn(other, j);
          return otherNewName === newName;
        });
        
        if (conflict) {
          results.push({
            item,
            index: i,
            status: 'error',
            reason: 'conflict',
            message: `Another file in batch would get the same name`,
          });
          continue;
        }
        
        // Perform rename
        await this.fileOps.rename(item, newName, options);
        
        results.push({
          item,
          index: i,
          status: 'ok',
          oldName: item.name,
          newName,
        });
      } catch (err) {
        results.push({
          item,
          index: i,
          status: 'error',
          reason: 'operation_failed',
          message: String(err),
        });
      }
    }
    
    return {
      operationId,
      total: items.length,
      results,
      successCount: results.filter(r => r.status === 'ok').length,
      errorCount: results.filter(r => r.status === 'error').length,
      skippedCount: results.filter(r => r.status === 'skipped').length,
    };
  }

  /**
   * Change extension for multiple files
   * @param {Array} items - Files to change
   * @param {string} newExt - New extension (with or without dot)
   * @param {Object} options - Options
   * @returns {Promise<Object>} Batch result
   */
  async changeExtension(items, newExt, options = {}) {
    const ext = newExt.startsWith('.') ? newExt : '.' + newExt;
    
    return this.rename(items, (item) => {
      const base = item.name?.replace(/\.[^.]+$/, '') || item.name;
      return base + ext;
    }, options);
  }

  /**
   * Move multiple files to a directory
   * @param {Array} items - Files to move
   * @param {string} targetDir - Target directory path
   * @param {Object} options - Options
   * @returns {Promise<Object>} Batch result
   */
  async move(items, targetDir, options = {}) {
    const results = [];
    const operationId = this._nextId();
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      try {
        await this.fileOps.move(item, targetDir, options);
        
        results.push({
          item,
          index: i,
          status: 'ok',
          targetDir,
        });
      } catch (err) {
        results.push({
          item,
          index: i,
          status: 'error',
          reason: 'operation_failed',
          message: String(err),
        });
      }
    }
    
    return {
      operationId,
      total: items.length,
      results,
      successCount: results.filter(r => r.status === 'ok').length,
      errorCount: results.filter(r => r.status === 'error').length,
    };
  }

  /**
   * Copy multiple files (if supported)
   * @param {Array} items - Files to copy
   * @param {string} targetDir - Target directory path
   * @param {Object} options - Options
   * @returns {Promise<Object>} Batch result
   */
  async copy(items, targetDir, options = {}) {
    const results = [];
    const operationId = this._nextId();
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      try {
        await this.fileOps.copy(item, targetDir, options);
        
        results.push({
          item,
          index: i,
          status: 'ok',
          targetDir,
        });
      } catch (err) {
        results.push({
          item,
          index: i,
          status: 'error',
          reason: 'operation_failed',
          message: String(err),
        });
      }
    }
    
    return {
      operationId,
      total: items.length,
      results,
      successCount: results.filter(r => r.status === 'ok').length,
      errorCount: results.filter(r => r.status === 'error').length,
    };
  }

  /**
   * Delete multiple files
   * @param {Array} items - Files to delete
   * @param {Object} options - Options
   * @param {boolean} options.force - Skip confirmation
   * @returns {Promise<Object>} Batch result
   */
  async delete(items, options = {}) {
    const results = [];
    const operationId = this._nextId();
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      try {
        await this.fileOps.remove(item, options);
        
        results.push({
          item,
          index: i,
          status: 'ok',
        });
      } catch (err) {
        results.push({
          item,
          index: i,
          status: 'error',
          reason: 'operation_failed',
          message: String(err),
        });
      }
    }
    
    return {
      operationId,
      total: items.length,
      results,
      successCount: results.filter(r => r.status === 'ok').length,
      errorCount: results.filter(r => r.status === 'error').length,
    };
  }

  /**
   * Batch validate new names
   * @param {string} name - Proposed new name
   * @returns {Object} Validation result
   */
  _validateName(name) {
    if (!name || typeof name !== 'string') {
      return { ok: false, message: 'Name is required' };
    }
    
    if (name.length === 0) {
      return { ok: false, message: 'Name cannot be empty' };
    }
    
    // Check for invalid characters (platform-dependent, but be conservative)
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(name)) {
      return { ok: false, message: 'Name contains invalid characters' };
    }
    
    // Check for reserved names (Windows-style)
    const reserved = /^(\.|CON|PRN|AUX|NUL|COM\d|LPT\d)$/i;
    if (reserved.test(name.trim())) {
      return { ok: false, message: 'Name is reserved' };
    }
    
    // Check length
    if (name.length > 255) {
      return { ok: false, message: 'Name is too long (max 255 characters)' };
    }
    
    // Check for trailing dots or spaces (problematic on some systems)
    if (name.endsWith('.') || name.endsWith(' ')) {
      return { ok: false, message: 'Name cannot end with dot or space' };
    }
    
    return { ok: true };
  }

  /**
   * Create a sequential rename pattern
   * @param {string} prefix - Prefix for names
   * @param {string} startAt - Starting number
   * @returns {Function} Name function for batch rename
   */
  createSequentialPattern(prefix = 'file', startAt = 1) {
    let counter = startAt;
    return () => {
      const name = `${prefix}_${String(counter).padStart(3, '0')}`;
      counter++;
      return name;
    };
  }

  /**
   * Create a rename pattern that adds a suffix
   * @param {string} suffix - Suffix to add
   * @returns {Function} Name function for batch rename
   */
  createSuffixPattern(suffix = '_backup') {
    return (item) => {
      const base = item.name?.replace(/\.[^.]+$/, '') || item.name;
      const ext = item.name?.includes('.') ? '.' + item.name.split('.').pop() : '';
      return `${base}${suffix}${ext}`;
    };
  }

  /**
   * Create a rename pattern that adds a prefix
   * @param {string} prefix - Prefix to add
   * @returns {Function} Name function for batch rename
   */
  createPrefixPattern(prefix = 'old_') {
    return (item) => {
      return prefix + (item.name || '');
    };
  }
}

/**
 * FileOps interface for batch operations:
 * {
 *   rename(item, newName, options) => Promise<void>,
 *   move(item, targetDir, options) => Promise<void>,
 *   copy(item, targetDir, options) => Promise<void>,
 *   remove(item, options) => Promise<void>,
 * }
 */
