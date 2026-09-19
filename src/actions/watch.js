/**
 * Watch service — keeps an open folder fresh.
 *
 * The refresh is wall-clock triggered (Acode has no cross-process FS events
 * reachable from the WebView), so this module owns the cadence, the pause
 * rules (dialog open, hidden panel, document invisible), and change
 * coalescing. The heavy lifting stays in the scanner.
 */

/**
 * @typedef {Object} WatchOptions
 * @property {() => Promise<any[]>} scan - Rescan the open folder.
 * @property {() => boolean} isPaused - Whether refreshing should pause.
 * @property {number} [intervalMs] - Poll interval.
 */

/** Default poll interval in milliseconds. */
export const DEFAULT_WATCH_INTERVAL = 5000;

/** Fastest interval users may configure. */
export const MIN_WATCH_INTERVAL = 2000;

/** Slowest interval users may configure. */
export const MAX_WATCH_INTERVAL = 60000;

export class WatchService {
  /**
   * @param {WatchOptions} options - Service options.
   */
  constructor(options) {
    if (typeof options.scan !== 'function') {
      throw new TypeError('WatchService requires a scan() function');
    }

    this.scan = options.scan;
    this.isPaused = options.isPaused || (() => false);
    this.intervalMs = clampInterval(options.intervalMs || DEFAULT_WATCH_INTERVAL);

    /** @type {number|null} */
    this.timer = null;
    this.running = false;
    this.refreshing = false;
    /** @type {Set<(info: { changed: boolean, entries: any[] }) => void>} */
    this.listeners = new Set();
    /** @type {any[]|null} */
    this.lastSnapshot = null;
    /** @type {{ adds: number, removes: number, at: number }|null} */
    this.lastChange = null;
  }

  /**
   * Change the poll interval.
   * @param {number} ms - Interval in milliseconds.
   */
  setInterval(ms) {
    this.intervalMs = clampInterval(ms);
    if (this.running) {
      this.stop();
      this.start();
    }
  }

  /** Begin polling. */
  start() {
    if (this.running) return;
    this.running = true;
    this.schedule();
  }

  /** Stop polling. */
  stop() {
    this.running = false;
    if (this.timer != null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Subscribe to change events.
   * @param {(info: { changed: boolean, entries: any[] }) => void} listener - Listener.
   * @returns {() => void} Unsubscribe.
   */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Schedule the next tick (chain, never overlapping). */
  schedule() {
    if (!this.running) return;
    this.timer = window.setTimeout(() => {
      this.tick();
    }, this.intervalMs);
  }

  /** One poll: refresh when nothing else is in the way. */
  async tick() {
    this.timer = null;

    if (!this.running) return;
    if (this.refreshing || this.isPaused()) {
      this.schedule();
      return;
    }

    await this.refreshNow();
    this.schedule();
  }

  /**
   * Scan immediately, detect changes, and notify listeners.
   * @returns {Promise<{ changed: boolean, entries: any[] }>} Scan outcome.
   */
  async refreshNow() {
    if (this.refreshing) return { changed: false, entries: this.lastSnapshot || [] };

    this.refreshing = true;
    try {
      const entries = await this.scan();
      const changed = this.detectChanges(entries);

      if (changed) {
        const info = this.lastChange;
        for (const listener of this.listeners) {
          try {
            listener({ changed: true, entries });
          } catch {
            /* a broken listener must not break the watch */
          }
        }
        if (info) this.lastChange = info;
      }

      this.lastSnapshot = entries;
      return { changed, entries };
    } finally {
      this.refreshing = false;
    }
  }

  /**
   * Detect and record a change between scans.
   *
   * @param {any[]} entries - New listing.
   * @returns {boolean} Whether the listing differs from the previous one.
   */
  detectChanges(entries) {
    if (!this.lastSnapshot) {
      this.lastSnapshot = entries;
      return false;
    }

    const previous = new Set(this.lastSnapshot.map((entry) => `${entry.name}:${entry.isDirectory ? 'd' : 'f'}:${entry.size}:${entry.modified}`));
    const current = new Set((entries || []).map((entry) => `${entry.name}:${entry.isDirectory ? 'd' : 'f'}:${entry.size}:${entry.modified}`));

    let adds = 0;
    let removes = 0;
    for (const key of current) if (!previous.has(key)) adds++;
    for (const key of previous) if (!current.has(key)) removes++;

    if (adds || removes) {
      this.lastChange = { adds, removes, at: Date.now() };
      return true;
    }

    return false;
  }

  /** @returns {{ adds: number, removes: number, at: number }|null} Last change info. */
  get lastChangeInfo() {
    return this.lastChange;
  }
}

/**
 * Clamp a user-provided interval into the supported range.
 * @param {number} ms - Requested interval.
 * @returns {number} Clamped interval.
 */
export function clampInterval(ms) {
  const value = Math.floor(Number(ms) || DEFAULT_WATCH_INTERVAL);
  return Math.min(MAX_WATCH_INTERVAL, Math.max(MIN_WATCH_INTERVAL, value));
}
