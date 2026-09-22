# Table Notes, Runner Tags and Pinned MRs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show pinned pipeline notes in GitLab's pipelines table, show each pipeline's runner tag as a badge (table and pipeline page), and pin MRs in the popup.

**Architecture:** The popup's single registered content script (id `pipeline-note`) becomes three classic scripts run in one isolated world: `content/shared.js` (pure helpers + a coalesced `MutationObserver`), `content/pipeline-notes.js` (heading and table notes) and `content/runner-tags.js` (badges from the jobs API, cached in `chrome.storage.local`). Its matches widen to `${origin}/*/-/pipelines*`. Pinned MRs are a third `createPinnedList` instance in `popup.js`, keyed `mrs` in storage.

**Tech Stack:** Manifest V3 browser extension (Chrome + Firefox), vanilla ES modules, no build step, `bun test`, headless Chrome for behaviour checks, `npx web-ext lint`.

Spec: `docs/superpowers/specs/2026-09-22-table-notes-runner-tags-pinned-mrs-design.md`

## Global Constraints

- Repo root: `/Users/nuwan/projects/pet-projects/gitlab-navigate`. Run every repo command from there.
- Vanilla JS, no build step, no new dependencies, **no new manifest permissions**.
- Content scripts are classic scripts: no `import`/`export`. They share state only through `globalThis.gitlabNavigate`, defined by `content/shared.js`.
- **Every DOM write in a content script must be conditional.** A pass that finds everything already correct must not touch the DOM. The observer re-runs after every mutation (queued microtask), so an unconditional write, even setting `textContent` to the same value, loops forever and freezes the GitLab tab.
- Content-script registration: `id: 'pipeline-note'` (unchanged), `matches: [`${origin}/*/-/pipelines*`]`, `js: ['content/shared.js', 'content/pipeline-notes.js', 'content/runner-tags.js']`, `runAt: 'document_idle'`, `persistAcrossSessions: true`. Re-register when `matches` **or** `js` differ.
- Note span: text `📌 ` + note via `textContent`; marker attribute `data-gitlab-navigate-note="<pipeline url>"`; inline style `margin-left: 0.5rem; font-weight: 400; color: var(--gl-text-color-subtle, #626168);`. Table: appended inside `[data-testid="pipeline-url-table-cell"] [data-testid="pipeline-url-link"]`. Heading: appended to the parent of `[data-testid="pipeline-header"] [data-testid="pipeline-id"]`.
- Runner badge: `<span data-gitlab-navigate-runner="<pipeline url>" title="Runner tag" class="gl-badge badge badge-pill badge-neutral" style="margin-left: 0.25rem"><span class="gl-badge-content">TAG</span></span>`. Table: appended to the last element child of `[data-testid="pipeline-url-table-cell"]`. Header: inserted before the closest `div` around `[data-testid="pipeline-header"] [data-testid="total-jobs"]`.
- Runner rule: tags every job with a non-empty `tag_list` carries, minus ignored tags (case-insensitive). Jobs API: `GET ${location.origin}/api/v4/projects/${encodeURIComponent(projectPath)}/pipelines/${id}/jobs?per_page=100`, `credentials: 'include'`, max 4 in flight, each pipeline at most once per page load, failures not cached.
- Storage keys: `pinnedMrs` (local, cap 10), `runnerTags` (local, `{ [pipeline url]: string[] }`, newest 500, pre-ignore tags, written only when the jobs list is non-empty), `ignoredJobTags` (sync, `string[]`). `pinnedPipelines` and `pinnedTickets` are unchanged.
- MR entry shape: `{ base, id, title, state, sourceBranch, targetBranch, pipelineStatus, webUrl, note?, pinnedAt }`, `id` = iid as a string.
- MR status token → glyph, colour: `opened` and `locked` → `opened`, `○` (U+25CB), `#108548`; `merged` → `merged`, `✓` (U+2713), `#1f75cb`; `closed` → `mr-closed`, `✕` (U+2715), `#dd2b0e`; unknown → `unknown`, `●` (U+25CF), muted.
- MR small line: branches text = `source → target` (U+2192 with spaces), with a source over 24 characters cut to its first 23 + `…` (U+2026). `!<iid> · <branches>` when branches are known and the headline is not `!<iid>`; `<branches>` when the headline is `!<iid>`; `!<iid>` when branches are unknown and the headline is not `!<iid>`; empty otherwise. Separator ` · ` is U+00B7 with spaces.
- Copy: pin button `📌 Pin this MR`; section heading `Pinned MRs`; note placeholder `What's this MR for?`; note aria-label `Note for MR !<iid>`; unpin aria-label `Unpin this MR`; settings label `Ignore job tags`, placeholder `cypress`; badge title `Runner tag`.
- Pinning an MR does NOT open the note editor.
- Unit tests (bun) cover `lib/parse.js` and `content/shared.js` only. Do not add a storage test harness.
- Commit locally after each task. **Never push.** Commit messages carry **no** `Co-Authored-By` or other AI attribution lines (standing user rule).
- Every screenshot must be opened with the Read tool and its byte size checked: popup screenshots > 20,000 bytes, fixture-page screenshots > 5,000 bytes (blank renders are ~700 bytes). Describe only what is actually visible.
- Release version: `0.20.0`.

## File Map

| File | Change |
|------|--------|
| `lib/parse.js` | + `parseMrUrl`, `mrApiUrl`, `parseTagList` |
| `test/parse.test.js` | + 16 tests |
| `content/shared.js` (new) | `normalize`, `pipelineUrlFromHref`, `sharedJobTags`, `pinnedUrl`, `watch` |
| `test/content-shared.test.js` (new) | 16 tests |
| `content/pipeline-notes.js` (new) | heading + table notes; replaces `content/pipeline-note.js` (deleted) |
| `content/runner-tags.js` (new) | runner badges, fetching, cache |
| `lib/storage.js` | + `getIgnoredJobTags` / `setIgnoredJobTags`; + list kind `mrs` |
| `pinned-list.js` | + optional `idPrefix` |
| `popup.js` | registration; Ignore job tags setting; pinned MRs |
| `popup.html`, `popup.css` | settings field; Pinned MRs section; MR colours; `.pin-mr-pipeline` |
| `tools/screenshot.sh`, `docs/popup-*.png` | MR sample rows; regenerated |
| `manifest.json`, `CHANGELOG.md`, `README.md`, `docs/superpowers/specs/2026-08-04-gitlab-navigate-design.md` | 0.20.0 |

## Test harness (scratch, never committed)

```
S=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad
H=$S/mrs-harness
```

Task 3 creates it, served over HTTP on **port 8766**. ES modules do not load from `file://`, and 8765 belongs to an older harness.
- **Popup:** the real `popup.js` runs with a stubbed `chrome.*`. `check.sh "<query>"` prints a JSON snapshot. `regress.sh` prints the pipeline and ticket state of twelve scenarios for diffing against `baseline.txt`, and `popup-checks.py` asserts this plan's new popup behaviour.
- **Pages:** GitLab-like fixtures run the real content scripts with stubbed `chrome.storage` and `fetch`. `page-check.sh "<path>" "<query>"` prints the page state, and `notes-checks.py` / `runner-checks.py` assert it.
- **Timing:** the checks are timing-based. If one case fails, re-run that case once; a failure that persists is a real bug.

---

### Task 1: MR URL helpers and the tag-list parser in `lib/parse.js`

**Files:**
- Modify: `lib/parse.js` (after `ticketApiUrl`, and after `parseTicketUrl`)
- Test: `test/parse.test.js`

**Interfaces:**
- Produces:
  - `export function parseMrUrl(urlString: string): { base: string, id: string } | null`
  - `export function mrApiUrl(base: string, id: string): string` (throws `ParseError` for an empty base)
  - `export function parseTagList(text: string | undefined): string[]`

- [ ] **Step 1: Write the failing tests**

In `test/parse.test.js`, in the import list, replace:

```js
  mineMrUrl,
  myPipelinesUrl,
```

with:

```js
  mineMrUrl,
  mrApiUrl,
  myPipelinesUrl,
```

and replace:

```js
  originPattern,
  parsePipelineUrl,
  parseTicketUrl,
```

with:

```js
  originPattern,
  parseMrUrl,
  parsePipelineUrl,
  parseTagList,
  parseTicketUrl,
```

Append to the end of the file:

```js
describe('parseMrUrl', () => {
  test('recognises an MR page', () => {
    expect(parseMrUrl(`${BASE}/-/merge_requests/1303`)).toEqual({ base: BASE, id: '1303' });
  });

  test('recognises the diffs tab', () => {
    expect(parseMrUrl(`${BASE}/-/merge_requests/1303/diffs`)).toEqual({ base: BASE, id: '1303' });
  });

  test('recognises the commits tab', () => {
    expect(parseMrUrl(`${BASE}/-/merge_requests/1303/commits`)).toEqual({
      base: BASE,
      id: '1303',
    });
  });

  test('recognises the pipelines tab', () => {
    expect(parseMrUrl(`${BASE}/-/merge_requests/1303/pipelines`)).toEqual({
      base: BASE,
      id: '1303',
    });
  });

  test('ignores a trailing slash, query and hash', () => {
    expect(parseMrUrl(`${BASE}/-/merge_requests/1303/?tab=overview#note_42`)).toEqual({
      base: BASE,
      id: '1303',
    });
  });

  test('handles a self-hosted instance with a nested group', () => {
    expect(parseMrUrl('https://git.example.org/a/b/c/-/merge_requests/7')).toEqual({
      base: 'https://git.example.org/a/b/c',
      id: '7',
    });
  });

  test('returns null for the new MR page', () => {
    expect(
      parseMrUrl(`${BASE}/-/merge_requests/new?merge_request%5Bsource_branch%5D=x`),
    ).toBeNull();
  });

  test('returns null for the MR list', () => {
    expect(parseMrUrl(`${BASE}/-/merge_requests`)).toBeNull();
  });

  test('returns null for a non-http URL', () => {
    expect(parseMrUrl('chrome://extensions')).toBeNull();
  });
});

describe('mrApiUrl', () => {
  test('URL-encodes the project path', () => {
    expect(mrApiUrl(BASE, '1303')).toBe(
      'https://gitlab.com/api/v4/projects/ternandsparrow%2Fparatoo-fdcp/merge_requests/1303',
    );
  });

  test('rejects a missing base URL', () => {
    expect(() => mrApiUrl('', '1303')).toThrow(ParseError);
  });
});

describe('parseTagList', () => {
  test('splits on commas', () => {
    expect(parseTagList('cypress,docker')).toEqual(['cypress', 'docker']);
  });

  test('splits on whitespace', () => {
    expect(parseTagList('cypress docker\tgpu')).toEqual(['cypress', 'docker', 'gpu']);
  });

  test('drops empty entries', () => {
    expect(parseTagList(' , cypress,, ')).toEqual(['cypress']);
  });

  test('drops case-insensitive duplicates, keeping the first spelling', () => {
    expect(parseTagList('Cypress cypress CYPRESS docker')).toEqual(['Cypress', 'docker']);
  });

  test('returns an empty list for empty input', () => {
    expect(parseTagList('')).toEqual([]);
    expect(parseTagList(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test`
Expected: FAIL. The new tests error because `parseMrUrl`, `mrApiUrl` and `parseTagList` are not exported (`SyntaxError` / `undefined is not a function`).

- [ ] **Step 3: Implement**

In `lib/parse.js`, replace:

```js
export function parseTicketUrl(urlString) {
  return parseProjectItemUrl(urlString, /^(.*)\/-\/(?:work_items|issues)\/(\d+)\/?$/);
}
```

with:

```js
export function parseTicketUrl(urlString) {
  return parseProjectItemUrl(urlString, /^(.*)\/-\/(?:work_items|issues)\/(\d+)\/?$/);
}

/**
 * Recognise a merge request page or one of its tabs: `.../-/merge_requests/1303`,
 * `.../1303/diffs`, `/commits` or `/pipelines`. Null for the list, `new` and anything
 * else.
 */
export function parseMrUrl(urlString) {
  return parseProjectItemUrl(
    urlString,
    /^(.*)\/-\/merge_requests\/(\d+)(?:\/(?:diffs|commits|pipelines))?\/?$/,
  );
}
```

Replace:

```js
export function ticketApiUrl(base, id) {
  return `${projectApiUrl(base)}/issues/${id}`;
}
```

with:

```js
export function ticketApiUrl(base, id) {
  return `${projectApiUrl(base)}/issues/${id}`;
}

/**
 * The REST endpoint for one merge request, by its iid.
 */
export function mrApiUrl(base, id) {
  return `${projectApiUrl(base)}/merge_requests/${id}`;
}

/**
 * Split a settings box of tags ("cypress, docker  gpu") into a clean list: commas
 * and/or whitespace separate tags, empties go, and case-insensitive duplicates keep
 * their first spelling.
 */
export function parseTagList(text) {
  const seen = new Set();
  const tags = [];
  for (const tag of String(text ?? '').split(/[\s,]+/)) {
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: `134 pass`, `0 fail`.

- [ ] **Step 5: Commit**

```bash
git add lib/parse.js test/parse.test.js
git commit -m "Add MR URL helpers and a tag-list parser"
```

---

### Task 2: `content/shared.js`, the page scripts' helpers

**Files:**
- Create: `content/shared.js`
- Test: `test/content-shared.test.js`

**Interfaces:**
- Produces, on `globalThis.gitlabNavigate`:
  - `normalize(url: string): string`: `origin + pathname`, trailing slashes removed; `''` if unparsable.
  - `pipelineUrlFromHref(href: string, baseUrl?: string): { url: string, projectPath: string, id: string } | null`.
  - `sharedJobTags(jobs: Array<{ tag_list?: string[] }>): string[]`.
  - `pinnedUrl(entry: { base: string, id: string, webUrl?: string }): string`.
  - `watch(callback: () => void): void`: a coalesced `MutationObserver` on `document.body`.

- [ ] **Step 1: Write the failing tests**

Create `test/content-shared.test.js`:

```js
import { describe, expect, test } from 'bun:test';
import '../content/shared.js';

const { normalize, pipelineUrlFromHref, sharedJobTags, pinnedUrl } = globalThis.gitlabNavigate;
const BASE = 'https://gitlab.com/ternandsparrow/paratoo-fdcp';
const tagged = (tags, count) => Array.from({ length: count }, () => ({ tag_list: tags }));

describe('normalize', () => {
  test('keeps origin and path, dropping trailing slashes, query and hash', () => {
    expect(normalize(`${BASE}/-/pipelines/12/?page=2#top`)).toBe(`${BASE}/-/pipelines/12`);
  });

  test('returns an empty string for something that is not a URL', () => {
    expect(normalize('not a url')).toBe('');
  });
});

describe('pipelineUrlFromHref', () => {
  const expected = {
    url: `${BASE}/-/pipelines/2866034605`,
    projectPath: 'ternandsparrow/paratoo-fdcp',
    id: '2866034605',
  };

  test('reads an absolute pipeline URL', () => {
    expect(pipelineUrlFromHref(`${BASE}/-/pipelines/2866034605`)).toEqual(expected);
  });

  test('resolves a relative href against the base URL', () => {
    expect(
      pipelineUrlFromHref('/ternandsparrow/paratoo-fdcp/-/pipelines/2866034605', `${BASE}/-/pipelines`),
    ).toEqual(expected);
  });

  test('reads a pipeline tab as its pipeline', () => {
    expect(pipelineUrlFromHref(`${BASE}/-/pipelines/2866034605/builds`)).toEqual(expected);
  });

  test('ignores a trailing slash', () => {
    expect(pipelineUrlFromHref(`${BASE}/-/pipelines/2866034605/`)).toEqual(expected);
  });

  test('returns null for the pipelines list', () => {
    expect(pipelineUrlFromHref(`${BASE}/-/pipelines?scope=finished`)).toBeNull();
  });

  test('returns null for the new pipeline page', () => {
    expect(pipelineUrlFromHref(`${BASE}/-/pipelines/new`)).toBeNull();
  });

  test('returns null for the pipeline charts page', () => {
    expect(pipelineUrlFromHref(`${BASE}/-/pipelines/charts`)).toBeNull();
  });

  test('returns null for a non-http URL', () => {
    expect(pipelineUrlFromHref('javascript:void(0)')).toBeNull();
  });
});

describe('sharedJobTags', () => {
  test('finds the runner tag in a real paratoo-fdcp pipeline shape', () => {
    const jobs = [
      ...tagged(['cypress', 'perentie-runner'], 28),
      ...tagged(['perentie-runner'], 2),
      ...tagged([], 11),
    ];
    expect(sharedJobTags(jobs)).toEqual(['perentie-runner']);
  });

  test('keeps every tag when all tagged jobs carry the same set', () => {
    expect(sharedJobTags(tagged(['cypress', 'perentie-runner'], 3))).toEqual([
      'cypress',
      'perentie-runner',
    ]);
  });

  test('skips jobs without a tag_list', () => {
    expect(sharedJobTags([{ name: 'lint' }, ...tagged(['huy-runner'], 1)])).toEqual(['huy-runner']);
  });

  test('returns nothing when no job has tags, or there are no jobs', () => {
    expect(sharedJobTags(tagged([], 3))).toEqual([]);
    expect(sharedJobTags([])).toEqual([]);
    expect(sharedJobTags(undefined)).toEqual([]);
  });
});

describe('pinnedUrl', () => {
  test("prefers the entry's webUrl, normalized", () => {
    expect(pinnedUrl({ base: BASE, id: '12', webUrl: `${BASE}/-/pipelines/12/` })).toBe(
      `${BASE}/-/pipelines/12`,
    );
  });

  test('falls back to base and id', () => {
    expect(pinnedUrl({ base: BASE, id: '12' })).toBe(`${BASE}/-/pipelines/12`);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test test/content-shared.test.js`
Expected: FAIL, with the import error "Cannot find module '../content/shared.js'".

- [ ] **Step 3: Implement**

Create `content/shared.js`:

```js
// Helpers shared by the GitLab page scripts, which run after this one in the same
// isolated world. A classic script (content scripts cannot use static ES module
// imports). It touches no chrome.* or document at load time, so bun can import it for
// tests.
(() => {
  function normalize(url) {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
    } catch {
      return '';
    }
  }

  const PIPELINE_PATH = /^\/(.+)\/-\/pipelines\/(\d+)(?:\/.*)?$/;

  // A single pipeline's URL, from its page, one of its tabs or a link to it.
  function pipelineUrlFromHref(href, baseUrl) {
    let parsed;
    try {
      parsed = new URL(href, baseUrl);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

    const match = parsed.pathname.match(PIPELINE_PATH);
    if (!match) return null;
    return {
      url: `${parsed.origin}/${match[1]}/-/pipelines/${match[2]}`,
      projectPath: match[1],
      id: match[2],
    };
  }

  // The tags carried by every job that has any. Untagged jobs run on shared runners and
  // say nothing about the runner the pipeline targets.
  function sharedJobTags(jobs) {
    const tagLists = (Array.isArray(jobs) ? jobs : [])
      .map((job) => (Array.isArray(job?.tag_list) ? job.tag_list : []))
      .filter((tags) => tags.length > 0);
    if (tagLists.length === 0) return [];

    return tagLists[0].filter(
      (tag, index, first) =>
        first.indexOf(tag) === index && tagLists.every((tags) => tags.includes(tag)),
    );
  }

  function pinnedUrl(entry) {
    return normalize(entry.webUrl || `${entry.base}/-/pipelines/${entry.id}`);
  }

  // Calls back once per batch of DOM changes. GitLab re-renders with Vue after load and
  // while pipelines run, and its table can reuse a row element for another pipeline, so
  // href and text changes count as well as added and removed nodes. A microtask rather
  // than an animation frame, which pauses in background tabs and never fires headless.
  function watch(callback) {
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      Promise.resolve().then(() => {
        scheduled = false;
        callback();
      });
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['href'],
    });
  }

  globalThis.gitlabNavigate = { normalize, pipelineUrlFromHref, sharedJobTags, pinnedUrl, watch };
})();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: `150 pass`, `0 fail` (134 from Task 1 plus 16 new).

- [ ] **Step 5: Commit**

```bash
git add content/shared.js test/content-shared.test.js
git commit -m "Add shared helpers for the GitLab page scripts"
```

---

### Task 3: Notes in the pipelines table (and the heading) via `content/pipeline-notes.js`

**Files:**
- Create: `content/pipeline-notes.js`
- Delete: `content/pipeline-note.js`
- Modify: `popup.js` (the `PAGE_NOTE_SCRIPT` constant and `ensurePipelineNoteScript`)
- Create (scratch, not committed): `$H/stub-chrome.js`, `$H/scenario.js` (copied), `$H/sync.sh`, `$H/check.sh`, `$H/shot.sh`, `$H/regress.sh`, `$H/baseline.txt`, `$H/popup-checks.py`, `$H/page-stub.js`, `$H/page-scenario.js`, `$H/page-fixtures.sh`, `$H/page-check.sh`, `$H/page-shot.sh`, `$H/notes-checks.py`

**Interfaces:**
- Consumes: `globalThis.gitlabNavigate.{ pipelineUrlFromHref, pinnedUrl, watch }` (Task 2).
- Produces: `PIPELINE_PAGE_SCRIPT` in `popup.js` with `js: ['content/shared.js', 'content/pipeline-notes.js']`. Task 4 appends `'content/runner-tags.js'`. `ensurePipelineNoteScript(forBase)` keeps its name and call sites. The harness files above are reused by Tasks 4–6.

- [ ] **Step 1: Create the popup harness and record the baseline (before any source change)**

```bash
S=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad
H=$S/mrs-harness
test -f "$S/tickets-harness/stub-chrome.js" && test -f "$S/tickets-harness/scenario.js" || { echo "tickets-harness missing: report BLOCKED"; exit 1; }
mkdir -p "$H" && cp "$S/tickets-harness/stub-chrome.js" "$S/tickets-harness/scenario.js" "$H/"
```

Edit `$H/stub-chrome.js`. The default tab becomes a page that is never pinnable, since MR pages become pinnable in Task 6. Replace:

```js
const tabUrl = TABS[params.get('tab')] ?? `${BASE}/-/merge_requests/1`;

const registered = [];
```

with:

```js
const tabUrl = TABS[params.get('tab')] ?? `${BASE}/-/tree/main`;

// `oldScript=1` starts from the 0.19 registration, to check the upgrade path.
const registered =
  params.get('oldScript') === '1'
    ? [
        {
          id: 'pipeline-note',
          js: ['content/pipeline-note.js'],
          matches: ['https://gitlab.com/*/-/pipelines/*'],
          runAt: 'document_idle',
          persistAcrossSessions: true,
        },
      ]
    : [];
```

Write `$H/sync.sh`:

```bash
#!/usr/bin/env bash
# Copies the current extension source into the harness and makes sure it is served.
set -euo pipefail
H="$(cd "$(dirname "$0")" && pwd)"
REPO=/Users/nuwan/projects/pet-projects/gitlab-navigate
rsync -a --delete "$REPO/lib/" "$H/lib/"
rsync -a --delete "$REPO/content/" "$H/content/"
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
curl -s -o /dev/null http://localhost:8766/harness.html || \
  (cd "$H" && nohup python3 -m http.server 8766 >/dev/null 2>&1 &)
sleep 1
```

Write `$H/check.sh`:

```bash
#!/usr/bin/env bash
# usage: check.sh "<query string>"  -> prints the scenario's state JSON
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
"$CHROME" --headless --disable-gpu --virtual-time-budget=3000 --dump-dom \
  "http://localhost:8766/harness.html?$1" 2>/dev/null | python3 -c '
import sys, re, html, json
title = re.search(r"<title>(.*?)</title>", sys.stdin.read(), re.S).group(1)
print(json.dumps(json.loads(html.unescape(title)), ensure_ascii=False, indent=1))'
```

Write `$H/shot.sh`:

```bash
#!/usr/bin/env bash
# usage: shot.sh "<query string>" <out.png>
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
"$CHROME" --headless --disable-gpu --hide-scrollbars --virtual-time-budget=3000 \
  --window-size=330,1400 --screenshot="$2" \
  "http://localhost:8766/harness.html?$1" >/dev/null 2>&1
ls -l "$2" | awk '{print "wrote", $NF, $5, "bytes"}'
```

Write `$H/regress.sh`:

```bash
#!/usr/bin/env bash
# Prints the pipeline and ticket state of each regression scenario, one line each.
H="$(cd "$(dirname "$0")" && pwd)"
for s in rest commit clear escape other "race&access=1" "pin&tab=pipeline&access=1" \
         "rest&tab=ticket" "pin&tab=ticket&access=1" ticketNote ticketUnpin ticketReorder; do
  echo "== $s"
  "$H/check.sh" "scenario=$s" | python3 -c '
import json, sys
d = json.load(sys.stdin)
keep = ["notes", "statuses", "pipelineIds", "headlines", "sublines", "tooltips", "tickets",
        "editing", "focused", "pinHidden", "pinText"]
print(json.dumps({k: d.get(k) for k in keep}, ensure_ascii=False, sort_keys=True))'
done
```

Run:

```bash
chmod +x "$H"/*.sh && "$H/sync.sh" && "$H/regress.sh" > "$H/baseline.txt"; grep -c '^{' "$H/baseline.txt"; grep -c '"pinHidden"' "$H/baseline.txt"
```

Expected: `12` and `12`. Twelve JSON lines were recorded against the unchanged popup, and none is empty. If a line is missing, re-run the command once.

- [ ] **Step 2: Create the page harness and confirm the table checks fail**

Write `$H/page-stub.js`:

```js
// chrome.storage and fetch stand-ins for the GitLab page scripts, with onChanged support.
const params = new URLSearchParams(location.search);
const BASE = `${location.origin}/ternandsparrow/paratoo-fdcp`;
const listeners = [];
const tagged = (tags, count) => Array.from({ length: count }, () => ({ tag_list: tags }));

// Jobs per pipeline, shaped like paratoo-fdcp's real ones. Ids not listed have no jobs yet.
const JOBS = {
  2866034605: [
    ...tagged(['cypress', 'perentie-runner'], 3),
    ...tagged(['perentie-runner'], 1),
    ...tagged([], 2),
  ],
  2866011111: [...tagged(['cypress', 'huy-runner'], 2), ...tagged(['huy-runner'], 1)],
  2866022222: tagged([], 3),
  2866000000: tagged(['cypress', 'perentie-runner'], 2),
};

function seededCache() {
  if (params.get('cached') === '1') {
    return { [`${BASE}/-/pipelines/2866034605`]: ['cached-runner'] };
  }
  if (params.get('cached') === 'full') {
    return Object.fromEntries(
      Array.from({ length: 500 }, (_, i) => [`${BASE}/-/pipelines/${i + 1}`, []]),
    );
  }
  return undefined;
}

const stores = {
  local: {
    pinnedPipelines: [
      {
        base: BASE,
        id: '2866034605',
        note: 'Species list old issue v2',
        webUrl: `${BASE}/-/pipelines/2866034605`,
      },
      { base: BASE, id: '2866011111' },
      { base: BASE, id: '2866022222', note: 'Nightly check' },
    ],
    runnerTags: seededCache(),
  },
  sync: params.get('ignore') ? { ignoredJobTags: params.get('ignore').split(',') } : {},
};

const area = (name) => ({
  async get(key) {
    return { [key]: structuredClone(stores[name][key]) };
  },
  async set(values) {
    const changes = {};
    for (const [key, value] of Object.entries(values)) {
      changes[key] = { oldValue: stores[name][key], newValue: structuredClone(value) };
      stores[name][key] = structuredClone(value);
    }
    for (const listener of listeners) listener(changes, name);
  },
});

window.chrome = {
  storage: {
    local: area('local'),
    sync: area('sync'),
    onChanged: { addListener: (listener) => listeners.push(listener) },
  },
};

const calls = [];
const credentials = [];
let inFlight = 0;
let maxInFlight = 0;
window.fetch = async (url, options) => {
  calls.push(String(url));
  credentials.push(options?.credentials ?? null);
  inFlight += 1;
  maxInFlight = Math.max(maxInFlight, inFlight);
  await new Promise((resolve) => setTimeout(resolve, 100));
  inFlight -= 1;
  const id = String(url).match(/pipelines\/(\d+)\/jobs/)?.[1];
  if (params.get('fail') === id) return { ok: false, status: 500, json: async () => ({}) };
  return { ok: true, json: async () => structuredClone(JOBS[id] ?? []) };
};

window.__stores = stores;
window.__fetch = {
  calls,
  credentials,
  get maxInFlight() {
    return maxInFlight;
  },
};
```

Write `$H/page-scenario.js`:

```js
const params = new URLSearchParams(location.search);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const NOTE = '[data-gitlab-navigate-note]';
const RUNNER = '[data-gitlab-navigate-runner]';
const texts = (root, selector) =>
  root ? [...root.querySelectorAll(selector)].map((el) => el.textContent) : [];
const ids = (urls) => urls.map((url) => url.match(/pipelines\/(\d+)/)?.[1]).sort();

const scenarios = {
  // Vue rebuilding the header or the table body from scratch.
  async rerender() {
    const header = document.querySelector('[data-testid="pipeline-header"]');
    const body = document.querySelector('tbody');
    if (header) header.innerHTML = '';
    if (body) body.innerHTML = '';
    await wait(100);
    if (header) header.innerHTML = document.getElementById('header-template').innerHTML;
    if (body) body.innerHTML = document.getElementById('rows-template').innerHTML;
  },
  // Vue reusing the first row's elements for another pipeline.
  async reuse() {
    const link = document.querySelector('[data-testid="pipeline-url-link"]');
    link.setAttribute('href', '/ternandsparrow/paratoo-fdcp/-/pipelines/2866011111');
    link.firstChild.textContent = '#2866011111 ';
  },
  async update() {
    const [first, ...rest] = window.__stores.local.pinnedPipelines;
    await chrome.storage.local.set({ pinnedPipelines: [{ ...first, note: 'Renamed note' }, ...rest] });
  },
  async unpin() {
    await chrome.storage.local.set({
      pinnedPipelines: window.__stores.local.pinnedPipelines.slice(1),
    });
  },
  async ignoreLive() {
    await chrome.storage.sync.set({ ignoredJobTags: ['Perentie-Runner'] });
  },
};

await wait(400);
await scenarios[params.get('scenario')]?.();
await wait(800);

const heading = document.querySelector('[data-testid="pipeline-id"]');
const header = document.querySelector('[data-testid="pipeline-header"]');
const jobsWrapper = document.querySelector('[data-testid="total-jobs"]')?.closest('div');
const headerRunners = header ? [...header.querySelectorAll(RUNNER)] : [];
const cacheKeys = Object.keys(window.__stores.local.runnerTags ?? {});
document.title = JSON.stringify({
  heading: heading ? texts(heading.parentElement, `:scope > ${NOTE}`) : null,
  rows: [...document.querySelectorAll('[data-testid="pipeline-url-table-cell"]')].map((cell) => {
    const link = cell.querySelector('[data-testid="pipeline-url-link"]');
    const labels = cell.lastElementChild;
    return {
      id: link.getAttribute('href').split('/').pop(),
      notes: texts(link, NOTE),
      runners: texts(labels, `:scope > ${RUNNER}`),
      strayRunners:
        cell.querySelectorAll(RUNNER).length - labels.querySelectorAll(`:scope > ${RUNNER}`).length,
    };
  }),
  headerRunners: headerRunners.map((badge) => badge.textContent),
  headerRunnersBeforeJobs: headerRunners.length
    ? headerRunners.at(-1).nextElementSibling === jobsWrapper
    : null,
  badgeClass: document.querySelector(RUNNER)?.className ?? null,
  badgeTitle: document.querySelector(RUNNER)?.title ?? null,
  totalNotes: document.querySelectorAll(NOTE).length,
  fetched: ids(window.__fetch.calls),
  fetchUrl: window.__fetch.calls[0] ?? null,
  credentials: [...new Set(window.__fetch.credentials)],
  maxInFlight: window.__fetch.maxInFlight,
  cachedNew: ids(cacheKeys.filter((key) => /\/2866\d+$/.test(key))),
  cacheSize: cacheKeys.length,
  cacheFirst: cacheKeys[0]?.split('/').pop() ?? null,
});
```

Write `$H/page-fixtures.sh`:

```bash
#!/usr/bin/env bash
# Builds GitLab-like pages under the harness root for the page scripts: the pipelines
# list and single pipeline pages, using GitLab's own test ids.
set -euo pipefail
H="$(cd "$(dirname "$0")" && pwd)"
P="$H/ternandsparrow/paratoo-fdcp/-/pipelines"
PROJECT=/ternandsparrow/paratoo-fdcp
rm -rf "$H/ternandsparrow"

head_html() {
  cat <<'EOF'
<!doctype html>
<html>
<head>
<meta charset="utf-8"><title>fixture</title>
<style>
  body { font-family: sans-serif; padding: 16px; color: #3a383f; }
  h1 { font-size: 28px; font-weight: 700; margin: 0 0 8px; }
  td { padding: 8px 12px; border-bottom: 1px solid #ddd; vertical-align: top; width: 320px; max-width: 320px; }
  a { color: #1f75cb; text-decoration: none; }
  .gl-block { display: block; }
  .gl-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gl-inline-block { display: inline-block; }
  button { border: 0; background: none; padding: 0; margin-right: 4px; }
  .gl-badge { display: inline-flex; align-items: center; padding: 0 8px; border-radius: 999px; font-size: 12px; line-height: 20px; }
  .badge-success { background: #c3e6cd; color: #24663b; }
  .badge-info { background: #cbe2f9; color: #0b5cad; }
  .badge-neutral { background: #ececef; color: #3a383f; }
</style>
</head>
<body>
EOF
}

tail_html() {
  cat <<'EOF'
<script src="/page-stub.js"></script>
<script src="/content/shared.js"></script>
<script src="/content/pipeline-notes.js"></script>
<script src="/content/runner-tags.js"></script>
<script type="module" src="/page-scenario.js"></script>
</body>
</html>
EOF
}

header() { # header <pipeline id>
  cat <<EOF
<h1 class="heading"><span data-testid="pipeline-id">#$1</span></h1>
<div>
  <div class="gl-mb-3 gl-inline-block"><button type="button" data-testid="badges-latest"><span class="gl-badge badge badge-pill badge-success"><span class="gl-badge-content">latest</span></span></button></div>
  <div class="gl-inline-block"><button type="button"><span data-testid="total-jobs">41 jobs</span></button></div>
</div>
EOF
}

row() { # row <pipeline id>
  cat <<EOF
<tr><td>
  <div data-testid="pipeline-url-table-cell">
    <a data-testid="pipeline-url-link" class="gl-block gl-truncate" href="$PROJECT/-/pipelines/$1">#$1 </a>
    <div class="gl-mb-2">Merge branch 'dev/1.0.12' into feature</div>
    <div class="gl-mt-1"><button type="button" data-testid="pipeline-url-latest"><span class="gl-badge badge badge-pill badge-success"><span class="gl-badge-content">latest</span></span></button><button type="button" data-testid="pipeline-url-branch"><span class="gl-badge badge badge-pill badge-info"><span class="gl-badge-content">branch</span></span></button></div>
  </div>
</td></tr>
EOF
}

page() { # page <path under -/pipelines> <pipeline id>
  mkdir -p "$P/$1"
  { head_html
    echo "<div data-testid=\"pipeline-header\">$(header "$2")</div>"
    echo "<template id=\"header-template\">$(header "$2")</template>"
    echo '<p>Running · Created 14 minutes ago</p>'
    tail_html
  } > "$P/$1/index.html"
}

ROWS=""
for id in 2866034605 2866011111 2866022222 2866000000 2866000001 2866000002; do
  ROWS="$ROWS$(row "$id")"
done
mkdir -p "$P"
{ head_html
  echo "<table><tbody>$ROWS</tbody></table>"
  echo "<template id=\"rows-template\">$ROWS</template>"
  tail_html
} > "$P/index.html"

page 2866034605 2866034605
page 2866034605/builds 2866034605
page 2866011111 2866011111
page 2866022222 2866022222
page 2866000000 2866000000
```

Write `$H/page-check.sh`:

```bash
#!/usr/bin/env bash
# usage: page-check.sh <path under -/pipelines/, or "" for the list> "<query>"  -> page state JSON
# The 20 s alarm turns a page that never settles (an observer feedback loop) into a failure.
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
URL="http://localhost:8766/ternandsparrow/paratoo-fdcp/-/pipelines/${1:+$1/}?$2"
perl -e 'alarm 20; exec @ARGV' "$CHROME" --headless --disable-gpu --virtual-time-budget=4000 \
  --dump-dom "$URL" 2>/dev/null | python3 -c '
import sys, re, html, json
m = re.search(r"<title>(.*?)</title>", sys.stdin.read(), re.S)
if not m or m.group(1) == "fixture":
    print("NO RESULT (the page never finished: possible observer loop)"); sys.exit(1)
print(json.dumps(json.loads(html.unescape(m.group(1))), ensure_ascii=False, sort_keys=True))'
```

Write `$H/page-shot.sh`:

```bash
#!/usr/bin/env bash
# usage: page-shot.sh <path under -/pipelines/, or ""> "<query>" <out.png>
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
"$CHROME" --headless --disable-gpu --hide-scrollbars --virtual-time-budget=4000 \
  --window-size=760,560 --screenshot="$3" \
  "http://localhost:8766/ternandsparrow/paratoo-fdcp/-/pipelines/${1:+$1/}?$2" >/dev/null 2>&1
ls -l "$3" | awk '{print "wrote", $NF, $5, "bytes"}'
```

Write `$H/notes-checks.py`:

```python
#!/usr/bin/env python3
"""Page-note checks against the fixture pages. Prints OK/FAIL per case."""
import json, pathlib, subprocess, sys

H = pathlib.Path(__file__).resolve().parent
PIN = '\U0001F4CC '
SPECIES = PIN + 'Species list old issue v2'
NIGHTLY = PIN + 'Nightly check'


def page(path, query):
    out = subprocess.run([str(H / 'page-check.sh'), path, query],
                         capture_output=True, text=True).stdout
    try:
        return json.loads(out)
    except ValueError:
        return {'error': out.strip()}


def notes(d):
    return [r['notes'] for r in d['rows']]


CASES = [
    # The pipelines list.
    ('', 'scenario=rest', lambda d: notes(d) == [[SPECIES], [], [NIGHTLY], [], [], []]
        and d['totalNotes'] == 2 and d['heading'] is None),
    ('', 'scenario=rerender', lambda d: notes(d) == [[SPECIES], [], [NIGHTLY], [], [], []]
        and d['totalNotes'] == 2),
    ('', 'scenario=reuse', lambda d: d['rows'][0]['id'] == '2866011111'
        and notes(d) == [[], [], [NIGHTLY], [], [], []] and d['totalNotes'] == 1),
    ('', 'scenario=update', lambda d: notes(d)[0] == [PIN + 'Renamed note']
        and notes(d)[2] == [NIGHTLY]),
    ('', 'scenario=unpin', lambda d: notes(d) == [[], [], [NIGHTLY], [], [], []]),
    # Pipeline pages: the 0.19 heading behaviour, unchanged.
    ('2866034605', 'scenario=rest', lambda d: d['heading'] == [SPECIES] and d['totalNotes'] == 1),
    ('2866034605/builds', 'scenario=rest', lambda d: d['heading'] == [SPECIES]),
    ('2866011111', 'scenario=rest', lambda d: d['heading'] == [] and d['totalNotes'] == 0),
    ('2866022222', 'scenario=rest', lambda d: d['heading'] == [NIGHTLY]),
    ('2866000000', 'scenario=rest', lambda d: d['heading'] == [] and d['totalNotes'] == 0),
    ('2866034605', 'scenario=rerender', lambda d: d['heading'] == [SPECIES] and d['totalNotes'] == 1),
    ('2866034605', 'scenario=update', lambda d: d['heading'] == [PIN + 'Renamed note']),
    ('2866034605', 'scenario=unpin', lambda d: d['heading'] == [] and d['totalNotes'] == 0),
]

failed = 0
for path, query, ok in CASES:
    d = page(path, query)
    try:
        good = bool(ok(d))
    except Exception:
        good = False
    print('OK  ' if good else 'FAIL', f'{path or "(list)"}?{query}',
          '' if good else json.dumps(d, ensure_ascii=False))
    failed += not good
sys.exit(1 if failed else 0)
```

Run:

```bash
chmod +x "$H"/*.sh "$H"/*.py && "$H/page-fixtures.sh" && "$H/sync.sh" && "$H/notes-checks.py"
```

Expected: every `(list)` case FAILs, because `content/pipeline-notes.js` does not exist yet. The `rest` case shows `notes` all empty. Every pipeline-page case that expects a note also FAILs.

- [ ] **Step 3: Write `content/pipeline-notes.js` and delete the old script**

Create `content/pipeline-notes.js`:

```js
// Shows pinned pipelines' notes on GitLab: after the number in a pipeline page's
// heading, and after each pinned pipeline's number in the pipelines table.
// Relies on content/shared.js, which runs first.
(() => {
  const { pipelineUrlFromHref, pinnedUrl, watch } = globalThis.gitlabNavigate;
  const MARK = 'data-gitlab-navigate-note';
  const HEADING_ID = '[data-testid="pipeline-header"] [data-testid="pipeline-id"]';
  const TABLE_LINKS =
    '[data-testid="pipeline-url-table-cell"] [data-testid="pipeline-url-link"]';
  const STYLE =
    'margin-left: 0.5rem; font-weight: 400; color: var(--gl-text-color-subtle, #626168);';

  let notes = new Map(); // pipeline url -> note

  // Keeps one marked note span at the end of `container`, or none when `note` is ''.
  // Writes only when something is wrong: every write wakes the observer, and an
  // unconditional write would loop forever.
  function place(container, url, note) {
    const existing = [...container.children].find((child) => child.hasAttribute(MARK));
    if (!note) {
      existing?.remove();
      return;
    }

    const text = `\u{1F4CC} ${note}`;
    if (existing) {
      if (existing.getAttribute(MARK) !== url) existing.setAttribute(MARK, url);
      if (existing.textContent !== text) existing.textContent = text;
      return;
    }

    const span = document.createElement('span');
    span.setAttribute(MARK, url);
    span.textContent = text;
    span.style.cssText = STYLE;
    container.append(span);
  }

  function apply() {
    const headingId = document.querySelector(HEADING_ID);
    const page = pipelineUrlFromHref(location.href);
    if (headingId?.parentElement && page) {
      place(headingId.parentElement, page.url, notes.get(page.url) ?? '');
    }

    // Inside the link, so a long note truncates with GitLab's ellipsis and a click on it
    // opens the pipeline like the number does.
    for (const link of document.querySelectorAll(TABLE_LINKS)) {
      const pipeline = pipelineUrlFromHref(link.href);
      place(link, pipeline?.url ?? '', pipeline ? notes.get(pipeline.url) ?? '' : '');
    }
  }

  async function loadNotes() {
    let pinnedPipelines;
    try {
      ({ pinnedPipelines } = await chrome.storage.local.get('pinnedPipelines'));
    } catch {
      // The extension was reloaded or updated; this copy of the script is orphaned.
      return;
    }

    notes = new Map();
    for (const entry of Array.isArray(pinnedPipelines) ? pinnedPipelines : []) {
      const url = pinnedUrl(entry);
      if (entry.note && url && !notes.has(url)) notes.set(url, entry.note);
    }
    apply();
  }

  watch(apply);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.pinnedPipelines) loadNotes();
  });
  loadNotes();
})();
```

Then:

```bash
git rm -q content/pipeline-note.js
```

- [ ] **Step 4: Register the new scripts from the popup**

In `popup.js`, replace:

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

with:

```js
// Keeps its 0.19 id so existing installs update in place instead of gaining a second
// registration.
const PIPELINE_PAGE_SCRIPT = {
  id: 'pipeline-note',
  js: ['content/shared.js', 'content/pipeline-notes.js'],
  runAt: 'document_idle',
  persistAcrossSessions: true,
};

const sameList = (a, b) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

// Keeps the pipeline page scripts registered for the GitLab site in `forBase`. Runs on
// every popup open because browsers clear registered scripts when the extension
// updates, the repo URL may have moved to another GitLab site, and an update may have
// changed the script files.
async function ensurePipelineNoteScript(forBase) {
  try {
    const script = {
      ...PIPELINE_PAGE_SCRIPT,
      matches: [`${new URL(forBase).origin}/*/-/pipelines*`],
    };
    const [existing] = await chrome.scripting.getRegisteredContentScripts({ ids: [script.id] });
    if (!existing) await chrome.scripting.registerContentScripts([script]);
    else if (!sameList(existing.matches, script.matches) || !sameList(existing.js, script.js)) {
      await chrome.scripting.updateContentScripts([script]);
    }
  } catch {
    // Only the page notes and badges are lost; the popup itself is unaffected.
  }
}
```

- [ ] **Step 5: Run the page checks**

Run: `"$H/sync.sh" && "$H/notes-checks.py"`
Expected: 13 lines, all `OK`. If a line says `NO RESULT`, the page never settled. That means a DOM write in `place()` is running unconditionally: fix it and re-run.

- [ ] **Step 6: Run the popup regression and registration checks**

Write `$H/popup-checks.py`:

```python
#!/usr/bin/env python3
"""Popup checks for this plan's new behaviour. Prints OK/FAIL per case."""
import json, pathlib, subprocess, sys

H = pathlib.Path(__file__).resolve().parent
SCRIPT_JS = ['content/shared.js', 'content/pipeline-notes.js']
MATCHES = ['https://gitlab.com/*/-/pipelines*']


def popup(query):
    out = subprocess.run([str(H / 'check.sh'), query], capture_output=True, text=True).stdout
    try:
        return json.loads(out)
    except ValueError:
        return {'error': out.strip()}


def registered_ok(d):
    r = d['registered']
    return (len(r) == 1 and r[0]['id'] == 'pipeline-note' and r[0]['js'] == SCRIPT_JS
            and r[0]['matches'] == MATCHES and r[0]['persistAcrossSessions'] is True)


CASES = [
    ('scenario=rest&access=1', registered_ok),
    ('scenario=rest&access=1&oldScript=1', registered_ok),
    ('scenario=rest', lambda d: d['registered'] == []),
]

failed = 0
for query, ok in CASES:
    d = popup(query)
    try:
        good = bool(ok(d))
    except Exception:
        good = False
    print('OK  ' if good else 'FAIL', query, '' if good else json.dumps(d, ensure_ascii=False))
    failed += not good
sys.exit(1 if failed else 0)
```

Run:

```bash
chmod +x "$H/popup-checks.py" && "$H/regress.sh" | diff "$H/baseline.txt" - && echo IDENTICAL; "$H/popup-checks.py"
```

Expected: `IDENTICAL`, then 3 `OK` lines.

- [ ] **Step 7: Look at the pages**

Run:

```bash
"$H/page-shot.sh" "" "scenario=rest" "$H/t3-list.png"; "$H/page-shot.sh" 2866034605 "scenario=rest" "$H/t3-page.png"
```

Both files must be over 5,000 bytes. Open each with the Read tool.
- **`t3-list.png`:** six table rows. Row 1 reads `#2866034605` followed by a grey, lighter `📌 Species list old issue v2` on the same line. Row 3 reads `#2866022222  📌 Nightly check`. The other rows show only their numbers. There are no runner badges yet.
- **`t3-page.png`:** the large `#2866034605` heading followed by `📌 Species list old issue v2` in grey, lighter text.

- [ ] **Step 8: Unit tests, lint, commit**

Run: `bun test && npx web-ext lint 2>&1 | grep -E "errors|notices|warnings"`
Expected: `150 pass`, `0 fail`; errors/notices/warnings all `0`.

```bash
git add content/pipeline-notes.js popup.js
git commit -m "Show pinned pipeline notes in the GitLab pipelines table"
```

(`git rm` already staged the deletion of `content/pipeline-note.js`.)

---

### Task 4: Runner tag badges via `content/runner-tags.js`

**Files:**
- Create: `content/runner-tags.js`
- Modify: `popup.js` (`PIPELINE_PAGE_SCRIPT.js`)
- Create (scratch): `$H/runner-checks.py`; modify `$H/popup-checks.py` (`SCRIPT_JS`)

**Interfaces:**
- Consumes: `globalThis.gitlabNavigate.{ pipelineUrlFromHref, sharedJobTags, watch }` (Task 2). Reads `chrome.storage.local` `runnerTags` and `chrome.storage.sync` `ignoredJobTags` (an array; Task 5 adds the popup setting that writes it).
- Produces: `chrome.storage.local` `runnerTags` = `{ [pipeline url]: string[] }`.

- [ ] **Step 1: Write the runner checks and confirm they fail**

Write `$H/runner-checks.py`:

```python
#!/usr/bin/env python3
"""Runner-badge checks against the fixture pages. Prints OK/FAIL per case."""
import json, pathlib, subprocess, sys

H = pathlib.Path(__file__).resolve().parent
ALL = sorted(['2866034605', '2866011111', '2866022222', '2866000000', '2866000001', '2866000002'])
CACHED = sorted(['2866034605', '2866011111', '2866022222', '2866000000'])
REST = [['perentie-runner'], ['huy-runner'], [], ['cypress', 'perentie-runner'], [], []]
FIRST_URL = ('http://localhost:8766/api/v4/projects/ternandsparrow%2Fparatoo-fdcp'
             '/pipelines/2866034605/jobs?per_page=100')


def page(path, query):
    out = subprocess.run([str(H / 'page-check.sh'), path, query],
                         capture_output=True, text=True).stdout
    try:
        return json.loads(out)
    except ValueError:
        return {'error': out.strip()}


def runners(d):
    return [r['runners'] for r in d['rows']]


def no_strays(d):
    return all(r['strayRunners'] == 0 for r in d['rows'])


CASES = [
    ('', 'scenario=rest', lambda d: runners(d) == REST and no_strays(d)
        and d['fetched'] == ALL and d['maxInFlight'] == 4 and d['credentials'] == ['include']
        and d['fetchUrl'] == FIRST_URL and d['cachedNew'] == CACHED and d['cacheSize'] == 4
        and d['badgeClass'] == 'gl-badge badge badge-pill badge-neutral'
        and d['badgeTitle'] == 'Runner tag'),
    ('', 'scenario=rest&ignore=cypress', lambda d: runners(d)[3] == ['perentie-runner']
        and runners(d)[0] == ['perentie-runner']),
    ('', 'scenario=ignoreLive', lambda d: runners(d) ==
        [[], ['huy-runner'], [], ['cypress'], [], []]),
    ('', 'scenario=rest&cached=1', lambda d: runners(d)[0] == ['cached-runner']
        and d['fetched'] == [i for i in ALL if i != '2866034605']),
    ('', 'scenario=rest&cached=full', lambda d: d['cacheSize'] == 500 and d['cacheFirst'] == '5'
        and d['cachedNew'] == CACHED),
    ('', 'scenario=rerender', lambda d: runners(d) == REST and no_strays(d) and d['fetched'] == ALL),
    ('', 'scenario=reuse', lambda d: d['rows'][0]['id'] == '2866011111'
        and runners(d)[0] == ['huy-runner'] and d['fetched'] == ALL),
    ('', 'scenario=rest&fail=2866011111', lambda d: runners(d)[1] == []
        and '2866011111' not in d['cachedNew'] and d['fetched'] == ALL),
    ('2866034605', 'scenario=rest', lambda d: d['headerRunners'] == ['perentie-runner']
        and d['headerRunnersBeforeJobs'] is True and d['fetched'] == ['2866034605']),
    ('2866034605/builds', 'scenario=rest', lambda d: d['headerRunners'] == ['perentie-runner']),
    ('2866034605', 'scenario=rerender', lambda d: d['headerRunners'] == ['perentie-runner']
        and d['headerRunnersBeforeJobs'] is True and d['fetched'] == ['2866034605']),
    ('2866000000', 'scenario=rest&ignore=cypress', lambda d: d['headerRunners'] == ['perentie-runner']),
    ('2866022222', 'scenario=rest', lambda d: d['headerRunners'] == []
        and d['headerRunnersBeforeJobs'] is None),
]

failed = 0
for path, query, ok in CASES:
    d = page(path, query)
    try:
        good = bool(ok(d))
    except Exception:
        good = False
    print('OK  ' if good else 'FAIL', f'{path or "(list)"}?{query}',
          '' if good else json.dumps(d, ensure_ascii=False))
    failed += not good
sys.exit(1 if failed else 0)
```

Run: `chmod +x "$H/runner-checks.py" && "$H/sync.sh" && "$H/runner-checks.py"`
Expected: every case except the last FAILs, because no badges exist and nothing is fetched.

- [ ] **Step 2: Write `content/runner-tags.js`**

```js
// Shows the runner a pipeline targets as a grey badge: after GitLab's own badges in each
// pipelines-table row, and after the header badges on a pipeline page. GitLab does not
// keep a pipeline's inputs, so the runner comes from its jobs' tags.
// Relies on content/shared.js, which runs first.
(() => {
  const { pipelineUrlFromHref, sharedJobTags, watch } = globalThis.gitlabNavigate;
  const MARK = 'data-gitlab-navigate-runner';
  const TABLE_CELL = '[data-testid="pipeline-url-table-cell"]';
  const TABLE_LINK = '[data-testid="pipeline-url-link"]';
  const HEADER_JOBS = '[data-testid="pipeline-header"] [data-testid="total-jobs"]';
  const CACHE_KEY = 'runnerTags';
  const CACHE_LIMIT = 500;
  const MAX_IN_FLIGHT = 4;

  const isPlainObject = (value) =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  // Pipeline URL -> the tags every tagged job shares, before the ignore list, so a
  // settings change applies without refetching.
  let cache = {};
  let ignored = new Set();
  let ready = false;
  const requested = new Set(); // fetched, or being fetched, during this page load
  const queue = [];
  let inFlight = 0;
  let writing = Promise.resolve();

  function setIgnored(tags) {
    ignored = new Set((Array.isArray(tags) ? tags : []).map((tag) => String(tag).toLowerCase()));
  }

  function visibleTags(url) {
    return (cache[url] ?? []).filter((tag) => !ignored.has(tag.toLowerCase()));
  }

  function badge(url, tag) {
    const outer = document.createElement('span');
    outer.setAttribute(MARK, url);
    outer.title = 'Runner tag';
    outer.className = 'gl-badge badge badge-pill badge-neutral';
    outer.style.marginLeft = '0.25rem';
    const inner = document.createElement('span');
    inner.className = 'gl-badge-content';
    inner.textContent = tag;
    outer.append(inner);
    return outer;
  }

  // Makes the marked badges directly inside `container` read `tags`, inserting before
  // `before` (null = at the end). Writes only when they differ: every write wakes the
  // observer, and an unconditional write would loop forever.
  function place(container, before, url, tags) {
    const existing = [...container.children].filter((child) => child.hasAttribute(MARK));
    const have = existing.map((el) => `${el.getAttribute(MARK)} ${el.textContent}`);
    const wanted = tags.map((tag) => `${url} ${tag}`);
    if (have.length === wanted.length && have.every((value, i) => value === wanted[i])) return;

    for (const el of existing) el.remove();
    for (const tag of tags) container.insertBefore(badge(url, tag), before);
  }

  function apply() {
    if (!ready) return;

    for (const cell of document.querySelectorAll(TABLE_CELL)) {
      const link = cell.querySelector(TABLE_LINK);
      const labels = cell.lastElementChild;
      if (!link || !labels || labels === link || labels.contains(link)) continue;
      const pipeline = pipelineUrlFromHref(link.href);
      if (pipeline) request(pipeline);
      place(labels, null, pipeline?.url ?? '', pipeline ? visibleTags(pipeline.url) : []);
    }

    const page = pipelineUrlFromHref(location.href);
    const jobsWrapper = document.querySelector(HEADER_JOBS)?.closest('div');
    if (page && jobsWrapper?.parentElement) {
      request(page);
      place(jobsWrapper.parentElement, jobsWrapper, page.url, visibleTags(page.url));
    }
  }

  function request(pipeline) {
    if (pipeline.url in cache || requested.has(pipeline.url)) return;
    requested.add(pipeline.url);
    queue.push(pipeline);
    pump();
  }

  function pump() {
    while (inFlight < MAX_IN_FLIGHT && queue.length > 0) {
      const pipeline = queue.shift();
      inFlight += 1;
      fetchTags(pipeline)
        .then((tags) => {
          if (tags) remember(pipeline.url, tags);
        })
        .catch(() => {
          // Not cached, so the next page load tries again.
        })
        .finally(() => {
          inFlight -= 1;
          pump();
          apply();
        });
    }
  }

  // Null when there is nothing worth caching yet: an error, or no jobs so far.
  async function fetchTags({ projectPath, id }) {
    const response = await fetch(
      `${location.origin}/api/v4/projects/${encodeURIComponent(projectPath)}/pipelines/${id}/jobs?per_page=100`,
      { credentials: 'include' },
    );
    if (!response.ok) return null;
    const jobs = await response.json();
    return Array.isArray(jobs) && jobs.length > 0 ? sharedJobTags(jobs) : null;
  }

  // A pipeline's tags never change once it exists, so they are kept across page loads.
  // Writes are chained so this page's own fetches cannot overwrite each other's entries.
  function remember(url, tags) {
    cache[url] = tags;
    writing = writing.then(async () => {
      try {
        const { [CACHE_KEY]: stored } = await chrome.storage.local.get(CACHE_KEY);
        const next = isPlainObject(stored) ? { ...stored } : {};
        delete next[url];
        next[url] = tags;
        const keys = Object.keys(next);
        for (const key of keys.slice(0, Math.max(0, keys.length - CACHE_LIMIT))) {
          delete next[key];
        }
        await chrome.storage.local.set({ [CACHE_KEY]: next });
      } catch {
        // Orphaned after an extension update, or storage failed; the badge still shows.
      }
    });
  }

  async function load() {
    try {
      const [{ [CACHE_KEY]: stored }, { ignoredJobTags }] = await Promise.all([
        chrome.storage.local.get(CACHE_KEY),
        chrome.storage.sync.get('ignoredJobTags'),
      ]);
      cache = isPlainObject(stored) ? { ...stored } : {};
      setIgnored(ignoredJobTags);
    } catch {
      // The extension was reloaded or updated; this copy of the script is orphaned.
      return;
    }
    ready = true;
    apply();
  }

  watch(apply);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.ignoredJobTags) {
      setIgnored(changes.ignoredJobTags.newValue);
      apply();
    }
  });
  load();
})();
```

- [ ] **Step 3: Register it**

In `popup.js`, replace:

```js
  js: ['content/shared.js', 'content/pipeline-notes.js'],
```

with:

```js
  js: ['content/shared.js', 'content/pipeline-notes.js', 'content/runner-tags.js'],
```

In `$H/popup-checks.py`, replace:

```python
SCRIPT_JS = ['content/shared.js', 'content/pipeline-notes.js']
```

with:

```python
SCRIPT_JS = ['content/shared.js', 'content/pipeline-notes.js', 'content/runner-tags.js']
```

- [ ] **Step 4: Run all page and popup checks**

Run: `"$H/sync.sh" && "$H/runner-checks.py"; "$H/notes-checks.py"; "$H/regress.sh" | diff "$H/baseline.txt" - && echo IDENTICAL; "$H/popup-checks.py"`
Expected:
- `runner-checks.py`: 13 `OK`.
- `notes-checks.py`: 13 `OK`, since notes are unaffected by badges.
- `regress.sh`: `IDENTICAL`.
- `popup-checks.py`: 3 `OK`.

A `NO RESULT` line means an unconditional DOM write: fix `place()`.

- [ ] **Step 5: Look at the pages**

Run:

```bash
"$H/page-shot.sh" "" "scenario=rest" "$H/t4-list.png"; "$H/page-shot.sh" 2866034605 "scenario=rest" "$H/t4-page.png"
```

Both files must be over 5,000 bytes. Open each with the Read tool.
- **`t4-list.png`:** row 1's badge line reads `latest`, `branch`, then a grey pill `perentie-runner`. Row 2 ends with `huy-runner`. Row 4 ends with two grey pills, `cypress` and `perentie-runner`. Rows 3, 5 and 6 have no grey pill. Row 1 still shows its note.
- **`t4-page.png`:** under the heading, the green `latest` pill, then a grey `perentie-runner` pill, then `41 jobs`.

- [ ] **Step 6: Unit tests, lint, commit**

Run: `bun test && npx web-ext lint 2>&1 | grep -E "errors|notices|warnings"`
Expected: `150 pass`, `0 fail`; errors/notices/warnings all `0`.

```bash
git add content/runner-tags.js popup.js
git commit -m "Show each pipeline's runner tag as a badge on GitLab"
```

---

### Task 5: The Ignore job tags setting

**Files:**
- Modify: `lib/storage.js`, `popup.html` (settings section), `popup.js` (settings wiring, `init`)
- Modify (scratch): `$H/stub-chrome.js`, `$H/scenario.js`, `$H/popup-checks.py`

**Interfaces:**
- Consumes: `parseTagList(text)` (Task 1). `content/runner-tags.js` (Task 4) already reads `chrome.storage.sync` `ignoredJobTags` and reacts to its changes.
- Produces: `export async function getIgnoredJobTags(): Promise<string[]>` and `export async function setIgnoredJobTags(tags: string[]): Promise<void>` in `lib/storage.js`.

- [ ] **Step 1: Extend the harness and confirm the new checks fail**

In `$H/stub-chrome.js`, replace:

```js
const syncStore = { baseUrl: BASE, targetBranch: 'dev/1.0.11', username: 'nuwan-tern' };
```

with:

```js
const syncStore = {
  baseUrl: BASE,
  targetBranch: 'dev/1.0.11',
  username: 'nuwan-tern',
  ...(params.get('ignored') === '1' ? { ignoredJobTags: ['gpu', 'cypress'] } : {}),
};
```

and replace:

```js
window.__localStore = localStore;
```

with:

```js
window.__localStore = localStore;
window.__syncStore = syncStore;
```

In `$H/scenario.js`, replace:

```js
  async pin() {
    pinButton().click();
  },
```

with:

```js
  async pin() {
    pinButton().click();
  },
  async openSettings() {
    document.getElementById('settings-toggle').click();
  },
  async ignore() {
    document.getElementById('settings-toggle').click();
    document.getElementById('ignored-tags-input').value = ' cypress,, Docker  cypress ';
    document.getElementById('ignored-tags-save').click();
  },
  async ignoreEnter() {
    document.getElementById('settings-toggle').click();
    const input = document.getElementById('ignored-tags-input');
    input.value = 'gpu';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  },
  async ignoreClear() {
    document.getElementById('settings-toggle').click();
    document.getElementById('ignored-tags-input').value = '   ';
    document.getElementById('ignored-tags-save').click();
  },
```

and replace:

```js
  registered: window.__registered,
});
```

with:

```js
  registered: window.__registered,
  ignoredJobTags: window.__syncStore.ignoredJobTags ?? null,
  ignoredInput: document.getElementById('ignored-tags-input')?.value ?? null,
});
```

In `$H/popup-checks.py`, replace:

```python
    ('scenario=rest', lambda d: d['registered'] == []),
]
```

with:

```python
    ('scenario=rest', lambda d: d['registered'] == []),
    ('scenario=openSettings&ignored=1', lambda d: d['ignoredInput'] == 'gpu, cypress'),
    ('scenario=openSettings', lambda d: d['ignoredInput'] == '' and d['ignoredJobTags'] is None),
    ('scenario=ignore', lambda d: d['ignoredJobTags'] == ['cypress', 'Docker']
        and d['ignoredInput'] == 'cypress, Docker'),
    ('scenario=ignoreEnter', lambda d: d['ignoredJobTags'] == ['gpu']),
    ('scenario=ignoreClear&ignored=1', lambda d: d['ignoredJobTags'] == []
        and d['ignoredInput'] == ''),
]
```

Run: `"$H/sync.sh" && "$H/popup-checks.py"`
Expected: the first 3 cases `OK`; the 5 new ones FAIL, because there is no `#ignored-tags-input` yet (`ignoredInput` is `null`).

- [ ] **Step 2: Storage functions**

In `lib/storage.js`, replace:

```js
const USERNAME_KEY = 'username';
```

with:

```js
const USERNAME_KEY = 'username';
const IGNORED_JOB_TAGS_KEY = 'ignoredJobTags';
```

and replace:

```js
export async function getHistory() {
```

with:

```js
/**
 * Job tags left out of the runner badge on GitLab pages. Read directly by
 * content/runner-tags.js, which cannot import this module.
 */
export async function getIgnoredJobTags() {
  const { [IGNORED_JOB_TAGS_KEY]: tags } = await chrome.storage.sync.get(IGNORED_JOB_TAGS_KEY);
  return Array.isArray(tags) ? tags : [];
}

export async function setIgnoredJobTags(tags) {
  await chrome.storage.sync.set({ [IGNORED_JOB_TAGS_KEY]: tags });
}

export async function getHistory() {
```

- [ ] **Step 3: The settings field**

In `popup.html`, replace:

```html
      <p class="error" id="username-error" hidden></p>
    </section>
```

with:

```html
      <p class="error" id="username-error" hidden></p>

      <label for="ignored-tags-input">Ignore job tags</label>
      <div class="settings-row">
        <input
          id="ignored-tags-input"
          type="text"
          spellcheck="false"
          placeholder="cypress"
        />
        <button id="ignored-tags-save" type="button">Save</button>
      </div>
      <p class="error" id="ignored-tags-error" hidden></p>
    </section>
```

- [ ] **Step 4: Wire it in `popup.js`**

In the `./lib/parse.js` import list, replace:

```js
  originPattern,
  parsePipelineUrl,
```

with:

```js
  originPattern,
  parsePipelineUrl,
  parseTagList,
```

In the `./lib/storage.js` import list, replace:

```js
  getHistory,
```

with:

```js
  getHistory,
  getIgnoredJobTags,
```

and replace:

```js
  setBase,
```

with:

```js
  setBase,
  setIgnoredJobTags,
```

Replace:

```js
const usernameError = document.getElementById('username-error');
```

with:

```js
const usernameError = document.getElementById('username-error');
const ignoredTagsInput = document.getElementById('ignored-tags-input');
const ignoredTagsSave = document.getElementById('ignored-tags-save');
const ignoredTagsError = document.getElementById('ignored-tags-error');
```

Replace:

```js
let username = '';
```

with:

```js
let username = '';
let ignoredJobTags = [];
```

Replace:

```js
  usernameInput.value = username;
  baseInput.focus();
```

with:

```js
  usernameInput.value = username;
  ignoredTagsInput.value = ignoredJobTags.join(', ');
  baseInput.focus();
```

Replace:

```js
  clearError(usernameError);
}

function navigate(url) {
```

with:

```js
  clearError(usernameError);
  clearError(ignoredTagsError);
}

function navigate(url) {
```

Replace:

```js
function goToBaseList(buildListUrl) {
```

with:

```js
// An empty box is a valid choice: it stops ignoring anything.
async function saveIgnoredTags() {
  clearError(ignoredTagsError);

  const tags = parseTagList(ignoredTagsInput.value);
  try {
    await setIgnoredJobTags(tags);
  } catch {
    showError(ignoredTagsError, 'Could not save; try again');
    return;
  }
  ignoredJobTags = tags;
  ignoredTagsInput.value = tags.join(', ');
}

function goToBaseList(buildListUrl) {
```

Replace:

```js
async function init() {
  base = await getBase();
  targetBranch = await getTargetBranch();
  username = await getUsername();
```

with:

```js
ignoredTagsSave.addEventListener('click', saveIgnoredTags);
ignoredTagsInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  saveIgnoredTags();
});

async function init() {
  base = await getBase();
  targetBranch = await getTargetBranch();
  username = await getUsername();
  ignoredJobTags = await getIgnoredJobTags();
```

- [ ] **Step 5: Run the checks**

Run: `"$H/sync.sh" && "$H/popup-checks.py"; "$H/regress.sh" | diff "$H/baseline.txt" - && echo IDENTICAL`
Expected: 8 `OK`; `IDENTICAL`.

- [ ] **Step 6: Look at the settings panel**

Run: `"$H/shot.sh" "scenario=openSettings&ignored=1" "$H/t5-settings.png"`
The file must be over 20,000 bytes. Open it with the Read tool. The settings panel shows four fields: GitLab repo URL, Default MR target branch, Your GitLab username, and **Ignore job tags** with `gpu, cypress` in its box. Each field has a Save button.

- [ ] **Step 7: Screenshots of the README, unit tests, lint, commit**

`popup.html` changed, so re-render the README images. The settings panel is hidden in them, so they should look the same.

Run: `./tools/screenshot.sh && ls -l docs/popup-*.png && bun test && npx web-ext lint 2>&1 | grep -E "errors|notices|warnings"`
Expected: both PNGs are over 20,000 bytes. `150 pass`, `0 fail`; lint all `0`.

```bash
git add lib/storage.js popup.html popup.js docs/popup-light.png docs/popup-dark.png
git commit -m "Add the Ignore job tags setting for runner badges"
```

---

### Task 6: Pinned MRs

**Files:**
- Modify: `lib/storage.js` (`PINNED_KEYS`), `pinned-list.js` (`idPrefix`), `popup.html`, `popup.css`, `popup.js`
- Modify (scratch): `$H/stub-chrome.js`, `$H/scenario.js`, `$H/popup-checks.py`

**Interfaces:**
- Consumes: `parseMrUrl`, `mrApiUrl` (Task 1). `createPinnedList({ kind, noun, idPrefix, section, list, describeRow, navigate, onRender })` (after this task's change). `STATUS_GLYPHS` (existing in `popup.js`).
- Produces: storage kind `'mrs'` → key `pinnedMrs`; `describeMr(entry)` and `fetchMr(entry)` in `popup.js`.

- [ ] **Step 1: Extend the harness and confirm the MR checks fail**

In `$H/stub-chrome.js`, replace:

```js
const TICKET_TITLES = { 2950: 'Past data empty after sync' };
```

with:

```js
const TICKET_TITLES = { 2950: 'Past data empty after sync' };
localStore.pinnedMrs = [
  {
    base: BASE,
    id: '1310',
    title: 'Camera trap variations',
    state: 'opened',
    sourceBranch: '2319-camera-trapping-module-variations',
    targetBranch: 'dev/1.0.12',
    pipelineStatus: 'running',
  },
  {
    base: BASE,
    id: '1303',
    title: 'fix(test): dropdown harness carried subjects',
    state: 'merged',
    sourceBranch: 'fix/cypress-dropdown-and-spec-bundle-node-env',
    targetBranch: 'dev/1.0.13',
    pipelineStatus: 'success',
    note: 'Dropdown fix',
  },
  {
    base: BASE,
    id: '1290',
    title: 'Abandoned approach',
    state: 'closed',
    sourceBranch: 'spike/x',
    targetBranch: 'dev/1.0.11',
    pipelineStatus: null,
  },
];
const MR_DATA = { 1320: { title: 'Add runner badge', source: 'feature/runner-badge' } };
```

Replace:

```js
  ticket: `${BASE}/-/work_items/2950`,
};
```

with:

```js
  ticket: `${BASE}/-/work_items/2950`,
  mr: `${BASE}/-/merge_requests/1320/diffs`,
};
```

Replace:

```js
  const pin = localStore.pinnedPipelines.find((p) => p.id === id);
```

with:

```js
  if (String(url).includes('/merge_requests/')) {
    const mr = localStore.pinnedMrs.find((m) => m.id === id);
    return {
      ok: true,
      json: async () => ({
        title: mr?.title ?? MR_DATA[id]?.title ?? `MR ${id}`,
        state: mr?.state ?? 'opened',
        source_branch: mr?.sourceBranch ?? MR_DATA[id]?.source ?? 'feature/x',
        target_branch: mr?.targetBranch ?? 'dev/1.0.12',
        web_url: `${BASE}/-/merge_requests/${id}`,
        head_pipeline: mr?.pipelineStatus ? { status: mr.pipelineStatus } : null,
      }),
    };
  }
  const pin = localStore.pinnedPipelines.find((p) => p.id === id);
```

In `$H/scenario.js`, replace:

```js
const LISTS = { pipelines: '#pinned-list', tickets: '#pinned-tickets-list' };
```

with:

```js
const LISTS = {
  pipelines: '#pinned-list',
  tickets: '#pinned-tickets-list',
  mrs: '#pinned-mrs-list',
};
```

Replace:

```js
  async openSettings() {
```

with:

```js
  async mrEdit() {
    editButton('mrs', 0).click();
  },
  async mrNote() {
    editButton('mrs', 0).click();
    type('Needs review');
    press('Enter');
  },
  async mrUnpin() {
    rows('mrs')[1].querySelector('.pin-remove').click();
  },
  async mrReorder() {
    drag('mrs', 1, 'mrs', 0);
    await wait(300);
    drag('mrs', 0, 'tickets', 0);
  },
  async openSettings() {
```

Replace:

```js
  ignoredJobTags: window.__syncStore.ignoredJobTags ?? null,
```

with:

```js
  ignoredJobTags: window.__syncStore.ignoredJobTags ?? null,
  mrs: {
    ids: stored('pinnedMrs').map((m) => m.id),
    notes: stored('pinnedMrs').map((m) => m.note ?? null),
    headlines: rows('mrs').map((r) => text(r, '.pin-note, .pin-id')),
    sublines: rows('mrs').map((r) => text(r, '.pin-ref')),
    glyphs: rows('mrs').map((r) => text(r, '.pin-nav > .pin-status')),
    statuses: rows('mrs').map((r) => r.querySelector('.pin-nav > .pin-status')?.dataset.status ?? null),
    pipelines: rows('mrs').map((r) => text(r, '.pin-mr-pipeline')),
    tooltips: rows('mrs').map(tooltip),
    noteLabel: document.querySelector('#pinned-mrs-list .pin-note-input')?.getAttribute('aria-label') ?? null,
    hidden: document.getElementById('pinned-mrs')?.hidden ?? null,
  },
```

In `$H/popup-checks.py`, replace:

```python
    ('scenario=ignoreClear&ignored=1', lambda d: d['ignoredJobTags'] == []
        and d['ignoredInput'] == ''),
]
```

with:

```python
    ('scenario=ignoreClear&ignored=1', lambda d: d['ignoredJobTags'] == []
        and d['ignoredInput'] == ''),
    ('scenario=rest', lambda d: d['mrs'] == {
        'ids': ['1310', '1303', '1290'],
        'notes': [None, 'Dropdown fix', None],
        'headlines': ['Camera trap variations', 'Dropdown fix', 'Abandoned approach'],
        'sublines': ['!1310 · 2319-camera-trapping-mo… → dev/1.0.12',
                     '!1303 · fix/cypress-dropdown-an… → dev/1.0.13',
                     '!1290 · spike/x → dev/1.0.11'],
        'glyphs': ['○', '✓', '✕'],
        'statuses': ['opened', 'merged', 'mr-closed'],
        'pipelines': ['●', '✓', None],
        'tooltips': [
            'Camera trap variations\n2319-camera-trapping-module-variations → dev/1.0.12\nopen · pipeline running',
            'Dropdown fix\nfix(test): dropdown harness carried subjects\nfix/cypress-dropdown-and-spec-bundle-node-env → dev/1.0.13\nmerged · pipeline success',
            'Abandoned approach\nspike/x → dev/1.0.11\nclosed'],
        'noteLabel': None,
        'hidden': False,
    }),
    ('scenario=rest&tab=mr', lambda d: d['pinHidden'] is False
        and d['pinText'] == '\U0001F4CC Pin this MR'),
    ('scenario=pin&tab=mr&access=1', lambda d: d['mrs']['ids'] == ['1320', '1310', '1303', '1290']
        and d['mrs']['headlines'][0] == 'Add runner badge'
        and d['mrs']['sublines'][0] == '!1320 · feature/runner-badge → dev/1.0.12'
        and d['mrs']['pipelines'][0] is None and d['editing'] is None and d['pinHidden'] is True),
    ('scenario=pin&tab=mr', lambda d: d['mrs']['headlines'][0] == '!1320'
        and d['mrs']['sublines'][0] == '' and d['mrs']['glyphs'][0] == '●'
        and d['mrs']['statuses'][0] == 'unknown' and d['pinHidden'] is True),
    ('scenario=mrEdit', lambda d: d['mrs']['noteLabel'] == 'Note for MR !1310'),
    ('scenario=mrNote', lambda d: d['mrs']['notes'] == ['Needs review', 'Dropdown fix', None]
        and d['mrs']['headlines'][0] == 'Needs review'
        and d['mrs']['sublines'][0] == '!1310 · 2319-camera-trapping-mo… → dev/1.0.12'),
    ('scenario=mrUnpin', lambda d: d['mrs']['ids'] == ['1310', '1290']),
    ('scenario=mrReorder', lambda d: d['mrs']['ids'] == ['1303', '1310', '1290']
        and d['tickets']['ids'] == ['2893', '2846']),
]
```

Run: `"$H/sync.sh" && "$H/popup-checks.py"`
Expected: the first 8 cases `OK`; the 8 MR cases FAIL (there are no MR rows, and `pinText` is not `Pin this MR`).

- [ ] **Step 2: Storage kind and `idPrefix`**

In `lib/storage.js`, replace:

```js
const PINNED_KEYS = { pipelines: 'pinnedPipelines', tickets: 'pinnedTickets' };
```

with:

```js
const PINNED_KEYS = { pipelines: 'pinnedPipelines', tickets: 'pinnedTickets', mrs: 'pinnedMrs' };
```

and replace:

```js
 * @param {'pipelines'|'tickets'} kind which pinned list
```

with:

```js
 * @param {'pipelines'|'tickets'|'mrs'} kind which pinned list
```

In `pinned-list.js`, replace:

```js
export function createPinnedList({ kind, noun, section, list, describeRow, navigate, onRender }) {
```

with:

```js
// `idPrefix` is how the item's number is written: `#` for pipelines and tickets, `!` for MRs.
export function createPinnedList({
  kind,
  noun,
  idPrefix = '#',
  section,
  list,
  describeRow,
  navigate,
  onRender,
}) {
```

and replace:

```js
    input.setAttribute('aria-label', `Note for ${noun} #${entry.id}`);
```

with:

```js
    input.setAttribute('aria-label', `Note for ${noun} ${idPrefix}${entry.id}`);
```

- [ ] **Step 3: Markup and styles**

In `popup.html`, replace:

```html
      <ul id="pinned-tickets-list"></ul>
    </section>
```

with:

```html
      <ul id="pinned-tickets-list"></ul>
    </section>

    <section id="pinned-mrs" class="recent" hidden>
      <h2>Pinned MRs</h2>
      <ul id="pinned-mrs-list"></ul>
    </section>
```

In `popup.css`, replace:

```css
.pin-status[data-status="closed"] { color: #1f75cb; }
```

with:

```css
.pin-status[data-status="closed"] { color: #1f75cb; }
/* MRs get their own tokens: a closed ticket is done (blue) but a closed MR was abandoned. */
.pin-status[data-status="merged"] { color: #1f75cb; }
.pin-status[data-status="mr-closed"] { color: #dd2b0e; }

/* An MR's latest pipeline, in the column where pipeline rows show their duration. */
.pin-mr-pipeline {
  flex: none;
  min-width: 40px;
  text-align: right;
}
```

and replace:

```css
.pin-item:hover .pin-duration,
.pin-item:focus-within .pin-duration {
  visibility: hidden;
}
```

with:

```css
.pin-item:hover .pin-duration,
.pin-item:focus-within .pin-duration,
.pin-item:hover .pin-mr-pipeline,
.pin-item:focus-within .pin-mr-pipeline {
  visibility: hidden;
}
```

- [ ] **Step 4: `popup.js`**

In the `./lib/parse.js` import list, replace:

```js
  mineMrUrl,
```

with:

```js
  mineMrUrl,
  mrApiUrl,
```

and replace:

```js
  originPattern,
  parsePipelineUrl,
```

with:

```js
  originPattern,
  parseMrUrl,
  parsePipelineUrl,
```

Replace:

```js
const pinned = document.getElementById('pinned');
```

with:

```js
const pinnedMrs = document.getElementById('pinned-mrs');
const pinnedMrsList = document.getElementById('pinned-mrs-list');
const pinned = document.getElementById('pinned');
```

Replace:

```js
const lists = { pipelines: pipelinesList, tickets: ticketsList };
```

with:

```js
function mrWebUrl(entry) {
  return entry.webUrl || `${entry.base}/-/merge_requests/${entry.id}`;
}

// GitLab's MR states mapped to row tokens. A closed ticket is done, but a closed MR was
// abandoned, so MRs use `mr-closed` rather than sharing the ticket's blue `closed`.
const MR_STATUS = { opened: 'opened', locked: 'opened', merged: 'merged', closed: 'mr-closed' };
const MR_GLYPHS = { opened: '○', merged: '✓', 'mr-closed': '✕' };
const MR_STATE_WORDS = { opened: 'open', locked: 'open', merged: 'merged', closed: 'closed' };
const SOURCE_BRANCH_MAX = 24;

// Shortened from the end so the target branch after it stays visible.
function shortBranch(branch) {
  return branch.length > SOURCE_BRANCH_MAX ? `${branch.slice(0, SOURCE_BRANCH_MAX - 1)}…` : branch;
}

function describeMr(entry) {
  const number = `!${entry.id}`;
  const headline = entry.note || entry.title || number;
  const headlineIsId = !entry.note && !entry.title;
  const hasBranches = Boolean(entry.sourceBranch && entry.targetBranch);
  const branches = hasBranches ? `${shortBranch(entry.sourceBranch)} → ${entry.targetBranch}` : '';

  let subline = '';
  if (hasBranches) subline = headlineIsId ? branches : `${number} · ${branches}`;
  else if (!headlineIsId) subline = number;

  let trailing = null;
  if (entry.pipelineStatus) {
    trailing = document.createElement('span');
    trailing.className = 'pin-status pin-mr-pipeline';
    trailing.dataset.status = entry.pipelineStatus;
    trailing.title = `Pipeline ${entry.pipelineStatus}`;
    trailing.textContent = STATUS_GLYPHS[entry.pipelineStatus] ?? '●';
  }

  const status = MR_STATUS[entry.state] ?? 'unknown';
  const summary = [
    MR_STATE_WORDS[entry.state],
    entry.pipelineStatus && `pipeline ${entry.pipelineStatus}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    status,
    glyph: MR_GLYPHS[status] ?? '●',
    headline,
    headlineIsId,
    subline,
    editSubline: hasBranches ? `${number} · ${branches}` : number,
    tooltip: [
      headline,
      entry.note && entry.title,
      hasBranches && `${entry.sourceBranch} → ${entry.targetBranch}`,
      summary,
    ]
      .filter(Boolean)
      .join('\n'),
    trailing,
    url: mrWebUrl(entry),
  };
}

const mrsList = createPinnedList({
  kind: 'mrs',
  noun: 'MR',
  idPrefix: '!',
  section: pinnedMrs,
  list: pinnedMrsList,
  describeRow: describeMr,
  navigate,
  onRender: refreshPinButton,
});

const lists = { pipelines: pipelinesList, tickets: ticketsList, mrs: mrsList };
```

Replace:

```js
const FETCHERS = { pipelines: fetchPipeline, tickets: fetchTicket };
```

with:

```js
async function fetchMr(entry) {
  const response = await fetch(mrApiUrl(entry.base, entry.id), {
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`GitLab returned ${response.status}`);
  const raw = await response.json();
  return {
    base: entry.base,
    id: entry.id,
    title: raw.title,
    state: raw.state,
    sourceBranch: raw.source_branch,
    targetBranch: raw.target_branch,
    pipelineStatus: raw.head_pipeline?.status ?? null,
    webUrl: raw.web_url,
  };
}

const FETCHERS = { pipelines: fetchPipeline, tickets: fetchTicket, mrs: fetchMr };
```

Replace:

```js
  refreshPinned('pipelines');
  refreshPinned('tickets');
}
```

with:

```js
  refreshPinned('pipelines');
  refreshPinned('tickets');
  refreshPinned('mrs');
}
```

Replace:

```js
  if (pinnable) {
    const noun = pinnable.kind === 'tickets' ? 'ticket' : 'pipeline';
    pinButton.textContent = `\u{1F4CC} Pin this ${noun}`;
  }
```

with:

```js
  if (pinnable) {
    const noun = { pipelines: 'pipeline', tickets: 'ticket', mrs: 'MR' }[pinnable.kind];
    pinButton.textContent = `\u{1F4CC} Pin this ${noun}`;
  }
```

Replace:

```js
  const pipeline = parsePipelineUrl(tab.url);
  const ticket = pipeline ? null : parseTicketUrl(tab.url);
  if (pipeline) pinnable = { kind: 'pipelines', ...pipeline };
  else if (ticket) pinnable = { kind: 'tickets', ...ticket };
  refreshPinButton();
```

with:

```js
  const pipeline = parsePipelineUrl(tab.url);
  const ticket = pipeline ? null : parseTicketUrl(tab.url);
  const mr = pipeline || ticket ? null : parseMrUrl(tab.url);
  if (pipeline) pinnable = { kind: 'pipelines', ...pipeline };
  else if (ticket) pinnable = { kind: 'tickets', ...ticket };
  else if (mr) pinnable = { kind: 'mrs', ...mr };
  refreshPinButton();
```

Replace:

```js
  ticketsList.setEntries(await getPinned('tickets'));
  pipelinesList.setEntries(await getPinned('pipelines'));
```

with:

```js
  mrsList.setEntries(await getPinned('mrs'));
  ticketsList.setEntries(await getPinned('tickets'));
  pipelinesList.setEntries(await getPinned('pipelines'));
```

(`refreshPinButton` is a function declaration further down the file. It is hoisted, and the pipeline and ticket lists already pass it the same way.)

- [ ] **Step 5: Run the checks**

Run: `"$H/sync.sh" && "$H/popup-checks.py"; "$H/regress.sh" | diff "$H/baseline.txt" - && echo IDENTICAL`
Expected: 16 `OK`; `IDENTICAL`.

- [ ] **Step 6: Look at the popup**

Run: `"$H/shot.sh" "scenario=rest" "$H/t6-rest.png"; "$H/shot.sh" "scenario=hover" "$H/t6-hover.png"`
Both files must be over 20,000 bytes. Open each with the Read tool.
- **`t6-rest.png`:** a **PINNED MRS** section below Pinned tickets and above Create MR, with three rows:
  - Row 1: green `○`, then `Camera trap variations` over `!1310 · 2319-camera-trapping-mo… → dev/1.0.12`, then a blue `●` on the right.
  - Row 2: blue `✓`, then `Dropdown fix` over `!1303 · fix/cypress-dropdown-an… → dev/1.0.13`, then a green `✓` on the right.
  - Row 3: red `✕`, then `Abandoned approach` over `!1290 · spike/x → dev/1.0.11`, with nothing on the right.
- **`t6-hover.png`:** the first MR row shows ✎ and ✕ over its right edge, and the pipeline glyph is hidden.

- [ ] **Step 7: Unit tests, lint, commit**

Run: `bun test && npx web-ext lint 2>&1 | grep -E "errors|notices|warnings"`
Expected: `150 pass`, `0 fail`; lint all `0`.

```bash
git add lib/storage.js pinned-list.js popup.html popup.css popup.js
git commit -m "Add pinned MRs with state, branches and pipeline status"
```

---

### Task 7: Screenshots, docs, version 0.20.0

**Files:**
- Modify: `tools/screenshot.sh`, `docs/popup-light.png`, `docs/popup-dark.png`, `manifest.json`, `CHANGELOG.md`, `README.md`, `docs/superpowers/specs/2026-08-04-gitlab-navigate-design.md`

**Interfaces:**
- Consumes: the finished feature (Tasks 1–6).

- [ ] **Step 1: Sample MR rows in the screenshot script**

In `tools/screenshot.sh`, replace:

```python
light = re.search(r'^:root\s*\{([^}]*)\}', css, re.M)
```

with:

```python
mrs = [
    ('opened', '&#x25CB;', '1310', 'Camera trap variations', None,
     '2319-camera-trapping-module-variations', 'dev/1.0.12', 'running', '&#x25CF;'),
    ('merged', '&#x2713;', '1303', 'fix(test): dropdown harness carried subjects', 'Dropdown fix',
     'fix/cypress-dropdown-and-spec-bundle-node-env', 'dev/1.0.13', 'success', '&#x2713;'),
]


def short_branch(branch):
    # Mirrors shortBranch() in popup.js.
    return branch if len(branch) <= 24 else branch[:23] + '&#x2026;'


def mr_item(status, glyph, iid, title, note, source, target, pipeline, pipeline_glyph):
    # Mirrors describeMr() in popup.js and buildNavButton()/buildActions() in pinned-list.js.
    headline = note or title
    subline = f'!{iid} &#xB7; {short_branch(source)} &#x2192; {target}'
    return (
        f'<li class="pin-item">'
        f'<span class="pin-handle" aria-label="Drag to reorder"></span>'
        f'<button type="button" class="pin-nav">'
        f'<span class="pin-status" data-status="{status}">{glyph}</span>'
        f'<span class="pin-main"><span class="pin-note">{headline}</span><span class="pin-ref">{subline}</span></span>'
        f'<span class="pin-status pin-mr-pipeline" data-status="{pipeline}">{pipeline_glyph}</span>'
        f'</button>'
        f'<span class="pin-actions">'
        f'<button type="button" class="pin-action pin-note-edit" aria-label="Edit note">&#x270E;</button>'
        f'<button type="button" class="pin-action pin-remove" aria-label="Unpin this MR">&#x2715;</button>'
        f'</span>'
        f'</li>')


mr_items = '\n'.join(mr_item(*m) for m in mrs)
html = (html
        .replace('<section id="pinned-mrs" class="recent" hidden>', '<section id="pinned-mrs" class="recent">')
        .replace('<ul id="pinned-mrs-list"></ul>', f'<ul id="pinned-mrs-list">{mr_items}</ul>'))

light = re.search(r'^:root\s*\{([^}]*)\}', css, re.M)
```

Run: `./tools/screenshot.sh && ls -l docs/popup-*.png`
Expected: two lines like `popup-light.png: 330x1160  bg=(255, 255, 255)`, and both files over 20,000 bytes. Open both with the Read tool. From top to bottom they show MRS, TICKETS, PIPELINES, GO TO, PINNED PIPELINES, PINNED TICKETS, **PINNED MRS** (two rows, as in Task 6's `t6-rest.png`), CREATE MR, RECENT. Nothing is cut off at the bottom. Dark mode is readable.

- [ ] **Step 2: Version**

In `manifest.json`, replace `"version": "0.19.1",` with `"version": "0.20.0",`.

- [ ] **Step 3: CHANGELOG**

In `CHANGELOG.md`, replace:

```markdown
# Changelog

```

with:

```markdown
# Changelog

## 0.20.0

- **Notes in the pipelines table.** A pinned pipeline's note now also appears in
  GitLab's pipelines list, after the pipeline number, so a page of pipelines reads at a
  glance. It keeps up as GitLab refreshes the table.
- **Runner badges.** Pipelines in the list and on their own page get a grey badge naming
  the runner they target (`perentie-runner`), next to GitLab's `latest` / `branch`
  badges. GitLab doesn't keep pipeline inputs, so the badge comes from the jobs' runner
  tags: the tags every tagged job shares. Tags that aren't runners, such as `cypress`,
  can be listed in the new **Ignore job tags** setting. Each pipeline's tags are fetched
  once with your GitLab login and remembered; no token needed.
- **Pinned MRs.** On an MR page the popup offers **Pin this MR**. Pinned MRs show open
  (○) / merged (✓) / closed (✕), the title, `!iid · source → target`, and the latest
  pipeline's status, refreshed each time the popup opens. Notes, drag-to-reorder and
  unpin work as for pipelines and tickets. Up to 10 MRs.
- The page script is now `content/shared.js`, `content/pipeline-notes.js` and
  `content/runner-tags.js`, and runs on the pipelines list as well as pipeline pages.
  Open the popup once after updating to switch it over.

```

- [ ] **Step 4: README**

In `README.md`, make these replacements.

**1. Alt text.** Replace:

```
pinned pipelines and tickets, the Create MR boxes,
```

with:

```
pinned pipelines, tickets and MRs, the Create MR boxes,
```

**2. The note on GitLab.** Replace the whole paragraph:

```markdown
**On the pipeline page.** A pinned pipeline's note also appears in GitLab itself, after
the big pipeline number (`#2866034605  📌 Species list old issue v2`), so you can tell
pipelines apart without opening the popup. It updates as soon as you edit the note and
disappears when you unpin. A small script does this; it runs only on your GitLab site's
`…/-/pipelines/…` pages and is switched on by the popup once you've granted GitLab
access. After updating the extension, open the popup once for notes to reappear on
pipeline pages. It covers the GitLab site in your repo URL setting; pipelines pinned
from a different GitLab site show their note in the popup only.
```

with:

```markdown
**On GitLab.** A pinned pipeline's note also appears in GitLab itself: after the big
number on the pipeline's page (`#2866034605  📌 Species list old issue v2`) and after
its number in the pipelines list, so you can tell pipelines apart without opening the
popup. It updates as soon as you edit the note, keeps up as GitLab refreshes the list,
and disappears when you unpin. A small script does this; it runs only on your GitLab
site's pipeline pages (`…/-/pipelines…`) and is switched on by the popup once you've
granted GitLab access. After updating the extension, open the popup once for notes to
reappear on GitLab. It covers the GitLab site in your repo URL setting; pipelines pinned
from a different GitLab site show their note in the popup only.
```

**3. API paragraph.** Replace:

```markdown
Pinned pipelines and pinned tickets are the only features that talk to the GitLab API
(`/api/v4/projects/:path/pipelines/:id` and `/api/v4/projects/:path/issues/:id`). They
authenticate with the `_gitlab_session` cookie your browser already has, so there is
**no token to create, and none is stored**.
```

with:

```markdown
The pinned lists and the runner badges are the only features that talk to the GitLab
API: the popup reads `/api/v4/projects/:path/pipelines/:id`, `…/issues/:id` and
`…/merge_requests/:iid`, and the pipeline-page script reads `…/pipelines/:id/jobs`. They
authenticate with the `_gitlab_session` cookie your browser already has, so there is
**no token to create, and none is stored**.
```

**4. Script paragraph.** Replace:

```markdown
The same access lets the popup switch on the pipeline-page note script, which adds the
`scripting` permission (Chrome shows no warning for it).
```

with:

```markdown
The same access lets the popup switch on the pipeline-page script (notes and runner
badges), which adds the `scripting` permission (Chrome shows no warning for it).
```

**5. Pinned MRs section.** Replace:

```markdown
## Create MR

```

with:

```markdown
## Pinned MRs

Open a merge request (`…/-/merge_requests/1303`, or its Changes, Commits or Pipelines
tab) and the popup shows **Pin this MR**. Each pinned MR shows whether it's open (○),
merged (✓) or closed (✕), its title, `!1303 · source → target`, and on the right the
status of its latest pipeline. Long source branches are shortened so the target stays
visible; hover for the full names. Notes, drag-to-reorder and unpin work as for
pipelines and tickets. Up to 10 MRs.

## Create MR

```

**6. Runner badges section.** Replace:

```markdown
## Swap branches on a "new merge request" page
```

with:

```markdown
## Runner badges

On your GitLab site's pipelines list and pipeline pages, each pipeline gets a grey badge
naming the runner it targets, such as `perentie-runner`, next to GitLab's own `latest` /
`branch` badges.

GitLab doesn't keep the inputs a pipeline was started with, so a `RUNNER_TAG` input
can't be read back, but it does record each job's runner tags. The badge shows the tags
that every tagged job in the pipeline carries; untagged jobs, which run on shared
runners, don't count. If your jobs also share a tag that isn't a runner, such as
`cypress`, list it under **Ignore job tags** in settings and it's dropped.

The page script reads the jobs with your existing GitLab login
(`/api/v4/projects/:path/pipelines/:id/jobs`, first 100 jobs), so there's no token to
set up. A pipeline's tags never change, so each one is fetched once and remembered (the
newest 500 are kept). Child pipelines aren't followed.

## Swap branches on a "new merge request" page
```

**7. Settings.** Replace:

```markdown
The gear button holds three fields:
```

with:

```markdown
The gear button holds four fields:
```

Replace:

```markdown
- **Your GitLab username** — used by the MRs, Tickets, and Pipelines > Mine buttons,
  e.g. `nuwan-tern`.

All three are kept in `chrome.storage.sync`,
```

with:

```markdown
- **Your GitLab username** — used by the MRs, Tickets, and Pipelines > Mine buttons,
  e.g. `nuwan-tern`.
- **Ignore job tags** — job tags that aren't runners, left out of the
  [runner badges](#runner-badges), e.g. `cypress`. Separate several with commas or
  spaces; leave it empty to ignore nothing.

All four are kept in `chrome.storage.sync`,
```

Check: `grep -n "Pinned MRs\|## Runner badges\|four fields\|All four\|On GitLab\.\|merge_requests/:iid\|notes and runner" README.md` prints 7 lines, one per replacement above except the alt text (the `## Pinned MRs` heading matches `Pinned MRs`).

- [ ] **Step 5: Main design doc**

In `docs/superpowers/specs/2026-08-04-gitlab-navigate-design.md`:

Replace:

```
  content/pipeline-note.js  note beside the number on GitLab pipeline pages
```

with:

```
  content/shared.js          helpers shared by the GitLab page scripts
  content/pipeline-notes.js  pinned notes on GitLab pipeline pages and the pipelines table
  content/runner-tags.js     runner badges on GitLab pipeline pages and the pipelines table
```

Replace:

```markdown
`lib/parse.js` has no Chrome dependencies and is the only unit-tested module.
`popup.js`, `pinned-list.js` and `content/pipeline-note.js` hold all DOM and Chrome API
interaction. `lib/storage.js` isolates the storage keys so nothing else needs to know
them — except the page-note script, which cannot import modules and reads
`pinnedPipelines` directly.
```

with:

```markdown
`lib/parse.js` and the pure helpers in `content/shared.js` have no Chrome dependencies
and are the unit-tested code. `popup.js`, `pinned-list.js` and the other page scripts
hold all DOM and Chrome API interaction. `lib/storage.js` isolates the storage keys so
nothing else needs to know them — except the page scripts, which cannot import modules
and read `pinnedPipelines`, `runnerTags` and `ignoredJobTags` directly.
```

Replace:

```markdown
2. Settings row (hidden by default): base repo URL, default MR target branch, and
   your GitLab username, each its own labelled input + Save button + error line.
```

with:

```markdown
2. Settings row (hidden by default): base repo URL, default MR target branch, your
   GitLab username, and job tags to ignore for runner badges, each its own labelled
   input + Save button + error line.
```

Replace:

```markdown
4. The pin button — "Pin this pipeline" or "Pin this ticket" by page type, hidden
   unless the active tab is a pipeline or ticket page that is not already pinned —
   then the "Pinned pipelines" list, then the "Pinned tickets" list.
```

with:

```markdown
4. The pin button — "Pin this pipeline", "Pin this ticket" or "Pin this MR" by page
   type, hidden unless the active tab is a pipeline, ticket or MR page that is not
   already pinned — then the "Pinned pipelines", "Pinned tickets" and "Pinned MRs"
   lists.
```

Replace:

```
getUsername() / setUsername(username)          // chrome.storage.sync, key "username"
```

with:

```
getUsername() / setUsername(username)          // chrome.storage.sync, key "username"
getIgnoredJobTags() / setIgnoredJobTags(tags)  // chrome.storage.sync, key "ignoredJobTags"
```

Replace:

```markdown
Base URL, target branch, and username all live in `sync` so they follow the user
```

with:

```markdown
Base URL, target branch, username and ignored job tags all live in `sync` so they follow the user
```

Replace `  "version": "0.19.1",` with `  "version": "0.20.0",`.

Replace:

```markdown
`2026-09-21-pinned-tickets-and-page-notes-design.md`.

## Data Flow
```

with:

```markdown
`2026-09-21-pinned-tickets-and-page-notes-design.md`.

**Table notes, runner tags and pinned MRs.** MRs are a third pinned list (`pinnedMrs`)
whose rows show state, `!iid · source → target` and the head pipeline's status. The
registered page script is now three files — `content/shared.js`,
`content/pipeline-notes.js` and `content/runner-tags.js` — matching `…/-/pipelines*`, so
it also covers the pipelines list. Notes are appended inside each pinned row's pipeline
link, and each pipeline gets a runner badge built from the tags every tagged job shares,
minus `ignoredJobTags`. The tags come from the jobs API and are cached in `runnerTags`.
Full design: `2026-09-22-table-notes-runner-tags-pinned-mrs-design.md`.

## Data Flow
```

Replace:

```markdown
`bun test` over `test/parse.test.js`, covering `lib/parse.js`:
```

with:

```markdown
`bun test` over `test/content-shared.test.js`, covering the pure helpers in
`content/shared.js` (pipeline URLs from links, the shared-job-tags rule), and
`test/parse.test.js`, covering `lib/parse.js`:
```

- [ ] **Step 6: Final checks and commit**

Run: `bun test && npx web-ext lint 2>&1 | grep -E "errors|notices|warnings" && grep -c '"version": "0.20.0"' manifest.json`
Expected: `150 pass`, `0 fail`; lint all `0`; `1`.

```bash
git add tools/screenshot.sh docs/popup-light.png docs/popup-dark.png manifest.json CHANGELOG.md README.md docs/superpowers/specs/2026-08-04-gitlab-navigate-design.md
git commit -m "Release table notes, runner badges and pinned MRs (0.20.0)"
```
