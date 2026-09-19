/**
 * Pattern matching helpers.
 *
 * User-supplied ignore patterns are treated as globs (`*`, `?`, `**`), never as
 * raw regular expressions. Treating them as regex made inputs like `.ds_store`
 * match far more than intended, because `.` is a wildcard there.
 */

/** Patterns hidden from listings by default. */
export const DEFAULT_IGNORE_PATTERNS = [
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  '.directory',
  'about-files.json',
];

const REGEXP_SPECIAL = /[.*+?^${}()|[\]\\]/g;

/**
 * Convert a glob pattern to an anchored regular expression.
 *
 * Supported syntax:
 * - `*`  matches any run of characters except `/`
 * - `?`  matches a single character except `/`
 * - `**` matches any run of characters including `/`
 *
 * @param {string} glob - Glob pattern.
 * @returns {RegExp} Anchored, case-insensitive regular expression.
 */
export function globToRegExp(glob) {
  const source = String(glob).trim();
  let out = '';

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (char === '*') {
      if (source[i + 1] === '*') {
        out += '.*';
        i++;
      } else {
        out += '[^/]*';
      }
      continue;
    }

    if (char === '?') {
      out += '[^/]';
      continue;
    }

    out += char.replace(REGEXP_SPECIAL, '\\$&');
  }

  return new RegExp(`^${out}$`, 'i');
}

/**
 * Create a matcher for a list of ignore globs.
 *
 * @param {string[]} [ignoreList] - Extra patterns supplied by the user.
 * @returns {{ matches: (name: string) => boolean, patterns: RegExp[], globs: string[] }}
 */
export function makePatternMatcher(ignoreList = []) {
  const globs = [...DEFAULT_IGNORE_PATTERNS, ...(ignoreList || [])]
    .map((raw) => String(raw ?? '').trim())
    .filter(Boolean);

  const patterns = globs.map(globToRegExp);

  return {
    matches(name) {
      if (!name) return false;
      return patterns.some((re) => re.test(name));
    },
    patterns,
    globs,
  };
}

/**
 * Group items whose base names collide (case-insensitive).
 *
 * @param {Array<{ name?: string }>} items - Entries to inspect.
 * @returns {Array<Array>} Groups containing two or more items.
 */
export function duplicateNameGroup(items) {
  const groups = new Map();

  for (const item of items || []) {
    const base = String(item?.name || '').replace(/[/\\]+$/, '');
    if (!base) continue;
    const key = base.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  return [...groups.values()].filter((group) => group.length > 1);
}

/** Editor swap/autosave artefacts. */
const TEMP_PATTERN = /(^\.?#.*#$|~$|\.(tmp|temp|swp|swo|part|crdownload|download)$)/i;

/** Editor/compiler backups and stale copies. */
const BACKUP_PATTERN = /\.(bak|backup|bkp|old|orig|save)$/i;

/**
 * Whether a name looks like a temporary file.
 * @param {string} name - File name.
 * @returns {boolean} True for temp-like names.
 */
export function looksLikeTemp(name) {
  if (!name) return false;
  return TEMP_PATTERN.test(String(name));
}

/**
 * Whether a name looks like a backup file.
 * @param {string} name - File name.
 * @returns {boolean} True for backup-like names.
 */
export function looksLikeBackup(name) {
  if (!name) return false;
  return BACKUP_PATTERN.test(String(name));
}

/**
 * Whether an entry is a safe cleanup suggestion.
 *
 * Hidden files (leading dot) are deliberately excluded: a dotfile is a
 * configuration file, not junk, and suggesting its deletion is dangerous.
 *
 * @param {string} name - File name.
 * @param {'file'|'folder'} [kind] - Entry kind.
 * @returns {boolean} True when the entry is a cleanup candidate.
 */
export function isCleanupCandidate(name, kind = 'file') {
  if (kind === 'folder' || !name) return false;
  return looksLikeTemp(name) || looksLikeBackup(name);
}

/**
 * Extract the lowercase extension from a name.
 * @param {string} name - File name.
 * @returns {string|null} Extension without the dot, or null.
 */
export function getExtension(name) {
  if (!name) return null;
  const dot = String(name).lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return null;
  return String(name).slice(dot + 1).toLowerCase();
}

/**
 * Strip the extension from a name.
 * @param {string} name - File name.
 * @returns {string} Name without its extension.
 */
export function stripExtension(name) {
  if (!name) return '';
  const value = String(name);
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return value;
  return value.slice(0, dot);
}
