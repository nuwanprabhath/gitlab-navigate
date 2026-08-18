# GitLab Navigate — Design

Date: 2026-08-04

## Purpose

A Chrome extension that turns a bare GitLab reference into a tab. Click the toolbar
icon (or press the keyboard shortcut), paste a ticket number, MR number, commit hash,
or branch name, press Enter, and the corresponding GitLab page opens in a new tab.

The base repository URL is user-configurable, so the extension is not tied to any one
project.

## Scope

In scope: popup with four inputs, configurable base repo URL, recent-navigation list,
keyboard shortcut.

Out of scope: GitLab API access, authentication, autocomplete, multiple saved repos,
context-menu integration, Firefox/Safari builds.

## Architecture

Manifest V3, vanilla JavaScript, no build step — matching the other extensions in
`pet-projects` (`simple-tab`, `tab-media-controller`).

```
gitlab-navigate/
  manifest.json
  popup.html
  popup.css
  popup.js          UI wiring: events, rendering, storage calls
  lib/parse.js      pure functions: reference -> URL
  lib/storage.js    chrome.storage read/write helpers
  icons/            16/32/48/128 px PNGs
  test/parse.test.js
  README.md
```

`lib/parse.js` has no Chrome dependencies and is the only unit-tested module.
`popup.js` holds all DOM and Chrome API interaction. `lib/storage.js` isolates the
storage keys so nothing else needs to know them.

Modules load as ES modules (`<script type="module" src="popup.js">`), which MV3
popups support.

## Components

### popup.html / popup.css

Fixed-width popup (~320px). Top to bottom:

1. Header row: title, gear button (toggles the settings row).
2. Settings row (hidden by default): text input for the base repo URL, Save button.
3. Four labelled input rows, in order: **Ticket**, **MR**, **Commit**, **History**.
   Each row has a label, a text input, and a hidden error `<span>` beneath it.
4. "Recent" section: up to 8 entries, each a button showing a type badge and the
   value. Hidden when history is empty.

The Ticket input is focused on open.

Styling is plain CSS, light/dark aware via `prefers-color-scheme`.

### lib/parse.js

Pure, exported functions. No I/O.

```js
normalizeBase(input) -> string               // throws on invalid
buildUrl(type, input, base, extra) -> string  // throws ParseError on invalid input
```

`extra` is type-specific and only `createMr` uses it, as the target branch.

`normalizeBase`:
- trim whitespace
- require an `http://` or `https://` URL, else throw
- drop a trailing `/`
- drop a trailing `/-/...` segment and everything after it, so pasting any page from
  the repo yields the repo root

`buildUrl(type, raw, base)`:
- trim `raw`; empty input throws
- if `raw` parses as an `http(s)` URL, return it unchanged (pasted full links just work)
- otherwise, by type:

| type       | accepted input                     | result                                    |
|------------|------------------------------------|--------------------------------------------|
| `ticket`   | `2795`, `#2795`                    | `{base}/-/work_items/2795`                 |
| `mr`       | `1122`, `!1122`                    | `{base}/-/merge_requests/1122`             |
| `commit`   | 7–40 hex chars                     | `{base}/-/commit/{hash}`                   |
| `history`  | branch name, e.g. `dev/1.0.11`     | `{base}/-/commits/dev%2F1.0.11/`           |
| `pipeline` | `2753700544`, `#2753700544`        | `{base}/-/pipelines/2753700544`            |
| `job`      | `15853756077`, `#15853756077`      | `{base}/-/jobs/15853756077`                |
| `createMr` | source branch, e.g. `fix-plot-layout-pro-expansion-issue` | `{base}/-/merge_requests/new?merge_request[source_branch]=...&merge_request[target_branch]={configured target}` |

Per-type normalization before matching:
- `ticket`: strip a leading `#`
- `mr`: strip a leading `!`
- `commit`: lowercase; must match `/^[0-9a-f]{7,40}$/`
- `history`: strip leading/trailing `/`, strip a leading `refs/heads/` or `origin/`,
  then `encodeURIComponent` the remainder and append a trailing `/`
- `pipeline`, `job`: strip a leading `#`; digits only
- `createMr`: same branch-prefix stripping as `history` (shared helper
  `stripBranchPrefixes`), applied to the source branch only; throws if no target
  branch is configured

Pipeline and job ids are both bare numbers with no distinguishing shape (unlike a
hex commit hash or a slash-containing branch name), so there is no way to route a
single input to the right one — they get their own boxes.

`createMr` does not build a page that already exists (like every other type) — it
builds GitLab's *new*-MR form pre-filled via query string, using GitLab's own
`merge_request[source_branch]` / `merge_request[target_branch]` parameter names, so
GitLab is not left to default the target to `main`. The target branch is a second
setting (`targetBranch`, `chrome.storage.sync`) rather than a fifth text box, since it
changes far less often than the source branch and belongs with the repo URL as
one-time setup.

Anything that fails its pattern throws a `ParseError` carrying a short human message.

### lib/storage.js

```js
getBase() / setBase(url)        // chrome.storage.sync, key "baseUrl"
getHistory() / pushHistory(e)   // chrome.storage.local, key "history"
```

`pushHistory` prepends `{type, value, url, ts}`, removes any earlier entry with the
same `url`, and truncates to 8.

Base URL lives in `sync` so it follows the user across machines; history lives in
`local` because it is machine-specific noise.

### manifest.json

```json
{
  "manifest_version": 3,
  "name": "GitLab Navigate",
  "version": "0.1.0",
  "permissions": ["storage"],
  "action": { "default_popup": "popup.html" },
  "commands": {
    "_execute_action": {
      "suggested_key": { "default": "Ctrl+Shift+G", "mac": "Command+Shift+G" }
    }
  },
  "icons": { "16": "...", "32": "...", "48": "...", "128": "..." }
}
```

No host permissions and no background service worker are needed —
`chrome.tabs.create` with a URL requires neither.

## Data Flow

**On open:** `popup.js` reads the base URL and history. If no base URL is stored, the
settings row is expanded, the four inputs are disabled, and the base input is focused.
Otherwise the inputs are enabled, history renders, and the Ticket input is focused.

**On Enter in an input:** call `buildUrl(type, value, base)`. On success, call
`chrome.tabs.create({ url })`, `pushHistory(...)`, clear the input, and
`window.close()`. On `ParseError`, show the message in that row's error span and leave
the input as it is.

**On Save in settings:** call `normalizeBase(value)`, store it, collapse the settings
row, enable the inputs, focus Ticket. On failure, show an error next to the base
input.

**On clicking a history entry:** open its stored URL in a new tab and close the popup.
The stored URL is used directly — no re-parsing, so entries stay valid even if the
base URL later changes.

## Error Handling

- No base URL configured: inputs disabled, settings expanded — the popup is
  self-explanatory on first run rather than failing on submit.
- Unparseable input: inline message under the offending row only. Nothing navigates,
  nothing is written to history, the popup stays open.
- Invalid base URL on save: inline message, nothing stored.
- All errors are inline text. No alerts, no thrown exceptions reaching the top level.

## Testing

`bun test` over `test/parse.test.js`, covering `lib/parse.js`:

- each type's happy path, including the three URLs from the original request
- `#2795` and `!1122` prefix stripping
- branch encoding: `dev/1.0.11` → `dev%2F1.0.11` with trailing slash
- branch prefix stripping: `origin/dev/1.0.11`, `refs/heads/main`
- pasted full URLs returned unchanged, for every type
- `normalizeBase` trailing-slash and trailing-`/-/...` trimming
- rejects: empty input, non-numeric ticket/MR, too-short and non-hex commit hashes,
  a base URL that is not http(s)

UI wiring is verified manually by loading the unpacked extension: first-run settings
state, each of the four boxes, the shortcut, and the history list.

## Decisions

- **Four separate boxes, not one smart box.** The user always knows which kind of
  reference they hold, and a bare number is genuinely ambiguous between a ticket and
  an MR. Explicit boxes remove the guesswork.
- **Tickets use `/-/work_items/`, not `/-/issues/`.** Matches the requested URL shape;
  GitLab redirects between the two anyway.
- **One repo, not a repo list.** YAGNI. A dropdown can be added later without
  reshaping storage, since the base URL is a single well-known key.
- **History stores the resolved URL,** not the raw reference, so replaying an entry
  never depends on current settings.
