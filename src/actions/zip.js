/**
 * Minimal ZIP writer (store-only, no compression).
 *
 * Enough of the PKZIP format for folder exports: local file headers, the
 * central directory, and the end-of-central-directory record, with CRC-32 and
 * DOS timestamps. Stored entries mean large files stream through without a
 * deflate implementation in the bundle.
 */

/** Incremental CRC-32 over the standard polynomial. */
export class Crc32 {
  constructor() {
    this.crc = -1;
  }

  /**
   * @param {Uint8Array} bytes - Bytes to feed.
   * @returns {void}
   */
  push(bytes) {
    let crc = this.crc;
    for (let i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
    }
    this.crc = crc;
  }

  /** @returns {number} Unsigned CRC value. */
  value() {
    return (this.crc ^ -1) >>> 0;
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/**
 * Convert a Date to DOS date/time fields.
 *
 * @param {Date} date - Timestamp to convert.
 * @returns {{ date: number, time: number }} DOS fields.
 */
export function toDosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2));
  return { date: dosDate & 0xffff, time: dosTime & 0xffff };
}

/**
 * @param {number} value - 16-bit value.
 * @returns {number[]} Little-endian bytes.
 */
function u16(value) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

/**
 * @param {number} value - 32-bit value.
 * @returns {number[]} Little-endian bytes.
 */
function u32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

/**
 * Encode a JS string as UTF-8 bytes.
 * @param {string} text - Text to encode.
 * @returns {Uint8Array} Encoded bytes.
 */
function utf8(text) {
  return new TextEncoder().encode(text);
}

/**
 * Append the bytes of one file to the archive parts.
 *
 * @param {Array<Uint8Array|number[]>} parts - Growing byte chunks.
 * @param {Array<{ name: string, crc: number, size: number, offset: number, dosTime: number, dosDate: number }>} central - Central directory entries.
 * @param {{ name: string, bytes: Uint8Array, modified?: number }} file - Entry to add.
 * @param {Date} [now] - Timestamp for the entry.
 * @returns {void}
 */
export function appendZipEntry(parts, central, file, now = new Date()) {
  const nameBytes = utf8(file.name);
  const data = file.bytes;
  const crc = new Crc32();
  crc.push(data);

  const { date, time } = toDosDateTime(
    Number.isFinite(file.modified) && file.modified > 0 ? new Date(file.modified) : now,
  );

  const offset = parts.reduce((sum, part) => sum + part.length, 0);

  parts.push(new Uint8Array([
    ...u32(0x04034b50), // local file header signature
    ...u16(20), // version needed
    ...u16(0x0800), // flags: UTF-8 name
    ...u16(0), // method: store
    ...u16(time),
    ...u16(date),
    ...u32(crc.value()),
    ...u32(data.length),
    ...u32(data.length),
    ...u16(nameBytes.length),
    ...u16(0), // extra length
    ...nameBytes,
  ]));
  parts.push(data);

  central.push({
    name: file.name,
    crc: crc.value(),
    size: data.length,
    offset,
    dosTime: time,
    dosDate: date,
  });
}

/**
 * Finish the archive: central directory + end record.
 *
 * @param {Array<Uint8Array|number[]>} parts - Byte chunks so far.
 * @param {Array<{ name: string, crc: number, size: number, offset: number, dosTime: number, dosDate: number }>} central - Central directory entries.
 * @returns {Uint8Array} The complete ZIP file bytes.
 */
export function finalizeZip(parts, central) {
  const directoryStart = parts.reduce((sum, part) => sum + part.length, 0);

  for (const entry of central) {
    const nameBytes = utf8(entry.name);
    parts.push(new Uint8Array([
      ...u32(0x02014b50), // central directory header signature
      ...u16(20), // version made by
      ...u16(20), // version needed
      ...u16(0x0800), // flags
      ...u16(0), // method: store
      ...u16(entry.dosTime),
      ...u16(entry.dosDate),
      ...u32(entry.crc),
      ...u32(entry.size),
      ...u32(entry.size),
      ...u16(nameBytes.length),
      ...u16(0), // extra
      ...u16(0), // comment
      ...u16(0), // disk number
      ...u16(0), // internal attrs
      ...u32(0), // external attrs
      ...u32(entry.offset),
      ...nameBytes,
    ]));
  }

  const directorySize = parts.reduce((sum, part) => sum + part.length, 0) - directoryStart;

  parts.push(new Uint8Array([
    ...u32(0x06054b50), // end of central directory
    ...u16(0), // disk number
    ...u16(0), // start disk
    ...u16(central.length),
    ...u16(central.length),
    ...u32(directorySize),
    ...u32(directoryStart),
    ...u16(0), // comment length
  ]));

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part instanceof Uint8Array ? part : new Uint8Array(part), cursor);
    cursor += part.length;
  }
  return out;
}

/**
 * Build a complete ZIP from a file list.
 *
 * @param {Array<{ name: string, bytes: Uint8Array, modified?: number }>} files - Entries to store.
 * @param {Date} [now] - Default timestamp.
 * @returns {Uint8Array} ZIP bytes.
 */
export function createZip(files, now = new Date()) {
  /** @type {Array<Uint8Array|number[]>} */
  const parts = [];
  /** @type {Array<{ name: string, crc: number, size: number, offset: number, dosTime: number, dosDate: number }>} */
  const central = [];

  for (const file of files) {
    appendZipEntry(parts, central, file, now);
  }

  return finalizeZip(parts, central);
}
