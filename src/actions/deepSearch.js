/**
 * Deep search — recursive name matching plus optional in-file grep.
 *
 * Name matching is substring, glob, or regex over a recursive walk; content
 * search additionally reads candidate files and reports line numbers with
 * snippets. Results are capped so a huge tree cannot exhaust memory.
 */

/**
 * @typedef {import('../platform.js').FileEntry} FileEntry
 */

/**
 * @typedef {Object} ContentHit
 * @property {number} line - 1-based line number.
 * @property {string} text - Matching line, trimmed to a snippet.
 * @property {number} column - 1-based column of the first match.
 */

/** @type {Set<string>} Extensions never read for content search. */
const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'ico', 'avif', 'heic', 'heif',
  'tiff', 'tif', 'mp3', 'wav', 'ogg', 'oga', 'opus', 'flac', 'aac', 'm4a',
  'wma', 'aiff', 'mp4', 'webm', 'mkv', 'mov', 'avi', 'm4v', '3gp', 'zip',
  'gz', 'bz2', 'xz', '7z', 'rar', 'tar', 'apk', 'jar', 'pdf', 'doc', 'docx',
  'xls', 'xlsx', 'ppt', 'pptx', 'exe', 'dll', 'so', 'bin', 'iso', 'dmg',
  'ttf', 'otf', 'woff', 'woff2', 'eot', 'class', 'pyc', 'wasm',
]);

/**
 * @param {string} name - File name.
 * @returns {boolean} True when the file looks textual.
 */
export function isTextualName(name) {
  const dot = String(name || '').lastIndexOf('.');
  if (dot <= 0) return true; // extensionless files are usually text
  const ext = String(name).slice(dot + 1).toLowerCase();
  return !BINARY_EXTENSIONS.has(ext);
}

/**
 * Build a matcher for the given query.
 *
 * @param {{ query: string, regex?: boolean, caseSensitive?: boolean, glob?: boolean }} spec - Query spec.
 * @returns {((value: string) => boolean)|null} Matcher, or null when the query is empty/invalid.
 */
export function buildMatcher(spec) {
  const query = String(spec?.query ?? '').trim();
  if (!query) return null;

  if (spec.regex) {
    try {
      const re = new RegExp(query, spec.caseSensitive ? '' : 'i');
      return (value) => re.test(value);
    } catch {
      return null;
    }
  }

  if (spec.glob) {
    // Reuse the plugin's glob semantics via a local conversion (no import
    // cycle: patterns.js has no imports).
    const source = globToRegExpSource(query);
    const re = new RegExp(`^${source}$`, spec.caseSensitive ? '' : 'i');
    return (value) => re.test(value);
  }

  const needle = spec.caseSensitive ? query : query.toLowerCase();
  return (value) => {
    const hay = spec.caseSensitive ? value : String(value).toLowerCase();
    return hay.includes(needle);
  };
}

/**
 * Build a global RegExp for extracting content matches.
 *
 * @param {{ query: string, regex?: boolean, caseSensitive?: boolean }} spec - Query spec.
 * @returns {RegExp|null} Global regex, or null.
 */
export function buildContentRegex(spec) {
  const query = String(spec?.query ?? '');
  if (!query.trim()) return null;

  const flags = 'g' + (spec.caseSensitive ? '' : 'i');
  try {
    if (spec.regex) return new RegExp(query, flags);
    // Plain queries are matched literally.
    return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  } catch {
    return null;
  }
}

/**
 * Convert a glob to a regexp source (dots literal, `*`/`?`/`**` supported).
 * @param {string} glob - Pattern.
 * @returns {string} Regexp source.
 */
function globToRegExpSource(glob) {
  let out = '';
  const source = String(glob);
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
    out += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return out;
}

/**
 * Extract matching lines from text content.
 *
 * @param {string} content - File text.
 * @param {RegExp} matcher - Global regular expression.
 * @param {{ maxHits?: number, maxLineLength?: number }} [options] - Limits.
 * @returns {ContentHit[]} Hits.
 */
export function matchContentLines(content, matcher, options = {}) {
  const maxHits = Math.max(1, Number(options.maxHits) || 50);
  const maxLineLength = Math.max(20, Number(options.maxLineLength) || 160);

  const lines = String(content).split(/\r\n|\r|\n/);
  /** @type {ContentHit[]} */
  const hits = [];

  for (let index = 0; index < lines.length && hits.length < maxHits; index++) {
    matcher.lastIndex = 0;
    const match = matcher.exec(lines[index]);
    if (!match) continue;

    const raw = lines[index];
    const column = match.index + 1;
    let text = raw.trim();
    if (text.length > maxLineLength) {
      // Keep the match near the centre of the snippet.
      const start = Math.max(0, match.index - Math.floor(maxLineLength / 3));
      text = (start > 0 ? '…' : '') + raw.slice(start, start + maxLineLength).trim() + '…';
    }

    hits.push({ line: index + 1, text, column });
  }

  return hits;
}

/**
 * Which files should be read for a content search.
 *
 * @param {FileEntry[]} entries - All scanned entries.
 * @param {{ maxFileBytes?: number, textualOnly?: boolean, maxFiles?: number }} [options] - Limits.
 * @returns {FileEntry[]} Candidate files.
 */
export function contentCandidates(entries, options = {}) {
  const maxFileBytes = Number(options.maxFileBytes) || 1024 * 1024;
  const maxFiles = Math.max(1, Number(options.maxFiles) || 400);
  const textualOnly = options.textualOnly !== false;

  const list = (entries || []).filter(
    (entry) => entry && entry.isFile && entry.url,
  );

  const filtered = textualOnly ? list.filter((entry) => isTextualName(entry.name)) : list;

  return filtered
    .filter((entry) => (Number(entry.size) || 0) <= maxFileBytes)
    .slice(0, maxFiles);
}

/**
 * Run a deep search over a scanned tree.
 *
 * @param {FileEntry[]} entries - Flat recursive listing.
 * @param {{ query: string, regex?: boolean, caseSensitive?: boolean, glob?: boolean, inContents?: boolean, maxResults?: number, maxFileBytes?: number }} spec - Search spec.
 * @param {{ readText?: (url: string) => Promise<string> }} io - Text reader.
 * @returns {Promise<{ nameMatches: FileEntry[], contentMatches: Array<{ entry: FileEntry, hits: ContentHit[] }>, scannedContents: number, truncated: boolean }>} Results.
 */
export async function deepSearch(entries, spec, io) {
  const maxResults = Math.max(1, Number(spec.maxResults) || 200);
  const nameMatcher = buildMatcher(spec);
  const contentRegex = spec.inContents ? buildContentRegex(spec) : null;

  /** @type {FileEntry[]} */
  const nameMatches = [];
  let truncated = false;

  for (const entry of entries || []) {
    if (!entry.isFile) continue;
    if (nameMatcher && nameMatcher(entry.name)) {
      if (nameMatches.length >= maxResults) {
        truncated = true;
        break;
      }
      nameMatches.push(entry);
    }
  }

  /** @type {Array<{ entry: FileEntry, hits: ContentHit[] }>} */
  const contentMatches = [];
  let scannedContents = 0;

  if (contentRegex) {
    const candidates = contentCandidates(entries, { maxFileBytes: spec.maxFileBytes });

    for (const file of candidates) {
      if (contentMatches.length >= maxResults) {
        truncated = true;
        break;
      }
      if (!io || typeof io.readText !== 'function') break;

      let text;
      try {
        text = await io.readText(file.url);
      } catch {
        continue;
      }
      scannedContents++;

      const hits = matchContentLines(text, contentRegex);
      if (hits.length) contentMatches.push({ entry: file, hits });
    }
  }

  return { nameMatches, contentMatches, scannedContents, truncated };
}
