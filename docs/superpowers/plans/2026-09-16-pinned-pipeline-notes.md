# Pinned Pipeline Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user attach a short, editable note to each pinned pipeline and show it as the row's headline.

**Architecture:** A pure `normalizeNote` in `lib/parse.js` defines the note's canonical form (tested with bun). `lib/storage.js` persists it as an optional `note` field on the pinned entry. `popup.js` renders the note as the headline, moves ✎/✕ into a hover overlay above the duration, and adds an edit mode whose state lives outside the DOM so list re-renders cannot lose a draft.

**Tech Stack:** Manifest V3 browser extension (Chrome + Firefox), vanilla ES modules, no build step, `bun test`, headless Chrome for render checks, `npx web-ext lint`.

Spec: `docs/superpowers/specs/2026-09-16-pinned-pipeline-notes-design.md`

## Global Constraints

- Repo root: `/Users/nuwan/projects/pet-projects/gitlab-navigate`. Run every command from there.
- Vanilla JS, no build step, no new dependencies, no new manifest permissions.
- Popup `body` stays `width: 320px`.
- Note max length: `NOTE_MAX_LENGTH = 80`.
- Placeholder copy: `What's this pipeline for?`. ✎ title/aria-label: `Add note` (no note) / `Edit note` (has note). Input aria-label: `Note for pipeline #<id>`.
- Second line of a noted row joins number and branch with ` · ` (U+00B7 with spaces): `#2816150418 · dev/1.0.11`.
- Enter and blur save; Esc cancels and must never save; an empty normalized note deletes the `note` field.
- Only `lib/parse.js` is unit tested (bun). Do not add a storage test harness.
- Commit locally after each task. **Never push.** Commit messages carry **no** `Co-Authored-By` or other AI attribution lines (standing user rule).
- After any `popup.html`/`popup.css` change the README screenshots must be regenerated with `./tools/screenshot.sh` (done in Task 4).
- Release version: `0.18.0`.

## File Map

| File | Change |
|------|--------|
| `lib/parse.js` | + `NOTE_MAX_LENGTH`, `normalizeNote(raw)` |
| `test/parse.test.js` | + `normalizeNote` tests |
| `lib/storage.js` | + `setPinnedNote(base, id, note)` |
| `popup.js` | Pinned row split into builders; note headline; action overlay; edit mode; pin opens editor |
| `popup.css` | `.pin-note`, `.pin-actions` overlay, `.pin-action`, `.pin-edit` |
| `tools/screenshot.sh` | Sample pinned rows carry notes and the new markup |
| `docs/popup-*.png` | Regenerated |
| `manifest.json`, `CHANGELOG.md`, `README.md`, `docs/superpowers/specs/2026-08-04-gitlab-navigate-design.md` | 0.18.0 docs |

A throwaway render harness (not committed) lives at
`H=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad/notes-harness`.
It runs the **real** `popup.js` in a plain page with a stubbed `chrome.*`, so behavior can be
checked headlessly. ES modules do not load from `file://`, so it is served over HTTP.

---

### Task 1: `normalizeNote`

**Files:**
- Modify: `lib/parse.js` (insert before the `/**` doc comment of `swapMrBranches`)
- Test: `test/parse.test.js`

**Interfaces:**
- Produces: `export const NOTE_MAX_LENGTH = 80;` and `export function normalizeNote(raw: unknown): string` — collapses whitespace runs to one space, trims, caps at 80, trims again; non-string → `''`; `''` means "no note".

- [ ] **Step 1: Write the failing tests**

In `test/parse.test.js`, add `normalizeNote,` to the import list directly after `normalizeBase,`:

```js
  normalizeBase,
  normalizeNote,
  originPattern,
```

Append at the end of the file:

```js
describe('normalizeNote', () => {
  test('trims surrounding whitespace', () => {
    expect(normalizeNote('  Hotfix  ')).toBe('Hotfix');
  });

  test('collapses internal whitespace, tabs and newlines to single spaces', () => {
    expect(normalizeNote('Hotfix:\t login\n\nredirect   loop')).toBe(
      'Hotfix: login redirect loop',
    );
  });

  test('returns an empty string for whitespace-only input', () => {
    expect(normalizeNote(' \t\n ')).toBe('');
  });

  test('caps the note at 80 characters', () => {
    expect(normalizeNote('a'.repeat(100))).toBe('a'.repeat(80));
  });

  test('does not leave a trailing space where the cap falls', () => {
    expect(normalizeNote(`${'a'.repeat(79)} bcd`)).toBe('a'.repeat(79));
  });

  test('returns an empty string for non-string input', () => {
    expect(normalizeNote(undefined)).toBe('');
    expect(normalizeNote(null)).toBe('');
    expect(normalizeNote(42)).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test 2>&1 | tail -5`
Expected: FAIL — an import/`SyntaxError` or `normalizeNote is not a function`; the suite does not report `107 pass`.

- [ ] **Step 3: Implement**

In `lib/parse.js`, insert immediately before the line `/**` that precedes ` * Swap the source and target branch on a GitLab "new merge request" URL.`:

```js
export const NOTE_MAX_LENGTH = 80;

/**
 * Canonical form of a pinned-pipeline note. An empty result means "no note".
 */
export function normalizeNote(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX_LENGTH).trim();
}

```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test 2>&1 | tail -5`
Expected: `107 pass`, `0 fail`.

- [ ] **Step 5: Commit**

```bash
git add lib/parse.js test/parse.test.js
git commit -m "Add normalizeNote for pinned pipeline notes"
```

---

### Task 2: Note headline and hover action overlay

Display only: a stored `note` becomes the headline, and ✕ moves into an overlay above the duration. (✎ arrives in Task 3.)

**Files:**
- Modify: `popup.js` (pinned rendering section)
- Modify: `popup.css` (pin rules)
- Create (scratch, not committed): `$H/stub-chrome.js`, `$H/scenario.js`, `$H/sync.sh`, `$H/shot.sh`, `$H/check.sh`

**Interfaces:**
- Consumes: nothing new.
- Produces (used by Task 3): in `popup.js`, top-level functions `statusGlyph(entry) → HTMLSpanElement`, `pinMain(headlineEl, sublineEl) → HTMLSpanElement`, `pinSubline(text) → HTMLSpanElement`, `idAndRef(entry) → string`, `buildNavButton(entry) → HTMLButtonElement`, `buildActions(entry) → HTMLSpanElement` (class `pin-actions`), `buildPinnedRow(entry, index) → HTMLLIElement`, `renderPinned()`. CSS classes `.pin-actions`, `.pin-action`, `.pin-note`.

- [ ] **Step 1: Create the render harness**

```bash
H=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad/notes-harness
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
};

const area = (store) => ({
  async get(key) {
    return { [key]: structuredClone(store[key]) };
  },
  async set(values) {
    Object.assign(store, structuredClone(values));
  },
});

const access = params.get('access') === '1';
const tabUrl =
  params.get('tab') === 'pipeline'
    ? `${BASE}/-/pipelines/2817000000`
    : `${BASE}/-/merge_requests/1`;

window.chrome = {
  storage: { sync: area(syncStore), local: area(localStore) },
  tabs: { query: async () => [{ id: 1, url: tabUrl }], create() {}, update() {} },
  permissions: { contains: async () => access, request: async () => access },
};

// The network refresh lands late, to exercise re-rendering during an edit.
window.fetch = async (url) => {
  await new Promise((resolve) => setTimeout(resolve, 600));
  const id = String(url).split('/').pop();
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
```

Write `$H/scenario.js`:

```js
const params = new URLSearchParams(location.search);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rows = () => [...document.querySelectorAll('#pinned-list .pin-item')];
const editor = () => document.querySelector('.pin-note-input');
const editButton = (row) => rows()[row].querySelector('.pin-note-edit');

function type(value) {
  const input = editor();
  input.value = value;
  input.setSelectionRange(value.length, value.length);
  input.dispatchEvent(new Event('input'));
}

function press(key) {
  editor().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

const scenarios = {
  // Headless screenshots cannot hover, so mimic :hover on the first row.
  async hover() {
    const style = document.createElement('style');
    style.textContent = `
      #pinned-list .pin-item:first-child .pin-actions { opacity: 1; pointer-events: auto; }
      #pinned-list .pin-item:first-child .pin-duration { visibility: hidden; }
      #pinned-list .pin-item:first-child .pin-nav { background: var(--chip); }
      #pinned-list .pin-item:first-child .pin-handle { opacity: 0.9; }`;
    document.head.append(style);
  },
  async edit() {
    editButton(0).click();
  },
  async commit() {
    editButton(2).click();
    type('  Needs   rerun  ');
    press('Enter');
  },
  async clear() {
    editButton(0).click();
    type('   ');
    press('Enter');
  },
  async escape() {
    editButton(0).click();
    type('junk that must not save');
    press('Escape');
  },
  async other() {
    editButton(0).click();
    type('Edited first');
    editor().blur();
    editButton(1).click();
  },
  async race() {
    editButton(0).click();
    type('Draft survives refresh');
  },
  async pin() {
    document.getElementById('pin-pipeline-button').click();
  },
};

await wait(200);
await scenarios[params.get('scenario')]?.();
await wait(1200);
document.getElementById('pinned').scrollIntoView({ block: 'start' });
document.title = JSON.stringify({
  notes: window.__localStore.pinnedPipelines.map((p) => p.note ?? null),
  statuses: window.__localStore.pinnedPipelines.map((p) => p.status),
  headlines: rows().map((r) => r.querySelector('.pin-note, .pin-id')?.textContent ?? null),
  sublines: rows().map((r) => r.querySelector('.pin-ref')?.textContent ?? null),
  tooltips: rows().map((r) => r.querySelector('.pin-nav')?.title ?? null),
  editing: editor()?.value ?? null,
  focused: Boolean(editor()) && document.activeElement === editor(),
  pinHidden: document.getElementById('pin-pipeline').hidden,
});
```

Write `$H/sync.sh` (copies the current source into the harness):

```bash
#!/usr/bin/env bash
set -euo pipefail
H="$(cd "$(dirname "$0")" && pwd)"
REPO=/Users/nuwan/projects/pet-projects/gitlab-navigate
rsync -a --delete "$REPO/lib/" "$H/lib/"
cp "$REPO/popup.css" "$REPO/popup.js" "$H/"
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

Write `$H/shot.sh`:

```bash
#!/usr/bin/env bash
# usage: shot.sh "<query string>" <out.png>
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
"$CHROME" --headless --disable-gpu --hide-scrollbars --virtual-time-budget=3000 \
  --window-size=330,220 --screenshot="$2" \
  "http://localhost:8765/harness.html?$1" >/dev/null 2>&1
echo "wrote $2"
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

Then:

```bash
chmod +x "$H"/*.sh && "$H/sync.sh" && "$H/check.sh" "scenario=rest" | head -8
```

Expected: JSON prints (proves the harness runs `popup.js`), with `"notes"` equal to `["Hotfix: login redirect loop", "Retry after flaky e2e", null]`. At this point `headlines` is still `["#2816150418", "#2816150001", "#2815998877"]` — that is the failing state this task fixes.

- [ ] **Step 2: Replace the pinned row rendering in `popup.js`**

Replace everything from the line `function clearDragOverMarkers() {` up to and including the closing `}` of `renderPinned` (the line right before `// Only running pipelines have a duration that moves, so the timer exists only for them.`) with:

```js
function clearDragOverMarkers() {
  for (const li of pinnedList.querySelectorAll('.pin-item')) {
    li.classList.remove('drag-over-top', 'drag-over-bottom');
  }
}

function statusGlyph(entry) {
  const status = document.createElement('span');
  status.className = 'pin-status';
  status.dataset.status = entry.status ?? 'unknown';
  status.textContent = STATUS_GLYPHS[entry.status] ?? '●';
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

function idAndRef(entry) {
  return [`#${entry.id}`, entry.ref].filter(Boolean).join(' · ');
}

function buildNavButton(entry) {
  const noted = Boolean(entry.note);

  const headline = document.createElement('span');
  headline.className = noted ? 'pin-note' : 'pin-id';
  headline.textContent = noted ? entry.note : `#${entry.id}`;

  const duration = document.createElement('span');
  duration.className = 'pin-duration';
  duration.dataset.pipelineId = entry.id;
  duration.textContent = formatDuration(pipelineElapsedSeconds(entry.raw ?? {})) ?? '';

  const statusLine = entry.status
    ? `${entry.status}${entry.ref ? ` on ${entry.ref}` : ''}`
    : pipelineWebUrl(entry);

  const nav = document.createElement('button');
  nav.type = 'button';
  nav.className = 'pin-nav';
  nav.title = noted ? `${entry.note}\n${statusLine}` : statusLine;
  nav.append(
    statusGlyph(entry),
    pinMain(headline, pinSubline(noted ? idAndRef(entry) : entry.ref ?? '')),
    duration,
  );
  nav.addEventListener('click', () => navigate(pipelineWebUrl(entry)));
  return nav;
}

function buildActions(entry) {
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'pin-action pin-remove';
  remove.title = 'Unpin';
  remove.setAttribute('aria-label', 'Unpin this pipeline');
  remove.textContent = '✕';
  remove.addEventListener('click', async () => {
    pinnedEntries = await unpinPipeline(entry.base, entry.id);
    renderPinned();
    await refreshPinButton();
  });

  const actions = document.createElement('span');
  actions.className = 'pin-actions';
  actions.append(remove);
  return actions;
}

function buildPinnedRow(entry, index) {
  // A dedicated grab handle, rather than the whole row, so dragging never
  // fights with clicking nav or the hover actions.
  const handle = document.createElement('span');
  handle.className = 'pin-handle';
  handle.draggable = true;
  handle.title = 'Drag to reorder';
  handle.setAttribute('aria-label', 'Drag to reorder');

  const item = document.createElement('li');
  item.className = 'pin-item';
  item.append(handle, buildNavButton(entry), buildActions(entry));

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

    const moved = pinnedEntries[draggedIndex];
    pinnedEntries = await reorderPinned(moved.base, moved.id, targetIndex);
    renderPinned();
  });

  return item;
}

function renderPinned() {
  pinnedList.replaceChildren(...pinnedEntries.map(buildPinnedRow));
  pinned.hidden = pinnedEntries.length === 0;
  scheduleTick();
}
```

- [ ] **Step 3: Update `popup.css`**

Replace:

```css
.pin-item {
  display: flex;
  align-items: center;
  gap: 2px;
}
```

with:

```css
.pin-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
}
```

Replace:

```css
.pin-id {
  font-variant-numeric: tabular-nums;
}
```

with:

```css
.pin-id {
  font-variant-numeric: tabular-nums;
}

.pin-note {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Replace:

```css
.pin-duration {
  flex: none;
  font-variant-numeric: tabular-nums;
}
```

with:

```css
/* The min-width reserves room for the hover actions that sit on top of it. */
.pin-duration {
  flex: none;
  min-width: 40px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
```

Replace this whole block:

```css
.pin-remove {
  flex: none;
  padding: 4px 6px;
  font-size: 12px;
  line-height: 1;
  color: var(--muted);
  background: none;
  border: none;
  border-radius: 6px;
  opacity: 0;
}

.pin-item:hover .pin-remove,
.pin-item:focus-within .pin-remove {
  opacity: 1;
}

.pin-remove:hover {
  color: var(--error);
  background: var(--chip);
}
```

with:

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

.pin-item:hover .pin-actions,
.pin-item:focus-within .pin-actions {
  opacity: 1;
  pointer-events: auto;
}

.pin-item:hover .pin-duration,
.pin-item:focus-within .pin-duration {
  visibility: hidden;
}

.pin-action {
  padding: 4px 5px;
  font-size: 12px;
  line-height: 1;
  color: var(--muted);
  background: none;
  border: none;
  border-radius: 6px;
}

.pin-action:hover {
  color: var(--fg);
  background: var(--chip);
}

.pin-remove:hover {
  color: var(--error);
}
```

- [ ] **Step 4: Verify behavior and render**

```bash
H=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad/notes-harness
node --check popup.js && bun test 2>&1 | tail -3
"$H/sync.sh" && "$H/check.sh" "scenario=rest"
"$H/shot.sh" "scenario=rest" "$H/t2-rest.png"
"$H/shot.sh" "scenario=hover" "$H/t2-hover.png"
```

Expected:
- `107 pass`, `0 fail`.
- `headlines`: `["Hotfix: login redirect loop", "Retry after flaky e2e", "#2815998877"]`
- `sublines`: `["#2816150418 · dev/1.0.11", "#2816150001 · fix-plot-layout-pro-expansion-issue", "2846-regression-fix"]`
- `tooltips[0]`: `"Hotfix: login redirect loop\nrunning on dev/1.0.11"`; `tooltips[2]`: `"failed on 2846-regression-fix"`
- `t2-rest.png` (open with the Read tool): notes as the headlines in normal text, `#id · branch` beneath, durations right-aligned, no ✕ visible, "Hotfix: login redirect loop" not truncated.
- `t2-hover.png`: first row shows ✕ where its duration was; its duration is not visible.

- [ ] **Step 5: Commit**

```bash
git add popup.js popup.css
git commit -m "Show pinned pipeline notes as the row headline, hover actions over duration"
```

---

### Task 3: Edit mode, ✎ button, editor on pin

**Files:**
- Modify: `lib/storage.js` (insert before the `reorderPinned` doc comment)
- Modify: `popup.js`
- Modify: `popup.css`

**Interfaces:**
- Consumes: `NOTE_MAX_LENGTH`, `normalizeNote` (Task 1); `statusGlyph`, `pinMain`, `pinSubline`, `idAndRef`, `buildNavButton`, `buildActions`, `buildPinnedRow`, `renderPinned`, `.pin-actions` / `.pin-action` (Task 2).
- Produces: `setPinnedNote(base: string, id: string, note: string) → Promise<Array>`; in `popup.js`: `startEditing(entry)`, `commitEdit() → Promise<void>`, `cancelEdit()`; CSS `.pin-edit`, `.pin-note-input`, `.pin-note-edit`.

- [ ] **Step 1: Confirm the failing behavior**

```bash
H=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad/notes-harness
"$H/sync.sh" && "$H/check.sh" "scenario=commit" | head -3
```

Expected: no JSON — the scenario throws because there is no `.pin-note-edit` button, so the page title is never replaced and `check.sh` prints a Python `JSONDecodeError` traceback.

- [ ] **Step 2: Add `setPinnedNote` to `lib/storage.js`**

Insert immediately before the line `/**` that precedes ` * Move a pinned pipeline to a new position in the list.`:

```js
/**
 * Set a pinned pipeline's note, or remove it when `note` is ''.
 */
export async function setPinnedNote(base, id, note) {
  const previous = await getPinned();
  return savePinned(
    previous.map((p) => {
      if (p.base !== base || p.id !== id) return p;
      const next = { ...p };
      if (note) next.note = note;
      else delete next.note;
      return next;
    }),
  );
}

```

- [ ] **Step 3: Update `popup.js` imports and state**

Replace:

```js
  formatDuration,
  normalizeBase,
```

with:

```js
  formatDuration,
  NOTE_MAX_LENGTH,
  normalizeBase,
  normalizeNote,
```

Replace:

```js
  reorderPinned,
  unpinPipeline,
```

with:

```js
  reorderPinned,
  setPinnedNote,
  unpinPipeline,
```

Replace:

```js
let draggedIndex = null;
```

with:

```js
let draggedIndex = null;
// The row being edited, kept outside the DOM so list rebuilds cannot lose it:
// { base, id, draft, selectionStart, selectionEnd, cancelled }
let editing = null;
// True while renderPinned rebuilds the list; blurs it causes are not saves.
let rendering = false;
```

- [ ] **Step 4: Add the ✎ button**

Replace the whole `buildActions` function from Task 2 with:

```js
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
  remove.setAttribute('aria-label', 'Unpin this pipeline');
  remove.textContent = '✕';
  remove.addEventListener('click', async () => {
    pinnedEntries = await unpinPipeline(entry.base, entry.id);
    renderPinned();
    await refreshPinButton();
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

function buildEditor(entry) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'pin-note-input';
  input.maxLength = NOTE_MAX_LENGTH;
  input.placeholder = "What's this pipeline for?";
  input.setAttribute('aria-label', `Note for pipeline #${entry.id}`);
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
  editor.append(statusGlyph(entry), pinMain(input, pinSubline(idAndRef(entry))));
  return editor;
}
```

- [ ] **Step 5: Render the edited row as an editor**

In `buildPinnedRow`, replace:

```js
function buildPinnedRow(entry, index) {
  // A dedicated grab handle, rather than the whole row, so dragging never
  // fights with clicking nav or the hover actions.
  const handle = document.createElement('span');
  handle.className = 'pin-handle';
  handle.draggable = true;
  handle.title = 'Drag to reorder';
  handle.setAttribute('aria-label', 'Drag to reorder');

  const item = document.createElement('li');
  item.className = 'pin-item';
  item.append(handle, buildNavButton(entry), buildActions(entry));
```

with:

```js
function buildPinnedRow(entry, index) {
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
  if (isEditing) item.append(handle, buildEditor(entry));
  else item.append(handle, buildNavButton(entry), buildActions(entry));
```

Replace the Task 2 `renderPinned`:

```js
function renderPinned() {
  pinnedList.replaceChildren(...pinnedEntries.map(buildPinnedRow));
  pinned.hidden = pinnedEntries.length === 0;
  scheduleTick();
}
```

with:

```js
function renderPinned() {
  rendering = true;
  try {
    pinnedList.replaceChildren(...pinnedEntries.map(buildPinnedRow));
  } finally {
    rendering = false;
  }
  pinned.hidden = pinnedEntries.length === 0;

  const input = pinnedList.querySelector('.pin-note-input');
  if (input) {
    input.focus();
    input.setSelectionRange(editing.selectionStart, editing.selectionEnd);
  }

  scheduleTick();
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
  renderPinned();
}

// State is cleared before the write, but the list is only rebuilt after it, so a
// click that caused this blur (e.g. ✎ on another row) still lands on its button.
async function commitEdit() {
  if (!editing) return;
  const { base, id, draft } = editing;
  editing = null;
  pinnedEntries = await setPinnedNote(base, id, normalizeNote(draft));
  renderPinned();
}

function cancelEdit() {
  editing = null;
  renderPinned();
}
```

- [ ] **Step 6: Open the editor after pinning**

In `doPinPipeline`, replace:

```js
  pinnedEntries = await pinPipeline(entry);
  renderPinned();
  await refreshPinButton();
```

with:

```js
  pinnedEntries = await pinPipeline(entry);
  startEditing(pinnedEntries.find((p) => p.base === entry.base && p.id === entry.id));
  await refreshPinButton();
```

- [ ] **Step 7: Style the editor**

In `popup.css`, insert immediately before `/* A 2x3 dot grid drawn with box-shadow`:

```css
.pin-edit {
  display: grid;
  grid-template-columns: 15px 1fr;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  padding: 2px 8px 4px;
}

/* Pull the box left by its own padding + border so typed text lines up with the
   headlines of the rows around it. */
.pin-edit input[type="text"] {
  width: calc(100% + 7px);
  margin-left: -7px;
  padding: 1px 6px;
}

```

- [ ] **Step 8: Verify**

```bash
H=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad/notes-harness
node --check popup.js && node --check lib/storage.js && bun test 2>&1 | tail -3
"$H/sync.sh"
for s in rest commit clear escape other "race&access=1" "pin&tab=pipeline&access=1"; do
  echo "== $s"; "$H/check.sh" "scenario=$s" | python3 -c '
import sys, json; d = json.load(sys.stdin)
print({k: d[k] for k in ("notes", "headlines", "editing", "focused", "pinHidden", "statuses")})'
done
"$H/shot.sh" "scenario=hover" "$H/t3-hover.png"
"$H/shot.sh" "scenario=edit" "$H/t3-edit.png"
"$H/shot.sh" "scenario=race&access=1" "$H/t3-race.png"
"$H/shot.sh" "scenario=pin&tab=pipeline&access=1" "$H/t3-pin.png"
```

Expected:
- `107 pass`, `0 fail`.
- `rest`: notes `['Hotfix: login redirect loop', 'Retry after flaky e2e', None]`, editing `None`.
- `commit`: notes `[…, …, 'Needs rerun']`, headlines[2] `'Needs rerun'`, editing `None`.
- `clear`: notes `[None, 'Retry after flaky e2e', None]`, headlines[0] `'#2816150418'`.
- `escape`: notes unchanged from `rest`, headlines[0] `'Hotfix: login redirect loop'`, editing `None`.
- `other`: notes `['Edited first', 'Retry after flaky e2e', None]`, editing `'Retry after flaky e2e'`, focused `True`, headlines `['Edited first', None, '#2815998877']`.
- `race&access=1`: notes unchanged from `rest`, statuses `['running', 'running', 'running']`, editing `'Draft survives refresh'`, focused `True`.
- `pin&tab=pipeline&access=1`: notes `[None, 'Hotfix: login redirect loop', 'Retry after flaky e2e', None]`, editing `''`, focused `True`, pinHidden `True`.
- `t3-hover.png`: ✎ and ✕ side by side where row 1's duration was.
- `t3-edit.png`: row 1 is a text box holding "Hotfix: login redirect loop" with the accent focus border, `#2816150418 · dev/1.0.11` beneath, text aligned with the headlines below.
- `t3-race.png`: row 1 box holds "Draft survives refresh".
- `t3-pin.png`: top row is an empty box showing the placeholder "What's this pipeline for?"; the "Pin this pipeline" button is gone.

If `focused` is `False` in `other`/`race`/`pin` while `editing` is correct, check whether headless sets `document.activeElement` without window focus before changing code: re-run with `--remote-debugging-port=0` added to `check.sh`; only treat it as a bug if the screenshot also lacks the focus border.

- [ ] **Step 9: Commit**

```bash
git add lib/storage.js popup.js popup.css
git commit -m "Add editable notes to pinned pipelines, opened on pin and via hover pencil"
```

---

### Task 4: Screenshots, docs, version 0.18.0

**Files:**
- Modify: `tools/screenshot.sh`, `manifest.json`, `CHANGELOG.md`, `README.md`, `docs/superpowers/specs/2026-08-04-gitlab-navigate-design.md`
- Regenerate: `docs/popup-light.png`, `docs/popup-dark.png`

**Interfaces:**
- Consumes: the final row markup from Tasks 2–3 (`.pin-note`, `.pin-ref`, `.pin-actions` containing `.pin-action.pin-note-edit` and `.pin-action.pin-remove`).
- Produces: nothing consumed later.

- [ ] **Step 1: Update the screenshot sample rows**

In `tools/screenshot.sh`, replace:

```python
pins = [
    ('running', '&#x25CF;', '2816150418', 'dev/1.0.11', '4m 12s'),
    ('success', '&#x2713;', '2816150001', 'fix-plot-layout-pro-expansion-issue', '7m 3s'),
    ('failed', '&#x2715;', '2815998877', '2846-regression-fix', '2m 41s'),
]
pin_items = '\n'.join(
    f'<li class="pin-item">'
    f'<span class="pin-handle" aria-label="Drag to reorder"></span>'
    f'<button type="button" class="pin-nav">'
    f'<span class="pin-status" data-status="{status}">{glyph}</span>'
    f'<span class="pin-main"><span class="pin-id">#{pid}</span>'
    f'<span class="pin-ref">{ref}</span></span>'
    f'<span class="pin-duration">{duration}</span>'
    f'</button>'
    f'<button type="button" class="pin-remove" aria-label="Unpin this pipeline">&#x2715;</button>'
    f'</li>'
    for status, glyph, pid, ref, duration in pins)
```

with:

```python
pins = [
    ('running', '&#x25CF;', '2816150418', 'dev/1.0.11', '4m 12s',
     'Hotfix: login redirect loop'),
    ('success', '&#x2713;', '2816150001', 'fix-plot-layout-pro-expansion-issue', '7m 3s',
     'Retry after flaky e2e'),
    ('failed', '&#x2715;', '2815998877', '2846-regression-fix', '2m 41s', None),
]


def pin_item(status, glyph, pid, ref, duration, note):
    # Mirrors buildNavButton()/buildActions() in popup.js.
    headline = (f'<span class="pin-note">{note}</span>' if note
                else f'<span class="pin-id">#{pid}</span>')
    subline = f'#{pid} &#xB7; {ref}' if note else ref
    return (
        f'<li class="pin-item">'
        f'<span class="pin-handle" aria-label="Drag to reorder"></span>'
        f'<button type="button" class="pin-nav">'
        f'<span class="pin-status" data-status="{status}">{glyph}</span>'
        f'<span class="pin-main">{headline}<span class="pin-ref">{subline}</span></span>'
        f'<span class="pin-duration">{duration}</span>'
        f'</button>'
        f'<span class="pin-actions">'
        f'<button type="button" class="pin-action pin-note-edit" aria-label="Edit note">&#x270E;</button>'
        f'<button type="button" class="pin-action pin-remove" aria-label="Unpin this pipeline">&#x2715;</button>'
        f'</span>'
        f'</li>')


pin_items = '\n'.join(pin_item(*pin) for pin in pins)
```

- [ ] **Step 2: Regenerate and inspect**

Run: `./tools/screenshot.sh`
Expected: two lines, `popup-light.png: 330x… bg=(255, 255, 255)` and `popup-dark.png: 330x… bg=(30, 30, 38)`.
Open both PNGs with the Read tool: Pinned pipelines shows the two notes as headlines with `#id · branch` beneath and the third row as `#2815998877`; no ✎/✕ visible; Recent still fully visible (not cut off).

- [ ] **Step 3: Bump the version**

```bash
python3 - <<'PY'
import json, collections
m = json.load(open('manifest.json'), object_pairs_hook=collections.OrderedDict)
m['version'] = '0.18.0'
json.dump(m, open('manifest.json', 'w'), indent=2)
open('manifest.json', 'a').write('\n')
PY
grep '"version"' manifest.json
```

Expected: `"version": "0.18.0",`

In `docs/superpowers/specs/2026-08-04-gitlab-navigate-design.md` replace `  "version": "0.17.0",` with `  "version": "0.18.0",`.

- [ ] **Step 4: CHANGELOG**

In `CHANGELOG.md` replace:

```markdown
# Changelog

## 0.17.0
```

with:

```markdown
# Changelog

## 0.18.0

- Pinned pipelines can carry a short **note** (up to 80 characters) so a long list
  reads at a glance. A noted row shows the note as its headline, with the pipeline
  number and branch on the small line beneath (`#2816150418 · dev/1.0.11`); rows
  without a note look as before.
- Hover a row for **✎** to add or edit its note. Enter or clicking away saves, Esc
  cancels, and saving an empty note removes it.
- Pinning a pipeline opens its note box straight away; press Esc or click away to
  skip.
- ✎ and ✕ now appear over the row's duration on hover instead of reserving their own
  column, so notes get the full row width when you're just reading the list.
- A status refresh that lands while you type keeps your draft and cursor, and Esc
  never saves — even if the browser closes the popup on Esc.

## 0.17.0
```

- [ ] **Step 5: README**

In `README.md` replace:

```markdown
row to open the pipeline; hover it to reveal an unpin button.
```

with:

```markdown
row to open the pipeline; hover it to reveal **✎** (note) and **✕** (unpin).
```

and replace:

```markdown
Drag the grip handle (⠿) on the left of a row to reorder it — a line shows where it will
land. Only the handle is draggable, so dragging never conflicts with clicking the row to
open it. Order persists across popup opens.
```

with:

```markdown
Drag the grip handle (⠿) on the left of a row to reorder it — a line shows where it will
land. Only the handle is draggable, so dragging never conflicts with clicking the row to
open it. Order persists across popup opens.

**Notes.** Give a pipeline a short note (up to 80 characters) and it becomes the row's
headline, with the pipeline number and branch on the line below — handy once several
pipelines are pinned. Pinning opens the note box straight away (Esc or click away to
skip); later, hover the row and click ✎. Enter or clicking away saves, Esc cancels, and
saving an empty note removes it. Notes are stored with the pin on this machine and go
away when you unpin.
```

- [ ] **Step 6: Main design doc**

In `docs/superpowers/specs/2026-08-04-gitlab-navigate-design.md`, replace:

```
pipelineElapsedSeconds(pipeline, now) -> number | null
```

with:

```
pipelineElapsedSeconds(pipeline, now) -> number | null
normalizeNote(raw) -> string                     // canonical note; '' = no note
```

Then find the paragraph that starts `**Order is explicit, not derived.**` and insert this new paragraph directly after the end of that paragraph (before `## Data Flow`):

```markdown

**Notes.** Each pinned entry may carry a `note` (≤ 80 characters, normalized by
`normalizeNote`, written by `setPinnedNote`, which deletes the field for `''`). A noted
row uses the note as its headline and `#id · branch` as its second line. ✎ and ✕ live
in a `.pin-actions` overlay above the duration so they reserve no width at rest. Edit
mode swaps the row's nav button for an input (an input cannot sit inside a button);
its state is held in `editing` outside the DOM so `renderPinned` rebuilds — notably the
status refresh — restore the draft and caret. Full design:
`2026-09-16-pinned-pipeline-notes-design.md`.
```

- [ ] **Step 7: Final verification**

```bash
bun test 2>&1 | tail -3
python3 -m json.tool manifest.json >/dev/null && echo manifest valid
npx --yes web-ext@latest lint --source-dir . --self-hosted 2>&1 | grep -Ev "npm warn" | tail -6
git status --short
```

Expected: `107 pass` / `0 fail`; `manifest valid`; lint `errors 0`, `notices 0`, `warnings 0`; status lists only `CHANGELOG.md`, `README.md`, `docs/popup-dark.png`, `docs/popup-light.png`, `docs/superpowers/specs/2026-08-04-gitlab-navigate-design.md`, `manifest.json`, `tools/screenshot.sh`.

- [ ] **Step 8: Commit (do not push)**

```bash
git add CHANGELOG.md README.md docs/popup-dark.png docs/popup-light.png \
  docs/superpowers/specs/2026-08-04-gitlab-navigate-design.md manifest.json tools/screenshot.sh
git commit -m "Release pinned pipeline notes (0.18.0)"
git log --oneline -5
```

Then report to the user, including the manual checks they must do in a real browser (from the spec's Testing section): Esc in the editor never changes the note; clicking the page mid-edit — did it save; pinning opens the editor focused, including on the first pin with the permission prompt; a status refresh while typing keeps the draft.
