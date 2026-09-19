# FS — Folder Workspace

A folder workspace for Acode.

Acode's file tree is built for navigating and editing a project. FS is built for
looking at a folder as a folder: what is in it, how big it is, what changed,
what is duplicated, what is junk — and then acting on it without opening a
single file.

It attaches to a folder you choose and stays out of the way until you need it.
On a phone it opens as a full-screen workspace; on a tablet or desktop it docks
to the side and you drag the edge to size it. The same state follows you in both
layouts.

## What it does

**See the folder without opening anything**

- Every entry listed with name, size, last-modified date, and type
  (text, image, media, binary, folder).
- Entries are classified from their extension and MIME type, so a `.bak` next
  to a `.txt` is obvious at a glance.
- Sort by name, size, date, or type — with natural ordering, so `file2` comes
  before `file10`, and folders stay grouped at the top.
- Filter by type with one tap, or type in the search box to narrow the list.
- Hidden files are excluded by default and can be toggled from settings.

**Understand the folder**

- A folder summary shows total size, file and folder counts, the type
  breakdown, the largest files, and whether any names are duplicated.
- Cleanup insights flag temporary files, editor backups, and duplicate names —
  and deliberately leave ordinary hidden configuration files alone, because a
  `.env` is not junk.

**Inspect a file without switching context**

- Text files get an inline preview, capped at a size you control so a huge log
  never gets read into memory.
- Images get an inline preview using Acode's internal URL, so a photo is
  rendered rather than buffered into the page.
- Anything without a preview still shows its size, date, and type with a clear
  explanation instead of a guess.

**Act on the folder**

- Open in editor, copy path, copy name, rename.
- Batch selection for move, copy, rename, and delete.
- Batch rename patterns: add a prefix or suffix, replace text, number
  sequentially, or change every extension at once.
- Create new files and folders in the current directory.

**The paid toolkit**

- **Storage analyzer** — see where the bytes live: a recursive size rollup
  for every subfolder, a ranked bar view of what takes the space, and the
  largest files in the whole tree. Tap a bar to descend.
- **Duplicate content finder** — finds files with identical *contents*, not
  just names: cheap size pre-filter, sampled fingerprint for large files,
  then byte-exact confirmation so a group is a group. Shows reclaimable
  space and lets you preview or delete from the group.
- **ZIP export** — bundle the folder into a `.zip` built on device (store
  method, CRC-32, real per-file timestamps) and share it anywhere through
  the Android share sheet.
- **Deep search** — search names *and* file contents across the whole tree,
  with line numbers and snippets, regex and case toggles. Binary and
  oversized files are skipped automatically, results are capped.
- **Snapshots** — take a snapshot of a folder, keep working, then compare:
  added, removed, changed, and renamed entries with byte deltas, and a
  diff report you can copy or save. Renames are paired automatically
  instead of showing as add+remove noise.
- **Live auto-refresh** — the listing rescans on a configurable interval
  (2–60 seconds) and pauses while a dialog is open, so what you see is
  what is on disk.
- **Places** — pin the folders you live in and jump between them from the
  quick switcher; recent folders are remembered and ranked by use.

**Report the folder**

- Export a report of the folder as **plain text**, **Markdown**, **CSV**, or a
  **styled HTML page**.
- **Open as page** renders the report instantly inside the workspace — a
  self-contained document with summary cards and tables — and the **Browser**
  button hands the same page to an external or in-app browser.
- Every report carries the summary, the type breakdown, the largest files, and
  the cleanup suggestions with the total reclaimable size.
- Save it into the folder you are inspecting, save it to app storage, hand it
  to the Android share sheet, or copy it straight to the clipboard.
- Full paths are optional, and the per-file listing can be dropped for a
  summary-only report.
- CSV is the listing only (name, type, size in bytes, readable size, modified,
  directory flag, optional path) so it opens cleanly in a spreadsheet. Names
  containing commas or quotes are escaped properly.
- The HTML page embeds its own stylesheet and requests nothing external, so it
  renders the same offline, in the workspace, or in a browser. It adapts to
  light and dark themes and has a print layout. File names are escaped, so a
  name containing markup cannot break the page.

## Layout

| | Phone | Tablet / desktop |
|---|---|---|
| Placement | Full screen | Docked side panel |
| Resize | Not needed | Drag the edge (or arrow keys, Shift for larger steps) |
| Back button | Closes the workspace | — |
| Width | Follows the screen | Remembered between sessions |

The choice is automatic based on viewport width, and can be overridden in
settings (`Panel layout`: Automatic, Full screen, or Docked side panel). The
dock side is configurable too.

Switching orientation or resizing the window does not lose the open folder, the
filter, or the selection.

## Where it lives in Acode

- **Sidebar** — a compact launcher that opens the workspace and lists the
  workspace folders already open in Acode.
- **Side button** — toggles the workspace panel.
- **Command palette** — `FS: Open the folder workspace`, `FS: Choose a folder to
  inspect`, `FS: Refresh the open folder`, `FS: Show the folder summary`,
  `FS: Analyze folder storage`, `FS: Find duplicate files (by content)`,
  `FS: Deep search (names and file contents)`, `FS: Export folder as ZIP`,
  `FS: Compare with folder snapshot`.

## Settings

Everything the panel shows is configurable from Acode's plugin settings page.

| Group | Settings |
|---|---|
| Display | File size, modified date, file type, type icons, relative dates, hidden files, compact rows |
| Sorting | Default sort field, direction, folders-first |
| Preview | Text previews, image previews, text preview size limit |
| Scanning | Scan subfolders, maximum depth, maximum entries, ignore globs |
| Tools | Batch actions, cleanup insights, confirm destructive actions, large-file threshold, recent-file window, duplicate finder, ZIP export, live auto-refresh and interval, in-file search |
| Reports | Report format (text, Markdown, CSV, HTML page), include full paths, include the file listing |
| Layout | Panel layout, dock side, remember last folder |

Ignore patterns are globs (`*`, `?`, `**`), not regular expressions, so a
pattern like `*.log` means exactly that. Comma-separate multiple patterns:
`*.log, build/**, .git/**`.

## Install

From Acode: **Plugins → + → Remote**, then point it at this repository's
released `plugin.zip`, or install through the Acode plugin store.

## Privacy

FS works entirely on device. It reads the folders you point it at, keeps its
settings in local storage, and makes no network requests.

## Development

```sh
npm install
npm run dev      # watch, serve on :3000, rebuild plugin.zip
npm run build    # bundle and write plugin.zip
npm test         # run the unit test suite
```

Install a development build in Acode from **Plugins → + → Remote** using:

```
http://<your-ip>:3000/plugin.zip
```

### Project layout

```
src/
  main.js        plugin entry point: services, sidebar, side button, commands
  platform.js    guarded Acode API access and the file-system adapter
  settings.js    settings schema and persistent store
  fs/            folder access, scanning, file reading, previews
  utils/         formatting, sorting, pattern matching
  actions/       file operations, batch actions, cleanup insights,
                 storage analysis, duplicate finder, deep search, snapshots,
                 ZIP export, live watch, places
  ui/            panel, sidebar launcher, DOM helpers, styles
test/            unit tests (bundled with esbuild and run under Node)
scripts/         test runner
```

The `fs/`, `utils/`, and `actions/` layers are free of DOM and host
dependencies, which is why they can be unit tested directly.

## License

MIT — see [LICENSE](LICENSE).
