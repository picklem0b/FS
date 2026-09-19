/**
 * Settings schema and store.
 *
 * Values are persisted by the plugin itself (not only by the host) so the
 * panel behaves identically before and after Acode restores plugin state.
 */

/**
 * @typedef {'boolean'|'number'|'string'} SettingType
 * @typedef {Object} SettingDefinition
 * @property {string} key
 * @property {string} text
 * @property {SettingType} type
 * @property {boolean|number|string} defaultValue
 * @property {string} [info]
 * @property {Array<[string, string]>} [options]
 * @property {string} [prompt]
 * @property {'number'|'text'} [promptType]
 * @property {string} [group]
 */

/** @type {SettingDefinition[]} */
export const SETTINGS_SCHEMA = [
  // --- Display -------------------------------------------------------------
  {
    key: 'display_showSize',
    text: 'Show file size',
    type: 'boolean',
    defaultValue: true,
    group: 'Display',
    info: 'Display the size column for every file.',
  },
  {
    key: 'display_showModified',
    text: 'Show modified date',
    type: 'boolean',
    defaultValue: true,
    group: 'Display',
    info: 'Display when each file was last changed.',
  },
  {
    key: 'display_showKind',
    text: 'Show file type',
    type: 'boolean',
    defaultValue: true,
    group: 'Display',
    info: 'Display whether an entry is text, image, media, or binary.',
  },
  {
    key: 'display_showIcons',
    text: 'Show type icons',
    type: 'boolean',
    defaultValue: true,
    group: 'Display',
  },
  {
    key: 'display_relativeDate',
    text: 'Use relative dates',
    type: 'boolean',
    defaultValue: true,
    group: 'Display',
    info: 'Show "3 h ago" instead of a full timestamp.',
  },
  {
    key: 'display_showHidden',
    text: 'Show hidden files',
    type: 'boolean',
    defaultValue: false,
    group: 'Display',
    info: 'Include dotfiles in the listing.',
  },
  {
    key: 'display_compactRows',
    text: 'Compact rows',
    type: 'boolean',
    defaultValue: false,
    group: 'Display',
    info: 'Fit more entries on screen by trimming row height.',
  },

  // --- Sorting -------------------------------------------------------------
  {
    key: 'sort_field',
    text: 'Sort by',
    type: 'string',
    defaultValue: 'name',
    group: 'Sorting',
    options: [
      ['name', 'Name'],
      ['size', 'Size'],
      ['date', 'Date modified'],
      ['type', 'Type'],
    ],
  },
  {
    key: 'sort_direction',
    text: 'Sort direction',
    type: 'string',
    defaultValue: 'asc',
    group: 'Sorting',
    options: [
      ['asc', 'Ascending'],
      ['desc', 'Descending'],
    ],
  },
  {
    key: 'sort_foldersFirst',
    text: 'Folders first',
    type: 'boolean',
    defaultValue: true,
    group: 'Sorting',
    info: 'Keep folders above files regardless of direction.',
  },

  // --- Preview -------------------------------------------------------------
  {
    key: 'preview_textEnabled',
    text: 'Preview text files',
    type: 'boolean',
    defaultValue: true,
    group: 'Preview',
  },
  {
    key: 'preview_imageEnabled',
    text: 'Preview images',
    type: 'boolean',
    defaultValue: true,
    group: 'Preview',
  },
  {
    key: 'preview_maxKb',
    text: 'Text preview limit (KB)',
    type: 'number',
    defaultValue: 256,
    group: 'Preview',
    prompt: 'Maximum size to read for a text preview, in kilobytes',
    promptType: 'number',
    info: 'Files above this size are not read into memory.',
  },

  // --- Folder scanning -----------------------------------------------------
  {
    key: 'folder_recursive',
    text: 'Scan subfolders',
    type: 'boolean',
    defaultValue: false,
    group: 'Scanning',
    info: 'Include nested files when a folder is scanned.',
  },
  {
    key: 'folder_maxDepth',
    text: 'Maximum depth',
    type: 'number',
    defaultValue: 3,
    group: 'Scanning',
    prompt: 'Deepest level to walk when scanning subfolders',
    promptType: 'number',
  },
  {
    key: 'folder_maxFiles',
    text: 'Maximum entries',
    type: 'number',
    defaultValue: 5000,
    group: 'Scanning',
    prompt: 'Stop after this many entries',
    promptType: 'number',
    info: 'Prevents enormous folders from locking the listing.',
  },
  {
    key: 'folder_ignore',
    text: 'Ignore patterns',
    type: 'string',
    defaultValue: '',
    group: 'Scanning',
    prompt: 'Comma separated globs, e.g. *.log, build/**, .git/**',
    promptType: 'text',
    info: 'Globs only (*, ?, **). Matched names are hidden.',
  },

  // --- Tools ---------------------------------------------------------------
  {
    key: 'tools_batchEnabled',
    text: 'Batch actions',
    type: 'boolean',
    defaultValue: true,
    group: 'Tools',
    info: 'Rename, move, copy, and delete several files at once.',
  },
  {
    key: 'tools_cleanupEnabled',
    text: 'Cleanup insights',
    type: 'boolean',
    defaultValue: true,
    group: 'Tools',
    info: 'Surface temporary files, backups, duplicates, and large files.',
  },
  {
    key: 'behavior_confirmDestructive',
    text: 'Confirm destructive actions',
    type: 'boolean',
    defaultValue: true,
    group: 'Tools',
    info: 'Ask before deleting or renaming.',
  },
  {
    key: 'advanced_largeSizeMb',
    text: 'Large file threshold (MB)',
    type: 'number',
    defaultValue: 10,
    group: 'Tools',
    prompt: 'Files above this size are flagged as large',
    promptType: 'number',
  },
  {
    key: 'advanced_recentDays',
    text: 'Recent file window (days)',
    type: 'number',
    defaultValue: 30,
    group: 'Tools',
    prompt: 'Files changed within this many days count as recent',
    promptType: 'number',
  },

  // --- Reports -------------------------------------------------------------
  {
    key: 'report_format',
    text: 'Report format',
    type: 'string',
    defaultValue: 'text',
    group: 'Reports',
    options: [
      ['text', 'Plain text'],
      ['markdown', 'Markdown'],
      ['csv', 'CSV'],
    ],
    info: 'CSV exports the file listing only, which is what spreadsheets want.',
  },
  {
    key: 'report_includePaths',
    text: 'Include full paths',
    type: 'boolean',
    defaultValue: false,
    group: 'Reports',
    info: 'Add the full url of every entry to the report.',
  },
  {
    key: 'report_includeListing',
    text: 'Include the file listing',
    type: 'boolean',
    defaultValue: true,
    group: 'Reports',
    info: 'Turn off for a summary-only report.',
  },

  // --- Tools (new features) ------------------------------------------------
  {
    key: 'tools_duplicatesEnabled',
    text: 'Duplicate content finder',
    type: 'boolean',
    defaultValue: true,
    group: 'Tools',
    info: 'Detect files with identical contents and how much space they waste.',
  },
  {
    key: 'tools_zipEnabled',
    text: 'ZIP folder export',
    type: 'boolean',
    defaultValue: true,
    group: 'Tools',
    info: 'Bundle the open folder into a .zip archive.',
  },
  {
    key: 'tools_watchEnabled',
    text: 'Live auto-refresh',
    type: 'boolean',
    defaultValue: true,
    group: 'Tools',
    info: 'Rescan the open folder periodically so the listing stays current.',
  },
  {
    key: 'tools_watchInterval',
    text: 'Auto-refresh interval (seconds)',
    type: 'number',
    defaultValue: 5,
    group: 'Tools',
    prompt: 'Seconds between automatic rescans (2–60)',
    promptType: 'number',
  },
  {
    key: 'search_grepEnabled',
    text: 'Search inside files',
    type: 'boolean',
    defaultValue: true,
    group: 'Tools',
    info: 'Deep search also scans file contents, with line hits.',
  },

  // --- Layout --------------------------------------------------------------
  {
    key: 'layout_mode',
    text: 'Panel layout',
    type: 'string',
    defaultValue: 'auto',
    group: 'Layout',
    options: [
      ['auto', 'Automatic'],
      ['mobile', 'Full screen'],
      ['desktop', 'Docked side panel'],
    ],
    info: 'Automatic uses full screen on phones and a resizable docked panel on wider screens.',
  },
  {
    key: 'layout_side',
    text: 'Dock side',
    type: 'string',
    defaultValue: 'right',
    group: 'Layout',
    options: [
      ['right', 'Right'],
      ['left', 'Left'],
    ],
  },
  {
    key: 'folder_rememberLast',
    text: 'Remember last folder',
    type: 'boolean',
    defaultValue: true,
    group: 'Layout',
    info: 'Reopen the previous folder when the panel starts.',
  },
];

/** Keys the panel persists but does not show in the settings page. */
export const INTERNAL_KEYS = {
  lastFolder: 'internal_lastFolder',
  lastFolderTitle: 'internal_lastFolderTitle',
  panelWidth: 'internal_panelWidth',
  expanded: 'internal_expanded',
  recentFolders: 'internal_recentFolders',
  pinnedFolders: 'internal_pinnedFolders',
  snapshot: 'internal_snapshot',
};

/** Icon shown next to each setting row in Acode's plugin page. */
const SETTING_ICON = 'file';

const STORAGE_PREFIX = 'acode.fs.util:settings';

export class SettingsStore {
  /**
   * @param {{ pluginId?: string, storage?: Storage|null }} [options] - Store options.
   */
  constructor(options = {}) {
    this.pluginId = options.pluginId || 'acode.fs.util';
    this.storage = options.storage !== undefined ? options.storage : safeStorage();
    /** @type {Map<string, boolean|number|string>} */
    this.values = new Map();
    /** @type {Set<(key: string, value: any) => void>} */
    this.listeners = new Set();

    this.load();
  }

  /**
   * Populate defaults, then overlay persisted values.
   */
  load() {
    for (const definition of SETTINGS_SCHEMA) {
      this.values.set(definition.key, definition.defaultValue);
    }

    const saved = this.read();
    for (const [key, value] of Object.entries(saved || {})) {
      this.values.set(key, value);
    }
  }

  /**
   * @returns {Record<string, any>} Persisted values.
   */
  read() {
    if (!this.storage) return {};
    try {
      const raw = this.storage.getItem(`${STORAGE_PREFIX}:${this.pluginId}`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  /** Write current values back to storage. */
  persist() {
    if (!this.storage) return;
    try {
      this.storage.setItem(
        `${STORAGE_PREFIX}:${this.pluginId}`,
        JSON.stringify(Object.fromEntries(this.values)),
      );
    } catch {
      /* storage full or blocked — keep working in memory */
    }
  }

  /**
   * @param {string} key - Setting key.
   * @param {any} [fallback] - Value when the key is unknown.
   * @returns {any} Current value.
   */
  get(key, fallback = undefined) {
    return this.values.has(key) ? this.values.get(key) : fallback;
  }

  /**
   * @param {string} key - Setting key.
   * @param {any} value - New value.
   * @param {{ silent?: boolean }} [options] - Set options.
   */
  set(key, value, options = {}) {
    const coerced = this.coerce(key, value);
    if (this.values.get(key) === coerced) return;

    this.values.set(key, coerced);
    this.persist();

    if (!options.silent) {
      for (const listener of this.listeners) listener(key, coerced);
    }
  }

  /**
   * Coerce an incoming value to the schema type.
   * @param {string} key - Setting key.
   * @param {any} value - Raw value.
   * @returns {any} Coerced value.
   */
  coerce(key, value) {
    const definition = SETTINGS_SCHEMA.find((item) => item.key === key);
    if (!definition) return value;

    if (definition.type === 'boolean') return Boolean(value);
    if (definition.type === 'number') {
      const number = Number(value);
      return Number.isFinite(number) ? number : definition.defaultValue;
    }
    return value == null ? definition.defaultValue : String(value);
  }

  /**
   * @returns {Record<string, any>} Snapshot of every value.
   */
  all() {
    return Object.fromEntries(this.values);
  }

  /**
   * @param {(key: string, value: any) => void} listener - Change listener.
   * @returns {() => void} Unsubscribe.
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Apply a value coming from Acode's plugin settings page.
   * @param {string} key - Setting key.
   * @param {any} value - New value.
   */
  applyExternal(key, value) {
    this.set(key, value);
  }

  /**
   * Parse the ignore-pattern setting into a glob list.
   * @returns {string[]} Trimmed pattern list.
   */
  ignorePatterns() {
    return String(this.get('folder_ignore', ''))
      .split(',')
      .map((pattern) => pattern.trim())
      .filter(Boolean);
  }

  /**
   * Build the list Acode renders on the plugin settings page.
   * @returns {any[]} Host setting descriptors.
   */
  toHostSettings() {
    return SETTINGS_SCHEMA.map((definition) => {
      /** @type {any} */
      const row = {
        key: definition.key,
        text: definition.text,
        icon: SETTING_ICON,
        info: definition.info || '',
        value: this.get(definition.key, definition.defaultValue),
      };

      if (definition.type === 'boolean') {
        row.checkbox = true;
      } else if (definition.options) {
        row.select = definition.options;
        row.valueText = (value) => {
          const match = definition.options?.find(([option]) => option === value);
          return match ? match[1] : String(value ?? '');
        };
      } else if (definition.prompt) {
        row.prompt = definition.prompt;
        row.promptType = definition.promptType || 'text';
      }

      return row;
    });
  }
}

/**
 * Resolve a usable Web Storage instance.
 * @returns {Storage|null} Storage, or null when unavailable.
 */
function safeStorage() {
  try {
    const { localStorage } = window;
    const probe = `${STORAGE_PREFIX}:probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}
