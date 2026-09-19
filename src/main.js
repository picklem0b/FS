/**
 * FS — folder workspace for Acode.
 *
 * Entry point. Builds the service graph, mounts the workspace panel, and
 * registers the plugin's entry points (sidebar panel, side button, commands).
 * Everything registered here is torn down again on unmount.
 */

import plugin from '../plugin.json';

import * as platform from './platform.js';
import { SettingsStore } from './settings.js';
import { FolderAccess } from './fs/access.js';
import { FolderScanner } from './fs/scanner.js';
import { FileReader } from './fs/fileReader.js';
import { PreviewService } from './fs/previews.js';
import { createAcodeSource } from './fs/source.js';
import { BatchActions } from './actions/batch.js';
import { ActionService } from './actions/index.js';
import { WatchService, clampInterval } from './actions/watch.js';
import { Places } from './actions/places.js';
import { WorkspacePanel } from './ui/panel.js';
import { createSidebarRenderer, SIDEBAR_ID } from './ui/sidebar.js';

/** Commands registered by this plugin, removed again on unmount. */
const COMMANDS = [
  {
    name: 'fs.openWorkspace',
    description: 'FS: Open the folder workspace',
  },
  {
    name: 'fs.chooseFolder',
    description: 'FS: Choose a folder to inspect',
  },
  {
    name: 'fs.refresh',
    description: 'FS: Refresh the open folder',
  },
  {
    name: 'fs.summary',
    description: 'FS: Show the folder summary',
  },
  {
    name: 'fs.analyzeStorage',
    description: 'FS: Analyze folder storage',
  },
  {
    name: 'fs.findDuplicates',
    description: 'FS: Find duplicate files (by content)',
  },
  {
    name: 'fs.deepSearch',
    description: 'FS: Deep search (names and file contents)',
  },
  {
    name: 'fs.exportZip',
    description: 'FS: Export folder as ZIP',
  },
  {
    name: 'fs.compareSnapshot',
    description: 'FS: Compare with folder snapshot',
  },
];

class FsPlugin {
  /**
   * @param {SettingsStore} settings - Settings store.
   */
  constructor(settings) {
    this.settings = settings;
    this.baseUrl = '';
    /** @type {import('./ui/panel.js').WorkspacePanel|null} */
    this.panel = null;
    /** @type {any} */
    this.sideButton = null;
    /** @type {Array<() => void>} */
    this.disposers = [];
    this.initialised = false;
  }

  /**
   * @param {any} $page - Plugin page handle supplied by Acode.
   * @param {any} options - Init options supplied by Acode.
   */
  async init($page, options) {
    if (this.initialised) return;

    if (!platform.isHostAvailable() || !platform.getFsFactory()) {
      platform.toast('FS needs a newer Acode version with the file system API');
      return;
    }

    /** @type {platform.AcodeFileSystem} */
    let fs;
    try {
      fs = new platform.AcodeFileSystem();
    } catch (err) {
      console.warn('[FS] File system unavailable', err);
      platform.toast('FS could not reach the file system');
      return;
    }

    const source = createAcodeSource(fs);
    const fileOps = createFileOps(fs);
    const access = new FolderAccess(source);
    const scanner = new FolderScanner(access, this.scannerOptions());
    const preview = new PreviewService(new FileReader(source));
    const batch = new BatchActions(fileOps);
    const actions = new ActionService({
      fileOps,
      access,
      batch,
      preview,
      settings: this.settings,
    });

    this.panel = new WorkspacePanel({
      settings: this.settings,
      access,
      scanner,
      actions,
      preview,
    });
    this.panel.mount(document.body);

    this.disposers.push(
      this.settings.subscribe(() => {
        scanner.setIgnoreList(this.settings.ignorePatterns());
        scanner.setMaxFiles(Number(this.settings.get('folder_maxFiles')) || 5000);
        scanner.setMaxDepth(Number(this.settings.get('folder_maxDepth')) || 3);
      }),
    );

    // Places (pinned + recent folders) persist through the settings store.
    this.places = new Places(this.settings, {
      pinnedKey: 'internal_pinnedFolders',
      recentsKey: 'internal_recentFolders',
    });

    // Live watch: paused whenever the panel is closed or a dialog is up.
    this.watch = new WatchService({
      scan: () => this.panel ? this.panel.rescan() : Promise.resolve([]),
      isPaused: () => !this.panel?.open || this.panel?.hasOpenDialog === true,
      intervalMs: clampInterval((Number(this.settings.get('tools_watchInterval')) || 5) * 1000),
    });
    this.panel.setWatch(this.watch);
    this.panel.setPlaces(this.places);
    if (this.settings.get('tools_watchEnabled') !== false) this.watch.start();

    this.disposers.push(
      this.settings.subscribe(() => {
        const enabled = this.settings.get('tools_watchEnabled') !== false;
        this.watch.setInterval(clampInterval((Number(this.settings.get('tools_watchInterval')) || 5) * 1000));
        if (enabled) this.watch.start();
        else this.watch.stop();
      }),
    );

    this.registerSidebar();
    this.registerSideButton();
    this.registerCommands();

    this.initialised = true;
    console.log(`[FS] ready (v${plugin.version})`);
  }

  /** Tear everything down. */
  destroy() {
    for (const dispose of this.disposers) {
      try {
        dispose();
      } catch {
        /* ignore */
      }
    }
    this.disposers = [];

    try {
      platform.req('sidebarapps')?.remove?.(SIDEBAR_ID);
    } catch {
      /* ignore */
    }

    try {
      this.sideButton?.hide?.();
    } catch {
      /* ignore */
    }

    const commands = platform.req('commands');
    for (const command of COMMANDS) {
      try {
        commands?.removeCommand?.(command.name);
      } catch {
        /* ignore */
      }
    }

    this.panel?.destroy();
    this.panel = null;
    this.sideButton = null;
    this.watch?.stop();
    this.initialised = false;
  }

  /**
   * Scanner configuration derived from the current settings.
   * @returns {{ ignoreList: string[], maxFiles: number, maxDepth: number }} Scanner options.
   */
  scannerOptions() {
    return {
      ignoreList: this.settings.ignorePatterns(),
      maxFiles: Number(this.settings.get('folder_maxFiles')) || 5000,
      maxDepth: Number(this.settings.get('folder_maxDepth')) || 3,
    };
  }

  /** Register the sidebar entry that opens the workspace. */
  registerSidebar() {
    const sidebar = platform.req('sidebarapps');
    if (!sidebar?.add || !this.panel) return;

    try {
      const render = createSidebarRenderer({ panel: this.panel });
      sidebar.add('folder', SIDEBAR_ID, 'FS Folder Workspace', render, false, render);
    } catch (err) {
      console.warn('[FS] Could not register sidebar app', err);
    }
  }

  /** Register the floating side button that opens the workspace. */
  registerSideButton() {
    const makeButton = platform.req('sidebutton');
    if (!makeButton || !this.panel) return;

    try {
      this.sideButton = makeButton({
        text: 'FS',
        onclick: () => this.panel?.toggle(),
      });
      this.sideButton?.show?.();
    } catch (err) {
      console.warn('[FS] Could not register side button', err);
    }
  }

  /** Register palette commands. */
  registerCommands() {
    const commands = platform.req('commands');
    if (!commands?.addCommand) return;

    const handlers = {
      'fs.openWorkspace': async () => {
        await this.panel?.show();
        return true;
      },
      'fs.chooseFolder': async () => {
        const folder = await platform.pickFolder();
        if (!folder || !this.panel) return false;
        await this.panel.openRoot(folder.url, folder.title);
        await this.panel.show();
        return true;
      },
      'fs.refresh': async () => {
        await this.panel?.refresh();
        return true;
      },
      'fs.summary': async () => {
        if (!this.panel) return false;
        await this.panel.show();
        this.panel.showDetail();
        return true;
      },
      'fs.analyzeStorage': async () => {
        if (!this.panel) return false;
        await this.panel.show();
        await this.panel.showAnalysis();
        return true;
      },
      'fs.findDuplicates': async () => {
        if (!this.panel) return false;
        await this.panel.show();
        await this.panel.runDuplicateScan();
        return true;
      },
      'fs.deepSearch': async () => {
        if (!this.panel) return false;
        await this.panel.show();
        await this.panel.showDeepSearch();
        return true;
      },
      'fs.exportZip': async () => {
        if (!this.panel) return false;
        await this.panel.show();
        await this.panel.exportZip();
        return true;
      },
      'fs.compareSnapshot': async () => {
        if (!this.panel) return false;
        await this.panel.show();
        await this.panel.compareSnapshot();
        return true;
      },
    };

    for (const command of COMMANDS) {
      try {
        commands.addCommand({
          name: command.name,
          description: command.description,
          exec: handlers[command.name],
        });
      } catch (err) {
        console.warn(`[FS] Could not register ${command.name}`, err);
      }
    }
  }
}

/**
 * Adapt the platform file system to the operations the action layer expects.
 *
 * Both `ActionService` (which passes urls) and `BatchActions` (which passes
 * entries) use this object, so it accepts either shape.
 *
 * @param {platform.AcodeFileSystem} fs - Platform file system.
 * @returns {any} File operations.
 */
function createFileOps(fs) {
  /** @param {any} target - Entry or url. @returns {string} */
  const url = (target) => (typeof target === 'string' ? target : target?.url);

  return {
    open: (entry) => fs.openInEditor(entry),
    remove: (target) => fs.remove(url(target)),
    rename: (target, name) => fs.rename(url(target), name),
    move: (target, destination) => fs.move(url(target), destination),
    copy: (target, destination) => fs.copy(url(target), destination),
    createFile: (dirUrl, name, content) => fs.createFile(dirUrl, name, content),
    createDirectory: (dirUrl, name) => fs.createDirectory(dirUrl, name),
    displayUrl: (url) => fs.displayUrl(url),
  };
}

if (window.acode) {
  const settings = new SettingsStore({ pluginId: plugin.id });
  const instance = new FsPlugin(settings);

  acode.setPluginInit(
    plugin.id,
    async (baseUrl, $page, options) => {
      instance.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      await instance.init($page, options);
    },
    {
      list: settings.toHostSettings(),
      cb: (key, value) => settings.applyExternal(key, value),
    },
  );

  acode.setPluginUnmount(plugin.id, () => {
    instance.destroy();
  });
}
