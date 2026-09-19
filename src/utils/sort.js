/**
 * Sorting helpers for the file list.
 */

/** Natural, locale-aware comparison so `file2` sorts before `file10`. */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * @typedef {Object} SortableEntry
 * @property {string} [name]
 * @property {number} [size]
 * @property {number} [modified]
 * @property {string} [kind]
 * @property {boolean} [isDirectory]
 */

/** Fields offered in the UI. */
export const SORT_FIELDS = [
  { value: 'name', label: 'Name' },
  { value: 'size', label: 'Size' },
  { value: 'date', label: 'Date modified' },
  { value: 'type', label: 'Type' },
];

/** Directions offered in the UI. */
export const SORT_DIRECTIONS = [
  { value: 'asc', label: 'Ascending' },
  { value: 'desc', label: 'Descending' },
];

/**
 * Compare two entries by a single field.
 *
 * @param {SortableEntry} a - Left entry.
 * @param {SortableEntry} b - Right entry.
 * @param {string} field - One of `name`, `size`, `date`, `type`.
 * @returns {number} Negative, zero, or positive.
 */
function compareByField(a, b, field) {
  switch (field) {
    case 'size':
      return (a.size || 0) - (b.size || 0);
    case 'date':
      return (a.modified || 0) - (b.modified || 0);
    case 'type':
      return (
        collator.compare(a.kind || '', b.kind || '') ||
        collator.compare(a.name || '', b.name || '')
      );
    case 'name':
    default:
      return collator.compare(a.name || '', b.name || '');
  }
}

/**
 * Sort entries without mutating the input.
 *
 * Folders are kept above files when `foldersFirst` is set, regardless of the
 * chosen direction, which matches how file managers behave.
 *
 * @param {SortableEntry[]} items - Entries to sort.
 * @param {string} [field] - Sort field.
 * @param {'asc'|'desc'} [dir] - Sort direction.
 * @param {{ foldersFirst?: boolean }} [options] - Extra options.
 * @returns {SortableEntry[]} New sorted array.
 */
export function sortFiles(items, field = 'name', dir = 'asc', options = {}) {
  const { foldersFirst = true } = options;
  const multiplier = dir === 'desc' ? -1 : 1;

  return [...(items || [])].sort((a, b) => {
    if (foldersFirst && Boolean(a.isDirectory) !== Boolean(b.isDirectory)) {
      return a.isDirectory ? -1 : 1;
    }

    const primary = compareByField(a, b, field);
    if (primary !== 0) return primary * multiplier;

    // Stable tie-break so equal values never shuffle between renders.
    return collator.compare(a.name || '', b.name || '');
  });
}

/**
 * Group entries by kind for the type filter chips.
 *
 * @param {SortableEntry[]} items - Entries to group.
 * @returns {Array<{ kind: string, count: number }>} Counts ordered by size.
 */
export function countByKind(items) {
  const counts = new Map();

  for (const item of items || []) {
    const kind = item.isDirectory ? 'folder' : item.kind || 'other';
    counts.set(kind, (counts.get(kind) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || collator.compare(a.kind, b.kind));
}
