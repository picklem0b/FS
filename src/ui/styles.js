/**
 * Plugin stylesheet.
 *
 * Colours are derived from Acode's theme custom properties with safe fallbacks
 * so the panel reads correctly in both light and dark themes.
 */

export const STYLE_ID = 'acode-fs-util-styles';

export const STYLES = `
.fs-root {
  --fs-bg: var(--popup-background-color, var(--secondary-color, #1e1f22));
  --fs-fg: var(--popup-text-color, var(--primary-text-color, #e6e6e6));
  --fs-muted: var(--secondary-text-color, #9a9a9a);
  --fs-border: var(--border-color, rgba(128, 128, 128, 0.35));
  --fs-accent: var(--primary-color, #4c8bf5);
  --fs-danger: var(--danger-color, #e05252);
  --fs-hover: var(--active-color, rgba(128, 128, 128, 0.16));
  --fs-radius: 10px;

  position: fixed;
  z-index: 960;
  display: flex;
  flex-direction: column;
  background: var(--fs-bg);
  color: var(--fs-fg);
  font-size: 14px;
  line-height: 1.4;
  -webkit-tap-highlight-color: transparent;
}

.fs-root * { box-sizing: border-box; }

/* ---- Placement -------------------------------------------------------- */

.fs-root.fs-mode-mobile {
  inset: 0;
  width: 100%;
  height: 100%;
}

.fs-root.fs-mode-desktop {
  top: 0;
  bottom: 0;
  max-width: 92vw;
  width: 420px;
  border-inline-start: 1px solid var(--fs-border);
  box-shadow: 0 0 24px rgba(0, 0, 0, 0.35);
}
.fs-root.fs-mode-desktop.fs-side-right { right: 0; }
.fs-root.fs-mode-desktop.fs-side-left {
  left: 0;
  border-inline-start: none;
  border-inline-end: 1px solid var(--fs-border);
}

.fs-root[hidden] { display: none !important; }

.fs-scrim {
  position: fixed;
  inset: 0;
  z-index: 950;
  background: rgba(0, 0, 0, 0.45);
}
.fs-scrim[hidden] { display: none !important; }

/* Drag handle: only meaningful for the docked layout. */
.fs-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 14px;
  cursor: col-resize;
  touch-action: none;
  display: none;
}
.fs-root.fs-mode-desktop.fs-side-right .fs-resizer { left: -7px; }
.fs-root.fs-mode-desktop.fs-side-left .fs-resizer { right: -7px; }
.fs-root.fs-mode-desktop .fs-resizer { display: block; }
.fs-resizer::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 6px;
  width: 2px;
  background: transparent;
  transition: background 120ms ease;
}
.fs-resizer:hover::after,
.fs-resizer.fs-dragging::after { background: var(--fs-accent); }

/* ---- Header ----------------------------------------------------------- */

.fs-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--fs-border);
  flex: 0 0 auto;
}

.fs-title {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.fs-title strong {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fs-title span {
  font-size: 11px;
  color: var(--fs-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fs-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 34px;
  height: 34px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.fs-btn:hover { background: var(--fs-hover); }
.fs-btn:active { transform: scale(0.96); }
.fs-btn[aria-pressed="true"] {
  background: var(--fs-hover);
  border-color: var(--fs-border);
}
.fs-btn.fs-danger { color: var(--fs-danger); }
.fs-btn[disabled] { opacity: 0.45; cursor: default; }
.fs-btn:focus-visible,
.fs-row:focus-visible,
.fs-chip:focus-visible,
.fs-input:focus-visible {
  outline: 2px solid var(--fs-accent);
  outline-offset: 1px;
}

.fs-ic { display: inline-flex; width: 18px; height: 18px; flex: 0 0 auto; }
.fs-ic svg { width: 100%; height: 100%; }

/* ---- Search + filters ------------------------------------------------- */

.fs-search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px 4px;
  flex: 0 0 auto;
}
.fs-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 36px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--fs-border);
  background: transparent;
  color: inherit;
  font: inherit;
}

.fs-chips {
  display: flex;
  gap: 6px;
  padding: 6px 10px 8px;
  overflow-x: auto;
  flex: 0 0 auto;
  scrollbar-width: none;
}
.fs-chips::-webkit-scrollbar { display: none; }
.fs-chip {
  flex: 0 0 auto;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--fs-border);
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.fs-chip[aria-pressed="true"] {
  background: var(--fs-accent);
  border-color: var(--fs-accent);
  color: #fff;
}

/* ---- List ------------------------------------------------------------- */

.fs-body {
  flex: 1 1 auto;
  overflow: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.fs-summary {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  padding: 6px 12px;
  font-size: 11px;
  color: var(--fs-muted);
  border-bottom: 1px solid var(--fs-border);
}

.fs-list { list-style: none; margin: 0; padding: 0; }

.fs-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 46px;
  padding: 6px 10px;
  border: 0;
  border-bottom: 1px solid var(--fs-border);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}
.fs-row:hover { background: var(--fs-hover); }
.fs-row.fs-selected { background: var(--fs-hover); }
.fs-row[data-kind="folder"] .fs-name { font-weight: 600; }

.fs-main { min-width: 0; display: flex; flex-direction: column; }
.fs-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fs-meta {
  font-size: 11px;
  color: var(--fs-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fs-size { font-size: 12px; color: var(--fs-muted); white-space: nowrap; }
.fs-kind {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--fs-muted);
}

.fs-root.fs-compact .fs-row { min-height: 36px; padding: 3px 10px; }
.fs-root.fs-hide-size .fs-size,
.fs-root.fs-hide-kind .fs-kind,
.fs-root.fs-hide-icons .fs-ic { display: none; }
.fs-root.fs-hide-modified .fs-meta-modified { display: none; }

.fs-empty {
  padding: 28px 16px;
  text-align: center;
  color: var(--fs-muted);
}

.fs-kv {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  font-size: 13px;
}
.fs-kv dt { color: var(--fs-muted); }
.fs-kv dd { margin: 0; text-align: end; }

.fs-section { padding: 12px; border-bottom: 1px solid var(--fs-border); }
.fs-section h3 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--fs-muted);
}

.fs-preview {
  padding: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--editor-font, ui-monospace, monospace);
  font-size: 12px;
}
.fs-preview img {
  max-width: 100%;
  max-height: 60vh;
  display: block;
  margin: 0 auto;
  border-radius: 8px;
}

/* ---- Footer / batch bar ---------------------------------------------- */

.fs-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  padding: 6px 10px;
  border-top: 1px solid var(--fs-border);
  font-size: 11px;
  color: var(--fs-muted);
}
.fs-footer .fs-btn { min-width: 30px; height: 30px; }

.fs-batch {
  display: flex;
  gap: 6px;
  padding: 6px 10px;
  border-top: 1px solid var(--fs-border);
  overflow-x: auto;
  flex: 0 0 auto;
}
.fs-batch[hidden] { display: none; }
.fs-batch .fs-btn {
  height: 32px;
  border-color: var(--fs-border);
  font-size: 12px;
  white-space: nowrap;
}

.fs-progress {
  height: 2px;
  background: var(--fs-accent);
  width: 0;
  transition: width 160ms ease;
  flex: 0 0 auto;
}

/* ---- Report page ------------------------------------------------------ */

.fs-report {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.fs-report-bar {
  display: flex;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--fs-border);
  overflow-x: auto;
  flex: 0 0 auto;
}
.fs-report-bar .fs-btn {
  height: 36px;
  border-color: var(--fs-border);
  font-size: 12px;
  white-space: nowrap;
}
.fs-report-frame {
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  border: 0;
  background: transparent;
}

/* ---- Storage analysis bars ------------------------------------------- */

.fs-bar-row {
  padding: 6px 0;
  cursor: pointer;
}
.fs-bar-row:hover .fs-name { color: var(--fs-accent); }
.fs-bar-labels {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
}
.fs-bar-labels .fs-name {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fs-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--fs-hover);
  overflow: hidden;
}
.fs-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--fs-accent);
}

/* ---- Duplicates / search / diff -------------------------------------- */

.fs-group {
  padding: 8px 0;
  border-bottom: 1px solid var(--fs-border);
}
.fs-group:last-child { border-bottom: 0; }
.fs-group .fs-row { border-bottom: 0; min-height: 38px; }
.fs-hit {
  font-family: var(--editor-font, ui-monospace, monospace);
  font-size: 11px;
  color: var(--fs-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 2px 0 2px 8px;
}
.fs-code {
  margin: 0;
  font-family: var(--editor-font, ui-monospace, monospace);
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--fs-fg);
}

@media (max-width: 480px) {
  .fs-row { grid-template-columns: auto 1fr auto; }
  .fs-row .fs-size { display: none; }
}
`;
