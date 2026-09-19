/**
 * Tiny DOM helpers.
 *
 * The plugin builds its UI with these instead of a template library so the
 * bundle stays small and there is no runtime dependency to break.
 */

/**
 * Create an element.
 *
 * @param {string} tagName - Tag name.
 * @param {Record<string, any>} [props] - Properties; `class`, `text`, `html`, `style`, `dataset`, `on` are special.
 * @param {Array<Node|string|null|undefined>} [children] - Child nodes.
 * @returns {HTMLElement} The created element.
 */
export function el(tagName, props = {}, children = []) {
  const node = document.createElement(tagName);

  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;

    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'html') node.innerHTML = String(value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key === 'dataset' && typeof value === 'object') Object.assign(node.dataset, value);
    else if (key === 'on' && typeof value === 'object') {
      for (const [event, handler] of Object.entries(value)) {
        node.addEventListener(event, /** @type {EventListener} */ (handler));
      }
    } else if (key === 'aria' && typeof value === 'object') {
      for (const [name, ariaValue] of Object.entries(value)) {
        if (ariaValue == null) continue;
        node.setAttribute(`aria-${name}`, String(ariaValue));
      }
    } else {
      /** @type {any} */ (node)[key] = value;
    }
  }

  append(node, children);
  return node;
}

/**
 * Append children, skipping empty ones.
 * @param {Node} parent - Parent node.
 * @param {Array<Node|string|null|undefined>} children - Children.
 * @returns {Node} The parent.
 */
export function append(parent, children) {
  for (const child of children || []) {
    if (child == null || child === false) continue;
    parent.appendChild(child);
  }
  return parent;
}

/**
 * Remove every child of a node.
 * @param {Node} node - Node to empty.
 * @returns {Node} The node.
 */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/**
 * Build an icon span from the inline SVG set.
 * @param {keyof typeof ICONS} name - Icon name.
 * @param {string} [className] - Extra classes.
 * @returns {HTMLElement} Icon element.
 */
export function icon(name, className = '') {
  return el('span', {
    class: `fs-ic ${className}`.trim(),
    html: ICONS[name] || ICONS.file,
    aria: { hidden: 'true' },
  });
}

/** Inline SVG paths, scaled to a 24x24 viewBox. */
export const ICONS = {
  folder:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>',
  file:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm0 2.5L17.5 8H14V4.5z"/></svg>',
  text:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM8 13h8v1.5H8V13zm0 3h8v1.5H8V16zm0-6h4v1.5H8V10z"/></svg>',
  image:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z"/></svg>',
  media:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>',
  archive:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16v4H4V4zm0 6h16v10H4V10zm6 2h4v2h-4v-2z"/></svg>',
  search:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"/></svg>',
  sort: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/></svg>',
  refresh:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A8 8 0 1 0 19.73 14h-2.08A6 6 0 1 1 12 6a5.94 5.94 0 0 1 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
  chevron:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.29 6.71 4 12l5.29 5.29 1.42-1.42L6.83 12l3.88-3.88z"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 7h2v2h-2V7zm0 4h2v6h-2v-6zm1-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/></svg>',
  move: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 9h4V6h3l-5-5-5 5h3v3zm-1 1H6V7l-5 5 5 5v-3h3v-4zm14 2-5-5v3h-3v4h3v3l5-5zm-9 3h-4v3H7l5 5 5-5h-3v-3z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>',
  select:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h2V3a2 2 0 0 0-2 2zm0 8h2v-2H3v2zm4 8h2v-2H7v2zM3 9h2V7H3v2zm10-6h-2v2h2V3zm6 0v2h2a2 2 0 0 0-2-2zM5 21v-2H3a2 2 0 0 0 2 2zm-2-4h2v-2H3v2zm8 4h2v-2h-2v2zm8-8h2v-2h-2v2zm0-8h-2v2h2V3zm0 12h-2v2a2 2 0 0 0 2-2zm-8-8h-2v2h2V7zm0 8h-2v2h2v-2zm4-8h-2v2h2V7zm0 8h-2v2h2v-2z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>',
  expand:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>',
  compress:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>',
};
