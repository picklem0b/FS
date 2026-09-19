# Changelog

All notable changes to FS are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-09-11

First release.

### Added

- Folder workspace panel with a metadata-rich listing: name, size,
  last-modified date, and file type for every entry.
- Type classification for text, image, media, binary, and folder entries, with
  matching icons.
- Sorting by name, size, date, or type, using natural ordering with folders
  grouped first.
- Substring search and one-tap filtering by file type.
- Folder summary: total size, file and folder counts, type breakdown, largest
  files, and duplicate-name detection.
- Cleanup insights for temporary files, backups, and duplicate names.
- Inline previews for text and images, with a configurable size limit.
- File actions: open in editor, copy path, copy name, rename, move, copy,
  delete, and create file or folder.
- Batch operations: move, copy, delete, and rename; rename patterns include
  prefix, suffix, find-and-replace, sequential numbering, and extension change.
- Folder report export in plain text, Markdown, CSV, and HTML, covering the
  summary, type breakdown, largest files, cleanup suggestions, and the file
  listing; reports can be saved into the folder, saved to app storage, shared,
  or copied to the clipboard.
- Styled HTML report page: a self-contained document with summary cards and
  tables that can be viewed in the workspace, opened in a browser, saved, or
  shared. It embeds its own stylesheet, requests nothing external, supports
  light and dark themes, and has a print layout.
- Responsive layout: full-screen workspace on phones, docked and
  drag-resizable panel on wider screens, with the dock width remembered.
- Android back button closes the workspace instead of leaving Acode.
- Settings page covering display columns, sorting, previews, scanning limits
  and ignore globs, tools, and layout.
- Sidebar launcher, floating side button, and four command palette entries.
- Unit test suite covering formatting, sorting, pattern matching, batch
  operations, cleanup insights, folder reports, folder access, scanning, and
  previews.

### Fixed

- The folder access layer previously had no implementation at all; the module
  barrel re-exported a class from itself, so nothing could resolve a folder.
- Ignore patterns were compiled as raw regular expressions, which made entries
  like `.DS_Store` match far more than intended. They are now globs.
- The folder summary crashed when building the extension breakdown, because
  `Array.prototype.sort` was called on the object returned by
  `Object.fromEntries`.
- Ordinary hidden files were suggested as cleanup candidates. Dotfiles are now
  only flagged when they are genuinely temporary or backup files.
- Relative timestamps mislabelled future dates as "just now".
- The plugin manifest declared a fractional price, which the Acode plugin
  schema rejects; it now uses an integer.
- The HTML escaping helper compiled its quote replacement to a pattern that
  matched a backslash rather than a quote, so double quotes in file names were
  not escaped. Escaping is now built from character codes with dedicated tests.
- The CSV writer could have quoted cells containing unrelated letters; quoting
  is now driven by an explicit character check.
