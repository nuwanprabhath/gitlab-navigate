# Pinned Tickets and Pipeline Page Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin tickets (with notes) in the popup, and show a pinned pipeline's note next to the pipeline number on its GitLab page.

**Architecture:** The pinned-list UI (rows, drag-to-reorder, ✎/✕, note editing) moves out of `popup.js` into `pinned-list.js`, parameterised by a `describeRow(entry)` callback, so pipelines and tickets are two instances of one component. `lib/storage.js` pinned functions take a `kind` (`'pipelines'` | `'tickets'`). A classic content script, `content/pipeline-note.js`, is registered by the popup through `chrome.scripting.registerContentScripts` for the GitLab site's `…/-/pipelines/…` pages and appends the note to the page heading.

**Tech Stack:** Manifest V3 browser extension (Chrome + Firefox), vanilla ES modules, no build step, `bun test`, headless Chrome for behaviour checks, `npx web-ext lint`.

Spec: `docs/superpowers/specs/2026-09-21-pinned-tickets-and-page-notes-design.md`

## Global Constraints

- Repo root: `/Users/nuwan/projects/pet-projects/gitlab-navigate`. Run every repo command from there.
- Vanilla JS, no build step, no new dependencies. The only new manifest permission is `"scripting"`.
- Storage keys: pipelines `pinnedPipelines` (unchanged — existing pins must survive), tickets `pinnedTickets`. Cap 10 per list.
- Ticket entry shape: `{ base, id, title, state, webUrl, note?, pinnedAt }`, `id` = ticket number as a string.
- Ticket glyphs: `○` (U+25CB) for `opened`, colour `#108548`; `✓` (U+2713) for `closed`, colour `#1f75cb`; `●` (U+25CF) muted when unknown.
- Copy: pin button `📌 Pin this ticket` / `📌 Pin this pipeline`; note placeholder `What's this ticket for?` / `What's this pipeline for?`; note aria-label `Note for ticket #<id>` / `Note for pipeline #<id>`; unpin aria-label `Unpin this ticket` / `Unpin this pipeline`; ✎ title `Add note` / `Edit note`.
- Ticket small line: `#<n> · <title>` when the headline is the note and a title is known; `#<n>` when the headline is the note or the title; empty when the headline is `#<n>`. Separator is ` · ` (U+00B7 with spaces).
- Pinning a ticket does NOT open the note editor; pinning a pipeline still does.
- Page note: text `📌 ` + note via `textContent`; appended to the parent of `[data-testid="pipeline-header"] [data-testid="pipeline-id"]`; marker attribute `data-gitlab-navigate-note`; inline style `margin-left: 0.5rem; font-weight: 400; color: var(--gl-text-color-subtle, #626168);`.
- Content script registration: `id: 'pipeline-note'`, `matches: [`${origin}/*/-/pipelines/*`]`, `js: ['content/pipeline-note.js']`, `runAt: 'document_idle'`, `persistAcrossSessions: true`.
- Only `lib/parse.js` is unit tested (bun). Do not add a storage test harness.
- Commit locally after each task. **Never push.** Commit messages carry **no** `Co-Authored-By` or other AI attribution lines (standing user rule).
- Every screenshot must be opened with the Read tool and its byte size checked (a real render is > 20,000 bytes; blank ones are ~700 bytes). Describe only what is actually visible.
- Release version: `0.19.0`.

## File Map

| File | Change |
|------|--------|
| `lib/parse.js` | + `parseTicketUrl`, `ticketApiUrl`; `parsePipelineUrl`/`pipelineApiUrl` share private helpers |
| `test/parse.test.js` | + 11 tests |
| `lib/storage.js` | pinned functions take `kind`; `pinPipeline`/`unpinPipeline` → `pinItem`/`unpinItem` |
| `pinned-list.js` (new) | `createPinnedList(...)` |
| `popup.js` | uses two lists; shared pin button; ticket fetch; page-note script registration |
| `popup.html`, `popup.css` | Pinned tickets section; `#pin-page`; glyph colours; actions background |
| `content/pipeline-note.js` (new) | page note |
| `manifest.json` | + `"scripting"`; version 0.19.0 |
| `tools/screenshot.sh`, `docs/popup-*.png` | ticket sample rows; regenerated |
| `CHANGELOG.md`, `README.md`, `docs/superpowers/specs/2026-08-04-gitlab-navigate-design.md` | 0.19.0 docs |

## Test harness (scratch, never committed)

`H=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad/tickets-harness`

Task 2 creates it. It runs the **real** `popup.js` in a plain page with a stubbed `chrome.*` API, served over HTTP on port 8765 (ES modules do not load from `file://`). `check.sh` prints a JSON snapshot of stored data and rendered rows after a named scenario. Task 4 adds GitLab-like fixture pages for the content script.

---

### Task 1: Ticket URL helpers in `lib/parse.js`

**Files:**
- Modify: `lib/parse.js` (the `parsePipelineUrl` and `pipelineApiUrl` blocks)
- Test: `test/parse.test.js`

**Interfaces:**
- Produces: `export function parseTicketUrl(urlString: string): { base: string, id: string } | null` and `export function ticketApiUrl(base: string, id: string): string` (throws `ParseError` for an empty base). `parsePipelineUrl` and `pipelineApiUrl` keep their signatures and behaviour.

- [ ] **Step 1: Write the failing tests**

In `test/parse.test.js`, in the import list, replace:

```js
  parsePipelineUrl,
```

with:

```js
  parsePipelineUrl,
  parseTicketUrl,
```

and replace:

```js
  swapMrBranches,
} from '../lib/parse.js';
```

with:

```js
  swapMrBranches,
  ticketApiUrl,
} from '../lib/parse.js';
```

Append at the end of the file:

```js
describe('parseTicketUrl', () => {
  test('pulls base and id out of a work item URL', () => {
    expect(parseTicketUrl(`${BASE}/-/work_items/2893`)).toEqual({ base: BASE, id: '2893' });
  });

  test('accepts the older issues URL', () => {
    expect(parseTicketUrl(`${BASE}/-/issues/2893`)).toEqual({ base: BASE, id: '2893' });
  });

  test('ignores a trailing slash, query string and fragment', () => {
    expect(parseTicketUrl(`${BASE}/-/work_items/2893/?show=1#note_5`)).toEqual({
      base: BASE,
      id: '2893',
    });
  });

  test('works for a self-hosted instance', () => {
    expect(parseTicketUrl('https://gitlab.internal/team/repo/-/work_items/7')).toEqual({
      base: 'https://gitlab.internal/team/repo',
      id: '7',
    });
  });

  test('returns null for the work item list page', () => {
    expect(parseTicketUrl(`${BASE}/-/work_items?state=opened`)).toBeNull();
  });

  test('returns null for the new work item page', () => {
    expect(parseTicketUrl(`${BASE}/-/work_items/new`)).toBeNull();
  });

  test('returns null for a pipeline page', () => {
    expect(parseTicketUrl(`${BASE}/-/pipelines/2816150418`)).toBeNull();
  });

  test('returns null for a non-http URL', () => {
    expect(parseTicketUrl('chrome://extensions')).toBeNull();
  });
});

describe('ticketApiUrl', () => {
  test('URL-encodes the project path', () => {
    expect(ticketApiUrl(BASE, '2893')).toBe(
      'https://gitlab.com/api/v4/projects/ternandsparrow%2Fparatoo-fdcp/issues/2893',
    );
  });

  test('handles a nested subgroup path', () => {
    expect(ticketApiUrl('https://gitlab.com/a/b/c', '7')).toBe(
      'https://gitlab.com/api/v4/projects/a%2Fb%2Fc/issues/7',
    );
  });

  test('rejects a missing base URL', () => {
    expect(() => ticketApiUrl('', '7')).toThrow(ParseError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test 2>&1 | tail -5`
Expected: FAIL — `parseTicketUrl`/`ticketApiUrl` are not exported (SyntaxError or `is not a function`); the suite does not report `118 pass`.

- [ ] **Step 3: Implement**

In `lib/parse.js`, replace this exact block:

```js
/**
 * Recognise a single-pipeline page, e.g. `.../-/pipelines/2816150418`.
 *
 * @returns {{base: string, id: string}|null} null for anything else, including the
 *   pipeline *list* page, so callers can use it as a plain "is this pinnable?" test.
 */
export function parsePipelineUrl(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const match = url.pathname.match(/^(.*)\/-\/pipelines\/(\d+)\/?$/);
  if (!match) return null;

  return { base: `${url.origin}${match[1]}`, id: match[2] };
}

/**
 * The REST endpoint for one pipeline. GitLab accepts a URL-encoded project path in
 * place of a numeric project id, so no lookup call is needed.
 */
export function pipelineApiUrl(base, id) {
  if (!base) throw new ParseError('Set your GitLab repo URL first');

  const url = new URL(base);
  const project = encodeURIComponent(url.pathname.replace(/^\/|\/$/g, ''));
  return `${url.origin}/api/v4/projects/${project}/pipelines/${id}`;
}
```

with:

```js
/**
 * Match a page inside a project by a pathname pattern whose first group is the project
 * path and second the item id.
 *
 * @returns {{base: string, id: string}|null}
 */
function parseProjectItemUrl(urlString, pattern) {
  const url = asHttpUrl(urlString);
  if (!url) return null;
  const match = url.pathname.match(pattern);
  return match ? { base: `${url.origin}${match[1]}`, id: match[2] } : null;
}

/**
 * Recognise a single-pipeline page, e.g. `.../-/pipelines/2816150418`.
 *
 * @returns {{base: string, id: string}|null} null for anything else, including the
 *   pipeline *list* page, so callers can use it as a plain "is this pinnable?" test.
 */
export function parsePipelineUrl(urlString) {
  return parseProjectItemUrl(urlString, /^(.*)\/-\/pipelines\/(\d+)\/?$/);
}

/**
 * Recognise a single-ticket page: `.../-/work_items/2893` or the older
 * `.../-/issues/2893`. Null for lists, `new` and anything else.
 */
export function parseTicketUrl(urlString) {
  return parseProjectItemUrl(urlString, /^(.*)\/-\/(?:work_items|issues)\/(\d+)\/?$/);
}

// GitLab accepts a URL-encoded project path in place of a numeric project id, so no
// lookup call is needed.
function projectApiUrl(base) {
  if (!base) throw new ParseError('Set your GitLab repo URL first');

  const url = new URL(base);
  const project = encodeURIComponent(url.pathname.replace(/^\/|\/$/g, ''));
  return `${url.origin}/api/v4/projects/${project}`;
}

/**
 * The REST endpoint for one pipeline.
 */
export function pipelineApiUrl(base, id) {
  return `${projectApiUrl(base)}/pipelines/${id}`;
}

/**
 * The REST endpoint for one ticket. It serves issue, incident, test case and task types.
 */
export function ticketApiUrl(base, id) {
  return `${projectApiUrl(base)}/issues/${id}`;
}
```

(`asHttpUrl` already exists near the top of `lib/parse.js`: it returns a `URL` for http/https input and `null` otherwise.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test 2>&1 | tail -5`
Expected: `118 pass`, `0 fail`. The existing `parsePipelineUrl`/`pipelineApiUrl` tests must still pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/parse.js test/parse.test.js
git commit -m "Add ticket URL helpers and share project URL parsing"
```

---

### Task 2: Extract `pinned-list.js`; storage by `kind` (no behaviour change)

A pure refactor: the popup must behave exactly as in 0.18.0. The seven 0.18.0 note scenarios prove it.

**Files:**
- Create: `pinned-list.js`
- Modify: `lib/storage.js`, `popup.js`
- Create (scratch, not committed): `$H/stub-chrome.js`, `$H/scenario.js`, `$H/sync.sh`, `$H/check.sh`, `$H/shot.sh`

**Interfaces:**
- Consumes: `NOTE_MAX_LENGTH`, `normalizeNote` from `lib/parse.js` (exist since 0.18.0).
- Produces:
  - `lib/storage.js`: `getPinned(kind)`, `pinItem(kind, entry)`, `unpinItem(kind, base, id)`, `updatePinned(kind, updates)`, `setPinnedNote(kind, base, id, note)`, `reorderPinned(kind, base, id, targetIndex)` — `kind` is `'pipelines'` | `'tickets'`; each returns `Promise<Array>` of the list after the change.
  - `pinned-list.js`: `export function createPinnedList({ kind, noun, section, list, describeRow, navigate, onRender })` returning `{ getEntries(): Array, setEntries(entries: Array): void, startEditing(entry): void }`. `describeRow(entry)` must return `{ status: string, glyph: string, headline: string, headlineIsId: boolean, subline: string, editSubline: string, tooltip: string, trailing: HTMLElement|null, url: string }`. `onRender(entries)` runs after every render.
  - `popup.js`: top-level `pipelinesList`, `describePipeline(entry)`, `fetchPipeline(entry)`, `hasGitLabAccess()`, `refreshPinnedStatuses()`, `refreshPinButton()`, `doPinPipeline()`, `scheduleTick()`.

- [ ] **Step 1: Create the harness**

```bash
H=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad/tickets-harness
mkdir -p "$H"
```

Write `$H/stub-chrome.js`:

```js
// Minimal chrome.* stand-in so the real popup.js runs in a plain page.
const params = new URLSearchParams(location.search);
const BASE = 'https://gitlab.com/ternandsparrow/paratoo-fdcp';
const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

const syncStore = { baseUrl: BASE, targetBranch: 'dev/1.0.11', username: 'nuwan-tern' };
const localStore = {
  history: [],
  pinnedPipelines: [
    {
      base: BASE,
      id: '2816150418',
      status: 'running',
      ref: 'dev/1.0.11',
      note: 'Hotfix: login redirect loop',
      raw: { status: 'running', started_at: minutesAgo(4.2) },
    },
    {
      base: BASE,
      id: '2816150001',
      status: 'success',
      ref: 'fix-plot-layout-pro-expansion-issue',
      note: 'Retry after flaky e2e',
      raw: { status: 'success', duration: 423, finished_at: minutesAgo(30) },
    },
    {
      base: BASE,
      id: '2815998877',
      status: 'failed',
      ref: '2846-regression-fix',
      raw: { status: 'failed', duration: 161, finished_at: minutesAgo(60) },
    },
  ],
  pinnedTickets: [
    { base: BASE, id: '2893', title: 'Species list shows stale chunks', state: 'opened' },
    { base: BASE, id: '2846', title: 'Login redirect loop', state: 'closed', note: 'Old hotfix' },
  ],
};
const TICKET_TITLES = { 2950: 'Past data empty after sync' };

const area = (store) => ({
  async get(key) {
    return { [key]: structuredClone(store[key]) };
  },
  async set(values) {
    Object.assign(store, structuredClone(values));
  },
});

const access = params.get('access') === '1';
const TABS = {
  pipeline: `${BASE}/-/pipelines/2817000000`,
  ticket: `${BASE}/-/work_items/2950`,
};
const tabUrl = TABS[params.get('tab')] ?? `${BASE}/-/merge_requests/1`;

const registered = [];
window.chrome = {
  storage: { sync: area(syncStore), local: area(localStore) },
  tabs: { query: async () => [{ id: 1, url: tabUrl }], create() {}, update() {} },
  permissions: { contains: async () => access, request: async () => access },
  scripting: {
    async getRegisteredContentScripts({ ids } = {}) {
      return structuredClone(registered.filter((s) => !ids || ids.includes(s.id)));
    },
    async registerContentScripts(scripts) {
      registered.push(...structuredClone(scripts));
    },
    async updateContentScripts(scripts) {
      for (const script of scripts) {
        Object.assign(registered.find((r) => r.id === script.id), structuredClone(script));
      }
    },
  },
};

// The network refresh lands late, to exercise re-rendering during an edit.
window.fetch = async (url) => {
  await new Promise((resolve) => setTimeout(resolve, 600));
  const id = String(url).split('/').pop();
  if (String(url).includes('/issues/')) {
    const pin = localStore.pinnedTickets.find((t) => t.id === id);
    return {
      ok: true,
      json: async () => ({
        title: pin?.title ?? TICKET_TITLES[id] ?? `Ticket ${id}`,
        state: 'opened',
        web_url: `${BASE}/-/work_items/${id}`,
      }),
    };
  }
  const pin = localStore.pinnedPipelines.find((p) => p.id === id);
  return {
    ok: true,
    json: async () => ({
      status: 'running',
      ref: pin?.ref ?? 'feature/new-thing',
      web_url: `${BASE}/-/pipelines/${id}`,
      started_at: minutesAgo(1),
    }),
  };
};

window.__localStore = localStore;
window.__registered = registered;
```

Write `$H/scenario.js` (it works before and after Task 3's HTML changes, so later tasks reuse it unchanged):

```js
const params = new URLSearchParams(location.search);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const LISTS = { pipelines: '#pinned-list', tickets: '#pinned-tickets-list' };
const rows = (kind) => [...document.querySelectorAll(`${LISTS[kind]} .pin-item`)];
const editor = () => document.querySelector('.pin-note-input');
const editButton = (kind, row) => rows(kind)[row].querySelector('.pin-note-edit');
const pinSection = () =>
  document.getElementById('pin-page') ?? document.getElementById('pin-pipeline');
const pinButton = () =>
  document.getElementById('pin-page-button') ?? document.getElementById('pin-pipeline-button');

function type(value) {
  const input = editor();
  input.value = value;
  input.setSelectionRange(value.length, value.length);
  input.dispatchEvent(new Event('input'));
}

function press(key) {
  editor().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

// Drops the dragged row onto the upper half of the target row, i.e. "insert above".
function drag(fromKind, fromRow, toKind, toRow) {
  const dataTransfer = new DataTransfer();
  const handle = rows(fromKind)[fromRow].querySelector('.pin-handle');
  const target = rows(toKind)[toRow];
  const clientY = target.getBoundingClientRect().top + 1;
  handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
  target.dispatchEvent(
    new DragEvent('dragover', { bubbles: true, cancelable: true, clientY, dataTransfer }),
  );
  target.dispatchEvent(
    new DragEvent('drop', { bubbles: true, cancelable: true, clientY, dataTransfer }),
  );
  handle.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
}

const scenarios = {
  // Headless screenshots cannot hover, so mimic :hover on the first row of each list.
  async hover() {
    const style = document.createElement('style');
    style.textContent = Object.values(LISTS)
      .map(
        (list) => `
        ${list} .pin-item:first-child .pin-actions { opacity: 1; pointer-events: auto; }
        ${list} .pin-item:first-child .pin-duration { visibility: hidden; }
        ${list} .pin-item:first-child .pin-nav { background: var(--chip); }
        ${list} .pin-item:first-child .pin-handle { opacity: 0.9; }`,
      )
      .join('\n');
    document.head.append(style);
  },
  async edit() {
    editButton('pipelines', 0).click();
  },
  async commit() {
    editButton('pipelines', 2).click();
    type('  Needs   rerun  ');
    press('Enter');
  },
  async clear() {
    editButton('pipelines', 0).click();
    type('   ');
    press('Enter');
  },
  async escape() {
    editButton('pipelines', 0).click();
    type('junk that must not save');
    press('Escape');
  },
  async other() {
    editButton('pipelines', 0).click();
    type('Edited first');
    editor().blur();
    editButton('pipelines', 1).click();
  },
  async race() {
    editButton('pipelines', 0).click();
    type('Draft survives refresh');
  },
  async pin() {
    pinButton().click();
  },
  async ticketEdit() {
    editButton('tickets', 0).click();
  },
  async ticketNote() {
    editButton('tickets', 0).click();
    type('My fix is on MR !1261');
    press('Enter');
  },
  async ticketUnpin() {
    rows('tickets')[1].querySelector('.pin-remove').click();
  },
  async ticketReorder() {
    drag('tickets', 1, 'tickets', 0);
    await wait(300);
    drag('tickets', 0, 'pipelines', 0);
  },
};

await wait(200);
await scenarios[params.get('scenario')]?.();
await wait(1200);

const stored = (key) => window.__localStore[key] ?? [];
const text = (row, selector) => row.querySelector(selector)?.textContent ?? null;
const tooltip = (row) => row.querySelector('.pin-nav')?.title ?? null;
document.title = JSON.stringify({
  notes: stored('pinnedPipelines').map((p) => p.note ?? null),
  statuses: stored('pinnedPipelines').map((p) => p.status),
  pipelineIds: stored('pinnedPipelines').map((p) => p.id),
  headlines: rows('pipelines').map((r) => text(r, '.pin-note, .pin-id')),
  sublines: rows('pipelines').map((r) => text(r, '.pin-ref')),
  tooltips: rows('pipelines').map(tooltip),
  tickets: {
    ids: stored('pinnedTickets').map((t) => t.id),
    notes: stored('pinnedTickets').map((t) => t.note ?? null),
    headlines: rows('tickets').map((r) => text(r, '.pin-note, .pin-id')),
    sublines: rows('tickets').map((r) => text(r, '.pin-ref')),
    tooltips: rows('tickets').map(tooltip),
    hidden: document.getElementById('pinned-tickets')?.hidden ?? null,
  },
  editing: editor()?.value ?? null,
  focused: Boolean(editor()) && document.activeElement === editor(),
  pinHidden: pinSection().hidden,
  pinText: pinButton().textContent.trim(),
  registered: window.__registered,
});
```

Write `$H/sync.sh`:

```bash
#!/usr/bin/env bash
# Copies the current extension source into the harness and makes sure it is served.
set -euo pipefail
H="$(cd "$(dirname "$0")" && pwd)"
REPO=/Users/nuwan/projects/pet-projects/gitlab-navigate
rsync -a --delete "$REPO/lib/" "$H/lib/"
if [ -d "$REPO/content" ]; then rsync -a --delete "$REPO/content/" "$H/content/"; fi
cp "$REPO/popup.css" "$REPO"/*.js "$H/"
python3 - "$REPO/popup.html" "$H/harness.html" <<'PY'
import sys
src, dst = sys.argv[1:]
html = open(src).read()
tag = '<script type="module" src="popup.js"></script>'
assert tag in html
html = html.replace(tag, '<script src="stub-chrome.js"></script>\n' + tag +
                    '\n<script type="module" src="scenario.js"></script>')
open(dst, 'w').write(html)
PY
curl -s -o /dev/null http://localhost:8765/harness.html || \
  (cd "$H" && nohup python3 -m http.server 8765 >/dev/null 2>&1 &)
sleep 1
```

Write `$H/check.sh`:

```bash
#!/usr/bin/env bash
# usage: check.sh "<query string>"  -> prints the scenario's state JSON
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
"$CHROME" --headless --disable-gpu --virtual-time-budget=3000 --dump-dom \
  "http://localhost:8765/harness.html?$1" 2>/dev/null | python3 -c '
import sys, re, html, json
title = re.search(r"<title>(.*?)</title>", sys.stdin.read(), re.S).group(1)
print(json.dumps(json.loads(html.unescape(title)), ensure_ascii=False, indent=1))'
```

Write `$H/shot.sh` (tall window: a short one renders blank):

```bash
#!/usr/bin/env bash
# usage: shot.sh "<query string>" <out.png>
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
"$CHROME" --headless --disable-gpu --hide-scrollbars --virtual-time-budget=3000 \
  --window-size=330,1400 --screenshot="$2" \
  "http://localhost:8765/harness.html?$1" >/dev/null 2>&1
ls -l "$2" | awk '{print "wrote", $NF, $5, "bytes"}'
```

Then:

```bash
chmod +x "$H"/*.sh && "$H/sync.sh" && "$H/check.sh" "scenario=rest" | head -12
```

Expected: JSON prints, with `"notes"` equal to `["Hotfix: login redirect loop", "Retry after flaky e2e", null]` and `"headlines"` equal to `["Hotfix: login redirect loop", "Retry after flaky e2e", "#2815998877"]`. This is the 0.18.0 baseline the refactor must preserve.

- [ ] **Step 2: Record the baseline for all seven scenarios**

```bash
H=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad/tickets-harness
for s in rest commit clear escape other "race&access=1" "pin&tab=pipeline&access=1"; do
  echo "== $s"; "$H/check.sh" "scenario=$s" | python3 -c '
import sys, json; d = json.load(sys.stdin)
print({k: d[k] for k in ("notes", "headlines", "editing", "focused", "pinHidden", "statuses")})'
done | tee "$H/baseline.txt"
```

Expected (keep this output; Step 7 must reproduce it exactly):

```
== rest
{'notes': ['Hotfix: login redirect loop', 'Retry after flaky e2e', None], 'headlines': ['Hotfix: login redirect loop', 'Retry after flaky e2e', '#2815998877'], 'editing': None, 'focused': False, 'pinHidden': True, 'statuses': ['running', 'success', 'failed']}
== commit
{'notes': ['Hotfix: login redirect loop', 'Retry after flaky e2e', 'Needs rerun'], 'headlines': ['Hotfix: login redirect loop', 'Retry after flaky e2e', 'Needs rerun'], 'editing': None, 'focused': False, 'pinHidden': True, 'statuses': ['running', 'success', 'failed']}
== clear
{'notes': [None, 'Retry after flaky e2e', None], 'headlines': ['#2816150418', 'Retry after flaky e2e', '#2815998877'], 'editing': None, 'focused': False, 'pinHidden': True, 'statuses': ['running', 'success', 'failed']}
== escape
{'notes': ['Hotfix: login redirect loop', 'Retry after flaky e2e', None], 'headlines': ['Hotfix: login redirect loop', 'Retry after flaky e2e', '#2815998877'], 'editing': None, 'focused': False, 'pinHidden': True, 'statuses': ['running', 'success', 'failed']}
== other
{'notes': ['Edited first', 'Retry after flaky e2e', None], 'headlines': ['Edited first', None, '#2815998877'], 'editing': 'Retry after flaky e2e', 'focused': True, 'pinHidden': True, 'statuses': ['running', 'success', 'failed']}
== race&access=1
{'notes': ['Hotfix: login redirect loop', 'Retry after flaky e2e', None], 'headlines': [None, 'Retry after flaky e2e', '#2815998877'], 'editing': 'Draft survives refresh', 'focused': True, 'pinHidden': True, 'statuses': ['running', 'running', 'running']}
== pin&tab=pipeline&access=1
{'notes': [None, 'Hotfix: login redirect loop', 'Retry after flaky e2e', None], 'headlines': [None, 'Hotfix: login redirect loop', 'Retry after flaky e2e', '#2815998877'], 'editing': '', 'focused': True, 'pinHidden': True, 'statuses': ['running', 'running', 'running', 'running']}
```

- [ ] **Step 3: Generalise `lib/storage.js` by kind**

Replace:

```js
const PINNED_KEY = 'pinnedPipelines';
const PINNED_LIMIT = 10;
```

with:

```js
const PINNED_KEYS = { pipelines: 'pinnedPipelines', tickets: 'pinnedTickets' };
const PINNED_LIMIT = 10;
```

Then replace everything from the line `export async function getPinned() {` up to (not including) the line `export async function removeHistory(url) {` with:

```js
function pinnedKey(kind) {
  const key = PINNED_KEYS[kind];
  // chrome.storage.local.get(undefined) would return everything, so fail loudly instead.
  if (!key) throw new Error(`Unknown pinned list: ${kind}`);
  return key;
}

/**
 * @param {'pipelines'|'tickets'} kind which pinned list
 */
export async function getPinned(kind) {
  const key = pinnedKey(kind);
  const { [key]: pinned } = await chrome.storage.local.get(key);
  return Array.isArray(pinned) ? pinned : [];
}

async function savePinned(kind, pinned) {
  await chrome.storage.local.set({ [pinnedKey(kind)]: pinned });
  return pinned;
}

export async function pinItem(kind, entry) {
  const previous = await getPinned(kind);
  const without = previous.filter((p) => !(p.base === entry.base && p.id === entry.id));
  return savePinned(kind, [{ ...entry, pinnedAt: Date.now() }, ...without].slice(0, PINNED_LIMIT));
}

export async function unpinItem(kind, base, id) {
  const previous = await getPinned(kind);
  return savePinned(kind, previous.filter((p) => !(p.base === base && p.id === id)));
}

/**
 * Merge freshly fetched fields into the pinned entries, keyed by base + id. Entries
 * that were unpinned while a fetch was in flight are simply not matched.
 */
export async function updatePinned(kind, updates) {
  const previous = await getPinned(kind);
  return savePinned(
    kind,
    previous.map((p) => {
      const update = updates.find((u) => u.base === p.base && u.id === p.id);
      return update ? { ...p, ...update } : p;
    }),
  );
}

/**
 * Set a pinned item's note, or remove it when `note` is ''.
 */
export async function setPinnedNote(kind, base, id, note) {
  const previous = await getPinned(kind);
  return savePinned(
    kind,
    previous.map((p) => {
      if (p.base !== base || p.id !== id) return p;
      const next = { ...p };
      if (note) next.note = note;
      else delete next.note;
      return next;
    }),
  );
}

/**
 * Move a pinned item to a new position in its list.
 * @param {number} targetIndex 0-based target position
 */
export async function reorderPinned(kind, base, id, targetIndex) {
  const previous = await getPinned(kind);
  const currentIndex = previous.findIndex((p) => p.base === base && p.id === id);
  if (currentIndex === -1) return previous;

  const reordered = [...previous];
  const [item] = reordered.splice(currentIndex, 1);
  reordered.splice(targetIndex, 0, item);
  return savePinned(kind, reordered);
}

```

- [ ] **Step 4: Create `pinned-list.js`**

Write the file (repo root):

```js
import { NOTE_MAX_LENGTH, normalizeNote } from './lib/parse.js';
import { reorderPinned, setPinnedNote, unpinItem } from './lib/storage.js';

/**
 * One pinned list: rendering, drag-to-reorder, ✎ note editing and ✕ unpin. Lists differ
 * only in what a row shows, which describeRow(entry) supplies:
 *
 *   { status, glyph, headline, headlineIsId, subline, editSubline, tooltip, trailing, url }
 *
 * `trailing` is an element for the row's right edge (a pipeline's duration) or null.
 * onRender(entries) runs after every render.
 */
export function createPinnedList({ kind, noun, section, list, describeRow, navigate, onRender }) {
  let entries = [];
  let draggedIndex = null;
  // The row being edited, kept outside the DOM so list rebuilds cannot lose it:
  // { base, id, draft, selectionStart, selectionEnd, cancelled }
  let editing = null;
  // True while render() rebuilds the list; blurs it causes are not saves.
  let rendering = false;

  function clearDragOverMarkers() {
    for (const li of list.querySelectorAll('.pin-item')) {
      li.classList.remove('drag-over-top', 'drag-over-bottom');
    }
  }

  function statusGlyph(row) {
    const status = document.createElement('span');
    status.className = 'pin-status';
    status.dataset.status = row.status;
    status.textContent = row.glyph;
    return status;
  }

  function pinMain(headline, subline) {
    const main = document.createElement('span');
    main.className = 'pin-main';
    main.append(headline, subline);
    return main;
  }

  function pinSubline(text) {
    const sub = document.createElement('span');
    sub.className = 'pin-ref';
    sub.textContent = text;
    return sub;
  }

  function buildNavButton(row) {
    const headline = document.createElement('span');
    headline.className = row.headlineIsId ? 'pin-id' : 'pin-note';
    headline.textContent = row.headline;

    const nav = document.createElement('button');
    nav.type = 'button';
    nav.className = 'pin-nav';
    nav.title = row.tooltip;
    nav.append(statusGlyph(row), pinMain(headline, pinSubline(row.subline)));
    if (row.trailing) nav.append(row.trailing);
    nav.addEventListener('click', () => navigate(row.url));
    return nav;
  }

  function buildActions(entry) {
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'pin-action pin-note-edit';
    edit.title = entry.note ? 'Edit note' : 'Add note';
    edit.setAttribute('aria-label', edit.title);
    edit.textContent = '✎';
    edit.addEventListener('click', () => startEditing(entry));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'pin-action pin-remove';
    remove.title = 'Unpin';
    remove.setAttribute('aria-label', `Unpin this ${noun}`);
    remove.textContent = '✕';
    remove.addEventListener('click', async () => {
      entries = await unpinItem(kind, entry.base, entry.id);
      render();
    });

    const actions = document.createElement('span');
    actions.className = 'pin-actions';
    actions.append(edit, remove);
    return actions;
  }

  function rememberDraft(input) {
    if (!editing) return;
    editing.draft = input.value;
    editing.selectionStart = input.selectionStart;
    editing.selectionEnd = input.selectionEnd;
  }

  function buildEditor(entry, row) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'pin-note-input';
    input.maxLength = NOTE_MAX_LENGTH;
    input.placeholder = `What's this ${noun} for?`;
    input.setAttribute('aria-label', `Note for ${noun} #${entry.id}`);
    input.value = editing.draft;

    for (const type of ['input', 'select', 'keyup', 'click']) {
      input.addEventListener(type, () => rememberDraft(input));
    }
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit();
      } else if (event.key === 'Escape') {
        // Flag first: if the browser closes the popup on Esc, the blur that
        // follows must not save.
        editing.cancelled = true;
        event.preventDefault();
        cancelEdit();
      }
    });
    input.addEventListener('blur', () => {
      if (rendering || !input.isConnected || !editing || editing.cancelled) return;
      commitEdit();
    });

    const editor = document.createElement('div');
    editor.className = 'pin-edit';
    editor.append(statusGlyph(row), pinMain(input, pinSubline(row.editSubline)));
    return editor;
  }

  function buildRow(entry, index) {
    const row = describeRow(entry);
    const isEditing = editing?.base === entry.base && editing?.id === entry.id;

    // A dedicated grab handle, rather than the whole row, so dragging never
    // fights with clicking nav or the hover actions.
    const handle = document.createElement('span');
    handle.className = 'pin-handle';
    handle.draggable = !isEditing;
    handle.title = 'Drag to reorder';
    handle.setAttribute('aria-label', 'Drag to reorder');

    const item = document.createElement('li');
    item.className = 'pin-item';
    if (isEditing) item.append(handle, buildEditor(entry, row));
    else item.append(handle, buildNavButton(row), buildActions(entry));

    handle.addEventListener('dragstart', (event) => {
      draggedIndex = index;
      item.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      // Firefox requires data to be set for the drag to actually start.
      event.dataTransfer.setData('text/plain', String(index));
    });

    handle.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      draggedIndex = null;
      clearDragOverMarkers();
    });

    item.addEventListener('dragover', (event) => {
      if (draggedIndex === null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      const isAfter = event.clientY - item.getBoundingClientRect().top > item.offsetHeight / 2;
      item.classList.toggle('drag-over-bottom', isAfter);
      item.classList.toggle('drag-over-top', !isAfter);
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    item.addEventListener('drop', async (event) => {
      event.preventDefault();
      clearDragOverMarkers();
      if (draggedIndex === null || draggedIndex === index) return;

      const isAfter = event.clientY - item.getBoundingClientRect().top > item.offsetHeight / 2;
      let targetIndex = isAfter ? index + 1 : index;
      if (draggedIndex < targetIndex) targetIndex -= 1;

      const moved = entries[draggedIndex];
      entries = await reorderPinned(kind, moved.base, moved.id, targetIndex);
      render();
    });

    return item;
  }

  function render() {
    rendering = true;
    try {
      list.replaceChildren(...entries.map(buildRow));
    } finally {
      rendering = false;
    }
    section.hidden = entries.length === 0;

    const input = list.querySelector('.pin-note-input');
    if (input) {
      input.focus();
      input.setSelectionRange(editing.selectionStart, editing.selectionEnd);
    }

    onRender?.(entries);
  }

  function startEditing(entry) {
    if (editing) commitEdit();
    const note = entry.note ?? '';
    editing = {
      base: entry.base,
      id: entry.id,
      draft: note,
      selectionStart: 0,
      selectionEnd: note.length,
      cancelled: false,
    };
    render();
  }

  // State is cleared before the write, but the list is only rebuilt after it, so a
  // click that caused this blur (e.g. ✎ on another row) still lands on its button.
  async function commitEdit() {
    if (!editing) return;
    const { base, id, draft } = editing;
    editing = null;
    entries = await setPinnedNote(kind, base, id, normalizeNote(draft));
    render();
  }

  function cancelEdit() {
    editing = null;
    render();
  }

  return {
    getEntries: () => entries,
    setEntries(next) {
      entries = next;
      render();
    },
    startEditing,
  };
}
```

- [ ] **Step 5: Rewire `popup.js`**

5a. Replace the two import statements at the top of the file — this exact text:

```js
import {
  ParseError,
  assignedTicketsUrl,
  authoredPipelinesUrl,
  authoredTicketsUrl,
  buildUrl,
  inProgressTicketsUrl,
  mineMrUrl,
  myPipelinesUrl,
  formatDuration,
  NOTE_MAX_LENGTH,
  normalizeBase,
  normalizeNote,
  originPattern,
  parsePipelineUrl,
  pipelineApiUrl,
  pipelineElapsedSeconds,
  reviewerMrUrl,
  runningPipelinesUrl,
  swapMrBranches,
} from './lib/parse.js';
import {
  getBase,
  getHistory,
  getTargetBranch,
  getUsername,
  getPinned,
  pinPipeline,
  pushHistory,
  removeHistory,
  reorderPinned,
  setPinnedNote,
  unpinPipeline,
  updatePinned,
  setBase,
  setTargetBranch,
  setUsername,
} from './lib/storage.js';
```

with:

```js
import {
  ParseError,
  assignedTicketsUrl,
  authoredPipelinesUrl,
  authoredTicketsUrl,
  buildUrl,
  inProgressTicketsUrl,
  mineMrUrl,
  myPipelinesUrl,
  formatDuration,
  normalizeBase,
  originPattern,
  parsePipelineUrl,
  pipelineApiUrl,
  pipelineElapsedSeconds,
  reviewerMrUrl,
  runningPipelinesUrl,
  swapMrBranches,
} from './lib/parse.js';
import {
  getBase,
  getHistory,
  getTargetBranch,
  getUsername,
  getPinned,
  pinItem,
  pushHistory,
  removeHistory,
  updatePinned,
  setBase,
  setTargetBranch,
  setUsername,
} from './lib/storage.js';
import { createPinnedList } from './pinned-list.js';
```

5b. Replace:

```js
let pinnablePipeline = null;
let pinnedEntries = [];
let tickTimer = null;
let draggedIndex = null;
// The row being edited, kept outside the DOM so list rebuilds cannot lose it:
// { base, id, draft, selectionStart, selectionEnd, cancelled }
let editing = null;
// True while renderPinned rebuilds the list; blurs it causes are not saves.
let rendering = false;
```

with:

```js
let pinnablePipeline = null;
let tickTimer = null;
```

5c. Replace everything from the line `const STATUS_GLYPHS = {` up to and including the closing `}` of `async function doPinPipeline() {` (the last line before `async function submitCreateMr() {`) with:

```js
const STATUS_GLYPHS = {
  success: '✓',
  failed: '✕',
  running: '●',
  pending: '○',
  created: '○',
  waiting_for_resource: '○',
  preparing: '○',
  canceled: '⊘',
  canceling: '⊘',
  skipped: '»',
  manual: '▷',
  scheduled: '◴',
};

function pipelineWebUrl(entry) {
  return entry.webUrl || `${entry.base}/-/pipelines/${entry.id}`;
}

function idAndRef(entry) {
  return [`#${entry.id}`, entry.ref].filter(Boolean).join(' · ');
}

function describePipeline(entry) {
  const statusLine = entry.status
    ? `${entry.status}${entry.ref ? ` on ${entry.ref}` : ''}`
    : pipelineWebUrl(entry);

  const duration = document.createElement('span');
  duration.className = 'pin-duration';
  duration.dataset.pipelineId = entry.id;
  duration.textContent = formatDuration(pipelineElapsedSeconds(entry.raw ?? {})) ?? '';

  return {
    status: entry.status ?? 'unknown',
    glyph: STATUS_GLYPHS[entry.status] ?? '●',
    headline: entry.note || `#${entry.id}`,
    headlineIsId: !entry.note,
    subline: entry.note ? idAndRef(entry) : entry.ref ?? '',
    editSubline: idAndRef(entry),
    tooltip: entry.note ? `${entry.note}\n${statusLine}` : statusLine,
    trailing: duration,
    url: pipelineWebUrl(entry),
  };
}

const pipelinesList = createPinnedList({
  kind: 'pipelines',
  noun: 'pipeline',
  section: pinned,
  list: pinnedList,
  describeRow: describePipeline,
  navigate,
  onRender() {
    scheduleTick();
    refreshPinButton();
  },
});

// Only running pipelines have a duration that moves, so the timer exists only for them.
function scheduleTick() {
  if (tickTimer) clearInterval(tickTimer);
  const entries = pipelinesList.getEntries();
  if (!entries.some((e) => e.raw && !e.raw.finished_at && e.status !== 'success')) return;
  tickTimer = setInterval(() => {
    for (const entry of pipelinesList.getEntries()) {
      const cell = pinnedList.querySelector(`[data-pipeline-id="${entry.id}"]`);
      if (cell) cell.textContent = formatDuration(pipelineElapsedSeconds(entry.raw ?? {})) ?? '';
    }
  }, 1000);
}

async function hasGitLabAccess() {
  if (!base) return false;
  try {
    return await chrome.permissions.contains({ origins: [originPattern(base)] });
  } catch {
    return false;
  }
}

async function fetchPipeline(entry) {
  const response = await fetch(pipelineApiUrl(entry.base, entry.id), {
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`GitLab returned ${response.status}`);
  const raw = await response.json();
  return {
    base: entry.base,
    id: entry.id,
    status: raw.status,
    ref: raw.ref,
    webUrl: raw.web_url,
    raw,
  };
}

// Cached values render immediately; the network refresh replaces them when it lands, so
// an offline or unauthenticated popup still shows the last known state.
async function refreshPinnedStatuses() {
  const entries = pipelinesList.getEntries();
  if (entries.length === 0 || !(await hasGitLabAccess())) return;

  const results = await Promise.allSettled(entries.map(fetchPipeline));
  const updates = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (updates.length === 0) return;

  pipelinesList.setEntries(await updatePinned('pipelines', updates));
}

function refreshPinButton() {
  const alreadyPinned = pinnablePipeline
    ? pipelinesList
        .getEntries()
        .some((e) => e.base === pinnablePipeline.base && e.id === pinnablePipeline.id)
    : true;
  pinPipelineSection.hidden = !pinnablePipeline || alreadyPinned;
}

async function doPinPipeline() {
  if (!pinnablePipeline) return;

  // Must be the first await in a click handler, or the user gesture is lost.
  let granted = false;
  try {
    granted = await chrome.permissions.request({
      origins: [originPattern(pinnablePipeline.base)],
    });
  } catch {
    granted = false;
  }

  let entry = { ...pinnablePipeline };
  if (granted) {
    try {
      entry = await fetchPipeline(pinnablePipeline);
    } catch {
      // Keep the pin; it just shows as unknown until a later refresh succeeds.
    }
  }

  pipelinesList.setEntries(await pinItem('pipelines', entry));
  pipelinesList.startEditing(
    pipelinesList.getEntries().find((p) => p.base === entry.base && p.id === entry.id),
  );
}
```

5d. In `checkActiveTab`, replace:

```js
  pinnablePipeline = parsePipelineUrl(tab.url);
  await refreshPinButton();
```

with:

```js
  pinnablePipeline = parsePipelineUrl(tab.url);
  refreshPinButton();
```

5e. In `init`, replace:

```js
  pinnedEntries = await getPinned();
  renderPinned();
  await checkActiveTab();
  refreshPinnedStatuses();
```

with:

```js
  pipelinesList.setEntries(await getPinned('pipelines'));
  await checkActiveTab();
  refreshPinnedStatuses();
```

- [ ] **Step 6: Static checks**

```bash
node --check popup.js && node --check pinned-list.js && node --check lib/storage.js
grep -nE "pinnedEntries|renderPinned|draggedIndex|pinPipeline\(|unpinPipeline|NOTE_MAX_LENGTH|normalizeNote|editing" popup.js
bun build popup.js --target=browser --outdir=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad/bundle-check 2>&1 | tail -2
bun test 2>&1 | tail -3
```

Expected: `node --check` silent; the `grep` prints **nothing** (no leftovers); `bun build` prints a bundle line such as `popup.js  …KB` with no `error:`; `118 pass`, `0 fail`.

- [ ] **Step 7: Verify behaviour is unchanged**

```bash
H=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad/tickets-harness
"$H/sync.sh"
for s in rest commit clear escape other "race&access=1" "pin&tab=pipeline&access=1"; do
  echo "== $s"; "$H/check.sh" "scenario=$s" | python3 -c '
import sys, json; d = json.load(sys.stdin)
print({k: d[k] for k in ("notes", "headlines", "editing", "focused", "pinHidden", "statuses")})'
done > "$H/after-refactor.txt"
diff "$H/baseline.txt" "$H/after-refactor.txt" && echo "IDENTICAL"
"$H/shot.sh" "scenario=edit" "$H/t2-edit.png"
```

Expected: `IDENTICAL`. If a line differs, re-run that single scenario once (the harness is timing-based); a difference that persists is a bug in the refactor — fix it, do not edit `baseline.txt`. `t2-edit.png` is > 20,000 bytes; open it with the Read tool: the first pinned pipeline row is a text box containing "Hotfix: login redirect loop" with `#2816150418 · dev/1.0.11` beneath.

- [ ] **Step 8: Commit**

```bash
git add pinned-list.js lib/storage.js popup.js
git commit -m "Move the pinned list into pinned-list.js and key storage by list kind"
```

---

### Task 3: Pinned tickets

**Files:**
- Modify: `popup.html`, `popup.css`, `popup.js`

**Interfaces:**
- Consumes: `parseTicketUrl`, `ticketApiUrl` (Task 1); `createPinnedList`, storage functions by `kind`, and in `popup.js` `pipelinesList`, `fetchPipeline`, `hasGitLabAccess`, `navigate`, `refreshPinButton`, `doPinPipeline`, `refreshPinnedStatuses` (Task 2).
- Produces (used by Task 4): in `popup.js` — `ticketsList`, `lists` (`{ pipelines, tickets }`), `fetchTicket(entry)`, `FETCHERS`, `refreshPinned(kind)`, `refreshAllPinned()`, `doPin()`, module variable `pinnable` (`{ kind, base, id } | null`); DOM ids `#pin-page`, `#pin-page-button`, `#pinned-tickets`, `#pinned-tickets-list`. `refreshPinnedStatuses` and `doPinPipeline` no longer exist.

- [ ] **Step 1: Confirm the failing state**

```bash
H=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad/tickets-harness
"$H/sync.sh" && "$H/check.sh" "scenario=rest&tab=ticket" | python3 -c '
import sys, json; d = json.load(sys.stdin); print(d["tickets"], d["pinHidden"], d["pinText"])'
```

Expected (no ticket support yet): `{'ids': ['2893', '2846'], 'notes': [None, 'Old hotfix'], 'headlines': [], 'sublines': [], 'tooltips': [], 'hidden': None} True 📌 Pin this pipeline`.

- [ ] **Step 2: `popup.html`**

Replace:

```html
    <section id="pin-pipeline" class="wide-action" hidden>
      <button id="pin-pipeline-button" type="button">&#128204; Pin this pipeline</button>
    </section>

    <section id="pinned" class="recent" hidden>
```

with:

```html
    <section id="pin-page" class="wide-action" hidden>
      <button id="pin-page-button" type="button">&#128204; Pin this pipeline</button>
    </section>

    <section id="pinned-tickets" class="recent" hidden>
      <h2>Pinned tickets</h2>
      <ul id="pinned-tickets-list"></ul>
    </section>

    <section id="pinned" class="recent" hidden>
```

- [ ] **Step 3: `popup.css`**

Replace:

```css
.pin-status[data-status="pending"],
.pin-status[data-status="waiting_for_resource"] { color: #c17d10; }
```

with:

```css
.pin-status[data-status="pending"],
.pin-status[data-status="waiting_for_resource"] { color: #c17d10; }
.pin-status[data-status="opened"] { color: #108548; }
.pin-status[data-status="closed"] { color: #1f75cb; }
```

Replace:

```css
/* Hover actions sit over the duration instead of reserving their own column,
   so a note keeps the full row width at rest. */
.pin-actions {
  position: absolute;
  top: 50%;
  right: 4px;
  display: flex;
  transform: translateY(-50%);
  opacity: 0;
  pointer-events: none;
}
```

with:

```css
/* Hover actions sit over the duration instead of reserving their own column,
   so a note keeps the full row width at rest. Their background matches the hovered
   row, hiding any text that runs underneath (ticket rows have no duration). */
.pin-actions {
  position: absolute;
  top: 50%;
  right: 4px;
  display: flex;
  background: var(--chip);
  border-radius: 6px;
  transform: translateY(-50%);
  opacity: 0;
  pointer-events: none;
}
```

- [ ] **Step 4: `popup.js`**

4a. Replace:

```js
  parsePipelineUrl,
  pipelineApiUrl,
```

with:

```js
  parsePipelineUrl,
  parseTicketUrl,
  pipelineApiUrl,
```

and replace:

```js
  swapMrBranches,
} from './lib/parse.js';
```

with:

```js
  swapMrBranches,
  ticketApiUrl,
} from './lib/parse.js';
```

4b. Replace:

```js
const pinPipelineSection = document.getElementById('pin-pipeline');
const pinPipelineButton = document.getElementById('pin-pipeline-button');
```

with:

```js
const pinSection = document.getElementById('pin-page');
const pinButton = document.getElementById('pin-page-button');
const pinnedTickets = document.getElementById('pinned-tickets');
const pinnedTicketsList = document.getElementById('pinned-tickets-list');
```

4c. Replace:

```js
let pinnablePipeline = null;
```

with:

```js
// What the active tab shows, if it can be pinned: { kind, base, id }.
let pinnable = null;
```

4d. Insert immediately before the line `async function hasGitLabAccess() {`:

```js
function ticketWebUrl(entry) {
  return entry.webUrl || `${entry.base}/-/work_items/${entry.id}`;
}

const TICKET_GLYPHS = { opened: '○', closed: '✓' };
const TICKET_STATES = { opened: 'open', closed: 'closed' };

function describeTicket(entry) {
  const number = `#${entry.id}`;
  const headline = entry.note || entry.title || number;
  let subline = '';
  if (entry.note) subline = entry.title ? `${number} · ${entry.title}` : number;
  else if (entry.title) subline = number;

  return {
    status: entry.state ?? 'unknown',
    glyph: TICKET_GLYPHS[entry.state] ?? '●',
    headline,
    headlineIsId: !entry.note && !entry.title,
    subline,
    editSubline: entry.title ? `${number} · ${entry.title}` : number,
    tooltip: [headline, TICKET_STATES[entry.state]].filter(Boolean).join('\n'),
    trailing: null,
    url: ticketWebUrl(entry),
  };
}

const ticketsList = createPinnedList({
  kind: 'tickets',
  noun: 'ticket',
  section: pinnedTickets,
  list: pinnedTicketsList,
  describeRow: describeTicket,
  navigate,
  onRender: refreshPinButton,
});

const lists = { pipelines: pipelinesList, tickets: ticketsList };

```

4e. Replace everything from the line `// Cached values render immediately; the network refresh replaces them when it lands, so` up to and including the closing `}` of `async function doPinPipeline() {` (the last line before `async function submitCreateMr() {`) with:

```js
async function fetchTicket(entry) {
  const response = await fetch(ticketApiUrl(entry.base, entry.id), {
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`GitLab returned ${response.status}`);
  const raw = await response.json();
  return {
    base: entry.base,
    id: entry.id,
    title: raw.title,
    state: raw.state,
    webUrl: raw.web_url,
  };
}

const FETCHERS = { pipelines: fetchPipeline, tickets: fetchTicket };

async function refreshPinned(kind) {
  const list = lists[kind];
  const entries = list.getEntries();
  if (entries.length === 0) return;

  const results = await Promise.allSettled(entries.map(FETCHERS[kind]));
  const updates = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (updates.length === 0) return;

  list.setEntries(await updatePinned(kind, updates));
}

// Cached values render immediately; the network refresh replaces them when it lands, so
// an offline or unauthenticated popup still shows the last known state.
async function refreshAllPinned() {
  if (!(await hasGitLabAccess())) return;
  refreshPinned('pipelines');
  refreshPinned('tickets');
}

function refreshPinButton() {
  const alreadyPinned =
    Boolean(pinnable) &&
    lists[pinnable.kind]
      .getEntries()
      .some((e) => e.base === pinnable.base && e.id === pinnable.id);
  pinSection.hidden = !pinnable || alreadyPinned;
  if (pinnable) {
    const noun = pinnable.kind === 'tickets' ? 'ticket' : 'pipeline';
    pinButton.textContent = `\u{1F4CC} Pin this ${noun}`;
  }
}

async function doPin() {
  if (!pinnable) return;
  const { kind, base: itemBase, id } = pinnable;

  // Must be the first await in a click handler, or the user gesture is lost.
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: [originPattern(itemBase)] });
  } catch {
    granted = false;
  }

  let entry = { base: itemBase, id };
  if (granted) {
    try {
      entry = await FETCHERS[kind](entry);
    } catch {
      // Keep the pin; it just shows as unknown until a later refresh succeeds.
    }
  }

  const list = lists[kind];
  list.setEntries(await pinItem(kind, entry));
  // A pipeline is only a number, so ask for a note; a ticket already shows its title.
  if (kind === 'pipelines') {
    list.startEditing(list.getEntries().find((p) => p.base === entry.base && p.id === entry.id));
  }
}
```

4f. In `checkActiveTab`, replace:

```js
  pinnablePipeline = parsePipelineUrl(tab.url);
  refreshPinButton();
```

with:

```js
  const pipeline = parsePipelineUrl(tab.url);
  const ticket = pipeline ? null : parseTicketUrl(tab.url);
  if (pipeline) pinnable = { kind: 'pipelines', ...pipeline };
  else if (ticket) pinnable = { kind: 'tickets', ...ticket };
  refreshPinButton();
```

4g. Replace:

```js
pinPipelineButton.addEventListener('click', doPinPipeline);
```

with:

```js
pinButton.addEventListener('click', doPin);
```

4h. In `init`, replace:

```js
  pipelinesList.setEntries(await getPinned('pipelines'));
  await checkActiveTab();
  refreshPinnedStatuses();
```

with:

```js
  ticketsList.setEntries(await getPinned('tickets'));
  pipelinesList.setEntries(await getPinned('pipelines'));
  await checkActiveTab();
  refreshAllPinned();
```

- [ ] **Step 5: Static checks**

```bash
node --check popup.js
grep -nE "pinnablePipeline|pinPipelineSection|pinPipelineButton|doPinPipeline|refreshPinnedStatuses" popup.js
bun build popup.js --target=browser --outdir=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad/bundle-check 2>&1 | tail -2
bun test 2>&1 | tail -3
```

Expected: `grep` prints nothing; `bun build` shows no `error:`; `118 pass`, `0 fail`.

- [ ] **Step 6: Verify tickets**

```bash
H=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad/tickets-harness
"$H/sync.sh"
for s in rest "rest&tab=ticket" "rest&tab=pipeline" "pin&tab=ticket&access=1" ticketNote ticketUnpin ticketReorder; do
  echo "== $s"; "$H/check.sh" "scenario=$s" | python3 -c '
import sys, json; d = json.load(sys.stdin)
print(d["tickets"]); print({k: d[k] for k in ("editing", "pinHidden", "pinText", "pipelineIds")})'
done
```

Expected, per scenario (`tickets` line, then the second line):

- `rest`: ids `['2893', '2846']`, notes `[None, 'Old hotfix']`, headlines `['Species list shows stale chunks', 'Old hotfix']`, sublines `['#2893', '#2846 · Login redirect loop']`, tooltips `['Species list shows stale chunks\nopen', 'Old hotfix\nclosed']`, hidden `False`; editing `None`, pinHidden `True`.
- `rest&tab=ticket`: pinHidden `False`, pinText `📌 Pin this ticket`.
- `rest&tab=pipeline`: pinHidden `False`, pinText `📌 Pin this pipeline`.
- `pin&tab=ticket&access=1`: ids `['2950', '2893', '2846']`, notes `[None, None, 'Old hotfix']`, headlines `['Past data empty after sync', 'Species list shows stale chunks', 'Old hotfix']`; editing `None` (no editor opened), pinHidden `True`.
- `ticketNote`: notes `['My fix is on MR !1261', 'Old hotfix']`, headlines `['My fix is on MR !1261', 'Old hotfix']`, sublines `['#2893 · Species list shows stale chunks', '#2846 · Login redirect loop']`; editing `None`.
- `ticketUnpin`: ids `['2893']`, headlines `['Species list shows stale chunks']`.
- `ticketReorder`: ids `['2846', '2893']`; pipelineIds `['2816150418', '2816150001', '2815998877']` (the cross-list drop changed nothing).

Then re-run the pipeline regression and diff it against Task 2's baseline:

```bash
for s in rest commit clear escape other "race&access=1" "pin&tab=pipeline&access=1"; do
  echo "== $s"; "$H/check.sh" "scenario=$s" | python3 -c '
import sys, json; d = json.load(sys.stdin)
print({k: d[k] for k in ("notes", "headlines", "editing", "focused", "pinHidden", "statuses")})'
done > "$H/after-tickets.txt"
diff "$H/baseline.txt" "$H/after-tickets.txt" && echo "IDENTICAL"
```

Expected: `IDENTICAL` (re-run a differing scenario once before treating it as a bug).

- [ ] **Step 7: Verify visually**

```bash
"$H/shot.sh" "scenario=rest" "$H/t3-rest.png"
"$H/shot.sh" "scenario=hover" "$H/t3-hover.png"
"$H/shot.sh" "scenario=ticketEdit" "$H/t3-ticket-edit.png"
```

Each file must be > 20,000 bytes. Open each with the Read tool and confirm:
- `t3-rest.png`: a "PINNED TICKETS" section directly above "PINNED PIPELINES"; rows "Species list shows stale chunks" / `#2893` with a green ○, and "Old hotfix" / `#2846 · Login redirect loop` with a blue ✓; no right-hand duration on ticket rows.
- `t3-hover.png`: ✎ and ✕ on the right of the first ticket row and the first pipeline row, on a background that hides any title text beneath them.
- `t3-ticket-edit.png`: the first ticket row is an empty text box showing "What's this ticket for?", with `#2893 · Species list shows stale chunks` beneath.

- [ ] **Step 8: Commit**

```bash
git add popup.html popup.css popup.js
git commit -m "Add pinned tickets with GitLab titles, notes and a shared pin button"
```

---

### Task 4: Note on the pipeline page

**Files:**
- Create: `content/pipeline-note.js`
- Modify: `manifest.json`, `popup.js`
- Create (scratch, not committed): `$H/page-stub.js`, `$H/page-scenario.js`, `$H/page-fixtures.sh`, `$H/page-check.sh`, `$H/page-shot.sh`

**Interfaces:**
- Consumes (from Task 3, in `popup.js`): `hasGitLabAccess()`, `refreshAllPinned()`, `doPin()` with its local `granted` and `itemBase`, module variable `base`.
- Produces: `ensurePipelineNoteScript(forBase: string): Promise<void>` and `PAGE_NOTE_SCRIPT` in `popup.js`; `content/pipeline-note.js`.

- [ ] **Step 1: Create the page harness and confirm it fails**

```bash
H=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad/tickets-harness
```

Write `$H/page-stub.js`:

```js
// chrome.storage stand-in for the page-note script, with onChanged support.
const BASE = `${location.origin}/ternandsparrow/paratoo-fdcp`;
const listeners = [];
const store = {
  pinnedPipelines: [
    {
      base: BASE,
      id: '2866034605',
      note: 'Species list old issue v2',
      webUrl: `${BASE}/-/pipelines/2866034605`,
    },
    { base: BASE, id: '2866011111' },
  ],
};

window.chrome = {
  storage: {
    local: {
      async get(key) {
        return { [key]: structuredClone(store[key]) };
      },
      async set(values) {
        const changes = {};
        for (const [key, value] of Object.entries(values)) {
          changes[key] = { oldValue: store[key], newValue: structuredClone(value) };
          store[key] = structuredClone(value);
        }
        for (const listener of listeners) listener(changes, 'local');
      },
    },
    onChanged: { addListener: (listener) => listeners.push(listener) },
  },
};

window.__store = store;
```

Write `$H/page-scenario.js`:

```js
const params = new URLSearchParams(location.search);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const notes = () => [...document.querySelectorAll('[data-gitlab-navigate-note]')];
const pipelineId = () => document.querySelector('[data-testid="pipeline-id"]');

const scenarios = {
  // Vue replacing the whole heading, as GitLab does when it re-renders the header.
  async rerender() {
    const header = document.querySelector('[data-testid="pipeline-header"]');
    const idText = pipelineId().textContent;
    header.innerHTML = '';
    await wait(100);
    header.innerHTML = `<h1 class="heading"><span data-testid="pipeline-id">${idText}</span></h1>`;
  },
  async update() {
    const [first, ...rest] = window.__store.pinnedPipelines;
    await chrome.storage.local.set({
      pinnedPipelines: [{ ...first, note: 'Renamed note' }, ...rest],
    });
  },
  async unpin() {
    await chrome.storage.local.set({ pinnedPipelines: window.__store.pinnedPipelines.slice(1) });
  },
};

await wait(300);
await scenarios[params.get('scenario')]?.();
await wait(500);
document.title = JSON.stringify({
  count: notes().length,
  text: notes()[0]?.textContent ?? null,
  besideId: notes()[0] ? notes()[0].parentElement === pipelineId()?.parentElement : null,
});
```

Write `$H/page-fixtures.sh`:

```bash
#!/usr/bin/env bash
# Builds GitLab-like pipeline pages under the harness root for the page-note script.
set -euo pipefail
H="$(cd "$(dirname "$0")" && pwd)"
P="$H/ternandsparrow/paratoo-fdcp/-/pipelines"
page() { # page <path under -/pipelines> <pipeline id>
  mkdir -p "$P/$1"
  cat > "$P/$1/index.html" <<EOF
<!doctype html>
<html>
<head>
<meta charset="utf-8"><title>fixture</title>
<style>body { font-family: sans-serif; padding: 16px; } h1 { font-size: 28px; font-weight: 700; margin: 0; }</style>
</head>
<body>
<div data-testid="pipeline-header"><h1 class="heading"><span data-testid="pipeline-id">#$2</span></h1></div>
<p>Running · Created 14 minutes ago</p>
<script src="/page-stub.js"></script>
<script src="/content/pipeline-note.js"></script>
<script type="module" src="/page-scenario.js"></script>
</body>
</html>
EOF
}
page 2866034605 2866034605
page 2866034605/builds 2866034605
page 2866011111 2866011111
page 2866000000 2866000000
```

Write `$H/page-check.sh`:

```bash
#!/usr/bin/env bash
# usage: page-check.sh <path under -/pipelines/> "<query>"  -> prints the page state JSON
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
"$CHROME" --headless --disable-gpu --virtual-time-budget=3000 --dump-dom \
  "http://localhost:8765/ternandsparrow/paratoo-fdcp/-/pipelines/$1/?$2" 2>/dev/null | python3 -c '
import sys, re, html, json
title = re.search(r"<title>(.*?)</title>", sys.stdin.read(), re.S).group(1)
print(json.dumps(json.loads(html.unescape(title)), ensure_ascii=False))'
```

Write `$H/page-shot.sh`:

```bash
#!/usr/bin/env bash
# usage: page-shot.sh <path under -/pipelines/> <out.png>
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
"$CHROME" --headless --disable-gpu --hide-scrollbars --virtual-time-budget=3000 \
  --window-size=760,160 --screenshot="$2" \
  "http://localhost:8765/ternandsparrow/paratoo-fdcp/-/pipelines/$1/?scenario=rest" >/dev/null 2>&1
ls -l "$2" | awk '{print "wrote", $NF, $5, "bytes"}'
```

Then:

```bash
chmod +x "$H"/*.sh && "$H/page-fixtures.sh" && "$H/sync.sh" && "$H/page-check.sh" 2866034605 "scenario=rest"
```

Expected: `{"count": 0, "text": null, "besideId": null}` — the script does not exist yet (the page's `/content/pipeline-note.js` request returns 404).

- [ ] **Step 2: Write `content/pipeline-note.js`**

```js
// Shows a pinned pipeline's note next to the pipeline number on its GitLab page.
// Registered by the popup for the user's GitLab site. A classic script: content
// scripts cannot use static ES module imports.
(() => {
  const MARK = 'data-gitlab-navigate-note';
  const PIPELINE_ID = '[data-testid="pipeline-header"] [data-testid="pipeline-id"]';
  let note = '';

  function normalize(url) {
    try {
      const parsed = new URL(url, location.href);
      return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
    } catch {
      return '';
    }
  }

  // The pipeline's own page or one of its tabs, e.g. `…/-/pipelines/<id>/builds`.
  function isThisPipeline(entry) {
    const target = normalize(entry.webUrl || `${entry.base}/-/pipelines/${entry.id}`);
    const here = normalize(location.href);
    return Boolean(target) && (here === target || here.startsWith(`${target}/`));
  }

  function apply() {
    const existing = document.querySelector(`[${MARK}]`);
    const pipelineId = document.querySelector(PIPELINE_ID);
    if (!note || !pipelineId) {
      existing?.remove();
      return;
    }

    const text = `\u{1F4CC} ${note}`;
    if (existing?.parentElement === pipelineId.parentElement) {
      if (existing.textContent !== text) existing.textContent = text;
      return;
    }

    existing?.remove();
    const span = document.createElement('span');
    span.setAttribute(MARK, '');
    span.textContent = text;
    span.style.cssText =
      'margin-left: 0.5rem; font-weight: 400; color: var(--gl-text-color-subtle, #626168);';
    pipelineId.parentElement.append(span);
  }

  async function loadNote() {
    const { pinnedPipelines } = await chrome.storage.local.get('pinnedPipelines');
    const match = (Array.isArray(pinnedPipelines) ? pinnedPipelines : []).find(
      (entry) => entry.note && isThisPipeline(entry),
    );
    note = match?.note ?? '';
    apply();
  }

  // GitLab renders the header with Vue after load and re-renders it while the pipeline
  // runs; put the note back whenever it goes missing.
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      apply();
    });
  }).observe(document.body, { childList: true, subtree: true });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.pinnedPipelines) loadNote();
  });

  loadNote();
})();
```

- [ ] **Step 3: Verify the page script**

```bash
node --check content/pipeline-note.js
"$H/sync.sh"
for c in "2866034605 scenario=rest" "2866034605/builds scenario=rest" "2866011111 scenario=rest" "2866000000 scenario=rest" "2866034605 scenario=rerender" "2866034605 scenario=update" "2866034605 scenario=unpin"; do
  set -- $c; echo "== $1 $2"; "$H/page-check.sh" "$1" "$2"
done
"$H/page-shot.sh" 2866034605 "$H/t4-page.png"
```

Expected:
- `2866034605 scenario=rest`: `{"count": 1, "text": "📌 Species list old issue v2", "besideId": true}`
- `2866034605/builds scenario=rest`: `{"count": 1, "text": "📌 Species list old issue v2", "besideId": true}`
- `2866011111 scenario=rest` (pinned without a note): `{"count": 0, "text": null, "besideId": null}`
- `2866000000 scenario=rest` (not pinned): `{"count": 0, "text": null, "besideId": null}`
- `2866034605 scenario=rerender`: `{"count": 1, "text": "📌 Species list old issue v2", "besideId": true}`
- `2866034605 scenario=update`: `{"count": 1, "text": "📌 Renamed note", "besideId": true}`
- `2866034605 scenario=unpin`: `{"count": 0, "text": null, "besideId": null}`

`t4-page.png` > 20,000 bytes; open it with the Read tool: the bold heading `#2866034605` followed on the same line by a grey, normal-weight `📌 Species list old issue v2` at the same size.

- [ ] **Step 4: Add the `scripting` permission**

```bash
python3 - <<'PY'
import json, collections
m = json.load(open('manifest.json'), object_pairs_hook=collections.OrderedDict)
if 'scripting' not in m['permissions']:
    m['permissions'].append('scripting')
json.dump(m, open('manifest.json', 'w'), indent=2)
open('manifest.json', 'a').write('\n')
PY
python3 -c "import json; print(json.load(open('manifest.json'))['permissions'])"
```

Expected: `['storage', 'activeTab', 'scripting']`.

- [ ] **Step 5: Register the script from the popup**

5a. In `popup.js`, insert immediately before the line `async function fetchPipeline(entry) {`:

```js
const PAGE_NOTE_SCRIPT = {
  id: 'pipeline-note',
  js: ['content/pipeline-note.js'],
  runAt: 'document_idle',
  persistAcrossSessions: true,
};

// Keeps the pipeline-page note script registered for the GitLab site in `forBase`. Runs
// on every popup open because browsers clear registered scripts when the extension
// updates, and the repo URL may have moved to another GitLab site.
async function ensurePipelineNoteScript(forBase) {
  try {
    const script = {
      ...PAGE_NOTE_SCRIPT,
      matches: [`${new URL(forBase).origin}/*/-/pipelines/*`],
    };
    const [existing] = await chrome.scripting.getRegisteredContentScripts({ ids: [script.id] });
    if (!existing) await chrome.scripting.registerContentScripts([script]);
    else if (existing.matches?.[0] !== script.matches[0]) {
      await chrome.scripting.updateContentScripts([script]);
    }
  } catch {
    // Only the page note is lost; the popup itself is unaffected.
  }
}

```

5b. In `refreshAllPinned`, replace:

```js
  if (!(await hasGitLabAccess())) return;
  refreshPinned('pipelines');
```

with:

```js
  if (!(await hasGitLabAccess())) return;
  ensurePipelineNoteScript(base);
  refreshPinned('pipelines');
```

5c. In `doPin`, replace:

```js
  let entry = { base: itemBase, id };
```

with:

```js
  if (granted) ensurePipelineNoteScript(itemBase);

  let entry = { base: itemBase, id };
```

- [ ] **Step 6: Verify registration and nothing else regressed**

```bash
node --check popup.js
bun build popup.js --target=browser --outdir=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad/bundle-check 2>&1 | tail -2
bun test 2>&1 | tail -3
"$H/sync.sh"
for s in rest "rest&access=1" "pin&tab=ticket&access=1"; do
  echo "== $s"; "$H/check.sh" "scenario=$s" | python3 -c '
import sys, json; print(json.load(sys.stdin)["registered"])'
done
for s in rest commit clear escape other "race&access=1" "pin&tab=pipeline&access=1"; do
  echo "== $s"; "$H/check.sh" "scenario=$s" | python3 -c '
import sys, json; d = json.load(sys.stdin)
print({k: d[k] for k in ("notes", "headlines", "editing", "focused", "pinHidden", "statuses")})'
done > "$H/after-page-note.txt"
diff "$H/baseline.txt" "$H/after-page-note.txt" && echo "IDENTICAL"
npx --yes web-ext@latest lint --source-dir . --self-hosted 2>&1 | grep -Ev "npm warn" | tail -6
```

Expected:
- `bun build` no `error:`; `118 pass`, `0 fail`.
- `rest`: `[]` (no access, nothing registered).
- `rest&access=1` and `pin&tab=ticket&access=1`: exactly one entry — `[{'id': 'pipeline-note', 'js': ['content/pipeline-note.js'], 'runAt': 'document_idle', 'persistAcrossSessions': True, 'matches': ['https://gitlab.com/*/-/pipelines/*']}]`.
- `IDENTICAL`.
- lint: `errors 0`, `notices 0`, `warnings 0`.

- [ ] **Step 7: Commit**

```bash
git add content/pipeline-note.js manifest.json popup.js
git commit -m "Show pinned pipeline notes on GitLab pipeline pages"
```

---

### Task 5: Screenshots, docs, version 0.19.0

**Files:**
- Modify: `tools/screenshot.sh`, `manifest.json`, `CHANGELOG.md`, `README.md`, `docs/superpowers/specs/2026-08-04-gitlab-navigate-design.md`
- Regenerate: `docs/popup-light.png`, `docs/popup-dark.png`

**Interfaces:**
- Consumes: the ticket row markup from Task 3 (same `li.pin-item` structure as pipeline rows, no `.pin-duration`, headline always `.pin-note` when a title or note exists) and the section ids `#pinned-tickets` / `#pinned-tickets-list`.
- Produces: nothing consumed later.

- [ ] **Step 1: Screenshot generator**

In `tools/screenshot.sh`, replace:

```python
    # Mirrors buildNavButton()/buildActions() in popup.js.
```

with:

```python
    # Mirrors describePipeline() in popup.js and buildNavButton()/buildActions() in pinned-list.js.
```

Then replace:

```python
html = (html
        .replace('<section id="pinned" class="recent" hidden>', '<section id="pinned" class="recent">')
        .replace('<ul id="pinned-list"></ul>', f'<ul id="pinned-list">{pin_items}</ul>'))
```

with:

```python
html = (html
        .replace('<section id="pinned" class="recent" hidden>', '<section id="pinned" class="recent">')
        .replace('<ul id="pinned-list"></ul>', f'<ul id="pinned-list">{pin_items}</ul>'))

tickets = [
    ('opened', '&#x25CB;', '2893', 'Species list shows stale chunks', None),
    ('opened', '&#x25CB;', '2950', 'Past data empty after sync', 'My fix is on MR !1261'),
    ('closed', '&#x2713;', '2846', 'Login redirect loop', None),
]


def ticket_item(state, glyph, tid, title, note):
    # Mirrors describeTicket() in popup.js and buildNavButton()/buildActions() in pinned-list.js.
    headline = note or title
    subline = f'#{tid} &#xB7; {title}' if note else f'#{tid}'
    return (
        f'<li class="pin-item">'
        f'<span class="pin-handle" aria-label="Drag to reorder"></span>'
        f'<button type="button" class="pin-nav">'
        f'<span class="pin-status" data-status="{state}">{glyph}</span>'
        f'<span class="pin-main"><span class="pin-note">{headline}</span><span class="pin-ref">{subline}</span></span>'
        f'</button>'
        f'<span class="pin-actions">'
        f'<button type="button" class="pin-action pin-note-edit" aria-label="Edit note">&#x270E;</button>'
        f'<button type="button" class="pin-action pin-remove" aria-label="Unpin this ticket">&#x2715;</button>'
        f'</span>'
        f'</li>')


ticket_items = '\n'.join(ticket_item(*t) for t in tickets)
html = (html
        .replace('<section id="pinned-tickets" class="recent" hidden>', '<section id="pinned-tickets" class="recent">')
        .replace('<ul id="pinned-tickets-list"></ul>', f'<ul id="pinned-tickets-list">{ticket_items}</ul>'))
```

Then replace `--window-size=330,1100` with `--window-size=330,1400`.

- [ ] **Step 2: Regenerate and inspect**

Run: `./tools/screenshot.sh && ls -l docs/popup-*.png`
Expected: `popup-light.png: 330x… bg=(255, 255, 255)` and `popup-dark.png: 330x… bg=(30, 30, 38)`; both files > 20,000 bytes. Open both with the Read tool and confirm: "PINNED TICKETS" (three rows: "Species list shows stale chunks" / `#2893` green ○; "My fix is on MR !1261" / `#2950 · Past data empty after sync` green ○; "Login redirect loop" / `#2846` blue ✓) sits directly above "PINNED PIPELINES", and the Recent list at the bottom is fully visible (not cut off).

- [ ] **Step 3: Version**

```bash
python3 - <<'PY'
import json, collections
m = json.load(open('manifest.json'), object_pairs_hook=collections.OrderedDict)
m['version'] = '0.19.0'
json.dump(m, open('manifest.json', 'w'), indent=2)
open('manifest.json', 'a').write('\n')
PY
grep '"version"' manifest.json
```

Expected: `"version": "0.19.0",`

- [ ] **Step 4: CHANGELOG**

In `CHANGELOG.md`, replace:

```markdown
# Changelog

## 0.18.0
```

with:

```markdown
# Changelog

## 0.19.0

- **Pinned tickets.** On a ticket page (`…/-/work_items/2893` or `…/-/issues/2893`) the
  popup offers **Pin this ticket**. Pinned tickets get their own section above Pinned
  pipelines and show the GitLab title and open (○) / closed (✓) state, refreshed each
  time the popup opens. Notes, drag-to-reorder and unpin work as they do for pipelines;
  a note replaces the title as the headline. Up to 10 tickets.
- **Notes on the pipeline page.** A pinned pipeline's note now also appears on its GitLab
  page, after the big pipeline number (`#2866034605  📌 Species list old issue v2`), and
  updates as soon as you edit it. A small script does this, only on your GitLab site's
  `…/-/pipelines/…` pages. It adds the `scripting` permission, which shows no install
  warning. After updating, open the popup once for notes to appear on pipeline pages.
- The pinned-list code moved out of `popup.js` into `pinned-list.js`, shared by both
  lists.

## 0.18.0
```

- [ ] **Step 5: README**

5a. Replace:

```
a Create branch box, a two-column Go to grid, and a Recent list."
```

with:

```
the Create MR boxes, a two-column Go to grid, pinned tickets and pipelines, and a Recent list."
```

5b. Replace:

```markdown
## Pinned pipelines
```

with:

```markdown
## Pinned tickets

Keep the tickets you're working on one click away. Open a ticket (`…/-/work_items/2893`
or `…/-/issues/2893`) and the popup shows **Pin this ticket**. Each pinned ticket shows
its GitLab title and whether it's open (○) or closed (✓), refreshed each time the popup
opens. Add a note with ✎ and it replaces the title as the headline, with the number and
title on the line below. Drag to reorder and ✕ to unpin — the same controls as pinned
pipelines. Up to 10 tickets.

The title comes through the same GitLab access pinned pipelines use (see [How it reads
pipeline status](#how-it-reads-pipeline-status)). GitLab's work-item Status field ("In
progress") is only available through its GraphQL API, so it isn't shown.

## Pinned pipelines
```

5c. Replace:

```markdown
saving an empty note removes it. Notes are stored with the pin on this machine and go
away when you unpin.
```

with:

```markdown
saving an empty note removes it. Notes are stored with the pin on this machine and go
away when you unpin.

**On the pipeline page.** A pinned pipeline's note also appears in GitLab itself, after
the big pipeline number (`#2866034605  📌 Species list old issue v2`), so you can tell
pipelines apart without opening the popup. It updates as soon as you edit the note and
disappears when you unpin. A small script does this; it runs only on your GitLab site's
`…/-/pipelines/…` pages and is switched on by the popup once you've granted GitLab
access. After updating the extension, open the popup once for notes to reappear on
pipeline pages.
```

5d. Replace:

```markdown
This is the one feature that talks to the GitLab API
(`/api/v4/projects/:path/pipelines/:id`). It authenticates with the `_gitlab_session`
cookie your browser already has, so there is **no token to create, and none is stored**.
```

with:

```markdown
Pinned pipelines and pinned tickets are the only features that talk to the GitLab API
(`/api/v4/projects/:path/pipelines/:id` and `/api/v4/projects/:path/issues/:id`). They
authenticate with the `_gitlab_session` cookie your browser already has, so there is
**no token to create, and none is stored**.
```

5e. Replace:

```markdown
pipeline and clicking still opens it; the status and branch just stay blank until you
grant access.
```

with:

```markdown
pipeline and clicking still opens it; the status and branch just stay blank until you
grant access.

The same access lets the popup switch on the pipeline-page note script, which adds the
`scripting` permission (Chrome shows no warning for it). If you remove the access in
your browser settings, the browser stops running that script too.
```

- [ ] **Step 6: Main design doc**

In `docs/superpowers/specs/2026-08-04-gitlab-navigate-design.md`:

6a. Replace:

```
  popup.js          UI wiring: events, rendering, storage calls
  lib/parse.js      pure functions: reference -> URL
```

with:

```
  popup.js          UI wiring: events, rendering, storage calls
  pinned-list.js    one pinned list: rows, drag-to-reorder, note editing
  content/pipeline-note.js  note beside the number on GitLab pipeline pages
  lib/parse.js      pure functions: reference -> URL
```

6b. Replace:

```
`lib/parse.js` has no Chrome dependencies and is the only unit-tested module.
`popup.js` holds all DOM and Chrome API interaction. `lib/storage.js` isolates the
storage keys so nothing else needs to know them.
```

with:

```
`lib/parse.js` has no Chrome dependencies and is the only unit-tested module.
`popup.js`, `pinned-list.js` and `content/pipeline-note.js` hold all DOM and Chrome API
interaction. `lib/storage.js` isolates the storage keys so nothing else needs to know
them — except the page-note script, which cannot import modules and reads
`pinnedPipelines` directly.
```

6c. Replace:

```
normalizeNote(raw) -> string                     // canonical note; '' = no note
```

with:

```
normalizeNote(raw) -> string                     // canonical note; '' = no note
parseTicketUrl(url) -> {base, id} | null         // is this a pinnable ticket page?
ticketApiUrl(base, id) -> string                 // REST endpoint for one ticket
```

6d. Replace `  "version": "0.18.0",` with `  "version": "0.19.0",` and `  "permissions": ["storage", "activeTab"],` with `  "permissions": ["storage", "activeTab", "scripting"],`.

6e. Replace:

```
status refresh — restore the draft and caret. Full design:
`2026-09-16-pinned-pipeline-notes-design.md`.
```

with:

```
status refresh — restore the draft and caret. Full design:
`2026-09-16-pinned-pipeline-notes-design.md`.

**Pinned tickets and page notes.** Tickets are a second pinned list (`pinnedTickets`)
built by the same `createPinnedList` in `pinned-list.js`; each list supplies only
`describeRow(entry)`. Ticket rows show the REST issue title and open/closed state, and
pinning a ticket does not open the note editor. `content/pipeline-note.js`, registered by
the popup with `chrome.scripting.registerContentScripts` for the configured GitLab
origin's `…/-/pipelines/…` pages, appends a pinned pipeline's note to the page heading
and keeps it current via `MutationObserver` and `storage.onChanged`. Full design:
`2026-09-21-pinned-tickets-and-page-notes-design.md`.
```

- [ ] **Step 7: Final verification**

```bash
bun test 2>&1 | tail -3
python3 -m json.tool manifest.json >/dev/null && echo manifest valid
npx --yes web-ext@latest lint --source-dir . --self-hosted 2>&1 | grep -Ev "npm warn" | tail -6
git status --short
```

Expected: `118 pass` / `0 fail`; `manifest valid`; lint `errors 0`, `notices 0`, `warnings 0`; status lists only `CHANGELOG.md`, `README.md`, `docs/popup-dark.png`, `docs/popup-light.png`, `docs/superpowers/specs/2026-08-04-gitlab-navigate-design.md`, `manifest.json`, `tools/screenshot.sh`.

- [ ] **Step 8: Commit (do not push)**

```bash
git add CHANGELOG.md README.md docs/popup-dark.png docs/popup-light.png \
  docs/superpowers/specs/2026-08-04-gitlab-navigate-design.md manifest.json tools/screenshot.sh
git commit -m "Release pinned tickets and pipeline page notes (0.19.0)"
git log --oneline -6
```

Then report to the user, including the manual checks for a real browser (from the spec's Testing section): the note on a real GitLab pipeline page; the note appearing after an update once the popup has been opened; the first ticket pin's permission prompt.
