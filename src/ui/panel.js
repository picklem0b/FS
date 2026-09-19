/**
 * WorkspacePanel — the folder workspace UI.
 *
 * One component renders in two shapes, chosen by viewport width (overridable in
 * settings): a full-screen sheet on phones, and a docked, drag-resizable side
 * panel on wider screens. State is identical in both, so switching orientation
 * mid-session does not lose the open folder or the selection.
 */

import * as platform from '../platform.js';
import { INTERNAL_KEYS } from '../settings.js';
import { sortFiles, countByKind } from '../utils/sort.js';
import { formatSize, formatCount, formatDate, formatRelativeTime, typeLabel } from '../utils/format.js';
import { buildReport, reportFileName, reportFormat } from '../actions/report.js';
import { el, clear, icon } from './dom.js';
import { STYLE_ID, STYLES } from './styles.js';

/** Rows rendered at once; the rest are reachable by narrowing the filter. */
const RENDER_LIMIT = 500;

/** Dock width bounds in CSS pixels. */
const MIN_DOCK_WIDTH = 300;
const MAX_DOCK_WIDTH = 760;

/** Kind icons used in the list and filter chips. */
const KIND_ICON = {
  folder: 'folder',
  text: 'text',
  image: 'image',
  media: 'media',
  binary: 'archive',
  other: 'file',
  unknown: 'file',
};

export class WorkspacePanel {
  /**
   * @param {Object} deps - Dependencies.
   * @param {import('../settings.js').SettingsStore} deps.settings - Settings store.
   * @param {any} deps.access - FolderAccess instance.
   * @param {any} deps.scanner - FolderScanner instance.
   * @param {any} deps.actions - ActionService instance.
   * @param {any} deps.preview - PreviewService instance.
   */
  constructor(deps) {
    this.settings = deps.settings;
    this.access = deps.access;
    this.scanner = deps.scanner;
    this.actions = deps.actions;
    this.preview = deps.preview;

    /** @type {string|null} */
    this.rootUrl = null;
    this.rootTitle = '';
    /** @type {any[]} */
    this.entries = [];
    /** @type {any[]} */
    this.visible = [];
    this.query = '';
    this.kindFilter = 'all';
    /** @type {Set<string>} */
    this.selection = new Set();
    this.selecting = false;
    /** @type {'list'|'detail'|'preview'} */
    this.view = 'list';
    /** @type {any} */
    this.previewEntry = null;
    /** @type {any} */
    this.previewData = null;
    /** @type {string} */
    this.reportContent = '';
    this.reportFileName = '';
    this.loading = false;
    this.progress = { done: 0, total: 0 };
    this.open = false;
    /** @type {any[]} */
    this.disposers = [];
    this.backGuardPushed = false;

    this.element = this.buildShell();
    this.scrim = el('div', { class: 'fs-scrim', hidden: true });

    this.disposers.push(
      this.settings.subscribe(() => {
        this.applySettings();
        this.renderBody();
        this.renderChips();
        this.applyLayout();
      }),
    );
  }

  /* ---------------------------------------------------------------- *
   * Shell
   * ---------------------------------------------------------------- */

  buildShell() {
    this.searchInput = /** @type {HTMLInputElement} */ (
      el('input', {
        class: 'fs-input',
        type: 'search',
        placeholder: 'Filter files',
        aria: { label: 'Filter files in this folder' },
        on: { input: () => this.onSearchInput() },
      })
    );

    this.titleName = el('strong', { text: 'Folder workspace' });
    this.titlePath = el('span', { text: 'No folder selected' });

    this.detailBtn = this.button('info', 'Folder summary', () => this.showDetail());
    this.sortBtn = this.button('sort', 'Change sorting', () => this.pickSort());
    this.refreshBtn = this.button('refresh', 'Refresh folder', () => this.refresh());
    this.selectBtn = this.button('select', 'Select files', () => this.toggleSelecting());
    this.moreBtn = this.button('more', 'More actions', (ev) => this.showFolderMenu(ev));
    this.closeBtn = this.button('close', 'Close folder workspace', () => this.hide());

    this.header = el('header', { class: 'fs-header' }, [
      this.closeBtn,
      el('div', { class: 'fs-title' }, [this.titleName, this.titlePath]),
      this.detailBtn,
      this.sortBtn,
      this.selectBtn,
      this.refreshBtn,
      this.moreBtn,
    ]);

    this.chips = el('div', { class: 'fs-chips', role: 'toolbar', aria: { label: 'Filter by type' } });
    this.body = el('div', { class: 'fs-body', tabindex: '-1' });
    this.progressBar = el('div', { class: 'fs-progress' });
    this.footerText = el('span', { text: 'Ready' });
    this.footer = el('footer', { class: 'fs-footer' }, [this.footerText]);

    this.batchMoveBtn = this.button('move', 'Move selected', () => this.actions.moveEntries(this.selectedEntries()), 'fs-btn');
    this.batchCopyBtn = this.button('copy', 'Copy selected', () => this.actions.copyEntries(this.selectedEntries()), 'fs-btn');
    this.batchRenameBtn = this.button('edit', 'Rename selected', () => this.runBatchRename(), 'fs-btn');
    this.batchDeleteBtn = this.button('trash', 'Delete selected', () => this.runBatchDelete(), 'fs-btn fs-danger');
    this.batchCancelBtn = this.button('close', 'Clear selection', () => this.clearSelection(), 'fs-btn');
    this.batchBar = el('div', { class: 'fs-batch', hidden: true }, [
      this.batchMoveBtn,
      this.batchCopyBtn,
      this.batchRenameBtn,
      this.batchDeleteBtn,
      this.batchCancelBtn,
    ]);

    this.resizer = el('div', {
      class: 'fs-resizer',
      role: 'separator',
      aria: { orientation: 'vertical', label: 'Resize folder panel' },
      title: 'Drag to resize',
    });
    this.bindResizer();

    this.element = el('div', {
      class: 'fs-root',
      role: 'dialog',
      aria: { modal: 'false', label: 'Folder workspace' },
      hidden: true,
    }, [
      this.resizer,
      this.header,
      el('div', { class: 'fs-search' }, [
        icon('search'),
        this.searchInput,
      ]),
      this.chips,
      this.body,
      this.batchBar,
      this.progressBar,
      this.footer,
    ]);

    this.element.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && this.open) this.hide();
    });

    return this.element;
  }

  /**
   * @param {keyof typeof import('./dom.js').ICONS} name - Icon name.
   * @param {string} label - Accessible label.
   * @param {(ev: Event) => void} handler - Click handler.
   * @param {string} [className] - Extra classes.
   * @returns {HTMLElement} Button element.
   */
  button(name, label, handler, className = 'fs-btn') {
    return el('button', {
      class: className,
      type: 'button',
      title: label,
      aria: { label },
      on: { click: handler },
    }, [icon(name)]);
  }

  /* ---------------------------------------------------------------- *
   * Lifecycle
   * ---------------------------------------------------------------- */

  /**
   * Attach the panel to the document.
   * @param {HTMLElement} [parent] - Mount point, defaults to `document.body`.
   */
  mount(parent = document.body) {
    injectStyles();
    if (!this.scrim.isConnected) document.body.appendChild(this.scrim);
    if (!this.element.isConnected) parent.appendChild(this.element);

    this.disposers.push(platform.onResize(() => {
      this.applyLayout();
    }));

    this.scrim.addEventListener('click', () => this.hide());
    window.addEventListener('popstate', this.onPopState = () => {
      if (this.open) this.hide({ skipHistory: true });
    });
  }

  /**
   * Show the panel, restoring the last folder when configured.
   * @param {{ focus?: boolean }} [options] - Show options.
   */
  async show(options = {}) {
    this.open = true;
    this.element.hidden = false;
    this.applySettings();
    this.applyLayout();

    if (this.isMobile()) {
      this.scrim.hidden = false;
      // Intercept the Android back button while the sheet is up.
      try {
        window.history.pushState({ fsPanel: true }, '');
        this.backGuardPushed = true;
      } catch {
        this.backGuardPushed = false;
      }
    }

    if (!this.rootUrl && this.settings.get('folder_rememberLast') !== false) {
      const url = this.settings.get(INTERNAL_KEYS.lastFolder);
      const title = this.settings.get(INTERNAL_KEYS.lastFolderTitle);
      if (url) this.rootUrl = url;
      if (title) this.rootTitle = title;
    }

    if (!this.rootUrl) {
      await this.chooseFolder();
      if (!this.rootUrl) {
        this.hide();
        return;
      }
    }

    await this.refresh();
    if (options.focus !== false) this.body.focus();
  }

  /**
   * Hide the panel.
   * @param {{ skipHistory?: boolean }} [options] - Hide options.
   */
  hide(options = {}) {
    if (!this.open) return;
    this.open = false;
    this.element.hidden = true;
    this.scrim.hidden = true;
    this.progressWidth(0);

    if (this.backGuardPushed && !options.skipHistory) {
      this.backGuardPushed = false;
      try {
        window.history.back();
      } catch {
        /* ignore */
      }
    } else {
      this.backGuardPushed = false;
    }
  }

  /** Toggle visibility. */
  toggle() {
    if (this.open) this.hide();
    else this.show();
  }

  /** Release listeners and remove elements. */
  destroy() {
    for (const dispose of this.disposers) {
      try {
        dispose();
      } catch {
        /* ignore */
      }
    }
    this.disposers = [];
    if (this.onPopState) window.removeEventListener('popstate', this.onPopState);
    this.scrim.remove();
    this.element.remove();
    this.actions?.dispose?.();
  }

  /* ---------------------------------------------------------------- *
   * Layout
   * ---------------------------------------------------------------- */

  /** @returns {boolean} True when the sheet layout is active. */
  isMobile() {
    const context = platform.getLayoutContext(this.settings.get('layout_mode', 'auto'));
    return context.mode === 'mobile';
  }

  /** Apply responsive classes, dock width, and scrim visibility. */
  applyLayout() {
    const mode = this.settings.get('layout_mode', 'auto');
    const side = this.settings.get('layout_side', 'right') === 'left' ? 'left' : 'right';
    const mobile = this.isMobile();

    this.element.classList.toggle('fs-mode-mobile', mobile);
    this.element.classList.toggle('fs-mode-desktop', !mobile);
    this.element.classList.toggle('fs-side-right', side === 'right');
    this.element.classList.toggle('fs-side-left', side === 'left');
    this.element.setAttribute('aria-modal', mobile ? 'true' : 'false');

    if (!mobile) {
      const width = clampDockWidth(Number(this.settings.get(INTERNAL_KEYS.panelWidth)) || 420);
      this.element.style.width = `${width}px`;
      this.element.style[side === 'left' ? 'right' : 'left'] = 'auto';
    } else {
      this.element.style.width = '';
    }

    this.scrim.hidden = !this.open || !mobile;
  }

  /** Wire pointer drag on the resizer (works with mouse and touch). */
  bindResizer() {
    /** @type {number|null} */
    let activeId = null;

    const onMove = (ev) => {
      if (activeId == null || ev.pointerId !== activeId) return;
      const side = this.settings.get('layout_side', 'right') === 'left' ? 'left' : 'right';
      const width = side === 'left' ? ev.clientX : window.innerWidth - ev.clientX;
      this.element.style.width = `${clampDockWidth(width)}px`;
    };

    const onUp = (ev) => {
      if (activeId == null || ev.pointerId !== activeId) return;
      activeId = null;
      this.resizer.classList.remove('fs-dragging');
      try {
        this.resizer.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);

      const width = Math.round(this.element.getBoundingClientRect().width);
      this.settings.set(INTERNAL_KEYS.panelWidth, clampDockWidth(width), { silent: true });
    };

    this.resizer.addEventListener('pointerdown', (ev) => {
      if (this.isMobile()) return;
      activeId = ev.pointerId;
      this.resizer.classList.add('fs-dragging');
      try {
        this.resizer.setPointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      ev.preventDefault();
    });

    // Keyboard resize keeps the dock usable without a pointer.
    this.resizer.addEventListener('keydown', (ev) => {
      const current = Math.round(this.element.getBoundingClientRect().width) || 420;
      const step = ev.shiftKey ? 40 : 16;
      if (ev.key === 'ArrowLeft') {
        this.settings.set(INTERNAL_KEYS.panelWidth, clampDockWidth(current + step), { silent: true });
        this.applyLayout();
        ev.preventDefault();
      } else if (ev.key === 'ArrowRight') {
        this.settings.set(INTERNAL_KEYS.panelWidth, clampDockWidth(current - step), { silent: true });
        this.applyLayout();
        ev.preventDefault();
      }
    });
  }

  /* ---------------------------------------------------------------- *
   * Folder loading
   * ---------------------------------------------------------------- */

  /** Ask the user for a folder and load it. */
  async chooseFolder() {
    const folder = await platform.pickFolder();
    if (!folder) return;

    this.rootUrl = folder.url;
    this.rootTitle = folder.title;
    this.selection.clear();
    this.selecting = false;
    this.view = 'list';

    this.settings.set(INTERNAL_KEYS.lastFolder, this.rootUrl, { silent: true });
    this.settings.set(INTERNAL_KEYS.lastFolderTitle, this.rootTitle, { silent: true });
  }

  /**
   * Load a specific folder without prompting.
   * @param {string} url - Folder url.
   * @param {string} [title] - Display title.
   */
  async openRoot(url, title = '') {
    if (!url) return;
    this.rootUrl = url;
    this.rootTitle = title || basename(url);
    this.selection.clear();
    this.selecting = false;
    this.kindFilter = 'all';
    this.view = 'list';
    this.settings.set(INTERNAL_KEYS.lastFolder, this.rootUrl, { silent: true });
    this.settings.set(INTERNAL_KEYS.lastFolderTitle, this.rootTitle, { silent: true });
    await this.refresh();
  }

  /** @returns {string|null} Currently open folder url. */
  currentRoot() {
    return this.rootUrl;
  }

  /** Reload the current folder from the source. */
  async refresh() {
    if (!this.rootUrl) return;

    this.loading = true;
    this.progress = { done: 0, total: 0 };
    this.footerText.textContent = 'Scanning…';
    this.titleName.textContent = this.rootTitle || basename(this.rootUrl);
    this.titlePath.textContent = this.rootUrl;
    this.renderBody();

    try {
      this.access.invalidate(this.rootUrl);
      const entries = await this.scanner.getFiles(this.rootUrl, {
        recursive: this.settings.get('folder_recursive') === true,
        hideIgnored: true,
        includeFolders: true,
        includeFiles: true,
        limit: Number(this.settings.get('folder_maxFiles')) || 5000,
        maxDepth: Number(this.settings.get('folder_maxDepth')) || 3,
        onProgress: (done, total) => this.onScanProgress(done, total),
      });

      this.entries = this.settings.get('display_showHidden') === true
        ? entries
        : entries.filter((entry) => !entry.name.startsWith('.'));

      this.applyFilterAndSort();
      this.footerText.textContent = this.statusLine();
    } catch (err) {
      this.entries = [];
      this.visible = [];
      this.footerText.textContent = `Could not read folder: ${err?.message || err}`;
    } finally {
      this.loading = false;
      this.progressWidth(0);
      this.renderChips();
      this.renderBody();
    }
  }

  /**
   * @param {number} done - Files inspected.
   * @param {number} total - Files to inspect.
   */
  onScanProgress(done, total) {
    this.progress = { done, total };
    this.progressWidth(total ? done / total : 0);
  }

  /**
   * @param {number} ratio - Progress between 0 and 1.
   */
  progressWidth(ratio) {
    this.progressBar.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  }

  /** Recompute the visible list from the query and kind filter. */
  applyFilterAndSort() {
    let list = this.entries;

    if (this.kindFilter !== 'all') {
      list = list.filter((entry) =>
        this.kindFilter === 'folder' ? entry.isDirectory : entry.kind === this.kindFilter,
      );
    }

    const query = this.query.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (entry) =>
          entry.name.toLowerCase().includes(query) ||
          (entry.url || '').toLowerCase().includes(query),
      );
    }

    this.visible = sortFiles(
      list,
      this.settings.get('sort_field', 'name'),
      this.settings.get('sort_direction', 'asc'),
      { foldersFirst: this.settings.get('sort_foldersFirst') !== false },
    );
  }

  onSearchInput() {
    this.query = this.searchInput.value || '';
    if (this.searchTimer) window.clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(() => {
      this.applyFilterAndSort();
      this.renderBody();
    }, 140);
  }

  /** @returns {string} Footer status text. */
  statusLine() {
    const parts = [
      `${formatCount(this.entries.length)} item${this.entries.length === 1 ? '' : 's'}`,
    ];
    if (this.visible.length !== this.entries.length) {
      parts.push(`${formatCount(this.visible.length)} shown`);
    }
    if (this.selecting) parts.push(`${formatCount(this.selection.size)} selected`);
    if (this.settings.get('folder_recursive') === true) parts.push('recursive');
    return parts.join(' · ');
  }

  /* ---------------------------------------------------------------- *
   * Rendering
   * ---------------------------------------------------------------- */

  /** Apply display toggles from settings. */
  applySettings() {
    this.element.classList.toggle('fs-compact', this.settings.get('display_compactRows') === true);
    this.element.classList.toggle('fs-hide-size', this.settings.get('display_showSize') === false);
    this.element.classList.toggle('fs-hide-kind', this.settings.get('display_showKind') === false);
    this.element.classList.toggle('fs-hide-icons', this.settings.get('display_showIcons') === false);
    this.element.classList.toggle(
      'fs-hide-modified',
      this.settings.get('display_showModified') === false,
    );
  }

  /** Render the chip row. */
  renderChips() {
    const counts = countByKind(this.entries);
    const options = [{ kind: 'all', label: 'All', count: this.entries.length }];

    for (const { kind, count } of counts) {
      if (kind === 'other' && count === 0) continue;
      options.push({ kind, label: kind === 'folder' ? 'Folders' : typeLabel(kind), count });
    }

    clear(this.chips);
    for (const option of options) {
      this.chips.appendChild(
        el('button', {
          class: 'fs-chip',
          type: 'button',
          text: `${option.label} ${formatCount(option.count)}`,
          aria: { pressed: String(this.kindFilter === option.kind) },
          on: {
            click: () => {
              this.kindFilter = option.kind;
              this.applyFilterAndSort();
              this.renderChips();
              this.renderBody();
            },
          },
        }),
      );
    }
  }

  /** Render the current view. */
  renderBody() {
    clear(this.body);

    if (this.view === 'report') {
      this.body.appendChild(this.buildReportView());
    } else if (this.view === 'detail') {
      this.body.appendChild(this.buildDetail());
    } else if (this.view === 'preview') {
      this.body.appendChild(this.buildPreview());
    } else {
      this.body.appendChild(this.buildList());
    }

    this.footerText.textContent = this.statusLine();
    this.batchBar.hidden = !this.selecting;
  }

  /**
   * @returns {HTMLElement} The list, empty state, or placeholder.
   */
  buildList() {
    if (this.loading && !this.entries.length) {
      return el('div', { class: 'fs-empty', text: 'Scanning folder…' });
    }
    if (!this.rootUrl) {
      return el('div', { class: 'fs-empty' }, [
        el('p', { text: 'No folder selected.' }),
        el('button', {
          class: 'fs-btn',
          type: 'button',
          text: 'Choose folder',
          on: { click: () => this.chooseFolder().then(() => this.refresh()) },
        }),
      ]);
    }

    const shown = this.visible.slice(0, RENDER_LIMIT);
    const fragment = document.createDocumentFragment();

    fragment.appendChild(
      el('div', { class: 'fs-summary' }, this.buildSummaryBits()),
    );

    if (!shown.length) {
      fragment.appendChild(el('div', { class: 'fs-empty', text: 'Nothing matches this filter.' }));
      return fragment;
    }

    const list = el('div', { class: 'fs-list', role: 'list' });
    for (const entry of shown) list.appendChild(this.buildRow(entry));
    fragment.appendChild(list);

    if (this.visible.length > shown.length) {
      fragment.appendChild(
        el('div', {
          class: 'fs-empty',
          text: `Showing the first ${formatCount(shown.length)} of ${formatCount(this.visible.length)}. Narrow the filter to see the rest.`,
        }),
      );
    }

    return fragment;
  }

  /** @returns {HTMLElement[]} Summary pills above the list. */
  buildSummaryBits() {
    const files = this.entries.filter((entry) => entry.isFile);
    const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
    const newest = files.reduce((max, file) => Math.max(max, file.modified || 0), 0);

    return [
      el('span', { text: `${formatCount(files.length)} files` }),
      el('span', { text: formatSize(totalSize) }),
      newest
        ? el('span', {
            text: `newest ${this.settings.get('display_relativeDate') !== false ? formatRelativeTime(newest) : formatDate(newest)}`,
          })
        : null,
    ].filter(Boolean);
  }

  /**
   * @param {any} entry - Entry to render.
   * @returns {HTMLElement} Row element.
   */
  buildRow(entry) {
    const selected = this.selection.has(entry.url);
    const showRelative = this.settings.get('display_relativeDate') !== false;

    const metaParts = [];
    if (entry.isDirectory) metaParts.push('Folder');
    else if (this.settings.get('display_showKind') !== false) metaParts.push(typeLabel(entry.kind));
    if (this.settings.get('display_showModified') !== false && entry.modified) {
      metaParts.push(showRelative ? formatRelativeTime(entry.modified) : formatDate(entry.modified));
    }

    const row = el('div', {
      class: `fs-row${selected ? ' fs-selected' : ''}`,
      role: 'listitem',
      tabindex: '0',
      dataset: { kind: entry.kind || 'file', url: entry.url },
      aria: { selected: String(selected) },
    }, [
      icon(KIND_ICON[entry.kind] || 'file'),
      el('div', { class: 'fs-main' }, [
        el('span', { class: 'fs-name', text: entry.name }),
        el('span', { class: 'fs-meta', text: metaParts.join(' · ') }),
      ]),
      el('span', { class: 'fs-size', text: entry.isDirectory ? '' : formatSize(entry.size) }),
      el('button', {
        class: 'fs-btn',
        type: 'button',
        title: `Actions for ${entry.name}`,
        aria: { label: `Actions for ${entry.name}` },
        on: {
          click: (ev) => {
            ev.stopPropagation();
            this.showEntryMenu(entry, ev);
          },
        },
      }, [icon('more')]),
    ]);

    const activate = () => {
      if (this.selecting) this.toggleSelected(entry);
      else this.activateEntry(entry);
    };

    row.addEventListener('click', activate);
    row.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        activate();
      }
    });

    return row;
  }

  /**
   * @param {any} entry - Entry the user activated.
   */
  async activateEntry(entry) {
    if (entry.isDirectory) {
      this.rootUrl = entry.url;
      this.rootTitle = entry.name;
      this.selection.clear();
      this.kindFilter = 'all';
      this.view = 'list';
      this.settings.set(INTERNAL_KEYS.lastFolder, this.rootUrl, { silent: true });
      this.settings.set(INTERNAL_KEYS.lastFolderTitle, this.rootTitle, { silent: true });
      await this.refresh();
      return;
    }

    this.previewEntry = entry;
    this.view = 'preview';
    this.previewData = null;
    this.renderBody();
    this.previewData = await this.actions.previewEntry(entry);
    if (this.view === 'preview' && this.previewEntry === entry) this.renderBody();
  }

  /* ---------------------------------------------------------------- *
   * Detail view
   * ---------------------------------------------------------------- */

  /** Switch to the folder summary view. */
  showDetail() {
    this.view = this.view === 'detail' ? 'list' : 'detail';
    this.renderBody();
  }

  /**
   * @returns {HTMLElement} Folder summary card.
   */
  buildDetail() {
    const summary = this.actions.summarize(this.entries);
    const cleanupEnabled = this.settings.get('tools_cleanupEnabled') !== false;

    const sections = [
      el('section', { class: 'fs-section' }, [
        el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' } }, [
          el('button', {
            class: 'fs-btn',
            type: 'button',
            title: 'Export folder report',
            aria: { label: 'Export folder report' },
            on: { click: () => this.exportReport() },
          }, [icon('file'), el('span', { text: 'Export report' })]),
          el('button', {
            class: 'fs-btn',
            type: 'button',
            title: 'View report as a page',
            aria: { label: 'View report as a page' },
            on: { click: () => this.showReportPage() },
          }, [icon('eye'), el('span', { text: 'View page' })]),
        ]),
        el('h3', { text: 'Folder summary' }),
        el('dl', { class: 'fs-kv' }, [
          el('dt', { text: 'Files' }),
          el('dd', { text: formatCount(summary.totalFiles) }),
          el('dt', { text: 'Folders' }),
          el('dd', { text: formatCount(summary.totalFolders) }),
          el('dt', { text: 'Total size' }),
          el('dd', { text: formatSize(summary.totalSize) }),
          el('dt', { text: 'Duplicate names' }),
          el('dd', { text: summary.hasDuplicates ? 'Yes' : 'No' }),
        ]),
      ]),
      el('section', { class: 'fs-section' }, [
        el('h3', { text: 'Largest files' }),
        this.buildMiniList(summary.largestFiles),
      ]),
    ];

    if (cleanupEnabled) {
      const cleanup = this.actions.cleanupCandidates(this.entries);
      sections.push(
        el('section', { class: 'fs-section' }, [
          el('h3', { text: 'Cleanup candidates' }),
          cleanup.length
            ? this.buildMiniList(cleanup.slice(0, 8))
            : el('p', { class: 'fs-meta', text: 'No temporary or backup files found.' }),
        ]),
      );
    }

    if (summary.duplicateGroups?.length) {
      sections.push(
        el('section', { class: 'fs-section' }, [
          el('h3', { text: 'Duplicate names' }),
          ...summary.duplicateGroups.slice(0, 5).map((group) =>
            el('p', {
              class: 'fs-meta',
              text: `${group[0]?.name} — ${group.length} copies`,
            }),
          ),
        ]),
      );
    }

    return el('div', {}, sections);
  }

  /**
   * @param {any[]} entries - Entries to list.
   * @returns {HTMLElement} Compact list.
   */
  buildMiniList(entries) {
    if (!entries?.length) return el('p', { class: 'fs-meta', text: 'Nothing to show.' });

    return el('dl', { class: 'fs-kv' }, entries.flatMap((entry) => [
      el('dt', {
        text: entry.name,
        title: entry.url,
        style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      }),
      el('dd', { text: formatSize(entry.size) }),
    ]));
  }

  /* ---------------------------------------------------------------- *
   * Preview view
   * ---------------------------------------------------------------- */

  /**
   * @returns {HTMLElement} Preview pane.
   */
  buildPreview() {
    const entry = this.previewEntry;
    if (!entry) return el('div', { class: 'fs-empty', text: 'Nothing selected.' });

    const actions = [
      el('button', {
        class: 'fs-btn',
        type: 'button',
        text: 'Open in editor',
        on: { click: () => this.actions.open(entry) },
      }),
      el('button', {
        class: 'fs-btn',
        type: 'button',
        text: 'Copy path',
        on: { click: () => this.actions.copyPath(entry) },
      }),
      el('button', {
        class: 'fs-btn',
        type: 'button',
        text: 'Back to list',
        on: { click: () => { this.view = 'list'; this.renderBody(); } },
      }),
    ];

    const container = el('div', {}, [
      el('section', { class: 'fs-section' }, [
        el('h3', { text: entry.name }),
        el('dl', { class: 'fs-kv' }, [
          el('dt', { text: 'Size' }),
          el('dd', { text: formatSize(entry.size) }),
          el('dt', { text: 'Modified' }),
          el('dd', { text: formatDate(entry.modified) }),
          el('dt', { text: 'Type' }),
          el('dd', { text: typeLabel(entry.kind) }),
        ]),
        el('div', { style: { display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' } }, actions),
      ]),
    ]);

    if (!this.previewData) {
      container.appendChild(el('div', { class: 'fs-empty', text: 'Loading preview…' }));
      return container;
    }

    if (this.previewData.type === 'text' && this.previewData.ok) {
      container.appendChild(el('div', { class: 'fs-preview', text: this.previewData.text || '' }));
    } else if (this.previewData.type === 'image' && this.previewData.ok) {
      container.appendChild(
        el('div', { class: 'fs-preview' }, [
          el('img', { src: this.previewData.url, alt: `Preview of ${entry.name}` }),
        ]),
      );
    } else {
      container.appendChild(
        el('div', {
          class: 'fs-empty',
          text: this.previewData.message || 'No preview available for this file.',
        }),
      );
    }

    return container;
  }

  /* ---------------------------------------------------------------- *
   * Menus
   * ---------------------------------------------------------------- */

  /**
   * @param {any} entry - Entry.
   * @param {Event} ev - Triggering event.
   */
  showEntryMenu(entry, ev) {
    if (entry.isDirectory) {
      this.showMenu(ev, [
        ['Open folder', () => this.activateEntry(entry)],
        ['Folder summary', () => this.showDetail()],
        ['Rename', () => this.promptRename(entry)],
        ['Delete', () => this.actions.deleteEntry(entry).then(() => this.refresh())],
      ]);
      return;
    }

    const items = [
      ['Quick preview', () => this.activateEntry(entry)],
      ['Open in editor', () => this.actions.open(entry)],
      ['Copy path', () => this.actions.copyPath(entry)],
      ['Copy name', () => this.actions.copyName(entry)],
      ['Rename', () => this.promptRename(entry)],
      ['Move to folder', () => this.actions.moveEntries([entry]).then(() => this.refresh())],
      ['Copy to folder', () => this.actions.copyEntries([entry]).then(() => this.refresh())],
      ['Delete', () => this.actions.deleteEntry(entry).then(() => this.refresh())],
    ];

    this.showMenu(ev, items);
  }

  /**
   * @param {Event} ev - Triggering event.
   */
  showFolderMenu(ev) {
    const directory = this.rootUrl;
    this.showMenu(ev, [
      ['Change folder', () => this.chooseFolder().then(() => this.refresh())],
      ['New file', () => directory && this.actions.createFile(directory).then(() => this.refresh())],
      ['New folder', () => directory && this.actions.createFolder(directory).then(() => this.refresh())],
      ['Export folder report', () => this.exportReport()],
      ['View report page', () => this.showReportPage()],
      ['Folder summary', () => this.showDetail()],
      ['Refresh', () => this.refresh()],
    ]);
  }

  /**
   * Render a menu, preferring Acode's context menu and falling back to a sheet.
   * @param {Event} ev - Triggering event.
   * @param {Array<[string, () => void]>} items - Label/action pairs.
   */
  async showMenu(ev, items) {
    const labels = items.map(([label]) => label);
    const choice = await platform.select('Actions', labels);

    if (choice) {
      const match = items.find(([label]) => label === choice);
      if (match) match[1]();
      return;
    }

    // Fallback for hosts without a select dialog: use a plain context menu.
    const ContextMenu = platform.req('contextmenu');
    if (!ContextMenu || !ev) return;
    const point = /** @type {MouseEvent} */ (ev);
    const menu = new ContextMenu({
      left: point.clientX || 0,
      top: point.clientY || 0,
      items: items.map(([label]) => /** @type {[string, string]} */ ([label, label])),
      onselect: (event) => {
        const target = /** @type {any} */ (event.target || event);
        const label = target?.textContent || target?.dataset?.action;
        const match = items.find(([itemLabel]) => itemLabel === label);
        if (match) match[1]();
      },
    });
    menu.show();
  }

  /**
   * @param {any} entry - Entry to rename.
   */
  async promptRename(entry) {
    const name = await platform.prompt('Rename', entry.name, 'text');
    if (!name || name === entry.name) return;
    await this.actions.renameEntry(entry, name);
    await this.refresh();
  }

  /** @returns {any[]} Currently selected entries. */
  selectedEntries() {
    return this.entries.filter((entry) => this.selection.has(entry.url));
  }

  /** Enable or disable selection mode. */
  toggleSelecting() {
    this.selecting = !this.selecting;
    if (!this.selecting) this.selection.clear();
    this.selectBtn.setAttribute('aria-pressed', String(this.selecting));
    this.renderBody();
  }

  /**
   * @param {any} entry - Entry to toggle.
   */
  toggleSelected(entry) {
    if (this.selection.has(entry.url)) this.selection.delete(entry.url);
    else this.selection.add(entry.url);

    const node = this.body.querySelector(`.fs-row[data-url="${cssEscape(entry.url)}"]`);
    if (node) {
      node.classList.toggle('fs-selected', this.selection.has(entry.url));
      node.setAttribute('aria-selected', String(this.selection.has(entry.url)));
    }
    this.footerText.textContent = this.statusLine();
  }

  /** Clear the current selection. */
  clearSelection() {
    this.selection.clear();
    this.renderBody();
  }

  /** Delete every selected entry behind one confirmation. */
  async runBatchDelete() {
    await this.actions.deleteEntries(this.selectedEntries());
    this.selection.clear();
    await this.refresh();
  }

  /** Rename every selected entry using a chosen pattern. */
  async runBatchRename() {
    const entries = this.selectedEntries();
    if (!entries.length) {
      platform.toast('Select files first');
      return;
    }

    const mode = await platform.select('Batch rename', [
      'Add prefix',
      'Add suffix',
      'Replace text',
      'Number sequentially',
      'Change extension',
    ]);
    if (!mode) return;

    /** @type {((entry: any, index: number) => string)|null} */
    let nameFn = null;

    if (mode === 'Add prefix') {
      const prefix = await platform.prompt('Prefix to add', '');
      if (!prefix) return;
      nameFn = (entry) => `${prefix}${entry.name}`;
    } else if (mode === 'Add suffix') {
      const suffix = await platform.prompt('Suffix to add (before extension)', '');
      if (!suffix) return;
      nameFn = (entry) => {
        const dot = entry.name.lastIndexOf('.');
        return dot > 0
          ? `${entry.name.slice(0, dot)}${suffix}${entry.name.slice(dot)}`
          : `${entry.name}${suffix}`;
      };
    } else if (mode === 'Replace text') {
      const find = await platform.prompt('Text to find', '');
      if (!find) return;
      const replacement = await platform.prompt('Replace with', '');
      nameFn = (entry) => entry.name.split(find).join(replacement || '');
    } else if (mode === 'Number sequentially') {
      const prefix = await platform.prompt('Name prefix', 'file');
      if (prefix == null) return;
      const start = Number(await platform.prompt('Start at', '1', 'number')) || 1;
      let counter = start;
      nameFn = (entry) => {
        const dot = entry.name.lastIndexOf('.');
        const ext = dot > 0 ? entry.name.slice(dot) : '';
        const name = `${prefix}_${String(counter++).padStart(3, '0')}${ext}`;
        return name;
      };
    } else if (mode === 'Change extension') {
      const extension = await platform.prompt('New extension', 'txt');
      if (!extension) return;
      const normalised = extension.startsWith('.') ? extension : `.${extension}`;
      nameFn = (entry) => {
        const dot = entry.name.lastIndexOf('.');
        return dot > 0 ? `${entry.name.slice(0, dot)}${normalised}` : `${entry.name}${normalised}`;
      };
    }

    if (!nameFn) return;
    await this.actions.renameEntries(entries, nameFn);
    this.selection.clear();
    await this.refresh();
  }

  /**
   * Build a folder report and save, share, or copy it.
   */
  async exportReport() {
    if (!this.rootUrl) {
      platform.toast('Open a folder first');
      return;
    }
    if (!this.entries.length) {
      platform.toast('Nothing to report — the folder is empty');
      return;
    }

    const title = this.rootTitle || basename(this.rootUrl);
    const format = this.settings.get('report_format', 'text');
    const descriptor = reportFormat(format);

    const content = this.buildReportContent(format);

    const fileName = reportFileName(title, format);
    const storageUrl = platform.getDataStorageUrl();

    const options = ['Open as page', 'Save in this folder'];
    if (storageUrl) options.push('Save to app storage');
    options.push('Share', 'Copy to clipboard');

    const choice = await platform.select('Export folder report', options);
    if (!choice) return;

    if (choice === 'Open as page') {
      this.showReportPage();
      return;
    }

    if (choice === 'Copy to clipboard') {
      const ok = await this.actions.copyText(content);
      platform.toast(ok ? 'Report copied to clipboard' : 'Could not copy the report');
      return;
    }

    if (choice === 'Share') {
      const shared = await this.actions.shareText(content, fileName, descriptor.mime);
      if (shared) return;

      // Sharing is unavailable on some builds; copying still gets the user the data.
      const copied = await this.actions.copyText(content);
      platform.toast(
        copied ? 'Sharing unavailable — report copied instead' : 'Could not share the report',
      );
      return;
    }

    const target = choice === 'Save to app storage' ? storageUrl : this.rootUrl;
    const result = await this.actions.saveTextFile(target, fileName, content);

    if (!result.ok) {
      platform.toast(`Could not save report: ${result.message || 'unknown error'}`);
      return;
    }

    platform.toast(`Saved ${fileName}`);
    if (target === this.rootUrl) await this.refresh();
  }

  /**
   * Build report content for the current folder.
   * @param {string} [format] - Report format.
   * @returns {string} Report content.
   */
  buildReportContent(format = 'html') {
    return buildReport({
      rootTitle: this.rootTitle || basename(this.rootUrl || 'folder'),
      rootUrl: this.rootUrl || '',
      entries: this.entries,
      format,
      includePaths: this.settings.get('report_includePaths') === true,
      includeListing: this.settings.get('report_includeListing') !== false,
    });
  }

  /**
   * Open the folder report as a styled page inside the panel.
   */
  showReportPage() {
    if (!this.rootUrl) {
      platform.toast('Open a folder first');
      return;
    }
    if (!this.entries.length) {
      platform.toast('Nothing to report — the folder is empty');
      return;
    }

    this.reportContent = this.buildReportContent('html');
    this.reportFileName = reportFileName(this.rootTitle || basename(this.rootUrl), 'html');
    this.view = 'report';
    this.renderBody();
  }

  /**
   * @returns {HTMLElement} The report page view.
   */
  buildReportView() {
    const frame = el('iframe', {
      class: 'fs-report-frame',
      // `sandbox` with no tokens keeps the report inert: it contains no
      // scripts, and this stops anything unexpected from ever executing.
      sandbox: '',
      title: 'Folder report',
    });
    frame.setAttribute('srcdoc', this.reportContent || '');

    const bar = el('div', { class: 'fs-report-bar' }, [
      el('button', {
        class: 'fs-btn',
        type: 'button',
        title: 'Back to the list',
        aria: { label: 'Back to the list' },
        on: {
          click: () => {
            this.view = 'list';
            this.renderBody();
          },
        },
      }, [icon('back'), el('span', { text: 'Back' })]),
      el('button', {
        class: 'fs-btn',
        type: 'button',
        title: 'Open the report in a browser',
        aria: { label: 'Open the report in a browser' },
        on: { click: () => this.openReportInBrowser() },
      }, [icon('expand'), el('span', { text: 'Browser' })]),
      el('button', {
        class: 'fs-btn',
        type: 'button',
        title: 'Save the report',
        aria: { label: 'Save the report' },
        on: { click: () => this.exportReport() },
      }, [icon('file'), el('span', { text: 'Save' })]),
      el('button', {
        class: 'fs-btn',
        type: 'button',
        title: 'Copy the report source',
        aria: { label: 'Copy the report source' },
        on: {
          click: async () => {
            const ok = await this.actions.copyText(this.reportContent);
            platform.toast(ok ? 'Report source copied' : 'Could not copy the report');
          },
        },
      }, [icon('copy'), el('span', { text: 'Copy' })]),
    ]);

    return el('div', { class: 'fs-report' }, [bar, frame]);
  }

  /**
   * Write the report to disk and hand it to a browser.
   */
  async openReportInBrowser() {
    const html = this.reportContent || this.buildReportContent('html');
    const name = this.reportFileName || reportFileName(
      this.rootTitle || basename(this.rootUrl || 'folder'),
      'html',
    );

    const target = platform.getDataStorageUrl() || this.rootUrl;
    if (!target) {
      platform.toast('No writable location for the report');
      return;
    }

    const result = await this.actions.saveTextFile(target, name, html);
    if (!result.ok || !result.url) {
      platform.toast(`Could not write the report: ${result.message || 'unknown error'}`);
      return;
    }

    const displayUrl = await this.actions.displayUrl(result.url);
    if (displayUrl && platform.openExternal(displayUrl)) return;

    platform.toast(`Report saved as ${name}`);
  }

  /** Choose a sort field, then toggle direction when the same field is picked. */
  async pickSort() {
    const current = this.settings.get('sort_field', 'name');
    const choice = await platform.select('Sort by', [
      { value: 'name', text: 'Name' },
      { value: 'size', text: 'Size' },
      { value: 'date', text: 'Date modified' },
      { value: 'type', text: 'Type' },
      { value: 'toggle', text: 'Reverse current order' },
    ]);

    if (!choice) return;

    if (choice === 'toggle') {
      this.settings.set('sort_direction', this.settings.get('sort_direction') === 'asc' ? 'desc' : 'asc');
    } else if (choice === current) {
      this.settings.set('sort_direction', this.settings.get('sort_direction') === 'asc' ? 'desc' : 'asc');
    } else {
      this.settings.set('sort_field', choice);
      this.settings.set('sort_direction', 'asc');
    }

    this.applyFilterAndSort();
    this.renderBody();
  }
}

/**
 * Clamp a requested dock width to sane bounds.
 * @param {number} width - Requested width.
 * @returns {number} Clamped width.
 */
function clampDockWidth(width) {
  const viewport = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const max = Math.max(MIN_DOCK_WIDTH, Math.min(MAX_DOCK_WIDTH, Math.round(viewport * 0.92)));
  return Math.max(MIN_DOCK_WIDTH, Math.min(max, Math.round(Number(width) || 420)));
}

/**
 * @param {string} url - Url to reduce.
 * @returns {string} Last path segment.
 */
function basename(url) {
  const parts = String(url || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || url;
}

/**
 * Escape a value for use inside an attribute selector.
 * @param {string} value - Raw value.
 * @returns {string} Escaped value.
 */
function cssEscape(value) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return String(value).replace(/["\\]/g, '\\$&');
}

/** Inject the stylesheet once. */
export function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}
