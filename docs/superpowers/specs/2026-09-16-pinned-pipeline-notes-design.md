# Pinned Pipeline Notes — Design

Date: 2026-09-16
Target version: 0.18.0

## Goal

With many pipelines pinned, `#2816150418` says nothing about what a pipeline is for.
Let the user attach a short note to each pinned pipeline and read it at a glance.

## Layout

A row with a note shows the note as its headline; the pipeline number and branch share
the small muted second line, joined by ` · `:

```
⠿ ●  Hotfix: login redirect loop     4m 12s
     #2816150418 · dev/1.0.11
⠿ ✕  #2815998877                     2m 41s
     2846-regression-fix
```

- A row without a note renders exactly as in 0.17.0 (`#id` headline, branch below).
- The headline truncates with an ellipsis. The row's tooltip shows the full note on its
  first line, followed by the status and branch.
- Rows stay two lines tall with or without a note.

### Hover actions overlay the duration

✎ (edit note) and ✕ (unpin) are grouped in one action cluster, absolutely positioned
over the right end of the row and shown on `:hover` / `:focus-within`. The duration sits
underneath and is hidden while the cluster is visible.

Reason: 0.17.0's ✕ reserves ~24px of row width even while invisible. A second
permanently reserved button would leave the headline ~143px (~20 characters); overlaying
both gives it ~195px (~28 characters) in the resting state, which is the state notes
exist for. Cost: the hovered row's duration is hidden while hovered.

## Editing

### Entering edit mode

- Clicking ✎ puts that row in edit mode. Its title is "Add note" when the row has no
  note and "Edit note" otherwise.
- After pinning a pipeline, its new row (at the top) opens in edit mode automatically.
- At most one row is in edit mode. Entering edit mode on another row saves the current
  one first, by the same rule as clicking away.

### Edit mode

- The row's clickable nav button is replaced by a non-interactive container holding the
  status glyph, a text input in the headline slot, and the unchanged `#id · branch` line.
  (An input cannot be nested inside a `<button>`, so the button is swapped out rather than
  edited in place.)
- The input is focused with its existing text selected; placeholder
  *"What's this pipeline for?"*; `maxlength="80"`; `aria-label="Note for pipeline #<id>"`.
- The edited row's drag handle is not draggable, and its action cluster is hidden.

### Leaving edit mode

| Action        | Result                                              |
|---------------|-----------------------------------------------------|
| Enter         | Save                                                |
| Blur          | Save                                                |
| Esc           | Cancel — the stored note is unchanged               |

Save writes `normalizeNote(input.value)`; an empty result deletes the note. Leaving edit
mode re-renders the row normally.

### Esc must never save

A browser may close the popup on Esc, and closing it can blur the input, which would
save. So the Esc handler first sets a synchronous `cancelled` flag, then calls
`preventDefault()` and leaves edit mode. The blur handler returns without saving when the
flag is set. Esc therefore discards the edit whether or not the popup survives the
keypress.

### Re-renders during an edit

`renderPinned()` rebuilds the whole list, and `refreshPinnedStatuses()` calls it when the
network refresh lands — commonly moments after the popup opens, which is exactly when
the post-pin editor is active. To survive that, edit state lives outside the DOM:

```js
let editing = null; // { base, id, draft, selectionStart, selectionEnd, cancelled }
```

The input's `input` and `select` events keep `draft` and the selection current.
`renderPinned()` renders the edited row from `editing.draft`, restores the selection and
refocuses it. A blur caused by the rebuild itself must not count as a save: rendering
sets a `rendering` flag, and the blur handler ignores blurs while it is set.

The 1s duration tick updates cells in place and never rebuilds, so it cannot disturb an
edit.

### Known limitation

Dismissing the popup by clicking the page mid-edit saves only if the blur fires and its
storage write is dispatched before the popup is torn down. This is usual but not
guaranteed. Keystrokes are deliberately not autosaved, because a stored draft would make
Esc-to-cancel unreliable if the popup closes before the original note can be restored.

## Data

Pinned entries gain an optional `note: string` in `chrome.storage.local`, next to the rest
of the pin — notes are pin state, not settings, so they do not sync.

- `updatePinned` spreads fresh network fields over the stored entry and never sends
  `note`, so refreshes preserve notes unchanged.
- `unpinPipeline` removes the entry, note included.
- `reorderPinned` moves whole entries, note included.

## Code

### `lib/parse.js`

```js
normalizeNote(raw) -> string
```

Collapse every whitespace run to one space, trim, and cut to 80 characters (then trim
again, so a cut never leaves a trailing space). Non-string input yields `''`. `''` means
"no note".

### `lib/storage.js`

```js
setPinnedNote(base, id, note) -> Promise<Array>
```

Sets `note` on the matching entry, or deletes the field when `note` is `''`, saves, and
returns the list. Unknown `base`/`id` returns the list unchanged.

### `popup.js`

- `editing` state and `rendering` flag as above.
- `renderPinned()` renders either the normal row (headline = note or `#id`; second line =
  `#id · branch` when noted, otherwise branch) with the action cluster, or the edit row.
- `startEditing(entry)`, `commitEdit()`, `cancelEdit()`.
- `doPinPipeline()` calls `startEditing` on the new entry after rendering.

### `popup.css`

Headline note style, `.pin-actions` overlay cluster (✎ + ✕) with the duration hidden under
it on hover/focus, `.pin-edit` container, and the note input.

## Testing

- **Unit (bun):** `normalizeNote` — trims; collapses internal whitespace including
  tabs/newlines; whitespace-only returns `''`; caps at 80 characters without a trailing
  space; non-string returns `''`. The existing 101 tests keep passing.
- **Headless render:** noted and un-noted rows at rest, hover state, edit mode, in both
  themes. `./tools/screenshot.sh` sample rows gain notes on two of three rows, and the
  README screenshots are regenerated.
- **Lint:** `web-ext lint` stays 0/0/0.
- **Manual, in a real browser** (cannot be exercised headlessly):
  1. Esc in the editor — popup stays or closes, but the note is never changed.
  2. Clicking the page mid-edit — whether the note saved.
  3. Pinning — editor opens focused, including on the first pin when the host permission
     prompt appears.
  4. A status refresh landing while typing keeps the draft and caret.

## Release

0.18.0: `manifest.json`, CHANGELOG, README (Pinned pipelines section), and the main design
doc (`2026-08-04-gitlab-navigate-design.md`). Committed locally, not pushed.

## Out of scope

Syncing notes across machines, searching or filtering by note, notes on Recent entries,
multi-line notes.
