# Table Notes, Runner Tags and Pinned MRs — Design

Date: 2026-09-22
Target version: 0.20.0

## Goals

1. On GitLab's pipelines table, show each pinned pipeline's note next to its number, so
   pipelines can be told apart at a glance.
2. Show the runner a pipeline targets as a badge, both in the pipelines table and on the
   pipeline page.
3. Pin MRs in the popup, like pipelines and tickets.

## Background: why job tags, and no token

GitLab does not keep a pipeline's inputs retrievable: "After the pipeline starts, you
cannot fetch any used input values" (GitLab docs, CI/CD inputs). No REST, GraphQL or
token changes that. But the `RUNNER_TAG` input is interpolated into the jobs' `tags:`
when the pipeline is created, so each job's resolved `tag_list` carries it. On
`ternandsparrow/paratoo-fdcp`, pipeline 2869345251 has jobs tagged
`cypress,perentie-runner` (28), `perentie-runner` (2) and untagged (11); the nightly
2868066362 has the same shape with `huy-runner`.

The page script runs on the GitLab page and reads the jobs API with the user's existing
session, as GitLab's own UI does. No token setting is added and nothing secret is
stored.

## Part 1: Page scripts and notes in the pipelines table

### Registration

The popup keeps its single registered content script, with the same id `pipeline-note`
so existing installs update in place:

- `matches: [`${origin}/*/-/pipelines*`]` — the pipelines list (All, Finished,
  Branches, Tags, filters, `?page=`) as well as pipeline pages and their tabs.
- `js: ['content/shared.js', 'content/pipeline-notes.js', 'content/runner-tags.js']`,
  run in that order in one isolated world.
- `runAt: 'document_idle'`, `persistAcrossSessions: true`, as today.

`ensurePipelineNoteScript(base)` re-registers when the registered script's `matches`
**or** `js` differ from these, so the first popup open after updating switches over.
`content/pipeline-note.js` is removed.

### `content/shared.js`

A classic script that defines `globalThis.gitlabNavigate`. It touches no `chrome.*` or
`document` at load time, so bun can import it for unit tests.

- `normalize(url)` → `origin + pathname`, trailing slashes removed; `''` if unparsable.
- `pipelineUrlFromHref(href, baseUrl)` → `{ url, projectPath, id }` for a
  `…/<project path>/-/pipelines/<digits>` URL or one of its tabs
  (`…/-/pipelines/<id>/builds`), resolving `href` against `baseUrl`; `url` is the
  normalized pipeline URL without the tab. `null` for anything else, including the list
  page, `/-/pipelines/new` and `/-/pipelines/charts`.
- `sharedJobTags(jobs)` → the tags carried by **every** job whose `tag_list` is
  non-empty, in first-seen order; `[]` when no job has tags.
- `pinnedUrl(entry)` → `normalize(entry.webUrl || `${entry.base}/-/pipelines/${entry.id}`)`.
- `watch(callback)` → a `MutationObserver` on `document.body` with `childList`,
  `subtree`, `characterData`, and `attributes` filtered to `href`, coalesced to one
  `callback` per batch via a queued microtask (not an animation frame, which pauses in
  background tabs and never fires headless). `href` and text changes matter because
  GitLab's table can reuse a row element for a different pipeline when it polls.

### Notes in the table

For each `[data-testid="pipeline-url-table-cell"] [data-testid="pipeline-url-link"]`
link whose pipeline (`pipelineUrlFromHref(link.href)`) matches a pinned pipeline with a
non-empty note, a span is appended **inside** the link:

```
#2869345251  📌 Hotfix: login redirect loop
Merge branch 'fix/minio-quay-stopgap' i…
```

- Text `📌 ` + note via `textContent`; styled by a stylesheet the script injects once:
  `margin-left: 0.5rem; font-weight: 600; color: #9e5400`, and `#e9be74` under GitLab's
  `.gl-dark`. Bold amber, so a note is spotted at a glance in a dense table and does not
  read as part of the commit title. A stylesheet rather than an inline style, because
  only a rule can key off the dark theme. The heading note shares it.
  (0.20.1 — the first cut was subtle grey, which vanished in a busy row.)
- Inside the link it truncates with GitLab's own ellipsis in a narrow column, and a
  click opens the pipeline.
- The span carries `data-gitlab-navigate-note="<pipeline url>"`. Each check updates,
  replaces or removes it when the row now shows another pipeline, the note changed, or
  the pin went. Never duplicated.
- Popup edits update open tables at once (`chrome.storage.onChanged`, `local`,
  `pinnedPipelines`).

### Heading note

Behaviour unchanged from 0.19: on a pipeline page, the note is appended to the parent of
`[data-testid="pipeline-header"] [data-testid="pipeline-id"]`. It moves into
`content/pipeline-notes.js`, matching the page via
`pipelineUrlFromHref(location.href).url === pinnedUrl(entry)`, and uses `watch`.

## Part 2: Runner tag badges

### Where

- **Table:** appended to the row's badge line — the last element child of
  `[data-testid="pipeline-url-table-cell"]` (GitLab's `pipeline-labels` root), after
  `latest`, `branch` and the like.
- **Pipeline page:** inserted immediately before the element wrapping
  `[data-testid="pipeline-header"] [data-testid="total-jobs"]` (its closest `div`), i.e.
  straight after GitLab's header badges.

### Markup

GitLab's own badge markup, so it looks native and follows GitLab's themes:

```html
<span data-gitlab-navigate-runner="<pipeline url>" title="Runner tag"
      class="gl-badge badge badge-pill badge-neutral"><span class="gl-badge-content">perentie-runner</span></span>
```

One badge per tag left after the ignore list (usually one), with `margin-left: 0.25rem`
between badges. Re-checked on every `watch` callback and following row reuse, like
notes. If GitLab renames these classes the badge degrades to plain text.

### The rule

`sharedJobTags(jobs)`, then drop tags in the **Ignore job tags** setting (compared
case-insensitively). Nothing left, or no tagged job → no badge.

### Fetching

- `GET ${location.origin}/api/v4/projects/${encodeURIComponent(projectPath)}/pipelines/${id}/jobs?per_page=100`
  with `credentials: 'include'`. Same origin as the page; no new permission.
- First page only: a pipeline with more than 100 jobs is judged from those 100. Child
  pipelines are not followed.
- At most 4 requests in flight; each pipeline requested at most once per page load.
  Failures (network, non-2xx, non-array body) are not cached and are retried on the next
  page load.

### Cache

`chrome.storage.local` key `runnerTags`: an array of `[pipeline url, string[]]` pairs,
oldest first, holding `sharedJobTags` output **before** the ignore list, so changing the
setting applies without refetching. An array, not an object, because Chrome returns
object keys sorted alphabetically (Firefox keeps insertion order), which would break
newest-500 eviction.

- Written only when the jobs list is non-empty; a pipeline whose jobs have no tags
  caches `[]`.
- Newest 500 entries kept: a write drops that url's old pair, appends the new one, then
  keeps only the last 500 pairs.
- Tags never change after creation, so revisits cost no requests. Two tabs writing at
  once can lose an entry; it is simply fetched again later.
- Read failures (orphaned script after an extension update) are caught; the script then
  does nothing.

### Setting

A fourth settings field, **Ignore job tags** (placeholder `cypress`), with a Save button
and error line like the others. Tags are separated by commas and/or whitespace. Saved to
`chrome.storage.sync` key `ignoredJobTags` as an array via `parseTagList`: split, trim,
drop empties, de-duplicate case-insensitively keeping the first spelling. Saving an
empty value stores `[]`. The field shows the stored tags joined with `, `. Open GitLab
tabs re-draw their badges on change (`chrome.storage.onChanged`, `sync`,
`ignoredJobTags`).

## Part 3: Pinned MRs

### Pinning

- On `…/-/merge_requests/<iid>` or its `/diffs`, `/commits` or `/pipelines` tab (query
  and hash ignored), the shared pin button reads **📌 Pin this MR**; hidden when already
  pinned. `…/-/merge_requests/new` and the MR list do not qualify.
- Access is requested exactly as for pipelines and tickets (`originPattern(base)`);
  denied → pinned showing only `!<iid>`.
- Pinning does **not** open the note editor (like tickets).

### The list

A **Pinned MRs** section after Pinned tickets and before Create MR, capped at 10.

```
PINNED MRS
⠿ ○  Camera trap variations                 ●
     !1310 · 2319-camera-tr… → dev/1.0.12
⠿ ✓  fix(test): dropdown harness carried…   ✓
     !1303 · fix/cypress-drop… → dev/1.0.13
```

- **State glyph** (`status` token → glyph, colour):
  - `opened` and `locked` → token `opened`, `○`, green `#108548`.
  - `merged` → token `merged`, `✓`, blue `#1f75cb`.
  - `closed` → token `mr-closed`, `✕`, red `#dd2b0e`. (A separate token because
    tickets already colour `closed` blue.)
  - unknown → token `unknown`, muted `●`.
- **Headline:** note → title → `!<iid>`.
- **Small line:** `!<iid> · <source>` when branches are known and the headline is not
  `!<iid>`; `<source>` when the headline is `!<iid>`; `!<iid>` when branches are unknown
  and the headline is not `!<iid>`; empty otherwise. When branches are known it is
  followed by a tail, ` → <target>`, that never shrinks: only the part before it
  shortens with an ellipsis, so the target stays visible at any width. (`describeRow`
  returns it as `sublineTail`; `pinned-list.js` renders `.pin-ref-head` +
  `.pin-ref-tail`.) This replaced a fixed 24-character source cut, which still clipped
  the target at the popup's width.
- **Edit-mode small line:** `!<iid> · <source>` plus the same tail, or `!<iid>` when
  branches are unknown.
- **Trailing:** the MR's head pipeline status glyph (`STATUS_GLYPHS`), as
  `<span class="pin-status pin-mr-pipeline" data-status="<pipeline status>"
  title="Pipeline <status>">`, reusing the pipeline status colours; `null` when there is
  no head pipeline. ✎ and ✕ appear over it on hover, as over pipeline durations.
- **Tooltip lines:** the headline in full; the title when the note is the headline;
  `<source> → <target>` in full when known; then state (`open` for opened/locked,
  `merged`, `closed`) and `pipeline <status>` joined by ` · `, e.g.
  `merged · pipeline success`, omitting unknown parts.
- Click opens `webUrl`, else `${base}/-/merge_requests/<iid>`.
- Drag-to-reorder, ✎ notes (Enter/blur save, Esc cancels, empty removes,
  `NOTE_MAX_LENGTH` 80) and ✕ unpin behave as in the other lists. The note box's
  aria-label reads `Note for MR !<iid>`: `createPinnedList` gains an optional
  `idPrefix` (default `#`), which MRs set to `!`.
- Title, state, branches and pipeline status refresh on each popup open when access is
  granted; cached values render first.

### API

`GET /api/v4/projects/<encoded path>/merge_requests/<iid>` → `title`, `state`,
`source_branch`, `target_branch`, `web_url`, `head_pipeline.status`. Session-cookie auth
for GETs, as for pipelines and tickets.

## Data

- `pinnedMrs` (`chrome.storage.local`): `{ base, id, title, state, sourceBranch,
  targetBranch, pipelineStatus, webUrl, note?, pinnedAt }`; `id` is the iid as a string.
- `runnerTags` (`chrome.storage.local`): see Part 2.
- `ignoredJobTags` (`chrome.storage.sync`): `string[]`.
- `pinnedPipelines` and `pinnedTickets` unchanged.

## Code

| File | Change |
|------|--------|
| `lib/parse.js` | + `parseMrUrl(url) → {base, id} \| null`; + `mrApiUrl(base, id)`; + `parseTagList(text) → string[]` |
| `lib/storage.js` | + list kind `mrs` → `pinnedMrs`; + `getIgnoredJobTags()` / `setIgnoredJobTags(tags)` |
| `pinned-list.js` | + optional `idPrefix` (default `#`) for the note box's aria-label; + optional `sublineTail` that never shrinks |
| `popup.js` | `describeMr`, `fetchMr`, third list instance, MR branch in `checkActiveTab` and the pin button; Ignore job tags setting; `ensurePipelineNoteScript` compares `matches` and `js` |
| `popup.html` / `popup.css` | Pinned MRs section; settings field; `merged` / `mr-closed` colours; `.pin-mr-pipeline` |
| `content/shared.js` (new) | helpers above |
| `content/pipeline-notes.js` (new, replaces `content/pipeline-note.js`) | heading and table notes |
| `content/runner-tags.js` (new) | badges, fetching, cache |
| `tools/screenshot.sh` | sample pinned MR rows |
| `manifest.json` | version 0.20.0 |

## Testing

- **Unit (bun):**
  - `parseMrUrl`: MR page and each tab; query and hash; self-hosted and nested groups;
    rejects `new`, the list, non-http.
  - `mrApiUrl`: encoded path; missing base throws `ParseError`.
  - `parseTagList`: commas, whitespace, empties, case-insensitive duplicates, empty input.
  - `sharedJobTags`: the paratoo-fdcp shapes above; untagged jobs ignored; no tagged
    jobs; empty list.
  - `pipelineUrlFromHref`: relative and absolute hrefs; tabs; list page, `new`,
    `charts` rejected.
- **Popup harness** (headless Chrome, real popup, stubbed `chrome.*`): the existing
  pipeline and ticket scenarios as a regression check; MR pin (title and branches shown,
  no editor opens, button hides), refresh, note, unpin and independent reorder; saving
  the ignore setting; re-registration when `js` differs.
- **Page harness:** fixtures reproducing GitLab's table cell and header test ids, with
  stubbed `chrome.storage` and `fetch`: table notes inserted, following a row whose
  `href` changes, updated and removed; heading note unchanged; runner badges in table and
  header; badge dropped when its tag is added to the ignore list; cached pipelines not
  refetched; each pipeline fetched once per load; at most 4 in flight.
- **Screenshots:** opened and byte size checked (> 20 KB) before being trusted.
- **Lint:** `web-ext lint` stays 0/0/0.
- **Manual, real browser:** table notes and runner badges on the real pipelines list;
  the runner badge on a real pipeline page; first MR pin.

## Known limitations

- MR pages' Pipelines tab and commit pages are not covered.
- Runner tags come from the first 100 jobs; child pipelines are not followed.
- After an extension update, open the popup once; tabs already open at registration need
  a reload.
- If GitLab renames the test ids, notes and badges silently stop appearing; if it renames
  the badge classes, the badge shows as plain text.
- Runner badges need GitLab access, which the popup asks for on the first pin; without
  any pin the page script is never registered.

## Release

0.20.0: `manifest.json`, CHANGELOG, README (Pinned MRs; table notes; runner badges; the
Ignore job tags setting), main design doc. Committed locally; pushed only when the user
asks.

## Out of scope

A token setting, reading pipeline inputs, runner badges for child pipelines, page notes
on ticket or MR pages, pinning from the Go to boxes.
