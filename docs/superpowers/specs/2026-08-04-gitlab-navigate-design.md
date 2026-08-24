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

1. Header row: title, then **MR-c**, **MR-a**, and **MR-as** buttons, then the gear
   button (toggles the settings row).
2. Settings row (hidden by default): base repo URL, default MR target branch, and
   your GitLab username, each its own labelled input + Save button + error line.
3. Labelled input rows, one per `buildUrl` type (see below). Each row has a label, a
   text input, and a hidden error `<span>` beneath it.
4. "Swap source/target branches" button (hidden unless the active tab qualifies, see
   Data Flow).
5. "Recent" section: up to 8 entries, each a row with a nav button (type badge +
   value, click to reopen) and a 🗑 delete button that's invisible until the row is
   hovered or focused. Hidden when history is empty.

The Ticket input is focused on open, once the repo URL is configured.

Styling is plain CSS, light/dark aware via `prefers-color-scheme`.

### lib/parse.js

Pure, exported functions. No I/O.

```js
normalizeBase(input) -> string               // throws on invalid
buildUrl(type, input, base, extra) -> string  // throws ParseError on invalid input
newMrUrl(base) -> string                     // the blank new-MR page
assignedMrUrl(base, username) -> string      // open MRs where username is reviewer
assigneeMrUrl(base, username) -> string      // open MRs where username is assignee
```

`extra` is type-specific and only `createMr` uses it, as the target branch.

`newMrUrl`, `assignedMrUrl`, and `assigneeMrUrl` back the header buttons (**MR-c**,
**MR-a**, **MR-as**). Unlike the text-box types, they take no user-typed reference —
just settings — so they sit outside the `type`/`buildUrl` dispatch table rather than
inside it.

`assignedMrUrl` and `assigneeMrUrl` both build
`.../-/merge_requests/?sort=created_date&state=opened&{param}={username}&
first_page_size=100`, differing only in `{param}`: `reviewer_username` for
`assignedMrUrl`, `assignee_username` for `assigneeMrUrl`. GitLab treats reviewer and
assignee as separate roles on an MR, and a user can be one, the other, both, or
neither — so these are deliberately two buttons rather than one that guesses which
the user meant. Both share a private `mrListUrl(base, username, param)` helper to
avoid duplicating the shared query params.

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

`swapMrBranches(urlString)` is the other pure export. Given a
`.../-/merge_requests/new?...` URL, it swaps `merge_request[source_branch]` and
`merge_request[target_branch]` (and `source_project_id`/`target_project_id` if both
are present, for fork MRs), preserving every other query param and the path.
Throws `ParseError` if either branch param is missing or the input isn't a URL. It
operates purely on the URL string — no DOM, no live page — so it can't break when
GitLab changes their page markup, and it stays testable without a browser.

### lib/storage.js

```js
getBase() / setBase(url)                       // chrome.storage.sync, key "baseUrl"
getTargetBranch() / setTargetBranch(branch)     // chrome.storage.sync, key "targetBranch"
getUsername() / setUsername(username)          // chrome.storage.sync, key "username"
getHistory() / pushHistory(e)                   // chrome.storage.local, key "history"
removeHistory(url)                             // chrome.storage.local, key "history"
```

`pushHistory` prepends `{type, value, url, ts}`, removes any earlier entry with the
same `url`, and truncates to 8. `removeHistory` filters out the entry matching
`url` and persists the rest; both return the resulting array so `popup.js` can
re-render straight from the return value without a second read.

Base URL, target branch, and username all live in `sync` so they follow the user
across machines; history lives in `local` because it is machine-specific noise.

### manifest.json

```json
{
  "manifest_version": 3,
  "name": "GitLab Navigate",
  "version": "0.7.0",
  "permissions": ["storage", "activeTab"],
  "action": { "default_popup": "popup.html" },
  "commands": {
    "_execute_action": {
      "suggested_key": { "default": "Ctrl+Shift+G", "mac": "Command+Shift+G" }
    }
  },
  "icons": { "16": "...", "32": "...", "48": "...", "128": "..." }
}
```

No host permissions and no content script or background service worker are needed.
`chrome.tabs.create` with a URL requires nothing extra; the branch-swap feature reads
and rewrites the active tab's URL via `chrome.tabs.query`/`chrome.tabs.update`, which
`activeTab` covers because opening the popup is itself the qualifying user gesture —
no host permission, no broad "read/change data on all sites" warning, and no content
script to keep in sync with GitLab's markup.

## Data Flow

**On open:** `popup.js` reads the base URL, target branch, username, and history. If
no base URL is stored, the settings row is expanded, the reference inputs are
disabled, and the base input is focused. Otherwise the inputs are enabled, history
renders, and the Ticket input is focused.

**On Enter in an input:** call `buildUrl(type, value, base)`. On success, call
`chrome.tabs.create({ url })`, `pushHistory(...)`, clear the input, and
`window.close()`. On `ParseError`, show the message in that row's error span and leave
the input as it is.

**On Save in settings:** call `normalizeBase(value)`, store it, collapse the settings
row, enable the inputs, focus Ticket. On failure, show an error next to the base
input.

**On clicking a history entry's nav button:** open its stored URL in a new tab and
close the popup. The stored URL is used directly — no re-parsing, so entries stay
valid even if the base URL later changes.

**On clicking a history entry's 🗑 button:** `renderHistory(await
removeHistory(entry.url))` — remove it from storage and re-render from the
returned array, without closing the popup or navigating. The delete button is a
sibling of the nav button, not nested inside it, so the click can't also trigger
navigation.

**On open, independently of the above:** query the active tab's URL and try
`swapMrBranches(tab.url)`. If it succeeds, show the "Swap source/target branches"
button and cache the swapped URL and tab id. This check does not depend on the base
URL being configured — it only reads the tab that's already open. On click,
`chrome.tabs.update(tabId, { url: swappedUrl })` and close the popup.

**On clicking MR-c:** if `base` is unset, open settings and show the base error;
otherwise `navigate(newMrUrl(base))`.

**On clicking MR-a or MR-as:** both go through a shared `goToMrList(buildMrListUrl)`
in `popup.js`: check `base` then `username`, in that order; if either is unset, open
settings and show that field's error. Otherwise
`navigate(buildMrListUrl(base, username))`, passing `assignedMrUrl` or
`assigneeMrUrl` respectively. The checks happen before calling the builder rather
than catching its `ParseError`, so the code doesn't have to infer which field was
missing from the exception message.

## Error Handling

- No base URL configured: inputs disabled, settings expanded — the popup is
  self-explanatory on first run rather than failing on submit.
- Unparseable input: inline message under the offending row only. Nothing navigates,
  nothing is written to history, the popup stays open.
- Invalid base URL on save: inline message, nothing stored.
- Active tab isn't a new-MR page, or is missing a branch param: the swap button simply
  never appears. No error shown — it's an unobtrusive extra, not a step the user must
  clear.
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
- `swapMrBranches`: swaps source/target branch params, preserves path and other query
  params, swaps project ids only when both are present, rejects a URL missing either
  branch param or that isn't a URL at all
- `newMrUrl`: builds the blank new-MR page, rejects a missing base URL
- `assignedMrUrl` / `assigneeMrUrl`: build the reviewer- and assignee-filtered MR
  lists respectively, encode a username with special characters, reject a missing
  base URL or username

UI wiring is verified manually by loading the unpacked extension: first-run settings
state, each box, the shortcut, the history list, the swap button appearing only on a
new-MR tab, MR-c/MR-a/MR-as routing to settings with the right inline error when
unconfigured, and deleting a recent entry removing only that one without navigating.

`removeHistory` itself is not unit-tested — like the rest of `lib/storage.js`, it's a
thin `chrome.storage` wrapper with no branching logic worth a real vs. mocked-Chrome
test; `getHistory`/`pushHistory` were never tested either, for the same reason.

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
- **Branch swap lives in the popup and edits the tab's URL, not a content script.**
  A content script matching every host (needed since the repo is self-hostable) would
  cost a broad "read/change data on all sites" warning for a feature that only ever
  needs one tab, once, on click. `activeTab` covers reading and rewriting that one
  tab's URL because opening the popup is itself the qualifying user gesture — same
  guarantee, far smaller permission footprint. It also means the feature can't be
  broken by a GitLab front-end change, since it never touches the page's DOM.
- **MR-a and MR-as are two buttons, not one with a mode toggle.** GitLab tracks
  reviewer and assignee as independent roles on an MR — a user can be one, the
  other, both, or neither. Originally only MR-a (reviewer) existed, built to match
  the URL the user gave; "assigned to me" turned out to mean the literal assignee
  role too, so MR-as (assignee) was added as its own button rather than folding a
  second meaning into MR-a, keeping each button's result unambiguous from its label.
- **Username is a third setting, not inferred.** GitLab has no reliable
  unauthenticated way for a content-free extension to know "who am I" — the only
  honest option is to ask once and store it. Both MR-a and MR-as share it, since
  they're the same GitLab account.
- **Delete button hidden until hover/focus, not always visible.** The recent list is
  meant to be scanned quickly; a permanently visible 🗑 next to every row adds visual
  noise for an action used rarely. `:hover`/`:focus-within` costs nothing in
  JavaScript and keeps the row keyboard-reachable.
- **Delete is a sibling button, not a nested one.** Nesting the 🗑 inside the nav
  button would need `stopPropagation` to stop delete clicks from also navigating,
  and stray clicks near the edge could hit the wrong target. Two independent
  buttons in one row need no coordination.
