/**
 * Places — pinned and recent folders.
 *
 * The panel's folder picker is one dialog deep; Places keeps the folders the
 * user actually works in one tap away, with recents ranked by usage and
 * everything persisted through the settings store.
 */

/** Maximum number of pinned folders kept. */
export const MAX_PINNED = 12;

/** Maximum number of recent folders kept. */
export const MAX_RECENTS = 8;

/**
 * @typedef {{ url: string, title: string, pinnedAt?: number, lastUsed?: number, useCount?: number }} Place
 */

export class Places {
  /**
   * @param {{ get: (key: string, fallback?: any) => any, set: (key: string, value: any, options?: any) => void }} store - Persistent store (the settings store works).
   * @param {{ pinnedKey: string, recentsKey: string }} keys - Storage keys.
   */
  constructor(store, keys) {
    this.store = store;
    this.pinnedKey = keys.pinnedKey;
    this.recentsKey = keys.recentsKey;
  }

  /**
   * @returns {Place[]} Pinned folders, oldest pin first.
   */
  pinned() {
    return this.readList(this.pinnedKey);
  }

  /**
   * @returns {Place[]} Recent folders, most recent first.
   */
  recents() {
    const list = this.readList(this.recentsKey);
    list.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    return list;
  }

  /**
   * Record a folder being opened: bumps recents and usage counts.
   *
   * @param {string} url - Folder url.
   * @param {string} [title] - Display title.
   * @param {number} [when] - Timestamp override (tests).
   * @returns {void}
   */
  touch(url, title, when = Date.now()) {
    if (!url) return;

    const list = this.readList(this.recentsKey);
    const existing = list.find((place) => place.url === url);

    if (existing) {
      existing.lastUsed = when;
      existing.useCount = (existing.useCount || 0) + 1;
      if (title) existing.title = title;
    } else {
      list.unshift({ url, title: title || url, lastUsed: when, useCount: 1 });
    }

    this.store.set(this.recentsKey, list.slice(0, MAX_RECENTS).map(clean), { silent: true });
  }

  /**
   * Pin a folder.
   *
   * @param {string} url - Folder url.
   * @param {string} [title] - Display title.
   * @returns {boolean} Whether the folder is now pinned.
   */
  pin(url, title) {
    if (!url) return false;

    const list = this.readList(this.pinnedKey);
    if (list.some((place) => place.url === url)) return true;
    if (list.length >= MAX_PINNED) list.shift();

    list.push({ url, title: title || url, pinnedAt: Date.now() });
    this.store.set(this.pinnedKey, list.map(clean), { silent: true });
    return true;
  }

  /**
   * Remove a pin.
   * @param {string} url - Folder url.
   */
  unpin(url) {
    const list = this.readList(this.pinnedKey).filter((place) => place.url !== url);
    this.store.set(this.pinnedKey, list.map(clean), { silent: true });
  }

  /**
   * Whether a folder is pinned.
   * @param {string} url - Folder url.
   * @returns {boolean} True when pinned.
   */
  isPinned(url) {
    return this.pinned().some((place) => place.url === url);
  }

  /**
   * Forget a recent entry.
   * @param {string} url - Folder url.
   */
  forgetRecent(url) {
    const list = this.readList(this.recentsKey).filter((place) => place.url !== url);
    this.store.set(this.recentsKey, list.map(clean), { silent: true });
  }

  /** Clear recents; pins survive. */
  clearRecents() {
    this.store.set(this.recentsKey, [], { silent: true });
  }

  /**
   * Read a stored place list, tolerating corrupt data.
   * @param {string} key - Storage key.
   * @returns {Place[]} Places.
   */
  readList(key) {
    const raw = this.store.get(key, []);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((place) => place && typeof place.url === 'string' && place.url)
      .map((place) => ({
        url: place.url,
        title: typeof place.title === 'string' && place.title ? place.title : place.url,
        pinnedAt: Number(place.pinnedAt) || 0,
        lastUsed: Number(place.lastUsed) || 0,
        useCount: Number(place.useCount) || 0,
      }));
  }
}

/**
 * Strip undefined fields so persisted JSON stays small.
 * @param {Place} place - Place.
 * @returns {Record<string, any>} Clean place.
 */
function clean(place) {
  const out = { url: place.url, title: place.title };
  if (place.pinnedAt) out.pinnedAt = place.pinnedAt;
  if (place.lastUsed) out.lastUsed = place.lastUsed;
  if (place.useCount) out.useCount = place.useCount;
  return out;
}
