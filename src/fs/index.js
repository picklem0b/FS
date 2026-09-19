/**
 * File system layer — barrel export.
 *
 * `import { FolderAccess, FolderScanner } from './fs/index.js'`
 */

export { FolderAccess, createFolderAccess } from './access.js';
export { FolderScanner } from './scanner.js';
export { PreviewService, MAX_TEXT_PREVIEW_BYTES, MAX_IMAGE_PREVIEW_BYTES } from './previews.js';
export { FileReader, createFileReader } from './fileReader.js';
export { createSource, createAcodeSource, createMemorySource } from './source.js';

/** Kinds an entry can be classified as. */
export const FILE_KINDS = {
  TEXT: 'text',
  IMAGE: 'image',
  MEDIA: 'media',
  FOLDER: 'folder',
  BINARY: 'binary',
  OTHER: 'other',
  UNKNOWN: 'unknown',
};

/**
 * @param {string} kind - Entry kind.
 * @returns {boolean} True when the kind is a file (not a folder).
 */
export function isFileKind(kind) {
  return Boolean(kind) && kind !== FILE_KINDS.FOLDER;
}

/**
 * @param {string} kind - Entry kind.
 * @returns {boolean} True when the kind has an inline preview.
 */
export function isPreviewable(kind) {
  return kind === FILE_KINDS.TEXT || kind === FILE_KINDS.IMAGE;
}
