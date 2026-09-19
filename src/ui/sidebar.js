/**
 * Sidebar launcher.
 *
 * The sidebar stays deliberately small: it opens the workspace panel and offers
 * one-tap access to the workspaces Acode already has open.
 */

import * as platform from '../platform.js';
import { el, clear, icon } from './dom.js';
import { injectStyles } from './panel.js';

export const SIDEBAR_ID = 'acode-fs-util-panel';

/**
 * @param {Object} deps - Dependencies.
 * @param {import('./panel.js').WorkspacePanel} deps.panel - Workspace panel.
 * @returns {(container: HTMLElement) => void} Sidebar render function.
 */
export function createSidebarRenderer(deps) {
  const { panel } = deps;

  return function render(container) {
    injectStyles();
    clear(container);

    const current = panel.currentRoot();
    const list = el('div', { class: 'fs-list', role: 'list' });

    const header = el('div', { class: 'fs-section' }, [
      el('h3', { text: 'Folder workspace' }),
      el('p', {
        class: 'fs-meta',
        text: current ? current : 'No folder selected yet.',
        title: current || '',
        style: { wordBreak: 'break-all' },
      }),
    ]);

    const actions = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [
      el('button', {
        class: 'fs-btn',
        type: 'button',
        title: 'Open folder workspace',
        aria: { label: 'Open folder workspace' },
        on: {
          click: async () => {
            await panel.show();
          },
        },
      }, [icon('folder'), el('span', { text: 'Open workspace' })]),
      el('button', {
        class: 'fs-btn',
        type: 'button',
        title: 'Choose a folder',
        aria: { label: 'Choose a folder' },
        on: {
          click: async () => {
            const folder = await platform.pickFolder();
            if (!folder) return;
            await panel.openRoot(folder.url, folder.title);
            await panel.show();
          },
        },
      }, [icon('plus'), el('span', { text: 'Folder' })]),
      current
        ? el('button', {
            class: 'fs-btn',
            type: 'button',
            title: 'Refresh folder',
            aria: { label: 'Refresh folder' },
            on: { click: () => panel.refresh() },
          }, [icon('refresh')])
        : null,
    ].filter(Boolean));

    header.appendChild(el('div', { style: { marginTop: '8px' } }, [actions]));
    container.appendChild(header);

    const rootsSection = el('div', { class: 'fs-section' }, [
      el('h3', { text: 'Open workspaces' }),
      list,
    ]);
    container.appendChild(rootsSection);

    renderRoots(list);
  };

  /**
   * @param {HTMLElement} list - Container for the root buttons.
   */
  async function renderRoots(list) {
    clear(list);
    list.appendChild(el('p', { class: 'fs-meta', text: 'Loading workspaces…' }));

    let roots = [];
    try {
      roots = await platform.getWorkspaceRoots();
    } catch {
      roots = [];
    }

    clear(list);

    if (!roots.length) {
      list.appendChild(
        el('p', {
          class: 'fs-meta',
          text: 'No workspace folders are open. Use "Folder" above to pick one.',
        }),
      );
      return;
    }

    for (const root of roots) {
      list.appendChild(
        el('div', {
          class: 'fs-row',
          role: 'listitem',
          tabindex: '0',
          title: root.url,
          on: {
            click: async () => {
              await panel.openRoot(root.url, root.title);
              await panel.show();
            },
            keydown: async (ev) => {
              const key = /** @type {KeyboardEvent} */ (ev).key;
              if (key !== 'Enter' && key !== ' ') return;
              ev.preventDefault();
              await panel.openRoot(root.url, root.title);
              await panel.show();
            },
          },
        }, [
          icon('folder'),
          el('div', { class: 'fs-main' }, [
            el('span', { class: 'fs-name', text: root.title }),
            el('span', { class: 'fs-meta', text: root.url }),
          ]),
          el('span', { class: 'fs-size', text: '' }),
          el('span', { class: 'fs-size', text: '' }),
        ]),
      );
    }
  }
}
