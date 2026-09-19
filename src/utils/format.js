/**
 * Display formatting helpers.
 */

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/**
 * Format a byte count for display.
 * @param {number} [bytes] - Size in bytes.
 * @param {{ precise?: boolean }} [options] - When `precise`, always show one decimal.
 * @returns {string} Human readable size such as `2.4 MB`.
 */
export function formatSize(bytes, options = {}) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value === 0) return '0 B';

  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    SIZE_UNITS.length - 1,
  );
  const scaled = value / 1024 ** index;
  const decimals = index === 0 ? 0 : options.precise ? 2 : 1;

  return `${scaled.toFixed(decimals)} ${SIZE_UNITS[index]}`;
}

/**
 * Format a millisecond timestamp as an absolute short date.
 * @param {number} [ts] - Timestamp in milliseconds.
 * @returns {string} Formatted date.
 */
export function formatDate(ts) {
  const value = Number(ts);
  if (!Number.isFinite(value) || value <= 0) return '—';
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a millisecond timestamp as a short relative time.
 * @param {number} [ts] - Timestamp in milliseconds.
 * @param {number} [now] - Reference time, defaults to `Date.now()`.
 * @returns {string} Relative time such as `3 h ago`.
 */
export function formatRelativeTime(ts, now = Date.now()) {
  const value = Number(ts);
  if (!Number.isFinite(value) || value <= 0) return '—';

  const seconds = Math.round((now - value) / 1000);
  const table = [
    { limit: 60, divisor: 1, unit: 's' },
    { limit: 3600, divisor: 60, unit: 'min' },
    { limit: 86400, divisor: 3600, unit: 'h' },
    { limit: 2592000, divisor: 86400, unit: 'd' },
    { limit: 31536000, divisor: 2592000, unit: 'mo' },
  ];

  // Check the future first: otherwise the "just now" window swallows negatives.
  if (seconds < 0) return 'in the future';
  if (seconds < 45) return 'just now';

  for (const { limit, divisor, unit } of table) {
    if (seconds < limit) return `${Math.floor(seconds / divisor)} ${unit} ago`;
  }

  return `${Math.floor(seconds / 31536000)} y ago`;
}

/**
 * Format an integer with locale-aware separators.
 * @param {number} [value] - Count.
 * @returns {string} Grouped count.
 */
export function formatCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return number.toLocaleString();
}

/** Extensions treated as plain text. */
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'json5', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx',
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'xml', 'svg', 'yaml', 'yml',
  'toml', 'ini', 'cfg', 'conf', 'env', 'properties', 'log', 'sh', 'bash', 'zsh',
  'fish', 'py', 'rb', 'php', 'java', 'kt', 'kts', 'c', 'h', 'cpp', 'hpp', 'cc',
  'cs', 'go', 'rs', 'swift', 'lua', 'pl', 'r', 'm', 'mm', 'dart', 'sql', 'graphql',
  'vue', 'svelte', 'gitignore', 'editorconfig', 'dockerignore', 'lock',
]);

/** Extensions treated as images. */
const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'ico', 'avif', 'heic', 'heif', 'tiff', 'tif',
]);

/** Extensions treated as audio/video. */
const MEDIA_EXTENSIONS = new Set([
  'mp3', 'wav', 'ogg', 'oga', 'opus', 'flac', 'aac', 'm4a', 'wma', 'aiff',
  'mp4', 'webm', 'mkv', 'mov', 'avi', 'm4v', '3gp',
]);

/**
 * Classify an entry by extension and optional MIME type.
 * @param {string} name - File name.
 * @param {string|null} [mime] - Known MIME type.
 * @param {boolean} [isDirectory] - Whether the entry is a folder.
 * @returns {'text'|'image'|'media'|'folder'|'binary'|'other'|'unknown'} File kind.
 */
export function fileKind(name, mime, isDirectory = false) {
  if (isDirectory) return 'folder';

  const value = String(name || '');
  const dot = value.lastIndexOf('.');
  const ext = dot > 0 ? value.slice(dot + 1).toLowerCase() : '';

  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (MEDIA_EXTENSIONS.has(ext)) return 'media';

  if (mime) {
    if (mime.startsWith('text/')) return 'text';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('audio/') || mime.startsWith('video/')) return 'media';
    if (mime === 'application/json' || mime === 'application/xml') return 'text';
    if (mime.startsWith('application/')) return 'binary';
  }

  if (!ext) return 'unknown';
  return 'other';
}

/**
 * Human readable label for a file kind.
 * @param {string} kind - File kind.
 * @returns {string} Display label.
 */
export function typeLabel(kind) {
  return (
    {
      text: 'Text',
      image: 'Image',
      media: 'Media',
      folder: 'Folder',
      binary: 'Binary',
      other: 'Other',
      unknown: 'Unknown',
    }[kind] || 'Other'
  );
}

/**
 * Whether a kind is previewed as plain text.
 * @param {string} kind - File kind.
 * @returns {boolean} True for text.
 */
export function isTextPreviewable(kind) {
  return kind === 'text';
}

/**
 * Whether a kind is previewed as an image.
 * @param {string} kind - File kind.
 * @returns {boolean} True for images.
 */
export function isImagePreviewable(kind) {
  return kind === 'image';
}
