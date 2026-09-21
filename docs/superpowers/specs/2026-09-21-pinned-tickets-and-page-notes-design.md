# Pinned Tickets and Pipeline Page Notes — Design

Date: 2026-09-21
Target version: 0.19.0

## Goals

1. Pin tickets (work items/issues) in the popup, with notes, so the tickets being worked
   on stay one click away.
2. On a GitLab pipeline page, show the note of that pipeline's pin next to the large
   pipeline number, so the pipeline is identifiable without opening the popup.

## Part 1: Pinned tickets

### Pinning

- On a ticket page — `…/-/work_items/<n>` or `…/-/issues/<n>` — the popup shows
  **📌 Pin this ticket** where the pipeline pin button appears today. A page is never both,
  so a single shared button reads "Pin this ticket" or "Pin this pipeline" by page type.
  It is hidden when the page's item is already pinned.
- Pinning requests the same optional host permission as pipelines
  (`originPattern(base)`); nothing is asked if already granted. Denied → the ticket is
  still pinned, showing only `#<n>`.
- Pinning a ticket does **not** open the note editor (unlike pipelines): the GitLab title
  already describes the ticket; notes are added with ✎.

### The list

A **Pinned tickets** section directly above **Pinned pipelines**, capped at 10 entries.

```
PINNED TICKETS
⠿ ○  Species list shows stale chunks
     #2893
⠿ ○  My fix is on MR !1261
     #2950 · Past data empty after sync
⠿ ✓  Login redirect loop
     #2846
```

- **Glyph:** `○` green (`#108548`) = `opened`; `✓` blue (`#1f75cb`) = `closed`;
  muted `●` = unknown (no data yet).
- **Headline:** note → GitLab title → `#<n>`.
- **Small line:** `#<n> · <title>` when the headline is the note and a title is known;
  `#<n>` when the headline is the note or the title; empty when the headline is already
  `#<n>`.
- **Tooltip:** first line = the headline text in full; second line = `open` / `closed`
  when known.
- No duration column; ✎ and ✕ appear on hover at the right, exactly as on pipeline rows.
- Click opens the ticket (`webUrl`, else `${base}/-/work_items/<n>`) in a new tab.
- Drag-to-reorder, ✎ note editing (Enter/blur save, Esc cancels and never saves, empty
  removes, `NOTE_MAX_LENGTH` 80) and ✕ unpin behave identically to pipeline rows.
- Title and state refresh each time the popup opens, when the host permission is granted;
  cached values render first, so an offline popup shows the last known state.

The GitLab REST issues endpoint serves issue, incident, test case and task types, and
accepts session-cookie auth for GETs. The work-item **Status** field ("In progress") is
GraphQL-only and is out of scope.

## Part 2: Note on the pipeline page

### What is shown

On a pipeline page whose pipeline is pinned **with a note**, the note is appended to the
page heading, after the pipeline number and after GitLab's own pipeline name if present:

```
#2866034605  📌 Species list old issue v2
```

- Same font size as the heading, `font-weight: 400`, colour
  `var(--gl-text-color-subtle, #626168)` so it follows GitLab's light/dark themes,
  `margin-left: 0.5rem`.
- Text is `📌 ` + note, inserted via `textContent` (the note is user input).
- Read-only: not clickable, not editable. Pinned without a note → nothing is shown.

### Behaviour

- Editing or clearing the note in the popup updates any open tab of that pipeline at once
  (`chrome.storage.onChanged`, `local` area, `pinnedPipelines` key). Unpinning removes it.
- GitLab renders the header with Vue after page load and re-renders it while the pipeline
  runs. A `MutationObserver` on `document.body` (`childList`, `subtree`), throttled to one
  check per animation frame, re-inserts the note whenever it is missing and the heading
  exists.

### Script

`content/pipeline-note.js`, a classic script (content scripts cannot use static ES module
imports), self-contained:

1. **Locate the heading:** the element `[data-testid="pipeline-header"] [data-testid="pipeline-id"]`;
   the note node is appended to that element's parent. These test ids come from GitLab's
   `pipeline_header.vue` and are the most stable hooks available.
2. **Find the note:** normalize the page URL (`origin + pathname`, trailing slash removed)
   and compare it with each pinned pipeline's URL — `entry.webUrl` or
   `${entry.base}/-/pipelines/${entry.id}`, normalized the same way. The page matches
   when it equals that URL or is one of the pipeline's tabs beneath it (e.g.
   `…/-/pipelines/<id>/builds`). First match with a non-empty `note` wins. This compares against the entries' own URLs instead of
   re-implementing `parsePipelineUrl`.
3. **Mark its node** with `data-gitlab-navigate-note` so it can be found, updated or
   removed, and never duplicated.

### Registration

- Manifest gains `"scripting"` (Chrome shows no install warning for it). No static
  `content_scripts` entry.
- The popup calls `ensurePipelineNoteScript(base)` whenever it holds the host permission
  for `base`'s origin: after a grant at pin time (pipeline or ticket), and on every popup
  open. It uses `chrome.scripting.getRegisteredContentScripts({ ids: ['pipeline-note'] })`
  and then `registerContentScripts` or `updateContentScripts` with:
  - `id: 'pipeline-note'`
  - `matches: [`${origin}/*/-/pipelines/*`]`
  - `js: ['content/pipeline-note.js']`
  - `runAt: 'document_idle'`
  - `persistAcrossSessions: true`

  Calling it on each open is the upgrade path from 0.18.0 and follows base-URL changes to
  another origin. Registration failures are caught and ignored; they only mean no page
  note.
- The script runs only on that origin's `…/-/pipelines/…` pages. If the user revokes the
  host permission, the browser stops injecting it.

### Known limitations

- After updating the extension, notes appear on pipeline pages once the popup has been
  opened once.
- Pipeline tabs already open at first registration need a reload.
- If GitLab renames the test ids, the note silently stops appearing; nothing else breaks.

## Data

- Tickets: `chrome.storage.local` key `pinnedTickets`, entries
  `{ base, id, title, state, webUrl, note?, pinnedAt }`; `id` is the ticket number as a
  string.
- Pipelines: key `pinnedPipelines`, unchanged, so existing pins and notes survive.
- `lib/storage.js` pinned functions take a `kind` first argument — `'pipelines'` |
  `'tickets'` — mapped to those keys: `getPinned(kind)`, `pinItem(kind, entry)`,
  `unpinItem(kind, base, id)`, `updatePinned(kind, updates)`,
  `setPinnedNote(kind, base, id, note)`, `reorderPinned(kind, base, id, targetIndex)`.
  `pinPipeline` / `unpinPipeline` are replaced by `pinItem` / `unpinItem`.

## Code

| File | Change |
|------|--------|
| `lib/parse.js` | + `parseTicketUrl(url) → {base, id} \| null` (work_items or issues, digits only; null for lists, `new`, non-http); + `ticketApiUrl(base, id)` → `/api/v4/projects/<encoded path>/issues/<id>`; both API builders share a private project-path helper |
| `lib/storage.js` | pinned functions generalized by `kind` |
| `pinned-list.js` (new) | `createPinnedList({ kind, section, list, describeRow, onRender })`: rendering, drag-to-reorder, ✎/✕, edit mode and its state (moved from `popup.js`, behaviour unchanged). `describeRow(entry)` returns `{ status, glyph, headline, subline, tooltip, trailing }` (`trailing` = duration element or `null`). Exposes `setEntries(entries)`, `getEntries()`, `startEditing(entry)` |
| `popup.js` | two list instances; shared pin button; ticket fetch/refresh; `ensurePipelineNoteScript`; the pipeline duration tick driven by `onRender` |
| `content/pipeline-note.js` (new) | page note |
| `popup.html` / `popup.css` | Pinned tickets section; generic pin section; `opened`/`closed` glyph colours |
| `manifest.json` | + `"scripting"`, version 0.19.0 |
| `tools/screenshot.sh` | sample pinned-ticket rows |

## Testing

- **Unit (bun):** `parseTicketUrl` — work_items and issues URLs; trailing slash and query;
  self-hosted; rejects the list page, `/-/work_items/new`, job/pipeline pages, non-http.
  `ticketApiUrl` — encoded path, nested subgroups, missing base throws `ParseError`.
- **Popup harness** (headless Chrome running the real popup with stubbed `chrome.*`): the
  seven 0.18.0 note scenarios as a regression check of the extraction; plus ticket pin
  (row shows title, no editor opens, pin button hides), ticket note save, ticket unpin,
  and independent reordering of the two lists.
- **Page-script harness:** a fixture page reproducing GitLab's header test ids with a
  stubbed `chrome.storage`: note inserted; re-inserted after the header is replaced;
  updated on storage change; removed on unpin; nothing for an unpinned pipeline or a pin
  without a note.
- **Screenshots:** every image is opened and its byte size checked before it is trusted.
- **Lint:** `web-ext lint` stays 0/0/0.
- **Manual, real browser:** note on a real GitLab pipeline page; note appearing after an
  update once the popup has been opened; first ticket pin's permission prompt.

## Release

0.19.0: `manifest.json`, CHANGELOG, README (Pinned tickets; page note), main design doc.
Committed locally; pushed only when the user asks.

## Out of scope

The work-item Status field, page notes on ticket pages, pinning from the Go to boxes,
syncing pins across machines.
