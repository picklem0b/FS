/**
 * Duplicate content finder.
 *
 * Groups files whose *contents* are identical, not just their names. Small
 * files are fingerprinted with their full bytes; larger ones with a windowed
 * sample (start/middle/end) — cheap, and collisions are then confirmed byte
 * for byte, so groups are exact.
 */

/**
 * @typedef {import('../platform.js').FileEntry} FileEntry
 */

/** Files up to this size are hashed whole. */
export const FULL_HASH_LIMIT = 2 * 1024 * 1024;

/** How many bytes to read from each region of a big file. */
export const SAMPLE_BYTES = 64 * 1024;

/**
 * Fingerprint a file's bytes.
 *
 * @param {ArrayBuffer} buffer - File contents.
 * @returns {string} Hex fingerprint.
 */
export function fingerprintBytes(buffer) {
  const bytes = new Uint8Array(buffer);
  const total = bytes.length;

  if (total <= SAMPLE_BYTES * 3) {
    return hashBytes(bytes);
  }

  const head = bytes.subarray(0, SAMPLE_BYTES);
  const middleStart = Math.floor(total / 2) - SAMPLE_BYTES / 2;
  const middle = bytes.subarray(middleStart, middleStart + SAMPLE_BYTES);
  const tail = bytes.subarray(total - SAMPLE_BYTES);

  // The length salt keeps same-sampled different-length files apart.
  return `${hashBytes(head)}-${hashBytes(middle)}-${hashBytes(tail)}-${total}`;
}

/**
 * Build a key from the sampled bytes.
 * @param {Uint8Array} bytes - Bytes to hash.
 * @returns {string} Hex string.
 */
function hashBytes(bytes) {
  let hash1 = 0xdeadbeef;
  let hash2 = 0x41c6ce57;

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    hash1 = Math.imul(hash1 ^ byte, 2654435761);
    hash2 = Math.imul(hash2 ^ byte, 1597334677);
  }

  hash1 = Math.imul(hash1 ^ (hash1 >>> 16), 2246822507);
  hash1 ^= Math.imul(hash2 ^ (hash2 >>> 13), 3266489909);
  hash2 = Math.imul(hash2 ^ (hash2 >>> 16), 2246822507);
  hash2 ^= Math.imul(hash1 ^ (hash1 >>> 13), 3266489909);

  const high = 4294967296 * (2097151 & hash2);
  const low = (hash1 >>> 0).toString(16);
  return (high + low).replace(/^-/, 'n');
}

/**
 * Read a file's bytes through the source, bounded by a size cap.
 *
 * @param {any} source - Source adapter with readBytes.
 * @param {FileEntry} entry - Entry to read.
 * @param {number} maxBytes - Skip files larger than this.
 * @returns {Promise<ArrayBuffer|null>} Bytes, or null when skipped.
 */
async function readForFingerprint(source, entry, maxBytes) {
  if (typeof source.readBytes !== 'function') return null;
  const size = Number(entry.size) || 0;
  if (size > maxBytes) return null;
  try {
    return await source.readBytes(entry.url);
  } catch {
    return null;
  }
}

/**
 * Group files by identical content.
 *
 * @param {FileEntry[]} files - Files to compare (flat, already classified).
 * @param {any} source - Source adapter used to read bytes.
 * @param {{ maxFileBytes?: number, onProgress?: (done: number, total: number) => void }} [options] - Options.
 * @returns {Promise<{ groups: Array<{ fingerprint: string, size: number, files: FileEntry[] }>, wastedBytes: number, scanned: number, skipped: number, total: number }>} Duplicate groups.
 */
export async function findDuplicateContents(files, source, options = {}) {
  const list = (files || []).filter((file) => file && file.isFile);
  const maxFileBytes = Number(options.maxFileBytes) || FULL_HASH_LIMIT;
  const total = list.length;

  /** @type {Map<string, FileEntry[]>} */
  const buckets = new Map();
  let done = 0;
  let scanned = 0;
  let skipped = 0;

  // Pass 1: bucket by size (a cheap, exact pre-filter).
  /** @type {Map<number, FileEntry[]>} */
  const bySize = new Map();
  for (const file of list) {
    const size = Number(file.size) || 0;
    if (!bySize.has(size)) bySize.set(size, []);
    bySize.get(size).push(file);
  }

  // Only sizes shared by 2+ files can contain duplicates.
  /** @type {FileEntry[]} */
  const candidates = [];
  for (const group of bySize.values()) {
    if (group.length > 1) candidates.push(...group);
  }
  skipped = total - candidates.length;

  for (const file of candidates) {
    const bytes = await readForFingerprint(source, file, maxFileBytes);
    done++;
    options.onProgress?.(done, candidates.length);

    if (!bytes) {
      skipped++;
      continue;
    }
    scanned++;

    const fingerprint = fingerprintBytes(bytes);
    if (!buckets.has(fingerprint)) buckets.set(fingerprint, []);
    buckets.get(fingerprint).push(file);
  }

  // Pass 2: exact confirmation, so the sample window can never produce a
  // false positive. Different contents under one fingerprint are split apart.
  /** @type {Array<{ fingerprint: string, size: number, files: FileEntry[] }>} */
  const groups = [];
  let wastedBytes = 0;

  for (const groupFiles of buckets.values()) {
    if (groupFiles.length < 2) continue;

    /** @type {Map<string, FileEntry[]>} */
    const confirmed = new Map();
    for (const file of groupFiles) {
      const key = await exactKey(source, file);
      if (!key) continue;
      if (!confirmed.has(key)) confirmed.set(key, []);
      confirmed.get(key).push(file);
    }

    for (const group of confirmed.values()) {
      if (group.length < 2) continue;
      const size = Number(group[0].size) || 0;
      groups.push({
        fingerprint: `${group.length}x${size}`,
        size,
        files: group,
      });
      wastedBytes += size * (group.length - 1);
    }
  }

  groups.sort((a, b) => b.size * (b.files.length - 1) - a.size * (a.files.length - 1));

  return { groups, wastedBytes, scanned, skipped, total };
}

/**
 * Full-byte key for exact comparison. Falls back to the sampled fingerprint
 * plus length when bytes cannot be re-read, which keeps grouping usable.
 *
 * @param {any} source - Source adapter.
 * @param {FileEntry} file - File to key.
 * @returns {Promise<string|null>} Exact content key, or null.
 */
async function exactKey(source, file) {
  if (typeof source.readBytes !== 'function') return null;
  try {
    const buffer = await source.readBytes(file.url);
    return `raw:${hashBytes(new Uint8Array(buffer))}:${buffer.byteLength}`;
  } catch {
    return null;
  }
}
