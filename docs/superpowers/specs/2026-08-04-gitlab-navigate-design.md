# GitLab Navigate — Design

Date: 2026-08-04

## Purpose

A Chrome and Firefox extension that turns a bare GitLab reference into a tab. Click the toolbar
icon (or press the keyboard shortcut), paste a ticket number, MR number, commit hash,
or branch name, press Enter, and the corresponding GitLab page opens in a new tab.

The base repository URL is user-configurable, so the extension is not tied to any one
project.

## Scope

In scope: popup with grouped MR and ticket shortcuts plus reference inputs,
configurable base repo URL / default MR target branch / GitLab username,
recent-navigation list, keyboard shortcut. Chrome and Firefox from one manifest.

Out of scope: autocomplete, multiple saved repos, context-menu integration, Safari
builds, storing any GitLab credential.

GitLab API access was originally out of scope and stayed that way for fifteen releases.
Pinned pipelines needs it — status, branch and duration cannot be derived from a URL —
so it is now in scope for that one feature, under the constraints in
[Pinned pipelines](#pinned-pipelines) below: read-only, session-cookie authenticated,
and behind an optional permission.

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

1. Header row: title and the gear button (toggles the settings row).
2. Settings row (hidden by default): base repo URL, default MR target branch, and
   your GitLab username, each its own labelled input + Save button + error line.
3. Five labelled `.group` sections, each with an `<h2>`:
   - **MRs** — the Reviewer and Mine buttons, side by side.
   - **Tickets** — the Assigned, In progress and Authored buttons, side by side.
   - **Pipelines** — the Running, Mine and Authored buttons, side by side.
   - **Create MR** — a `.from-to` grid: the From and To boxes stacked in column one,
     with a ⇅ swap button spanning both rows in column two.
   - **Go to** — a `.fields-grid`, two columns wide, holding one `.field` per
     remaining `buildUrl` type.
   Each `.field` is a flex column: a small sentence-case caption label, the text input,
   and a hidden error `<p>` beneath. Stacking the label rather than seating it in a
   left-hand column is what makes two fields fit per row at 320px, and it keeps the
   example placeholders that a label-inside-the-box design would have displaced. Field
   labels are sentence case so they do not read as section headings, which are
   uppercase. In a grid row the error grows its own cell only, leaving its neighbour
   top-aligned.
4. "Swap source/target branches" button, immediately beneath Create MR so both
   branch-direction controls sit together (hidden unless the active tab qualifies, see
   Data Flow).
5. "Pin this pipeline" button (hidden unless the active tab is a pipeline page that
   is not already pinned), then the "Pinned pipelines" list.
6. "Recent" section: up to 8 entries, each a row with a nav button (type badge +
   value, click to reopen) and a 🗑 delete button that's invisible until the row is
   hovered or focused. Hidden when history is empty. The nav button is a two-column
   grid with a fixed 62px badge track, so values line up regardless of badge width
   rather than each row starting wherever its badge happens to end.

The Ticket input is focused on open, once the repo URL is configured.

Styling is plain CSS, light/dark aware via `prefers-color-scheme`.

### lib/parse.js

Pure, exported functions. No I/O.

```js
normalizeBase(input) -> string               // throws on invalid
buildUrl(type, input, base, extra) -> string  // throws ParseError on invalid input
reviewerMrUrl(base, username) -> string      // open MRs where username is reviewer
mineMrUrl(base, username) -> string          // open MRs assigned to username
assignedTicketsUrl(base, username) -> string     // work items assigned to username
inProgressTicketsUrl(base, username) -> string   // ...with status "In progress"
authoredTicketsUrl(base, username) -> string     // work items username opened
runningPipelinesUrl(base) -> string              // all running pipelines
myPipelinesUrl(base, username) -> string         // running pipelines username triggered
authoredPipelinesUrl(base, username) -> string   // all pipelines username triggered
parsePipelineUrl(url) -> {base, id} | null       // is this a pinnable pipeline page?
pipelineApiUrl(base, id) -> string               // REST endpoint for one pipeline
originPattern(base) -> string                    // host pattern for permissions.request
formatDuration(seconds) -> string | null         // "45s", "4m 12s", "1h 3m"
pipelineElapsedSeconds(pipeline, now) -> number | null
```

`extra` is type-specific and only `createMr` uses it, as the target branch.

`reviewerMrUrl` and `mineMrUrl` back the two **MRs** buttons. Unlike the text-box
types, they take no user-typed reference — just settings — so they sit outside the
`type`/`buildUrl` dispatch table rather than inside it.

Both build `.../-/merge_requests/?sort=created_date&state=opened&{param}={username}&
first_page_size=100`, differing only in `{param}`: `reviewer_username` and
`assignee_username` respectively, via a shared private
`mrListUrl(base, username, param)` helper.

The three ticket builders share a private `ticketListUrl(base, username, filters)`
helper and target `{base}/-/work_items`, GitLab's work-item list. Their filter params
were taken from URLs that list page produces itself, and cross-checked against GitLab's
frontend source (`work_items/list/constants.js`): assignee serialises as
`assignee_username[]` (bracketed), author as `author_username` (not bracketed), and
status as `status`. The helper rewrites `+` to `%20` after `URLSearchParams`, so
`status=In%20progress` matches GitLab's own links byte for byte. All three use
`state=all`, matching the views the user already works from.

"In progress" is GitLab's native work-item **Status** field, not a label: GitLab's issue
`state` is only `opened`/`closed`, and the REST issues API exposes no status filter at
all. Status is an Ultimate feature (GA in 18.4), so on a lesser tier the In progress
button degrades to "everything assigned to me" rather than erroring — acceptable,
since this repo is on a tier that has it.

The three pipeline builders share a private `pipelineListUrl(base, params)` targeting
`{base}/-/pipelines`, with each caller supplying its own params — they differ in both
content and order from the URLs GitLab produces, so the helper deliberately hardcodes
nothing but the path. `scope=all` is common to all three and matters: without it GitLab
scopes the list to the default branch. Running and Mine pin `status=running`; Authored
carries no status at all, making it a superset of Mine. `runningPipelinesUrl` is the
only list builder that takes no username, which is why `popup.js` needs a second guard
(see Data Flow) rather than reusing the username-gated one.

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
GitLab is not left to default the target to `main`. Both ends get the same
`stripBranchPrefixes` tolerance, because both now arrive from editable boxes.

`targetBranch` in `chrome.storage.sync` remains the *default* for the To box rather
than the only source of the target: it still changes far less often than the source
branch, so it stays a setting, but it seeds an editable field instead of being applied
invisibly. That is what makes a reverse MR possible without touching settings.

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

The `key` in `manifest.json` matters here. An unpacked extension's ID is otherwise
derived from its folder path, and `chrome.storage` is bucketed per extension ID — so
re-adding the extension via **Load unpacked**, or moving the folder, silently yields a
fresh empty bucket and the settings look "cleared". Pinning the ID with a `key` makes
storage stable across reinstalls, folder moves, and machines. No code path ever calls
`chrome.storage.*.clear()` or `.remove()`; only the named keys above are written.

Base URL, target branch, and username all live in `sync` so they follow the user
across machines; history lives in `local` because it is machine-specific noise.

### manifest.json

```json
{
  "manifest_version": 3,
  "name": "GitLab Navigate",
  "version": "0.14.0",
  "key": "<base64 SPKI public key — pins the extension ID>",
  "permissions": ["storage", "activeTab"],
  "optional_host_permissions": ["*://*/*"],
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

### Pinned pipelines

The only feature that reads from the GitLab API. Three constraints shape it:

**Authentication is the session cookie, not a token.** GitLab's REST API accepts the
`_gitlab_session` cookie the browser already holds ("The API uses this cookie for
authentication if it's present" — REST authentication docs). So `fetch(...,
{credentials: 'include'})` is authenticated as the signed-in user, and the extension
never asks for, handles, or stores a credential. A token field would have been a
liability for a tool this small.

**The host permission is optional and requested at runtime.** `optional_host_permissions`
is declared as `*://*/*`, but nothing is granted at install; `chrome.permissions.request`
asks for `originPattern(base)` — one origin — the first time the user pins. This keeps
the install-time permission profile unchanged for everyone who never pins. The request
must be the first `await` in the click handler or the user gesture is lost.

**Refusal is not failure.** If the permission is denied or the fetch fails, the pin is
still recorded from the URL alone and still navigates; only status, branch and duration
are missing. `refreshPinnedStatuses` renders cached values first and replaces them when
`Promise.allSettled` resolves, so a popup opened offline shows the last known state
rather than blanking.

`pipelineElapsedSeconds` prefers a finished pipeline's reported `duration` over the wall
clock; without that an old pinned pipeline would appear to still be counting up. The
1s tick that animates running pipelines is installed only when at least one unfinished
pipeline is pinned.

Storage is `chrome.storage.local`, capped at 10, keyed by `base` + `id` — pinned
pipelines are transient work state, like history, not settings.

## Data Flow

**On open:** `popup.js` reads the base URL, target branch, username, and history. If
no base URL is stored, the settings row is expanded, the reference inputs are
disabled, and the base input is focused. Otherwise the inputs are enabled, history
renders, and the Ticket input is focused.

**On Enter in a From or To box:** `submitCreateMr()` reads *both* boxes regardless of
which one has focus, checks each for emptiness so the error lands on the offending
field, then calls `buildUrl('createMr', from, base, to)`. The ⇅ button swaps the two
values in place and navigates nowhere. Create MR is therefore no longer part of the
generic `[data-type]` dispatch — that path assumes one box yields one URL — which is
why `refInputs` is scoped back to `#refs`.

**On Enter in a Go to input:** call `buildUrl(type, value, base)`. On success, call
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

**On open, for pinned pipelines:** render from `chrome.storage.local` immediately, then
refresh over the network if the host permission is already granted. Clicking a row opens
the pipeline; the ✕ that appears on hover unpins it and re-evaluates whether the Pin
button should reappear.

**On open, independently of the above:** query the active tab's URL and try
`swapMrBranches(tab.url)`. If it succeeds, show the "Swap source/target branches"
button and cache the swapped URL and tab id. This check does not depend on the base
URL being configured — it only reads the tab that's already open. On click,
`chrome.tabs.update(tabId, { url: swappedUrl })` and close the popup.

**On clicking a username-filtered list button** (both MRs, all three Tickets, and
Pipelines > Mine and Authored): all seven go through a shared `goToUserList(buildListUrl)` in
`popup.js`: check `base` then `username`, in that
order; if either is unset, open settings and show that field's error. Otherwise
`navigate(buildListUrl(base, username))`, passing the matching builder. The guard is
not MR-specific: every one of these buttons needs exactly the same two settings.

**On clicking Pipelines > Running:** `goToBaseList(runningPipelinesUrl)` — the same
shape, but it checks only `base`, because an unfiltered pipeline list needs no
username. Routing it through `goToUserList` would have demanded a setting the URL
never uses. The checks happen before calling the builder rather than catching its
`ParseError`, so the code doesn't have to infer which field was missing from the
exception message.

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
- `reviewerMrUrl` / `mineMrUrl`: build the reviewer- and assignee-filtered MR lists
  respectively, encode a username with special characters, reject a missing base URL
  or username
- `assignedTicketsUrl` / `inProgressTicketsUrl` / `authoredTicketsUrl`: build the three
  work-item lists, assert the exact URLs GitLab itself produces (including `%20` rather
  than `+` in the status), and reject a missing base URL or username
- `parsePipelineUrl`: accepts a single-pipeline page, rejects the pipeline *list* page,
  job pages and non-URLs, so it doubles as the "is this pinnable?" test
- `pipelineApiUrl`: URL-encodes the project path, including nested subgroups
- `formatDuration` / `pipelineElapsedSeconds`: the unit boundaries, a finished
  pipeline preferring its reported duration over the wall clock, and a negative clock
  skew clamping to zero rather than rendering "-5s"
- `runningPipelinesUrl` / `myPipelinesUrl` / `authoredPipelinesUrl`: build the three
  pipeline lists; the first rejects only a missing base URL, the other two a missing
  base URL or username. Authored is asserted to carry no `status` param.

The popup is rendered headlessly for layout checks — `Google Chrome --headless
--screenshot --window-size=330,900` against `file://…/popup.html` — which catches
spacing and hierarchy regressions without a browser session. The default, inline-error,
and settings-open states were each checked that way. UI wiring is still verified
manually by loading the unpacked extension: first-run settings
state, each box, the shortcut, the history list, the swap button appearing only on a
new-MR tab, Reviewer/Mine routing to settings with the right inline error when
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
- **Two MR buttons: Reviewer, and Mine.** These started as MR-a/MR-as in the header,
  abbreviations that were hard to find and hard to decode. What the user actually
  wants is one list of "MRs I have to deal with", with no author/assignee split.
  GitLab cannot express that union in a URL — filter params AND together, the MR list
  supports a `not` hash but no `or` hash, and `scope` is single-select
  (`created_by_me` / `assigned_to_me` / `reviews_for_me` / `all`), all confirmed
  against GitLab's merge-requests API docs. The alternatives were opening two tabs per
  click, or an unfiltered `scope=all` list; the user chose assignee-only, which is the
  union in practice because GitLab's new-MR form assigns the author by default. The
  one gap — an MR you opened and assigned to somebody else — is accepted knowingly.
  The button is named "Mine" rather than "Assignee" because it names the user's
  intent, and the underlying filter is documented rather than implied by the label.
- **Extension ID pinned with a manifest `key`, not a storage-migration layer.** The
  reported "settings clear on every update" was never a data-format problem — the keys
  have never changed, so there is nothing to migrate. It was an identity problem: a
  path-derived extension ID changing out from under a per-ID storage bucket. A `key`
  fixes the cause; a migration layer would have added machinery that addressed
  nothing. The private half of the keypair is generated locally and gitignored — only
  the public key is needed to pin the ID for an unpacked install.
- **Ticket filters copied from GitLab's own URLs, not guessed.** The param
  serialisation is inconsistent — `assignee_username[]` is bracketed, `author_username`
  is not — and guessing wrong fails silently by returning an unfiltered list rather
  than erroring. The values were taken from working URLs and confirmed against GitLab's
  frontend source, and the tests assert the full URL string so a regression is visible.
- **The header holds only the gear.** Cramming action buttons into the header row
  made them small, unlabelled, and easy to miss. Labelled `.group` sections cost a
  little vertical space and make each control's purpose readable at a glance.
- **Username is a third setting, not inferred.** GitLab has no reliable
  unauthenticated way for a content-free extension to know "who am I" — the only
  honest option is to ask once and store it. Both Reviewer and Mine share it, since
  they're the same GitLab account.
- **Delete button hidden until hover/focus, not always visible.** The recent list is
  meant to be scanned quickly; a permanently visible 🗑 next to every row adds visual
  noise for an action used rarely. `:hover`/`:focus-within` costs nothing in
  JavaScript and keeps the row keyboard-reachable.
- **Delete is a sibling button, not a nested one.** Nesting the 🗑 inside the nav
  button would need `stopPropagation` to stop delete clicks from also navigating,
  and stray clicks near the edge could hit the wrong target. Two independent
  buttons in one row need no coordination.
