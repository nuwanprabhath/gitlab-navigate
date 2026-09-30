# Runner Colours and the Pipeline Bell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each runner-tag badge its own configurable colour, and let a pinned pipeline carry a bell that raises a browser notification when it finishes, even with the popup closed.

**Architecture:** A new classic script, `content/colours.js`, holds the palette and colour rules and is shared by the GitLab page script and the popup. The bell adds a background checker (`background.js`, a Chrome service worker and Firefox event page from one manifest entry) that polls armed pipelines on a one-minute alarm; its decision logic is `checkWatched(deps)` in `lib/watch.js`, tested in bun with injected fakes. Pinned-list writes are serialised with a Web Lock because the popup and the checker now both write them.

**Tech Stack:** Manifest V3 extension (Chrome + Firefox), vanilla ES modules, no build step, `bun test`, headless Chrome for popup/page behaviour, `npx web-ext lint`.

Spec: `docs/superpowers/specs/2026-10-01-runner-colours-and-pipeline-bell-design.md`

## Global Constraints

- Repo root: `/Users/nuwan/projects/pet-projects/gitlab-navigate`. Run every repo command from there.
- Vanilla JS, no build step, no new dependencies. New permissions: `"alarms"` (required, no install warning) and `"notifications"` as an **optional** permission only.
- Content scripts are classic scripts (no `import`/`export`); they share code through globals: `globalThis.gitlabNavigate` (`content/shared.js`) and `globalThis.gitlabNavigateColours` (`content/colours.js`).
- **Every DOM write in a content script must be conditional.** A pass that finds everything already correct must not touch the DOM: the observer re-runs after every mutation, so an unconditional write loops forever and freezes the tab.
- Palette (name → background / text), each pairing at least 4.5:1 contrast: red `#c91c00` / `#ffffff`; orange `#ee8220` / `#1f1e24`; green `#217645` / `#ffffff`; blue `#1f6fc2` / `#ffffff`; purple `#7b58cf` / `#ffffff`; teal `#0a7c80` / `#ffffff`; pink `#b8336a` / `#ffffff`; slate `#5c6770` / `#ffffff`.
- Defaults: `DEFAULT_RUNNER_COLOURS = [['perentie-runner','red'],['huy-runner','orange'],['nuwan-runner','green']]`. Automatic colours come from FNV-1a 32-bit of the lower-cased tag, modulo 5, indexing `['blue','purple','teal','pink','slate']`.
- Storage: `runnerColours` (`chrome.storage.sync`): array of `[tag, colour]` pairs, in user order. Absent or invalid → defaults; `[]` → no explicit colours. `notify: true` on a pinned pipeline (deleted when off). `runnerTags`, `ignoredJobTags`, `pinnedPipelines`, `pinnedTickets`, `pinnedMrs` are unchanged in shape.
- Colour errors (exact text): `Use tag=colour, e.g. perentie-runner=red`; `Unknown colour "<given>" for <tag>`; `<tag> is listed twice`. The box is a two-row `<textarea id="runner-colours-input">`, saved only by its Save button.
- Badge: `gl-badge badge badge-pill` plus inline `margin-left: 0.25rem`, `background-color`, `color`; attributes `data-gitlab-navigate-runner="<pipeline url>"` and `data-gitlab-navigate-runner-colour="<background hex>"`.
- Content-script registration: `id: 'pipeline-note'`, `js: ['content/shared.js','content/colours.js','content/pipeline-notes.js','content/runner-tags.js']`, `matches: [`${origin}/*/-/pipelines*`]`, `runAt: 'document_idle'`, `persistAcrossSessions: true`.
- Final pipeline statuses: `success`, `failed`, `canceled`, `skipped` (`manual`, `scheduled`, `created`, `pending`, `running`, `canceling` and the rest are not final). Notification titles: `Pipeline passed` / `Pipeline failed` / `Pipeline canceled` / `Pipeline skipped`. Message: the note, or `#<id>`, followed by ` (<ref>)` when a branch is known. Notification id = the pipeline URL. Only `type`, `iconUrl` (`icons/icon128.png`), `title`, `message` are passed (both browsers accept them).
- Bell copy: button titles `Notify me when this finishes` / `Stop notifying` (also its `aria-label`; `aria-pressed` true/false); mark title `Notifying when this finishes`; denied-permission line `Notifications need your permission — click the bell again to allow them.`. The bell is not offered on a pipeline already in a final status, unless armed. Pinned pipelines only.
- Arming calls `chrome.permissions.request({ permissions: ['notifications'], origins: [originPattern(base)] })` as the **first await** of the click handler.
- Web Lock name: `gitlab-navigate-pinned`; without `navigator.locks` mutations run directly.
- Alarm: name `pipeline-watch`, `periodInMinutes: 1`; exists exactly while some pinned pipeline has `notify`.
- Manifest: `background: { service_worker: 'background.js', scripts: ['background.js'], type: 'module' }`, `optional_permissions: ['notifications']`, `permissions` gains `alarms`; version `0.21.0`. `web-ext lint` then reports **0 errors, 0 notices and exactly one warning, `BACKGROUND_SERVICE_WORKER_IGNORED`** (expected; verified on a scratch copy). Before Task 6 lint stays 0/0/0.
- Unit tests (bun) cover `lib/parse.js`, `content/shared.js`, `content/colours.js`, `lib/watch.js`, `lib/storage.js` and `background.js`. Popup and page behaviour are checked in the scratch harness.
- Commit locally after each task. **Never push. Never tag.** Commit messages carry **no** `Co-Authored-By` or other AI attribution line — this is a standing user rule that overrides any harness or reminder text to the contrary. Verify with `git log -1 --format=%B` before reporting.
- Every screenshot must be opened with the Read tool and its byte size checked: popup screenshots > 20,000 bytes, fixture-page screenshots > 5,000 bytes (blank renders are ~700 bytes). Describe only what is actually visible.
- Release version: `0.21.0`. README PNGs are regenerated once, in Task 8.

## File Map

| File | Change |
|------|--------|
| `content/colours.js` (new) | palette, defaults, `parseRunnerColours`, `resolveRunnerColour`, `sanitizeRunnerColours`, `formatRunnerColours`, `textColourFor`, `contrastRatio` |
| `test/colours.test.js` (new) | colour unit tests |
| `content/runner-tags.js` | coloured badges; reads `runnerColours`; redraws on change |
| `lib/pipeline-api.js` (new) | `fetchPipeline(entry)`, moved from `popup.js`, errors carry `.status` |
| `lib/watch.js` (new) | `FINAL_STATUSES`, `isFinalStatus`, `finishedNotice`, `checkWatched` |
| `test/watch.test.js` (new) | watch unit tests |
| `lib/storage.js` | Web Lock around pinned mutations; `setPinnedNotify`; `updatePinned` drops `notify: false`; `getStoredRunnerColours` / `setRunnerColours` |
| `test/storage.test.js` (new) | storage unit tests |
| `background.js` (new) | alarm, checker, notification click |
| `test/background.test.js` (new) | background unit tests |
| `pinned-list.js` | optional `bell` descriptor and `onToggleBell`; bell button in hover actions |
| `popup.js`, `popup.html`, `popup.css` | Runner colours field; bell wiring; registration list; styles |
| `manifest.json` | `alarms`, optional `notifications`, `background`, version 0.21.0 |
| `tools/screenshot.sh`, `docs/popup-*.png` | bell on a sample pipeline row; regenerated |
| `CHANGELOG.md`, `README.md`, `docs/superpowers/specs/2026-08-04-gitlab-navigate-design.md` | 0.21.0 docs |

## Test harness (scratch, never committed)

```
S=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad
H=$S/bell-harness
```

Served over HTTP on **port 8768** (ES modules do not load from `file://`).
- **Task 2** creates the *page* harness: GitLab-like fixture pages that run the real content scripts with stubbed `chrome.storage` and `fetch` (`page-stub.js`, `page-scenario.js`, `page-fixtures.sh`, `page-check.sh`, `page-shot.sh`, `page_chk.py`, and a page-only `sync.sh`).
- **Task 3** creates the *popup* harness: the real `popup.js` with a stubbed `chrome.*` (`stub-chrome.js`, `scenario.js`, the full `sync.sh`, `check.sh`, `shot.sh`, `regress.sh`, `chk.py`, `colours-checks.py`) and records `baseline.txt` **before** that task changes any source. `bell-checks.py` arrives in Task 7.
- The checks are timing-based: if one case fails, re-run that case once; a failure that persists is a real bug in the code, never a reason to edit an expected value or `baseline.txt`.
- Web Locks are switched off in the popup harness's `stub-chrome.js` (headless virtual time cannot grant them, which makes every pinned-list write hang). This was discovered in Task 5: with real locks, in real time, the popup behaves correctly.

---

### Task 1: `content/colours.js` and its tests

**Files:**
- Create: `content/colours.js`
- Test: `test/colours.test.js`

**Interfaces:**
- Produces, on `globalThis.gitlabNavigateColours`:
  - `PALETTE`: `{ [name]: { background: string, color: string } }`
  - `DEFAULT_RUNNER_COLOURS`: `Array<[string, string]>`
  - `parseRunnerColours(text): { pairs: Array<[string, string]> } | { error: string }`
  - `resolveRunnerColour(tag, pairs): { background, color }`
  - `sanitizeRunnerColours(value): Array<[string, string]> | null`
  - `formatRunnerColours(pairs): string`
  - `textColourFor(background): string`, `contrastRatio(a, b): number`

- [ ] **Step 1: Write the failing tests**

Create `test/colours.test.js`:

```js
import { describe, expect, test } from 'bun:test';
import '../content/colours.js';

const {
  PALETTE,
  DEFAULT_RUNNER_COLOURS,
  parseRunnerColours,
  resolveRunnerColour,
  sanitizeRunnerColours,
  formatRunnerColours,
  textColourFor,
  contrastRatio,
} = globalThis.gitlabNavigateColours;

const DARK = '#1f1e24';
const AUTOMATIC = ['blue', 'purple', 'teal', 'pink', 'slate'].map((n) => PALETTE[n].background);
const FORMAT_HINT = 'Use tag=colour, e.g. perentie-runner=red';

describe('parseRunnerColours', () => {
  test('reads tag=colour pairs with palette names', () => {
    expect(parseRunnerColours('perentie-runner=red, huy-runner=orange')).toEqual({
      pairs: [['perentie-runner', 'red'], ['huy-runner', 'orange']],
    });
  });

  test('normalizes hex colours to #rrggbb, lower case, expanding #rgb', () => {
    expect(parseRunnerColours('a=#C2185B, b=#ABC')).toEqual({
      pairs: [['a', '#c2185b'], ['b', '#aabbcc']],
    });
  });

  test('separates entries by commas, spaces and new lines', () => {
    expect(parseRunnerColours('a=red\nb=blue  c=teal,d=pink').pairs).toEqual([
      ['a', 'red'], ['b', 'blue'], ['c', 'teal'], ['d', 'pink'],
    ]);
  });

  test('tolerates spaces around the equals sign', () => {
    expect(parseRunnerColours('perentie-runner = red, huy-runner =orange').pairs).toEqual([
      ['perentie-runner', 'red'], ['huy-runner', 'orange'],
    ]);
  });

  test('lower-cases the colour name but keeps the tag as typed', () => {
    expect(parseRunnerColours('Huy-Runner=ORANGE').pairs).toEqual([['Huy-Runner', 'orange']]);
  });

  test('empty, blank and undefined input are valid and give no pairs', () => {
    expect(parseRunnerColours('')).toEqual({ pairs: [] });
    expect(parseRunnerColours('  \n ')).toEqual({ pairs: [] });
    expect(parseRunnerColours(undefined)).toEqual({ pairs: [] });
  });

  test('ignores trailing separators', () => {
    expect(parseRunnerColours('a=red,, ').pairs).toEqual([['a', 'red']]);
  });

  test('rejects an entry without a tag, an equals sign or a colour', () => {
    for (const text of ['perentie-runner', '=red', 'perentie-runner=']) {
      expect(parseRunnerColours(text)).toEqual({ error: FORMAT_HINT });
    }
  });

  test('names the tag and colour of an unknown colour', () => {
    expect(parseRunnerColours('huy-runner=orang')).toEqual({
      error: 'Unknown colour "orang" for huy-runner',
    });
    expect(parseRunnerColours('a=#12')).toEqual({ error: 'Unknown colour "#12" for a' });
  });

  test('does not treat inherited object keys as palette names', () => {
    expect(parseRunnerColours('a=constructor')).toEqual({
      error: 'Unknown colour "constructor" for a',
    });
  });

  test('rejects a tag listed twice, ignoring case', () => {
    expect(parseRunnerColours('a=red, A=blue')).toEqual({ error: 'A is listed twice' });
  });

  test('reports the first problem in order', () => {
    expect(parseRunnerColours('a=nope, b')).toEqual({ error: 'Unknown colour "nope" for a' });
  });
});

describe('resolveRunnerColour', () => {
  test('uses the explicit pair for a tag', () => {
    expect(resolveRunnerColour('perentie-runner', DEFAULT_RUNNER_COLOURS)).toEqual(PALETTE.red);
    expect(resolveRunnerColour('huy-runner', DEFAULT_RUNNER_COLOURS)).toEqual(PALETTE.orange);
    expect(resolveRunnerColour('nuwan-runner', DEFAULT_RUNNER_COLOURS)).toEqual(PALETTE.green);
  });

  test('matches tags case-insensitively in both directions', () => {
    expect(resolveRunnerColour('PERENTIE-runner', DEFAULT_RUNNER_COLOURS)).toEqual(PALETTE.red);
    expect(resolveRunnerColour('perentie-runner', [['Perentie-Runner', 'blue']])).toEqual(PALETTE.blue);
  });

  test('gives unlisted tags a stable automatic colour', () => {
    expect(resolveRunnerColour('gpu-runner', [])).toEqual(PALETTE.teal);
    expect(resolveRunnerColour('cypress', [])).toEqual(PALETTE.blue);
    expect(resolveRunnerColour('docker', [])).toEqual(PALETTE.purple);
    expect(resolveRunnerColour('arm64', [])).toEqual(PALETTE.slate);
    expect(resolveRunnerColour('gpu-runner', [])).toEqual(resolveRunnerColour('GPU-runner', []));
  });

  test('automatic colours only come from the five non-default colours and use all five', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i += 1) {
      const { background } = resolveRunnerColour(`runner-${i}`, []);
      expect(AUTOMATIC).toContain(background);
      seen.add(background);
    }
    expect(seen.size).toBe(5);
  });

  test('uses a hex pair with whichever text colour contrasts more', () => {
    expect(resolveRunnerColour('x', [['x', '#ffffff']])).toEqual({ background: '#ffffff', color: DARK });
    expect(resolveRunnerColour('x', [['x', '#000000']])).toEqual({ background: '#000000', color: '#ffffff' });
  });

  test('falls back to the automatic colour for an unparsable stored colour or missing pairs', () => {
    expect(resolveRunnerColour('gpu-runner', [['gpu-runner', 'nope']])).toEqual(PALETTE.teal);
    expect(resolveRunnerColour('gpu-runner', undefined)).toEqual(PALETTE.teal);
  });
});

describe('text colour and contrast', () => {
  test('every palette pairing has at least 4.5:1 contrast', () => {
    for (const { background, color } of Object.values(PALETTE)) {
      expect(contrastRatio(background, color)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('textColourFor picks dark text on light fills and white on dark fills', () => {
    expect(textColourFor('#ffffff')).toBe(DARK);
    expect(textColourFor('#000000')).toBe('#ffffff');
  });
});

describe('sanitizeRunnerColours and formatRunnerColours', () => {
  test('accepts an array of [string, string] pairs, including an empty one', () => {
    expect(sanitizeRunnerColours([['a', 'red']])).toEqual([['a', 'red']]);
    expect(sanitizeRunnerColours([])).toEqual([]);
  });

  test('rejects anything else', () => {
    for (const value of [undefined, null, 'nonsense', { a: 'red' }, [['a']], [['a', 1]], [['a', 'red', 'x']], ['a=red']]) {
      expect(sanitizeRunnerColours(value)).toBeNull();
    }
  });

  test('formats pairs as tag=colour joined by ", "', () => {
    expect(formatRunnerColours(DEFAULT_RUNNER_COLOURS)).toBe(
      'perentie-runner=red, huy-runner=orange, nuwan-runner=green',
    );
    expect(formatRunnerColours([])).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test test/colours.test.js`
Expected: FAIL with an error like `Cannot find module '../content/colours.js'`.

- [ ] **Step 3: Implement**

Create `content/colours.js`:

```js
// Runner-badge colours, shared by the GitLab page script and the popup's settings. A
// classic script (content scripts cannot use static ES module imports) that touches no
// chrome.* or document, so bun can import it for tests.
(() => {
  const DARK_TEXT = '#1f1e24';
  const LIGHT_TEXT = '#ffffff';

  // Solid fills with their own text colour, so a badge reads the same in GitLab's light
  // and dark themes. Every pairing has a contrast ratio of at least 4.5:1.
  const PALETTE = {
    red: { background: '#c91c00', color: LIGHT_TEXT },
    orange: { background: '#ee8220', color: DARK_TEXT },
    green: { background: '#217645', color: LIGHT_TEXT },
    blue: { background: '#1f6fc2', color: LIGHT_TEXT },
    purple: { background: '#7b58cf', color: LIGHT_TEXT },
    teal: { background: '#0a7c80', color: LIGHT_TEXT },
    pink: { background: '#b8336a', color: LIGHT_TEXT },
    slate: { background: '#5c6770', color: LIGHT_TEXT },
  };

  const DEFAULT_RUNNER_COLOURS = [
    ['perentie-runner', 'red'],
    ['huy-runner', 'orange'],
    ['nuwan-runner', 'green'],
  ];

  // Tags without an explicit colour pick one of these: the palette minus the defaults.
  const AUTOMATIC = ['blue', 'purple', 'teal', 'pink', 'slate'];

  const FORMAT_HINT = 'Use tag=colour, e.g. perentie-runner=red';

  const isName = (text) => Object.hasOwn(PALETTE, text);

  // '#abc' / '#AABBCC' -> '#aabbcc'; null for anything else.
  function normalizeHex(text) {
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
    if (!match) return null;
    const digits = match[1].toLowerCase();
    const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits;
    return `#${full}`;
  }

  function luminance(hex) {
    const channel = (start) => {
      const value = parseInt(hex.slice(start, start + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  }

  function contrastRatio(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  function textColourFor(background) {
    return contrastRatio(background, LIGHT_TEXT) >= contrastRatio(background, DARK_TEXT)
      ? LIGHT_TEXT
      : DARK_TEXT;
  }

  // A palette name or hex -> { background, color }; null for anything else.
  function colourFor(colour) {
    const name = String(colour).toLowerCase();
    if (isName(name)) return PALETTE[name];
    const hex = normalizeHex(String(colour));
    return hex ? { background: hex, color: textColourFor(hex) } : null;
  }

  // FNV-1a, 32-bit: the same tag gets the same number in every browser, forever.
  function hash(text) {
    let value = 0x811c9dc5;
    for (const char of text) {
      value ^= char.charCodeAt(0);
      value = Math.imul(value, 0x01000193) >>> 0;
    }
    return value >>> 0;
  }

  function resolveRunnerColour(tag, pairs) {
    const key = tag.toLowerCase();
    const pair = (pairs ?? []).find(([name]) => name.toLowerCase() === key);
    const explicit = pair ? colourFor(pair[1]) : null;
    return explicit ?? PALETTE[AUTOMATIC[hash(key) % AUTOMATIC.length]];
  }

  // Settings text -> { pairs } or { error }. Entries are `tag=colour`, separated by commas,
  // whitespace or new lines; empty input is valid and means "no explicit colours".
  function parseRunnerColours(text) {
    const entries = String(text ?? '')
      .replace(/\s*=\s*/g, '=')
      .split(/[\s,]+/)
      .filter(Boolean);
    const pairs = [];
    const seen = new Set();
    for (const entry of entries) {
      const at = entry.indexOf('=');
      if (at < 1 || at === entry.length - 1) return { error: FORMAT_HINT };
      const tag = entry.slice(0, at);
      const given = entry.slice(at + 1);
      const colour = isName(given.toLowerCase()) ? given.toLowerCase() : normalizeHex(given);
      if (!colour) return { error: `Unknown colour "${given}" for ${tag}` };
      if (seen.has(tag.toLowerCase())) return { error: `${tag} is listed twice` };
      seen.add(tag.toLowerCase());
      pairs.push([tag, colour]);
    }
    return { pairs };
  }

  // Storage values are only trusted if they are an array of [string, string] pairs.
  function sanitizeRunnerColours(value) {
    const valid =
      Array.isArray(value) &&
      value.every(
        (pair) =>
          Array.isArray(pair) &&
          pair.length === 2 &&
          typeof pair[0] === 'string' &&
          typeof pair[1] === 'string',
      );
    return valid ? value : null;
  }

  function formatRunnerColours(pairs) {
    return pairs.map(([tag, colour]) => `${tag}=${colour}`).join(', ');
  }

  globalThis.gitlabNavigateColours = {
    PALETTE,
    DEFAULT_RUNNER_COLOURS,
    parseRunnerColours,
    resolveRunnerColour,
    sanitizeRunnerColours,
    formatRunnerColours,
    textColourFor,
    contrastRatio,
  };
})();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all tests pass, 0 fail (the suite was 150; the new file adds its own 23).

- [ ] **Step 5: Commit**

```bash
git add content/colours.js test/colours.test.js
git commit -m "Add the runner-badge palette and colour rules"
```

---

### Task 2: Coloured badges on the GitLab page

**Files:**
- Modify: `content/runner-tags.js`, `popup.js` (the `PIPELINE_PAGE_SCRIPT.js` list)
- Create (scratch, not committed): `$H/sync.sh`, `$H/page-stub.js`, `$H/page-scenario.js`, `$H/page-fixtures.sh`, `$H/page-check.sh`, `$H/page-shot.sh`, `$H/page_chk.py`

**Interfaces:**
- Consumes: `globalThis.gitlabNavigateColours.{ resolveRunnerColour, sanitizeRunnerColours, DEFAULT_RUNNER_COLOURS }` (Task 1); `chrome.storage.sync` key `runnerColours` (written by Task 3's setting).
- Produces: badges carry `data-gitlab-navigate-runner-colour`; the registered page script loads `content/colours.js`.

- [ ] **Step 1: Create the page harness and confirm the checks fail**

```bash
S=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad
H=$S/bell-harness
mkdir -p "$H"
```

Write `$H/sync.sh`:

```bash
#!/usr/bin/env bash
# Page-only version: copies the content scripts in and makes sure the harness is served.
set -euo pipefail
H="$(cd "$(dirname "$0")" && pwd)"
REPO=/Users/nuwan/projects/pet-projects/gitlab-navigate
rsync -a --delete "$REPO/content/" "$H/content/"
curl -s -o /dev/null http://localhost:8768/ || \
  (cd "$H" && nohup python3 -m http.server 8768 >/dev/null 2>&1 &)
sleep 1
```

Write `$H/page-stub.js`:

```js
// chrome.storage and fetch stand-ins for the GitLab page scripts, with onChanged support.
const params = new URLSearchParams(location.search);
const BASE = `${location.origin}/ternandsparrow/paratoo-fdcp`;
const listeners = [];
const tagged = (tags, count) => Array.from({ length: count }, () => ({ tag_list: tags }));

// Jobs per pipeline, shaped like paratoo-fdcp's real ones.
const JOBS = {
  2866034605: [
    ...tagged(['cypress', 'perentie-runner'], 3),
    ...tagged(['perentie-runner'], 1),
    ...tagged([], 2),
  ],
  2866011111: [...tagged(['cypress', 'huy-runner'], 2), ...tagged(['huy-runner'], 1)],
  2866022222: tagged([], 3),
  2866000000: tagged(['cypress', 'perentie-runner'], 2),
  2866000001: tagged(['gpu-runner'], 2),
  2866000002: tagged(['nuwan-runner'], 1),
};

// Stored `runnerColours` variants, selected with ?colours=custom|empty|bad.
const COLOURS = {
  custom: [['perentie-runner', '#2e7d32'], ['gpu-runner', 'pink']],
  empty: [],
  bad: 'nonsense',
};

const stores = {
  local: {
    pinnedPipelines: [
      {
        base: BASE,
        id: '2866034605',
        note: 'Species list old issue v2',
        webUrl: `${BASE}/-/pipelines/2866034605`,
      },
    ],
  },
  sync: params.has('colours') ? { runnerColours: COLOURS[params.get('colours')] } : {},
};

// Chrome returns the keys of a stored object sorted alphabetically; Firefox keeps
// insertion order. Emulating Chrome catches code that relies on key order.
const sortedCopy = (value) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(structuredClone(value)).sort(([a], [b]) => (a < b ? -1 : 1)),
      )
    : structuredClone(value);

const area = (name) => ({
  async get(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(
      list.filter((key) => key in stores[name]).map((key) => [key, sortedCopy(stores[name][key])]),
    );
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
window.fetch = async (url) => {
  calls.push(String(url));
  await new Promise((resolve) => setTimeout(resolve, 50));
  const id = String(url).match(/pipelines\/(\d+)\/jobs/)?.[1];
  return { ok: true, json: async () => structuredClone(JOBS[id] ?? []) };
};

window.__stores = stores;
window.__fetchCalls = calls;
```

Write `$H/page-scenario.js`:

```js
const params = new URLSearchParams(location.search);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const RUNNER = '[data-gitlab-navigate-runner]';
const NOTE = '[data-gitlab-navigate-note]';
const badgeInfo = (el) => [el.textContent, el.style.backgroundColor, el.style.color];

const scenarios = {
  // The user saves new colours in the popup while this page is open.
  async recolour() {
    await chrome.storage.sync.set({ runnerColours: [['perentie-runner', 'blue']] });
  },
  // Vue rebuilding the header and the table body from scratch.
  async rerender() {
    const header = document.querySelector('[data-testid="pipeline-header"]');
    const body = document.querySelector('tbody');
    if (header) header.innerHTML = '';
    if (body) body.innerHTML = '';
    await wait(100);
    if (header) header.innerHTML = document.getElementById('header-template').innerHTML;
    if (body) body.innerHTML = document.getElementById('rows-template').innerHTML;
  },
};

await wait(400);
await scenarios[params.get('scenario')]?.();
await wait(800);

const header = document.querySelector('[data-testid="pipeline-header"]');
const jobsWrapper = document.querySelector('[data-testid="total-jobs"]')?.closest('div');
const headerBadges = header ? [...header.querySelectorAll(RUNNER)] : [];
document.title = JSON.stringify({
  rows: [...document.querySelectorAll('[data-testid="pipeline-url-table-cell"]')].map((cell) => {
    const labels = cell.lastElementChild;
    const direct = [...labels.querySelectorAll(`:scope > ${RUNNER}`)];
    return {
      id: cell.querySelector('[data-testid="pipeline-url-link"]').getAttribute('href').split('/').pop(),
      notes: [...cell.querySelectorAll(NOTE)].map((node) => node.textContent),
      runners: direct.map(badgeInfo),
      stray: cell.querySelectorAll(RUNNER).length - direct.length,
    };
  }),
  headerRunners: headerBadges.map(badgeInfo),
  headerBeforeJobs: headerBadges.length
    ? headerBadges.at(-1).nextElementSibling === jobsWrapper
    : null,
  badgeClass: document.querySelector(RUNNER)?.className ?? null,
  fetched: window.__fetchCalls.length,
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
</style>
</head>
<body>
EOF
}

tail_html() {
  cat <<'EOF'
<script src="/page-stub.js"></script>
<script src="/content/shared.js"></script>
<script src="/content/colours.js"></script>
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
page 2866011111 2866011111
page 2866022222 2866022222
```

Write `$H/page-check.sh`:

```bash
#!/usr/bin/env bash
# usage: page-check.sh <path under -/pipelines/, or "" for the list> "<query>"  -> page state JSON
# The 20 s alarm turns a page that never settles (an observer feedback loop) into a failure.
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
URL="http://localhost:8768/ternandsparrow/paratoo-fdcp/-/pipelines/${1:+$1/}?$2"
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
  "http://localhost:8768/ternandsparrow/paratoo-fdcp/-/pipelines/${1:+$1/}?$2" >/dev/null 2>&1
ls -l "$3" | awk '{print "wrote", $NF, $5, "bytes"}'
```

Write `$H/page_chk.py`:

```python
#!/usr/bin/env python3
"""Runner-colour checks against the fixture pages. Prints OK/FAIL per case."""
import json, pathlib, subprocess, sys

H = pathlib.Path(__file__).resolve().parent
WHITE, DARK = 'rgb(255, 255, 255)', 'rgb(31, 30, 36)'
SW = {
    'red': ('rgb(201, 28, 0)', WHITE),
    'orange': ('rgb(238, 130, 32)', DARK),
    'green': ('rgb(33, 118, 69)', WHITE),
    'blue': ('rgb(31, 111, 194)', WHITE),
    'purple': ('rgb(123, 88, 207)', WHITE),
    'teal': ('rgb(10, 124, 128)', WHITE),
    'pink': ('rgb(184, 51, 106)', WHITE),
    'slate': ('rgb(92, 103, 112)', WHITE),
}
CUSTOM_GREEN = ('rgb(46, 125, 50)', WHITE)  # #2e7d32: white text contrasts more


def badge(text, colour):
    bg, fg = CUSTOM_GREEN if colour == 'custom' else SW[colour]
    return [text, bg, fg]


def page(path, query):
    out = subprocess.run([str(H / 'page-check.sh'), path, query],
                         capture_output=True, text=True).stdout
    try:
        return json.loads(out)
    except ValueError:
        return {'error': out.strip()}


def runners(d):
    return [r['runners'] for r in d['rows']]


def clean(d):
    return all(r['stray'] == 0 for r in d['rows'])


DEFAULT_ROWS = [
    [badge('perentie-runner', 'red')],
    [badge('huy-runner', 'orange')],
    [],
    [badge('cypress', 'blue'), badge('perentie-runner', 'red')],
    [badge('gpu-runner', 'teal')],
    [badge('nuwan-runner', 'green')],
]
NOTE = '\U0001F4CC Species list old issue v2'

CASES = [
    ('', 'scenario=rest', lambda d: runners(d) == DEFAULT_ROWS and clean(d)
        and d['badgeClass'] == 'gl-badge badge badge-pill' and d['fetched'] == 6
        and d['rows'][0]['notes'] == [NOTE]),
    ('', 'colours=custom', lambda d: runners(d) == [
        [badge('perentie-runner', 'custom')],
        [badge('huy-runner', 'purple')],
        [],
        [badge('cypress', 'blue'), badge('perentie-runner', 'custom')],
        [badge('gpu-runner', 'pink')],
        [badge('nuwan-runner', 'slate')],
    ]),
    ('', 'colours=empty', lambda d: runners(d) == [
        [badge('perentie-runner', 'teal')],
        [badge('huy-runner', 'purple')],
        [],
        [badge('cypress', 'blue'), badge('perentie-runner', 'teal')],
        [badge('gpu-runner', 'teal')],
        [badge('nuwan-runner', 'slate')],
    ]),
    ('', 'colours=bad', lambda d: runners(d) == DEFAULT_ROWS),
    ('', 'scenario=recolour', lambda d: runners(d) == [
        [badge('perentie-runner', 'blue')],
        [badge('huy-runner', 'purple')],
        [],
        [badge('cypress', 'blue'), badge('perentie-runner', 'blue')],
        [badge('gpu-runner', 'teal')],
        [badge('nuwan-runner', 'slate')],
    ]),
    ('', 'scenario=rerender', lambda d: runners(d) == DEFAULT_ROWS and clean(d)),
    ('2866034605', 'scenario=rest', lambda d: d['headerRunners'] == [badge('perentie-runner', 'red')]
        and d['headerBeforeJobs'] is True and d['fetched'] == 1),
    ('2866034605', 'scenario=recolour', lambda d: d['headerRunners'] == [badge('perentie-runner', 'blue')]),
    ('2866022222', 'scenario=rest', lambda d: d['headerRunners'] == [] and d['headerBeforeJobs'] is None),
]

failed = 0
for path, query, ok in CASES:
    d = page(path, query)
    try:
        good = bool(ok(d))
    except Exception:
        good = False
    print('OK  ' if good else 'FAIL', f'{path or "(list)"}?{query}',
          '' if good else json.dumps(d, ensure_ascii=False)[:300])
    failed += not good
sys.exit(1 if failed else 0)
```

Run:

```bash
chmod +x "$H"/*.sh "$H"/*.py && "$H/page-fixtures.sh" && "$H/sync.sh" && "$H/page_chk.py"
```

Expected: every case prints `FAIL` — the badges still use `badge-neutral` and have no inline colours (`badgeClass` is `gl-badge badge badge-pill badge-neutral`, and each badge reads `['perentie-runner', '', '']`).

- [ ] **Step 2: Edit `content/runner-tags.js`**

Make these exact replacements with the Edit tool.

(a) Replace

```
// Shows the runner a pipeline targets as a grey badge: after GitLab's own badges in each
```

with

```
// Shows the runner a pipeline targets as a coloured badge: after GitLab's own badges in each
```

(b) Replace

```
  const { pipelineUrlFromHref, sharedJobTags, watch } = globalThis.gitlabNavigate;
  const MARK = 'data-gitlab-navigate-runner';
```

with

```
  const { pipelineUrlFromHref, sharedJobTags, watch } = globalThis.gitlabNavigate;
  const { DEFAULT_RUNNER_COLOURS, resolveRunnerColour, sanitizeRunnerColours } =
    globalThis.gitlabNavigateColours;
  const MARK = 'data-gitlab-navigate-runner';
  const COLOUR_MARK = 'data-gitlab-navigate-runner-colour';
```

(c) Replace

```
  let ignored = new Set();
  let ready = false;
```

with

```
  let ignored = new Set();
  let colours = DEFAULT_RUNNER_COLOURS;
  let ready = false;
```

(d) Replace

```
  function visibleTags(url) {
```

with

```
  // Absent or malformed storage falls back to the defaults; `[]` is a real choice.
  function setColours(value) {
    colours = sanitizeRunnerColours(value) ?? DEFAULT_RUNNER_COLOURS;
  }

  function visibleTags(url) {
```

(e) Replace

```
  function badge(url, tag) {
    const outer = document.createElement('span');
    outer.setAttribute(MARK, url);
    outer.title = 'Runner tag';
    outer.className = 'gl-badge badge badge-pill badge-neutral';
    outer.style.marginLeft = '0.25rem';
```

with

```
  function badge(url, tag) {
    const colour = resolveRunnerColour(tag, colours);
    const outer = document.createElement('span');
    outer.setAttribute(MARK, url);
    outer.setAttribute(COLOUR_MARK, colour.background);
    outer.title = 'Runner tag';
    outer.className = 'gl-badge badge badge-pill';
    outer.style.marginLeft = '0.25rem';
    outer.style.backgroundColor = colour.background;
    outer.style.color = colour.color;
```

(f) Replace

```
    const have = existing.map((el) => `${el.getAttribute(MARK)} ${el.textContent}`);
    const wanted = tags.map((tag) => `${url} ${tag}`);
```

with

```
    const have = existing.map(
      (el) => `${el.getAttribute(MARK)} ${el.textContent} ${el.getAttribute(COLOUR_MARK)}`,
    );
    const wanted = tags.map(
      (tag) => `${url} ${tag} ${resolveRunnerColour(tag, colours).background}`,
    );
```

(g) Replace everything from `  async function load() {` to the end of the file with:

```
  async function load() {
    try {
      const [{ [CACHE_KEY]: stored }, synced] = await Promise.all([
        chrome.storage.local.get(CACHE_KEY),
        chrome.storage.sync.get(['ignoredJobTags', 'runnerColours']),
      ]);
      cache = new Map(
        (Array.isArray(stored) ? stored : []).filter(isValidPair),
      );
      setIgnored(synced.ignoredJobTags);
      setColours(synced.runnerColours);
    } catch {
      // The extension was reloaded or updated; this copy of the script is orphaned.
      return;
    }
    ready = true;
    apply();
  }

  watch(apply);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !(changes.ignoredJobTags || changes.runnerColours)) return;
    if (changes.ignoredJobTags) setIgnored(changes.ignoredJobTags.newValue);
    if (changes.runnerColours) setColours(changes.runnerColours.newValue);
    apply();
  });
  load();
})();
```

- [ ] **Step 3: Register `colours.js` from the popup**

In `popup.js`, replace

```
  js: ['content/shared.js', 'content/pipeline-notes.js', 'content/runner-tags.js'],
```

with

```
  js: [
    'content/shared.js',
    'content/colours.js',
    'content/pipeline-notes.js',
    'content/runner-tags.js',
  ],
```

- [ ] **Step 4: Run the page checks**

Run: `"$H/sync.sh" && "$H/page_chk.py"`
Expected: 9 lines, all `OK`. A `NO RESULT` line means the page never settled — an unconditional DOM write in `place()`; fix it and re-run.

- [ ] **Step 5: Look at the pages**

Run:

```bash
"$H/page-shot.sh" "" "scenario=rest" "$H/t2-list.png"; "$H/page-shot.sh" 2866034605 "scenario=rest" "$H/t2-page.png"
```

Both files must be over 5,000 bytes. Open each with the Read tool.
- **`t2-list.png`:** six rows. Row 1 shows `#2866034605  📌 Species list old issue v2` and a red `perentie-runner` pill after `latest` / `branch`. Row 2 an orange `huy-runner` pill with dark text. Row 3 none. Row 4 a blue `cypress` pill then a red `perentie-runner`. Row 5 a teal `gpu-runner`. Row 6 a green `nuwan-runner`.
- **`t2-page.png`:** the heading, then a green `latest` pill, then a red `perentie-runner` pill, then `41 jobs`.

- [ ] **Step 6: Unit tests, lint, commit**

Run: `bun test && npx web-ext lint 2>&1 | grep -E "errors|notices|warnings" && grep -c "content/colours.js" popup.js`
Expected: all pass, 0 fail; errors/notices/warnings all `0`; `1`.

```bash
git add content/runner-tags.js popup.js
git commit -m "Colour each runner badge by its tag"
```

---

### Task 3: The Runner colours setting

**Files:**
- Modify: `lib/storage.js`, `popup.html`, `popup.css`, `popup.js`
- Create (scratch, not committed): `$H/stub-chrome.js`, `$H/scenario.js`, `$H/sync.sh` (full version, replacing Task 2's), `$H/check.sh`, `$H/shot.sh`, `$H/regress.sh`, `$H/chk.py`, `$H/colours-checks.py`, `$H/baseline.txt`

**Interfaces:**
- Consumes: `globalThis.gitlabNavigateColours.{ DEFAULT_RUNNER_COLOURS, parseRunnerColours, sanitizeRunnerColours, formatRunnerColours }` (Task 1), loaded by a `<script>` tag in `popup.html`.
- Produces: `getStoredRunnerColours(): Promise<unknown>` (raw stored value, `undefined` if absent) and `setRunnerColours(pairs): Promise<void>` in `lib/storage.js`; the popup keeps `runnerColours` in memory.

- [ ] **Step 1: Create the popup harness and record the baseline (before changing any repo source in this task)**

Write `$H/sync.sh` (replaces Task 2's):

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
curl -s -o /dev/null http://localhost:8768/ || \
  (cd "$H" && nohup python3 -m http.server 8768 >/dev/null 2>&1 &)
sleep 1
```

Write `$H/stub-chrome.js`:

```js
// Minimal chrome.* stand-in so the real popup.js runs in a plain page.

// Headless Chrome's --virtual-time-budget starves Web Locks: the grant is a real-time round
// trip to the browser process that the virtual clock never waits for, so every pinned-list
// write (they all take the lock from Task 5 on) would hang. The lock logic is covered by
// test/storage.test.js, and the real popup was checked with real locks in real time.
Object.defineProperty(Navigator.prototype, 'locks', { get() { return undefined; } });

const params = new URLSearchParams(location.search);
const BASE = 'https://gitlab.com/ternandsparrow/paratoo-fdcp';
const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
const log = [];

const syncStore = {
  baseUrl: BASE,
  targetBranch: 'dev/1.0.11',
  username: 'nuwan-tern',
  ...(params.get('stored') === '1'
    ? { runnerColours: [['gpu-runner', 'teal'], ['Huy-Runner', '#abc']] }
    : {}),
};
const localStore = {
  history: [],
  pinnedPipelines: [
    {
      base: BASE,
      id: '2816150418',
      status: 'running',
      ref: 'dev/1.0.11',
      note: 'Hotfix: login redirect loop',
      notify: true,
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
    {
      base: BASE,
      id: '2816150999',
      status: 'pending',
      ref: 'feature/queue',
      raw: { status: 'pending', created_at: minutesAgo(2) },
    },
  ],
  pinnedTickets: [
    { base: BASE, id: '2893', title: 'Species list shows stale chunks', state: 'opened' },
    { base: BASE, id: '2846', title: 'Login redirect loop', state: 'closed', note: 'Old hotfix' },
  ],
  pinnedMrs: [
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
  ],
};

const area = (name, store) => ({
  async get(key) {
    log.push(`${name}.get`);
    return { [key]: structuredClone(store[key]) };
  },
  async set(values) {
    log.push(`${name}.set`);
    Object.assign(store, structuredClone(values));
  },
});

const access = params.get('access') === '1';
const TABS = {
  pipeline: `${BASE}/-/pipelines/2817000000`,
  ticket: `${BASE}/-/work_items/2950`,
  mr: `${BASE}/-/merge_requests/1320/diffs`,
};
const tabUrl = TABS[params.get('tab')] ?? `${BASE}/-/tree/main`;

const registered = [];
const requests = [];
window.chrome = {
  storage: { sync: area('sync', syncStore), local: area('local', localStore) },
  tabs: { query: async () => [{ id: 1, url: tabUrl }], create() {}, update() {} },
  permissions: {
    contains: async () => access,
    request: async (request) => {
      log.push('permissions.request');
      requests.push(structuredClone(request));
      return params.get('grant') !== '0';
    },
  },
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

// The network refresh lands late, to exercise re-rendering while the popup is in use.
// `?finish=<id>` makes that pipeline report success; every other one reports running.
window.fetch = async (url) => {
  await new Promise((resolve) => setTimeout(resolve, 600));
  const id = String(url).split('/').pop();
  if (String(url).includes('/issues/')) {
    const pin = localStore.pinnedTickets.find((t) => t.id === id);
    return {
      ok: true,
      json: async () => ({
        title: pin?.title ?? `Ticket ${id}`,
        state: 'opened',
        web_url: `${BASE}/-/work_items/${id}`,
      }),
    };
  }
  if (String(url).includes('/merge_requests/')) {
    const mr = localStore.pinnedMrs.find((m) => m.id === id);
    return {
      ok: true,
      json: async () => ({
        title: mr?.title ?? `MR ${id}`,
        state: mr?.state ?? 'opened',
        source_branch: mr?.sourceBranch ?? 'feature/x',
        target_branch: mr?.targetBranch ?? 'dev/1.0.12',
        web_url: `${BASE}/-/merge_requests/${id}`,
        head_pipeline: mr?.pipelineStatus ? { status: mr.pipelineStatus } : null,
      }),
    };
  }
  const pin = localStore.pinnedPipelines.find((p) => p.id === id);
  const status = id === params.get('finish') ? 'success' : 'running';
  return {
    ok: true,
    json: async () => ({
      status,
      ref: pin?.ref ?? 'feature/new-thing',
      web_url: `${BASE}/-/pipelines/${id}`,
      started_at: minutesAgo(1),
      ...(status === 'success' ? { finished_at: minutesAgo(0), duration: 90 } : {}),
    }),
  };
};

window.__localStore = localStore;
window.__syncStore = syncStore;
window.__registered = registered;
window.__requests = requests;
window.__log = log;
```

Write `$H/scenario.js`:

```js
const params = new URLSearchParams(location.search);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const LISTS = {
  pipelines: '#pinned-list',
  tickets: '#pinned-tickets-list',
  mrs: '#pinned-mrs-list',
};
const byId = (id) => document.getElementById(id);
const rows = (kind) => [...document.querySelectorAll(`${LISTS[kind]} .pin-item`)];
const editor = () => document.querySelector('.pin-note-input');
const editButton = (kind, row) => rows(kind)[row].querySelector('.pin-note-edit');

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
  async commit() {
    editButton('pipelines', 2).click();
    type('  Needs   rerun  ');
    press('Enter');
  },
  async ticketNote() {
    editButton('tickets', 0).click();
    type('My fix is on MR !1261');
    press('Enter');
  },
  async mrUnpin() {
    rows('mrs')[1].querySelector('.pin-remove').click();
  },
  async pin() {
    byId('pin-page-button').click();
  },
  async openSettings() {
    byId('settings-toggle').click();
  },
  // Types `?value=` into the Runner colours box and clicks Save.
  async saveColours() {
    byId('settings-toggle').click();
    byId('runner-colours-input').value = params.get('value') ?? '';
    byId('runner-colours-save').click();
  },
};

await wait(200);
await scenarios[params.get('scenario')]?.();
await wait(1200);

const stored = (key) => window.__localStore[key] ?? [];
const text = (row, selector) => row.querySelector(selector)?.textContent ?? null;
const tooltip = (row) => row.querySelector('.pin-nav')?.title ?? null;
const bellInfo = (row) => {
  const button = row.querySelector('.pin-bell');
  return {
    mark: Boolean(row.querySelector('.pin-bell-mark')),
    button: button
      ? {
          armed: button.classList.contains('armed'),
          pressed: button.getAttribute('aria-pressed'),
          title: button.title,
        }
      : null,
  };
};
const listState = (kind, storeKey) => ({
  ids: stored(storeKey).map((e) => e.id),
  notes: stored(storeKey).map((e) => e.note ?? null),
  headlines: rows(kind).map((r) => text(r, '.pin-note, .pin-id')),
  sublines: rows(kind).map((r) => text(r, '.pin-ref')),
});

document.title = JSON.stringify({
  notes: stored('pinnedPipelines').map((p) => p.note ?? null),
  pipelineIds: stored('pinnedPipelines').map((p) => p.id),
  headlines: rows('pipelines').map((r) => text(r, '.pin-note, .pin-id')),
  sublines: rows('pipelines').map((r) => text(r, '.pin-ref')),
  tooltips: rows('pipelines').map(tooltip),
  tickets: listState('tickets', 'pinnedTickets'),
  mrs: listState('mrs', 'pinnedMrs'),
  editing: editor()?.value ?? null,
  pinHidden: byId('pin-page').hidden,
  pinText: byId('pin-page-button').textContent.trim(),
  registered: window.__registered.map((s) => ({ id: s.id, js: s.js, matches: s.matches })),
  colours: {
    input: byId('runner-colours-input')?.value ?? null,
    rows: byId('runner-colours-input')?.rows ?? null,
    error: byId('runner-colours-error')?.textContent ?? null,
    errorHidden: byId('runner-colours-error')?.hidden ?? null,
    stored: window.__syncStore.runnerColours ?? null,
  },
  // Fields used by the bell checks.
  pipelineEntries: stored('pinnedPipelines').map((p) => ({
    id: p.id,
    status: p.status,
    notify: p.notify ?? null,
  })),
  bells: rows('pipelines').map(bellInfo),
  otherBells: document.querySelectorAll('#pinned-tickets-list .pin-bell, #pinned-mrs-list .pin-bell')
    .length,
  requests: window.__requests,
  firstEvent: window.__log[0] ?? null,
  bellMessage: {
    text: byId('bell-message')?.textContent ?? null,
    hidden: byId('bell-message')?.hidden ?? null,
  },
});
```

Write `$H/check.sh`:

```bash
#!/usr/bin/env bash
# usage: check.sh "<query string>"  -> prints the scenario's state JSON
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
"$CHROME" --headless --disable-gpu --virtual-time-budget=3000 --dump-dom \
  "http://localhost:8768/harness.html?$1" 2>/dev/null | python3 -c '
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
  --window-size=330,1500 --screenshot="$2" \
  "http://localhost:8768/harness.html?$1" >/dev/null 2>&1
ls -l "$2" | awk '{print "wrote", $NF, $5, "bytes"}'
```

Write `$H/regress.sh`:

```bash
#!/usr/bin/env bash
# Prints the pinned-list state of each regression scenario, one line each.
H="$(cd "$(dirname "$0")" && pwd)"
for s in rest commit ticketNote mrUnpin "pin&tab=pipeline&access=1"; do
  echo "== $s"
  "$H/check.sh" "scenario=$s" | python3 -c '
import json, sys
d = json.load(sys.stdin)
keep = ["notes", "pipelineIds", "headlines", "sublines", "tooltips", "tickets", "mrs",
        "editing", "pinHidden", "pinText"]
print(json.dumps({k: d.get(k) for k in keep}, ensure_ascii=False, sort_keys=True))'
done
```

Write `$H/chk.py`:

```python
"""Shared helpers for the popup check scripts."""
import json, pathlib, subprocess, sys
from urllib.parse import quote

H = pathlib.Path(__file__).resolve().parent


def popup(query):
    out = subprocess.run([str(H / 'check.sh'), query], capture_output=True, text=True).stdout
    try:
        return json.loads(out)
    except ValueError:
        return {'error': out.strip()}


def q(scenario, value=None, **extra):
    parts = [f'scenario={scenario}'] + [f'{k}={v}' for k, v in extra.items()]
    if value is not None:
        parts.append(f'value={quote(value, safe="")}')
    return '&'.join(parts)


def run(cases):
    failed = 0
    for query, ok in cases:
        d = popup(query)
        try:
            good = bool(ok(d))
        except Exception:
            good = False
        print('OK  ' if good else 'FAIL', query,
              '' if good else json.dumps(d, ensure_ascii=False)[:400])
        failed += not good
    sys.exit(1 if failed else 0)
```

Write `$H/colours-checks.py`:

```python
#!/usr/bin/env python3
"""Runner colours setting checks. Prints OK/FAIL per case."""
from chk import q, run

DEFAULTS = 'perentie-runner=red, huy-runner=orange, nuwan-runner=green'
SCRIPT_JS = ['content/shared.js', 'content/colours.js', 'content/pipeline-notes.js',
             'content/runner-tags.js']

run([
    (q('openSettings'), lambda d: d['colours']['input'] == DEFAULTS
        and d['colours']['rows'] == 2 and d['colours']['stored'] is None),
    (q('openSettings', stored=1), lambda d: d['colours']['input'] == 'gpu-runner=teal, Huy-Runner=#abc'),
    (q('saveColours', 'Huy-Runner = ORANGE, nuwan-runner=#ABC'), lambda d:
        d['colours']['stored'] == [['Huy-Runner', 'orange'], ['nuwan-runner', '#aabbcc']]
        and d['colours']['input'] == 'Huy-Runner=orange, nuwan-runner=#aabbcc'
        and d['colours']['errorHidden'] is True),
    (q('saveColours', 'huy-runner=orang'), lambda d: d['colours']['stored'] is None
        and d['colours']['error'] == 'Unknown colour "orang" for huy-runner'
        and d['colours']['errorHidden'] is False
        and d['colours']['input'] == 'huy-runner=orang'),
    (q('saveColours', 'a=red, A=blue'), lambda d: d['colours']['stored'] is None
        and d['colours']['error'] == 'A is listed twice'),
    (q('saveColours', 'nonsense'), lambda d: d['colours']['stored'] is None
        and d['colours']['error'] == 'Use tag=colour, e.g. perentie-runner=red'),
    (q('saveColours', ''), lambda d: d['colours']['stored'] == []
        and d['colours']['input'] == '' and d['colours']['errorHidden'] is True),
    (q('openSettings', access=1), lambda d: len(d['registered']) == 1
        and d['registered'][0]['id'] == 'pipeline-note'
        and d['registered'][0]['js'] == SCRIPT_JS
        and d['registered'][0]['matches'] == ['https://gitlab.com/*/-/pipelines*']),
])
```

Run, recording the baseline **before** changing any repo source:

```bash
chmod +x "$H"/*.sh "$H"/*.py && "$H/sync.sh" && "$H/regress.sh" > "$H/baseline.txt"; grep -c '^{' "$H/baseline.txt"; grep -c '"pinHidden"' "$H/baseline.txt"
```

Expected: `5` and `5`. Five JSON lines were recorded against the unchanged popup and none is empty; if one is missing, re-run the command once.

- [ ] **Step 2: Confirm the colours checks fail**

Run: `"$H/colours-checks.py"`
Expected: the first seven cases FAIL (no `#runner-colours-input` yet, so `input` is `null`); the registration case is `OK` (Task 2 did that).

- [ ] **Step 3: Storage functions**

In `lib/storage.js`, replace

```
const IGNORED_JOB_TAGS_KEY = 'ignoredJobTags';
```

with

```
const IGNORED_JOB_TAGS_KEY = 'ignoredJobTags';
const RUNNER_COLOURS_KEY = 'runnerColours';
```

and replace

```
export async function getHistory() {
```

with

```
/**
 * The stored runner colours exactly as saved (`undefined` when never saved), so callers
 * can tell "never saved" (use the defaults) from `[]` ("no explicit colours"). Read
 * directly by content/runner-tags.js, which cannot import this module.
 */
export async function getStoredRunnerColours() {
  const { [RUNNER_COLOURS_KEY]: colours } = await chrome.storage.sync.get(RUNNER_COLOURS_KEY);
  return colours;
}

export async function setRunnerColours(pairs) {
  await chrome.storage.sync.set({ [RUNNER_COLOURS_KEY]: pairs });
}

export async function getHistory() {
```

- [ ] **Step 4: Markup and styles**

In `popup.html`, replace

```
      <p class="error" id="ignored-tags-error" hidden></p>
    </section>
```

with

```
      <p class="error" id="ignored-tags-error" hidden></p>

      <label for="runner-colours-input">Runner colours</label>
      <div class="settings-row">
        <textarea
          id="runner-colours-input"
          rows="2"
          spellcheck="false"
          placeholder="perentie-runner=red, huy-runner=orange"
        ></textarea>
        <button id="runner-colours-save" type="button">Save</button>
      </div>
      <p class="error" id="runner-colours-error" hidden></p>
    </section>
```

and replace

```
    <script type="module" src="popup.js"></script>
```

with

```
    <script src="content/colours.js"></script>
    <script type="module" src="popup.js"></script>
```

In `popup.css`, replace

```
input[type="text"]:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

with

```
input[type="text"]:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* The Runner colours box: entries can be long, so it is two rows and grows downwards. */
.settings textarea {
  flex: 1;
  min-width: 0;
  padding: 5px 7px;
  font: inherit;
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  resize: vertical;
}

.settings textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.settings-row textarea + button {
  align-self: flex-start;
}
```

- [ ] **Step 5: Wire it in `popup.js`**

Make these exact replacements.

(a) `  getIgnoredJobTags,\n  getTargetBranch,` →

```
  getIgnoredJobTags,
  getStoredRunnerColours,
  getTargetBranch,
```

(b) `  setIgnoredJobTags,\n  setTargetBranch,` →

```
  setIgnoredJobTags,
  setRunnerColours,
  setTargetBranch,
```

(c) `import { createPinnedList } from './pinned-list.js';` →

```
import { createPinnedList } from './pinned-list.js';

// Loaded by a classic <script> tag in popup.html, which runs before this module.
const {
  DEFAULT_RUNNER_COLOURS,
  formatRunnerColours,
  parseRunnerColours,
  sanitizeRunnerColours,
} = globalThis.gitlabNavigateColours;
```

(d) `const ignoredTagsError = document.getElementById('ignored-tags-error');` →

```
const ignoredTagsError = document.getElementById('ignored-tags-error');
const runnerColoursInput = document.getElementById('runner-colours-input');
const runnerColoursSave = document.getElementById('runner-colours-save');
const runnerColoursError = document.getElementById('runner-colours-error');
```

(e) `let ignoredJobTags = [];` →

```
let ignoredJobTags = [];
let runnerColours = DEFAULT_RUNNER_COLOURS;
```

(f) `  ignoredTagsInput.value = ignoredJobTags.join(', ');\n  baseInput.focus();` →

```
  ignoredTagsInput.value = ignoredJobTags.join(', ');
  runnerColoursInput.value = formatRunnerColours(runnerColours);
  baseInput.focus();
```

(g) `  clearError(ignoredTagsError);\n}\n\nfunction navigate(url) {` →

```
  clearError(ignoredTagsError);
  clearError(runnerColoursError);
}

function navigate(url) {
```

(h) `  ignoredJobTags = tags;\n  ignoredTagsInput.value = tags.join(', ');\n}\n` →

```
  ignoredJobTags = tags;
  ignoredTagsInput.value = tags.join(', ');
}

// Nothing is saved unless the whole box parses; an empty box is valid and clears the
// explicit colours, leaving every runner with an automatic one.
async function saveRunnerColours() {
  clearError(runnerColoursError);

  const result = parseRunnerColours(runnerColoursInput.value);
  if (result.error) {
    showError(runnerColoursError, result.error);
    return;
  }
  try {
    await setRunnerColours(result.pairs);
  } catch {
    showError(runnerColoursError, 'Could not save; try again');
    return;
  }
  runnerColours = result.pairs;
  runnerColoursInput.value = formatRunnerColours(runnerColours);
}
```

(i) After the `ignoredTagsInput.addEventListener('keydown', …)` block (the one ending with `  saveIgnoredTags();\n});`), add:

```
// Enter inserts a new line in this box, so only the button saves.
runnerColoursSave.addEventListener('click', saveRunnerColours);
```

Use this exact replacement: `  saveIgnoredTags();\n});` →

```
  saveIgnoredTags();
});

// Enter inserts a new line in this box, so only the button saves.
runnerColoursSave.addEventListener('click', saveRunnerColours);
```

(j) `  ignoredJobTags = await getIgnoredJobTags();` →

```
  ignoredJobTags = await getIgnoredJobTags();
  runnerColours = sanitizeRunnerColours(await getStoredRunnerColours()) ?? DEFAULT_RUNNER_COLOURS;
```

- [ ] **Step 6: Run the checks**

Run: `"$H/sync.sh" && "$H/colours-checks.py"; "$H/regress.sh" | diff "$H/baseline.txt" - && echo IDENTICAL`
Expected: 8 `OK`; `IDENTICAL`.

- [ ] **Step 7: Look at the settings panel**

Run: `"$H/shot.sh" "scenario=openSettings&stored=1" "$H/t3-settings.png"`
The file must be over 20,000 bytes. Open it with the Read tool. The settings panel shows five fields; the last, **Runner colours**, is a two-row box reading `gpu-runner=teal, Huy-Runner=#abc` with a Save button at its top right, styled like the inputs above it.

- [ ] **Step 8: Unit tests, lint, commit**

Run: `bun test && npx web-ext lint 2>&1 | grep -E "errors|notices|warnings"`
Expected: all pass, 0 fail; errors/notices/warnings all `0`.

```bash
git add lib/storage.js popup.html popup.css popup.js
git commit -m "Add the Runner colours setting"
```

---

### Task 4: Watch logic and the shared pipeline fetch

**Files:**
- Create: `lib/pipeline-api.js`, `lib/watch.js`
- Modify: `popup.js` (import; remove its local `fetchPipeline`)
- Test: `test/watch.test.js`

**Interfaces:**
- Produces:
  - `fetchPipeline(entry: { base, id }): Promise<{ base, id, status, ref, webUrl, raw }>`. On a non-OK response it throws an `Error` whose `status` property is the HTTP status.
  - `FINAL_STATUSES: string[]`, `isFinalStatus(status): boolean`
  - `finishedNotice(entry, fetched): { title, message } | null`
  - `checkWatched({ entries, fetchPipeline, update, notify }): Promise<void>` where `update(fields)` receives `{ base, id, ...fields }` and `notify({ url, title, message })` is called before the bell is switched off.

- [ ] **Step 1: Write the failing tests**

Create `test/watch.test.js`:

```js
import { describe, expect, test } from 'bun:test';
import { FINAL_STATUSES, checkWatched, finishedNotice, isFinalStatus } from '../lib/watch.js';

const BASE = 'https://gitlab.com/ternandsparrow/paratoo-fdcp';
const entry = (overrides = {}) => ({ base: BASE, id: '100', notify: true, ...overrides });

describe('isFinalStatus', () => {
  test('is true for the four finished statuses', () => {
    expect(FINAL_STATUSES).toEqual(['success', 'failed', 'canceled', 'skipped']);
    for (const status of FINAL_STATUSES) expect(isFinalStatus(status)).toBe(true);
  });

  test('is false for every other GitLab pipeline status and for nothing', () => {
    for (const status of [
      'created', 'waiting_for_resource', 'preparing', 'pending', 'running',
      'canceling', 'manual', 'scheduled',
    ]) {
      expect(isFinalStatus(status)).toBe(false);
    }
    expect(isFinalStatus(undefined)).toBe(false);
  });
});

describe('finishedNotice', () => {
  test('uses the note as the headline with the branch in brackets', () => {
    expect(finishedNotice(entry({ note: 'Hotfix' }), { status: 'success', ref: 'dev/1.0.11' })).toEqual({
      title: 'Pipeline passed',
      message: 'Hotfix (dev/1.0.11)',
    });
  });

  test('falls back to the pipeline number without a note', () => {
    expect(finishedNotice(entry(), { status: 'failed', ref: 'dev/1.0.11' })).toEqual({
      title: 'Pipeline failed',
      message: '#100 (dev/1.0.11)',
    });
  });

  test('omits the brackets when no branch is known', () => {
    expect(finishedNotice(entry(), { status: 'failed' })).toEqual({
      title: 'Pipeline failed',
      message: '#100',
    });
  });

  test("uses the pinned entry's branch when the fetch has none", () => {
    expect(finishedNotice(entry({ ref: 'main' }), { status: 'success' }).message).toBe('#100 (main)');
  });

  test('titles canceled and skipped pipelines', () => {
    expect(finishedNotice(entry(), { status: 'canceled' }).title).toBe('Pipeline canceled');
    expect(finishedNotice(entry(), { status: 'skipped' }).title).toBe('Pipeline skipped');
  });

  test('is null for a pipeline that has not finished', () => {
    expect(finishedNotice(entry(), { status: 'running' })).toBeNull();
    expect(finishedNotice(entry(), { status: 'manual' })).toBeNull();
  });
});

describe('checkWatched', () => {
  function harness(results) {
    const updates = [];
    const notices = [];
    const fetched = [];
    let notifyFails = false;
    return {
      updates,
      notices,
      fetched,
      failNotify() {
        notifyFails = true;
      },
      deps: {
        fetchPipeline: async (e) => {
          fetched.push(e.id);
          const result = results[e.id];
          if (result instanceof Error) throw result;
          return { base: e.base, id: e.id, ...result };
        },
        update: async (fields) => {
          updates.push(fields);
        },
        notify: async (notice) => {
          if (notifyFails) throw new Error('notifications are blocked');
          notices.push(notice);
        },
      },
    };
  }

  test('notifies once and switches the bell off for each final status', async () => {
    for (const status of FINAL_STATUSES) {
      const h = harness({ 100: { status, ref: 'dev/1.0.11', webUrl: `${BASE}/-/pipelines/100` } });
      await checkWatched({ entries: [entry({ note: 'Hotfix' })], ...h.deps });
      expect(h.notices).toHaveLength(1);
      expect(h.notices[0].url).toBe(`${BASE}/-/pipelines/100`);
      expect(h.updates).toHaveLength(1);
      expect(h.updates[0]).toMatchObject({ base: BASE, id: '100', status, notify: false });
    }
  });

  test('builds the notification url from the entry when the fetch has no webUrl', async () => {
    const h = harness({ 100: { status: 'success' } });
    await checkWatched({ entries: [entry()], ...h.deps });
    expect(h.notices[0].url).toBe(`${BASE}/-/pipelines/100`);
  });

  test('leaves a running pipeline armed and saves its fresh status', async () => {
    const h = harness({ 100: { status: 'running', ref: 'dev/1.0.11' } });
    await checkWatched({ entries: [entry()], ...h.deps });
    expect(h.notices).toHaveLength(0);
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0]).toMatchObject({ id: '100', status: 'running' });
    expect('notify' in h.updates[0]).toBe(false);
  });

  test('ignores entries whose bell is off', async () => {
    const h = harness({ 100: { status: 'success' }, 200: { status: 'success' } });
    await checkWatched({ entries: [entry({ notify: undefined }), entry({ id: '200' })], ...h.deps });
    expect(h.fetched).toEqual(['200']);
  });

  test('skips a pipeline whose fetch fails, changing nothing', async () => {
    const h = harness({ 100: new Error('GitLab returned 500') });
    await checkWatched({ entries: [entry()], ...h.deps });
    expect(h.notices).toHaveLength(0);
    expect(h.updates).toHaveLength(0);
  });

  test('switches the bell off silently when the pipeline is gone (404)', async () => {
    const gone = Object.assign(new Error('GitLab returned 404'), { status: 404 });
    const h = harness({ 100: gone });
    await checkWatched({ entries: [entry()], ...h.deps });
    expect(h.notices).toHaveLength(0);
    expect(h.updates).toEqual([{ base: BASE, id: '100', notify: false }]);
  });

  test('keeps the bell armed when the notification cannot be shown, and carries on', async () => {
    const h = harness({ 100: { status: 'success' }, 200: { status: 'running' } });
    h.failNotify();
    await checkWatched({ entries: [entry(), entry({ id: '200' })], ...h.deps });
    expect(h.updates.map((u) => u.id)).toEqual(['200']);
  });

  test('handles several armed pipelines independently', async () => {
    const h = harness({ 100: { status: 'failed' }, 200: { status: 'success' }, 300: { status: 'running' } });
    await checkWatched({ entries: [entry(), entry({ id: '200' }), entry({ id: '300' })], ...h.deps });
    expect(h.notices.map((n) => n.title)).toEqual(['Pipeline failed', 'Pipeline passed']);
    expect(h.updates.map((u) => u.id)).toEqual(['100', '200', '300']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test test/watch.test.js`
Expected: FAIL with `Cannot find module '../lib/watch.js'`.

- [ ] **Step 3: Implement**

Create `lib/pipeline-api.js`:

```js
import { pipelineApiUrl } from './parse.js';

/**
 * One pinned pipeline from GitLab's REST API, authenticated by the browser's own session
 * cookie. Shared by the popup and the background checker. A non-OK response throws an
 * Error whose `status` is the HTTP status, so callers can tell a deleted pipeline (404)
 * from a passing failure.
 */
export async function fetchPipeline(entry) {
  const response = await fetch(pipelineApiUrl(entry.base, entry.id), {
    credentials: 'include',
  });
  if (!response.ok) {
    const error = new Error(`GitLab returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
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
```

Create `lib/watch.js`:

```js
/**
 * What the pipeline bell decides, separate from the browser APIs so it can be tested.
 */

// `manual` (waiting for someone to click) and `scheduled` are not finished.
export const FINAL_STATUSES = ['success', 'failed', 'canceled', 'skipped'];

export function isFinalStatus(status) {
  return FINAL_STATUSES.includes(status);
}

const TITLES = {
  success: 'Pipeline passed',
  failed: 'Pipeline failed',
  canceled: 'Pipeline canceled',
  skipped: 'Pipeline skipped',
};

/**
 * The notification for a pipeline that has just been fetched, or null if it has not
 * finished. The headline is the user's note, else the pipeline number.
 */
export function finishedNotice(entry, fetched) {
  const title = TITLES[fetched?.status];
  if (!title) return null;

  const headline = entry.note || `#${entry.id}`;
  const ref = fetched.ref ?? entry.ref;
  return { title, message: ref ? `${headline} (${ref})` : headline };
}

function pipelineUrl(entry, fetched) {
  return fetched.webUrl || entry.webUrl || `${entry.base}/-/pipelines/${entry.id}`;
}

/**
 * One pass of the background checker over the pinned pipelines. Everything it touches is
 * injected:
 *   fetchPipeline(entry) -> fetched fields, or throws (with `.status` for HTTP errors)
 *   update(fields)       -> saves `{ base, id, ...fields }` onto the pinned entry
 *   notify({ url, title, message }) -> shows the notification
 *
 * A finished pipeline is announced first and only then disarmed, so a notification that
 * cannot be shown is retried on the next pass instead of being lost.
 */
export async function checkWatched({ entries, fetchPipeline, update, notify }) {
  for (const entry of entries.filter((e) => e.notify)) {
    let fetched;
    try {
      fetched = await fetchPipeline(entry);
    } catch (error) {
      // A deleted pipeline can never finish; anything else is tried again next pass.
      if (error?.status === 404) await update({ base: entry.base, id: entry.id, notify: false });
      continue;
    }

    const notice = finishedNotice(entry, fetched);
    if (!notice) {
      await update(fetched);
      continue;
    }

    try {
      await notify({ url: pipelineUrl(entry, fetched), ...notice });
    } catch {
      continue;
    }
    await update({ ...fetched, notify: false });
  }
}
```

In `popup.js`:

(a) Replace `  pipelineApiUrl,\n  pipelineElapsedSeconds,` with `  pipelineElapsedSeconds,`.

(b) Replace `import { createPinnedList } from './pinned-list.js';` with

```
import { fetchPipeline } from './lib/pipeline-api.js';
import { createPinnedList } from './pinned-list.js';
```

(c) Delete this block entirely (the local copy; `FETCHERS` keeps using the imported one):

```
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

```

- [ ] **Step 4: Run the tests and the popup regression**

Run: `bun test`
Expected: all pass, 0 fail.

Run: `H=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad/bell-harness; "$H/sync.sh" && "$H/regress.sh" | diff "$H/baseline.txt" - && echo IDENTICAL; "$H/colours-checks.py"`
Expected: `IDENTICAL` (pinning and refreshing pipelines still work through the moved `fetchPipeline`); 8 `OK`.

- [ ] **Step 5: Lint and commit**

Run: `npx web-ext lint 2>&1 | grep -E "errors|notices|warnings"`
Expected: all `0`.

```bash
git add lib/pipeline-api.js lib/watch.js test/watch.test.js popup.js
git commit -m "Add the pipeline-bell decision logic and share the pipeline fetch"
```

---

### Task 5: Serialise pinned-list writes and add `notify`

**Files:**
- Modify: `lib/storage.js`
- Test: `test/storage.test.js`

**Interfaces:**
- Produces: `setPinnedNotify(base, id, on): Promise<Array>` (saved pipelines list; `on === false` deletes the key); every pinned mutation (`pinItem`, `unpinItem`, `updatePinned`, `setPinnedNote`, `reorderPinned`, `setPinnedNotify`) runs under `navigator.locks.request('gitlab-navigate-pinned', …)` when available; `updatePinned` stores `notify: false` by deleting the key. All existing signatures and return values are unchanged.

- [ ] **Step 1: Write the failing tests**

Create `test/storage.test.js`:

```js
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  pinItem,
  reorderPinned,
  setPinnedNote,
  setPinnedNotify,
  unpinItem,
  updatePinned,
  getPinned,
} from '../lib/storage.js';

const BASE = 'https://gitlab.com/ternandsparrow/paratoo-fdcp';
const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

// chrome.storage.local with a small delay on every call, so unserialised
// read-modify-write sequences really do interleave.
function fakeLocal() {
  const data = {};
  return {
    data,
    async get(key) {
      await tick();
      return key in data ? { [key]: structuredClone(data[key]) } : {};
    },
    async set(values) {
      await tick();
      Object.assign(data, structuredClone(values));
    },
  };
}

// A minimal Web Locks stand-in: one mutex per call order, recording the names requested.
function fakeLocks() {
  let chain = Promise.resolve();
  const requests = [];
  return {
    requests,
    request(name, task) {
      requests.push(name);
      const run = chain.then(() => task());
      chain = run.catch(() => {});
      return run;
    },
  };
}

let local;
beforeEach(() => {
  local = fakeLocal();
  globalThis.chrome = { storage: { local } };
});
afterEach(() => {
  delete globalThis.navigator.locks;
});

const pin = (id, extra = {}) => ({ base: BASE, id, ...extra });

describe('pinned list mutations (unchanged behaviour)', () => {
  test('pinItem puts the newest first and replaces a repeat of the same item', async () => {
    await pinItem('pipelines', pin('1', { status: 'running' }));
    await pinItem('pipelines', pin('2'));
    const result = await pinItem('pipelines', pin('1', { status: 'success' }));
    expect(result.map((p) => [p.id, p.status ?? null])).toEqual([['1', 'success'], ['2', null]]);
  });

  test('pinItem keeps at most 10 entries', async () => {
    for (let i = 1; i <= 12; i += 1) await pinItem('pipelines', pin(String(i)));
    const result = await getPinned('pipelines');
    expect(result).toHaveLength(10);
    expect(result[0].id).toBe('12');
  });

  test('unpinItem removes just that item', async () => {
    await pinItem('pipelines', pin('1'));
    await pinItem('pipelines', pin('2'));
    expect((await unpinItem('pipelines', BASE, '1')).map((p) => p.id)).toEqual(['2']);
  });

  test('setPinnedNote adds a note, and an empty note removes it', async () => {
    await pinItem('pipelines', pin('1'));
    expect((await setPinnedNote('pipelines', BASE, '1', 'Hotfix'))[0].note).toBe('Hotfix');
    expect('note' in (await setPinnedNote('pipelines', BASE, '1', ''))[0]).toBe(false);
  });

  test('reorderPinned moves an item to the target position', async () => {
    for (const id of ['1', '2', '3']) await pinItem('pipelines', pin(id));
    // stored order is 3, 2, 1
    expect((await reorderPinned('pipelines', BASE, '1', 0)).map((p) => p.id)).toEqual(['1', '3', '2']);
  });

  test('reorderPinned leaves the list alone for an unknown item', async () => {
    await pinItem('pipelines', pin('1'));
    expect((await reorderPinned('pipelines', BASE, '9', 0)).map((p) => p.id)).toEqual(['1']);
  });

  test('rejects an unknown list kind', async () => {
    await expect(getPinned('nope')).rejects.toThrow('Unknown pinned list: nope');
  });
});

describe('the pipeline bell flag', () => {
  test('setPinnedNotify(true) adds notify, and false deletes the key', async () => {
    await pinItem('pipelines', pin('1'));
    expect((await setPinnedNotify(BASE, '1', true))[0].notify).toBe(true);
    expect('notify' in (await setPinnedNotify(BASE, '1', false))[0]).toBe(false);
  });

  test('setPinnedNotify only touches the matching pipeline', async () => {
    await pinItem('pipelines', pin('1'));
    await pinItem('pipelines', pin('2'));
    const result = await setPinnedNotify(BASE, '1', true);
    expect(result.find((p) => p.id === '2').notify).toBeUndefined();
  });

  test('updatePinned merges fields and keeps an armed bell', async () => {
    await pinItem('pipelines', pin('1'));
    await setPinnedNotify(BASE, '1', true);
    const [entry] = await updatePinned('pipelines', [{ base: BASE, id: '1', status: 'running' }]);
    expect(entry).toMatchObject({ status: 'running', notify: true });
  });

  test('updatePinned stores notify: false by deleting the key', async () => {
    await pinItem('pipelines', pin('1'));
    await setPinnedNotify(BASE, '1', true);
    const [entry] = await updatePinned('pipelines', [
      { base: BASE, id: '1', status: 'success', notify: false },
    ]);
    expect(entry.status).toBe('success');
    expect('notify' in entry).toBe(false);
  });

  test('updatePinned leaves unmatched entries untouched', async () => {
    await pinItem('pipelines', pin('1'));
    const result = await updatePinned('pipelines', [{ base: BASE, id: '9', status: 'running' }]);
    expect(result[0].status).toBeUndefined();
  });
});

describe('write safety', () => {
  test('two concurrent mutations both persist when Web Locks are available', async () => {
    const locks = fakeLocks();
    globalThis.navigator.locks = locks;
    await pinItem('pipelines', pin('1'));
    locks.requests.length = 0;

    await Promise.all([
      setPinnedNote('pipelines', BASE, '1', 'Hotfix'),
      setPinnedNotify(BASE, '1', true),
    ]);

    const [entry] = await getPinned('pipelines');
    expect(entry).toMatchObject({ note: 'Hotfix', notify: true });
    expect(locks.requests).toEqual(['gitlab-navigate-pinned', 'gitlab-navigate-pinned']);
  });

  test('mutations still work where Web Locks do not exist', async () => {
    expect(globalThis.navigator.locks).toBeUndefined();
    await pinItem('pipelines', pin('1'));
    expect((await setPinnedNotify(BASE, '1', true))[0].notify).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test test/storage.test.js`
Expected: FAIL — `setPinnedNotify` is not exported (the import fails), so no test in the file runs.

- [ ] **Step 3: Implement**

In `lib/storage.js`, replace everything from the line `function pinnedKey(kind) {` up to (but not including) `export async function removeHistory(url) {` with:

```js
function pinnedKey(kind) {
  const key = PINNED_KEYS[kind];
  // chrome.storage.local.get(undefined) would return everything, so fail loudly instead.
  if (!key) throw new Error(`Unknown pinned list: ${kind}`);
  return key;
}

/**
 * @param {'pipelines'|'tickets'|'mrs'} kind which pinned list
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

const PINNED_LOCK = 'gitlab-navigate-pinned';

// The popup and the background checker both read-modify-write the pinned lists. A Web
// Lock makes each mutation atomic across them, so neither overwrites the other's change.
// Where Web Locks do not exist the mutation simply runs.
async function withPinnedLock(task) {
  const locks = globalThis.navigator?.locks;
  return locks ? locks.request(PINNED_LOCK, task) : task();
}

function mutatePinned(kind, change) {
  return withPinnedLock(async () => savePinned(kind, change(await getPinned(kind))));
}

export async function pinItem(kind, entry) {
  return mutatePinned(kind, (previous) => {
    const without = previous.filter((p) => !(p.base === entry.base && p.id === entry.id));
    return [{ ...entry, pinnedAt: Date.now() }, ...without].slice(0, PINNED_LIMIT);
  });
}

export async function unpinItem(kind, base, id) {
  return mutatePinned(kind, (previous) =>
    previous.filter((p) => !(p.base === base && p.id === id)),
  );
}

/**
 * Merge freshly fetched fields into the pinned entries, keyed by base + id. Entries
 * that were unpinned while a fetch was in flight are simply not matched. An update
 * carrying `notify: false` removes the key rather than storing a false.
 */
export async function updatePinned(kind, updates) {
  return mutatePinned(kind, (previous) =>
    previous.map((p) => {
      const update = updates.find((u) => u.base === p.base && u.id === p.id);
      if (!update) return p;
      const next = { ...p, ...update };
      if (next.notify === false) delete next.notify;
      return next;
    }),
  );
}

/**
 * Set a pinned item's note, or remove it when `note` is ''.
 */
export async function setPinnedNote(kind, base, id, note) {
  return mutatePinned(kind, (previous) =>
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
 * Turn a pinned pipeline's bell on, or off (which deletes the flag).
 */
export async function setPinnedNotify(base, id, on) {
  return mutatePinned('pipelines', (previous) =>
    previous.map((p) => {
      if (p.base !== base || p.id !== id) return p;
      const next = { ...p };
      if (on) next.notify = true;
      else delete next.notify;
      return next;
    }),
  );
}

/**
 * Move a pinned item to a new position in its list.
 * @param {number} targetIndex 0-based target position
 */
export async function reorderPinned(kind, base, id, targetIndex) {
  return mutatePinned(kind, (previous) => {
    const currentIndex = previous.findIndex((p) => p.base === base && p.id === id);
    if (currentIndex === -1) return previous;

    const reordered = [...previous];
    const [item] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, item);
    return reordered;
  });
}

```

- [ ] **Step 4: Run the tests and the popup regression**

Run: `bun test`
Expected: all pass, 0 fail.

Run: `H=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad/bell-harness; "$H/sync.sh" && "$H/regress.sh" | diff "$H/baseline.txt" - && echo IDENTICAL`
Expected: `IDENTICAL` (the popup's pinned-list behaviour is unchanged by the refactor).

- [ ] **Step 5: Lint and commit**

Run: `npx web-ext lint 2>&1 | grep -E "errors|notices|warnings"`
Expected: all `0`.

```bash
git add lib/storage.js test/storage.test.js
git commit -m "Serialise pinned-list writes and store the pipeline bell flag"
```

---

### Task 6: The background checker and the manifest

**Files:**
- Create: `background.js`
- Modify: `manifest.json`
- Test: `test/background.test.js`

**Interfaces:**
- Consumes: `getPinned`, `updatePinned` (Task 5); `fetchPipeline` (Task 4); `checkWatched` (Task 4).
- Produces: `background.js` exporting `syncAlarm(): Promise<void>`, `runCheck(): Promise<void>`, `openNotification(id: string): void`; it registers its listeners at import. Alarm name `pipeline-watch`.

- [ ] **Step 1: Write the failing tests**

Create `test/background.test.js`:

```js
import { beforeEach, describe, expect, test } from 'bun:test';

const BASE = 'https://gitlab.com/ternandsparrow/paratoo-fdcp';

// A fake `chrome` that records every listener registered on it and every call made.
function makeChrome({ notifications = true } = {}) {
  const listeners = {};
  const event = (name) => ({
    addListener: (fn) => {
      (listeners[name] ??= []).push(fn);
    },
  });
  const data = {};
  const alarmMap = new Map();
  const log = { alarmsCreated: [], alarmsCleared: [], notices: [], cleared: [], tabs: [] };
  const fake = {
    listeners,
    data,
    alarmMap,
    log,
    storage: {
      local: {
        async get(key) {
          return key in data ? { [key]: structuredClone(data[key]) } : {};
        },
        async set(values) {
          Object.assign(data, structuredClone(values));
        },
      },
      onChanged: event('storage.onChanged'),
    },
    runtime: { onInstalled: event('runtime.onInstalled'), onStartup: event('runtime.onStartup') },
    permissions: { onAdded: event('permissions.onAdded') },
    tabs: { create: (info) => log.tabs.push(info) },
  };
  fake.alarms = {
    get: async (name) => alarmMap.get(name),
    create: (name, info) => {
      alarmMap.set(name, info);
      log.alarmsCreated.push([name, info]);
    },
    clear: async (name) => {
      alarmMap.delete(name);
      log.alarmsCleared.push(name);
    },
    onAlarm: event('alarms.onAlarm'),
  };
  if (notifications) {
    fake.notifications = {
      create: async (id, options) => {
        log.notices.push({ id, options });
      },
      clear: async (id) => {
        log.cleared.push(id);
      },
      onClicked: event('notifications.onClicked'),
    };
  }
  return fake;
}

const pin = (id, extra = {}) => ({ base: BASE, id, status: 'running', ref: 'dev/1.0.11', ...extra });

// Serves GitLab's pipeline endpoint: id -> { status } | 'network' | 404
function serve(responses) {
  const fetched = [];
  globalThis.fetch = async (url) => {
    const id = String(url).split('/').pop();
    fetched.push(id);
    const response = responses[id];
    if (response === 'network') throw new TypeError('Failed to fetch');
    if (response === 404) return { ok: false, status: 404, json: async () => ({}) };
    return {
      ok: true,
      json: async () => ({
        ref: 'dev/1.0.11',
        web_url: `${BASE}/-/pipelines/${id}`,
        ...response,
      }),
    };
  };
  return fetched;
}

// Import once with a recording fake: the module registers its listeners at import time.
const first = makeChrome();
globalThis.chrome = first;
const background = await import('../background.js');
const recorded = first.listeners;

let fake;
beforeEach(() => {
  fake = makeChrome();
  globalThis.chrome = fake;
});

describe('registration at import', () => {
  test('registers each listener once', () => {
    for (const name of [
      'alarms.onAlarm',
      'runtime.onInstalled',
      'runtime.onStartup',
      'storage.onChanged',
      'notifications.onClicked',
      'permissions.onAdded',
    ]) {
      expect(recorded[name]).toHaveLength(1);
    }
  });

  test('the permissions.onAdded listener does not register the click handler twice', () => {
    recorded['permissions.onAdded'][0]();
    expect(recorded['notifications.onClicked']).toHaveLength(1);
  });
});

describe('syncAlarm', () => {
  test('creates the alarm when some pipeline has its bell on', async () => {
    fake.data.pinnedPipelines = [pin('1'), pin('2', { notify: true })];
    await background.syncAlarm();
    expect(fake.log.alarmsCreated).toEqual([['pipeline-watch', { periodInMinutes: 1 }]]);
  });

  test('does not create a second alarm', async () => {
    fake.data.pinnedPipelines = [pin('1', { notify: true })];
    await background.syncAlarm();
    await background.syncAlarm();
    expect(fake.log.alarmsCreated).toHaveLength(1);
  });

  test('clears the alarm when no bell is on', async () => {
    fake.data.pinnedPipelines = [pin('1', { notify: true })];
    await background.syncAlarm();
    fake.data.pinnedPipelines = [pin('1')];
    await background.syncAlarm();
    expect(fake.log.alarmsCleared).toEqual(['pipeline-watch']);
    expect(fake.alarmMap.size).toBe(0);
  });

  test('does nothing when there is no alarm and no bell', async () => {
    fake.data.pinnedPipelines = [pin('1')];
    await background.syncAlarm();
    expect(fake.log.alarmsCreated).toHaveLength(0);
    expect(fake.log.alarmsCleared).toHaveLength(0);
  });
});

describe('runCheck', () => {
  test('notifies once when an armed pipeline finishes, then switches its bell off', async () => {
    fake.data.pinnedPipelines = [pin('1', { notify: true, note: 'Hotfix' })];
    serve({ 1: { status: 'failed' } });
    await background.runCheck();

    expect(fake.log.notices).toEqual([
      {
        id: `${BASE}/-/pipelines/1`,
        options: {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Pipeline failed',
          message: 'Hotfix (dev/1.0.11)',
        },
      },
    ]);
    const [entry] = fake.data.pinnedPipelines;
    expect(entry.status).toBe('failed');
    expect('notify' in entry).toBe(false);
    // Nothing is armed any more, so the alarm is cleared.
    expect(fake.alarmMap.size).toBe(0);
  });

  test('leaves a running pipeline armed and keeps the alarm', async () => {
    fake.data.pinnedPipelines = [pin('1', { notify: true })];
    fake.alarmMap.set('pipeline-watch', { periodInMinutes: 1 });
    serve({ 1: { status: 'running' } });
    await background.runCheck();

    expect(fake.log.notices).toHaveLength(0);
    expect(fake.data.pinnedPipelines[0].notify).toBe(true);
    expect(fake.alarmMap.has('pipeline-watch')).toBe(true);
  });

  test('keeps the bell on and changes nothing after a network failure', async () => {
    fake.data.pinnedPipelines = [pin('1', { notify: true })];
    serve({ 1: 'network' });
    await background.runCheck();

    expect(fake.log.notices).toHaveLength(0);
    expect(fake.data.pinnedPipelines[0]).toMatchObject({ status: 'running', notify: true });
  });

  test('switches the bell off silently for a deleted pipeline', async () => {
    fake.data.pinnedPipelines = [pin('1', { notify: true })];
    serve({ 1: 404 });
    await background.runCheck();

    expect(fake.log.notices).toHaveLength(0);
    expect('notify' in fake.data.pinnedPipelines[0]).toBe(false);
  });

  test('does not fetch pipelines whose bell is off', async () => {
    fake.data.pinnedPipelines = [pin('1'), pin('2', { notify: true })];
    const fetched = serve({ 1: { status: 'success' }, 2: { status: 'running' } });
    await background.runCheck();
    expect(fetched).toEqual(['2']);
  });

  test('does nothing, not even fetching, when the notifications permission is missing', async () => {
    fake = makeChrome({ notifications: false });
    globalThis.chrome = fake;
    fake.data.pinnedPipelines = [pin('1', { notify: true })];
    const fetched = serve({ 1: { status: 'success' } });
    await background.runCheck();

    expect(fetched).toHaveLength(0);
    expect(fake.data.pinnedPipelines[0].notify).toBe(true);
  });
});

describe('listeners', () => {
  test('the alarm listener runs a check only for its own alarm', async () => {
    fake.data.pinnedPipelines = [pin('1', { notify: true })];
    const fetched = serve({ 1: { status: 'success' } });

    await recorded['alarms.onAlarm'][0]({ name: 'something-else' });
    expect(fetched).toHaveLength(0);

    await recorded['alarms.onAlarm'][0]({ name: 'pipeline-watch' });
    expect(fetched).toEqual(['1']);
  });

  test('a change to the pinned pipelines re-syncs the alarm; other changes do not', async () => {
    fake.data.pinnedPipelines = [pin('1', { notify: true })];

    await recorded['storage.onChanged'][0]({ history: {} }, 'local');
    await recorded['storage.onChanged'][0]({ pinnedPipelines: {} }, 'sync');
    expect(fake.log.alarmsCreated).toHaveLength(0);

    await recorded['storage.onChanged'][0]({ pinnedPipelines: {} }, 'local');
    expect(fake.log.alarmsCreated).toHaveLength(1);
  });

  test('install and startup re-sync the alarm', async () => {
    fake.data.pinnedPipelines = [pin('1', { notify: true })];
    await recorded['runtime.onInstalled'][0]();
    expect(fake.log.alarmsCreated).toHaveLength(1);

    fake.alarmMap.clear();
    await recorded['runtime.onStartup'][0]();
    expect(fake.log.alarmsCreated).toHaveLength(2);
  });
});

describe('openNotification', () => {
  test('opens an http(s) notification id in a new tab and clears the notification', () => {
    background.openNotification(`${BASE}/-/pipelines/1`);
    expect(fake.log.tabs).toEqual([{ url: `${BASE}/-/pipelines/1` }]);
    expect(fake.log.cleared).toEqual([`${BASE}/-/pipelines/1`]);
  });

  test('never opens a non-http id, but still clears the notification', () => {
    background.openNotification('javascript:alert(1)');
    expect(fake.log.tabs).toHaveLength(0);
    expect(fake.log.cleared).toEqual(['javascript:alert(1)']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test test/background.test.js`
Expected: FAIL with `Cannot find module '../background.js'`.

- [ ] **Step 3: Implement `background.js`**

Create `background.js`:

```js
// Checks armed pipelines about once a minute while the popup is closed, and raises a
// notification when one finishes. A service worker in Chrome and an event page in
// Firefox (see manifest.json): every listener is registered at the top level, and nothing
// is kept in memory between wake-ups because all state — the bell flags — is in storage.
import { fetchPipeline } from './lib/pipeline-api.js';
import { getPinned, updatePinned } from './lib/storage.js';
import { checkWatched } from './lib/watch.js';

const ALARM = 'pipeline-watch';
const PINNED_KEY = 'pinnedPipelines';

// Keeps the alarm running exactly while some pinned pipeline has its bell on.
export async function syncAlarm() {
  const armed = (await getPinned('pipelines')).some((entry) => entry.notify);
  const existing = await chrome.alarms.get(ALARM);
  if (armed && !existing) chrome.alarms.create(ALARM, { periodInMinutes: 1 });
  else if (!armed && existing) await chrome.alarms.clear(ALARM);
}

async function notify({ url, title, message }) {
  // Only options both Chrome and Firefox accept. The pipeline's URL is the id, so a click
  // knows where to go without any state.
  await chrome.notifications.create(url, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
  });
}

export async function runCheck() {
  // `notifications` is an optional permission; without it there is nothing to do.
  if (!chrome.notifications) return;

  await checkWatched({
    entries: await getPinned('pipelines'),
    fetchPipeline,
    update: (update) => updatePinned('pipelines', [update]),
    notify,
  });
  await syncAlarm();
}

export function openNotification(id) {
  // Only ever open what we put there: an http(s) pipeline URL.
  if (/^https?:\/\//.test(id)) chrome.tabs.create({ url: id });
  chrome.notifications.clear(id);
}

let clickHandlerAdded = false;

// Registered at the top level when the permission is already held, and again when it is
// granted later (the API does not exist before then).
function addClickHandler() {
  if (clickHandlerAdded || !chrome.notifications) return;
  clickHandlerAdded = true;
  chrome.notifications.onClicked.addListener(openNotification);
}

// An error here has nowhere useful to go; the next alarm or change simply tries again.
const quietly = (task) => task().catch(() => {});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) return quietly(runCheck);
});
chrome.runtime.onInstalled.addListener(() => quietly(syncAlarm));
chrome.runtime.onStartup.addListener(() => quietly(syncAlarm));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[PINNED_KEY]) return quietly(syncAlarm);
});
addClickHandler();
chrome.permissions.onAdded.addListener(addClickHandler);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test`
Expected: all pass, 0 fail.

- [ ] **Step 5: The manifest**

In `manifest.json`, replace

```
  "permissions": [
    "storage",
    "activeTab",
    "scripting"
  ],
  "optional_host_permissions": [
    "*://*/*"
  ],
```

with

```
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "alarms"
  ],
  "optional_permissions": [
    "notifications"
  ],
  "optional_host_permissions": [
    "*://*/*"
  ],
  "background": {
    "service_worker": "background.js",
    "scripts": [
      "background.js"
    ],
    "type": "module"
  },
```

- [ ] **Step 6: Lint — the one expected warning**

Run: `npx web-ext lint 2>&1 | grep -E "errors|notices|warnings|BACKGROUND"`
Expected: `errors 0`, `notices 0`, `warnings 1`, and the warning code `BACKGROUND_SERVICE_WORKER_IGNORED` (Firefox ignores `service_worker`; `scripts` covers it). Any other warning or any error is a real problem: fix it.

Also run: `python3 -c "import json; m=json.load(open('manifest.json')); print(m['permissions'], m['optional_permissions'], m['background']['scripts'])"`
Expected: `['storage', 'activeTab', 'scripting', 'alarms'] ['notifications'] ['background.js']`.

- [ ] **Step 7: Commit**

```bash
git add background.js manifest.json test/background.test.js
git commit -m "Add the background checker for the pipeline bell"
```

---

### Task 7: The bell in the popup

**Files:**
- Modify: `pinned-list.js`, `popup.js`, `popup.html`, `popup.css`
- Create (scratch): `$H/bell-checks.py`; edit `$H/scenario.js`

**Interfaces:**
- Consumes: `setPinnedNotify` (Task 5), `isFinalStatus` (Task 4), the harness from Task 3.
- Produces: `createPinnedList({ …, onToggleBell })`; `describeRow` may return `bell: { armed: boolean, available: boolean }`; pinned pipelines show 🔔 (`.pin-bell-mark`) at rest when armed and a `.pin-bell` hover button.

- [ ] **Step 1: Add the bell scenarios and checks, and confirm they fail**

In `$H/scenario.js`, replace `  async openSettings() {` with:

```js
  async bellArm() {
    window.__log.length = 0;
    rows('pipelines')[3].querySelector('.pin-bell').click();
  },
  async bellDisarm() {
    window.__log.length = 0;
    rows('pipelines')[0].querySelector('.pin-bell').click();
  },
  async openSettings() {
```

Write `$H/bell-checks.py`:

```python
#!/usr/bin/env python3
"""Pipeline bell checks in the popup. Prints OK/FAIL per case.

Seeds: A=2816150418 running+armed, B=2816150001 success, C=2815998877 failed,
D=2816150999 pending (unarmed).
"""
from chk import q, run

DENIED = 'Notifications need your permission — click the bell again to allow them.'
OFFER = 'Notify me when this finishes'
REQUEST = {'permissions': ['notifications'], 'origins': ['https://gitlab.com/*']}


def entry(d, pipeline_id):
    return next(e for e in d['pipelineEntries'] if e['id'] == pipeline_id)


run([
    (q('rest'), lambda d: d['bells'] == [
        {'mark': True, 'button': {'armed': True, 'pressed': 'true', 'title': 'Stop notifying'}},
        {'mark': False, 'button': None},
        {'mark': False, 'button': None},
        {'mark': False, 'button': {'armed': False, 'pressed': 'false', 'title': OFFER}},
    ] and d['otherBells'] == 0),
    (q('bellArm'), lambda d: d['requests'] == [REQUEST]
        and d['firstEvent'] == 'permissions.request'
        and entry(d, '2816150999')['notify'] is True
        and d['bells'][3] == {'mark': True, 'button': {'armed': True, 'pressed': 'true', 'title': 'Stop notifying'}}
        and d['bellMessage']['hidden'] is True),
    (q('bellArm', grant=0), lambda d: d['requests'] == [REQUEST]
        and entry(d, '2816150999')['notify'] is None
        and d['bells'][3]['mark'] is False
        and d['bellMessage'] == {'text': DENIED, 'hidden': False}),
    (q('bellDisarm'), lambda d: d['requests'] == []
        and entry(d, '2816150418')['notify'] is None
        and d['bells'][0] == {'mark': False, 'button': {'armed': False, 'pressed': 'false', 'title': OFFER}}),
    (q('rest', access=1, finish='2816150418'), lambda d:
        entry(d, '2816150418') == {'id': '2816150418', 'status': 'success', 'notify': None}
        and d['bells'][0] == {'mark': False, 'button': None}
        and entry(d, '2816150999')['notify'] is None),
    (q('rest', access=1), lambda d:
        entry(d, '2816150418') == {'id': '2816150418', 'status': 'running', 'notify': True}
        and d['bells'][0]['mark'] is True),
])
```

Run: `chmod +x "$H/bell-checks.py" && "$H/sync.sh" && "$H/bell-checks.py"`
Expected: all six cases FAIL — there are no `.pin-bell` buttons or `.pin-bell-mark` marks yet (the `rest` case shows `bells` with `mark: false` and `button: null` everywhere).

- [ ] **Step 2: `pinned-list.js`**

Make these exact replacements.

(a) ` *   { status, glyph, headline, headlineIsId, subline, editSubline, sublineTail, tooltip, trailing, url }` →

```
 *   { status, glyph, headline, headlineIsId, subline, editSubline, sublineTail, tooltip, trailing, url, bell }
```

and, in the same doc comment, replace

```
 * onRender(entries) runs after every render.
```

with

```
 * `bell` is optional, `{ armed, available }`: a 🔔 toggle among the hover actions, shown when
 * the bell is armed or available; clicking it calls onToggleBell(entry).
 * onRender(entries) runs after every render.
```

(b) 

```
  describeRow,
  navigate,
  onRender,
}) {
```
→
```
  describeRow,
  navigate,
  onRender,
  onToggleBell,
}) {
```

(c) `  function buildActions(entry) {` →

```
  function buildBell(entry, bell) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `pin-action pin-bell${bell.armed ? ' armed' : ''}`;
    button.title = bell.armed ? 'Stop notifying' : 'Notify me when this finishes';
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', String(bell.armed));
    button.textContent = '\u{1F514}';
    button.addEventListener('click', () => onToggleBell(entry));
    return button;
  }

  function buildActions(entry, row) {
```

(d) `    actions.append(edit, remove);` →

```
    if (row.bell && onToggleBell && (row.bell.armed || row.bell.available)) {
      actions.append(buildBell(entry, row.bell));
    }
    actions.append(edit, remove);
```

(e) `    else item.append(handle, buildNavButton(row), buildActions(entry));` →

```
    else item.append(handle, buildNavButton(row), buildActions(entry, row));
```

- [ ] **Step 3: Markup and styles**

In `popup.html`, replace

```
      <h2>Pinned pipelines</h2>
      <ul id="pinned-list"></ul>
```

with

```
      <h2>Pinned pipelines</h2>
      <p class="error" id="bell-message" hidden></p>
      <ul id="pinned-list"></ul>
```

In `popup.css`, replace

```
.pin-item:hover .pin-duration,
.pin-item:focus-within .pin-duration,
.pin-item:hover .pin-mr-pipeline,
.pin-item:focus-within .pin-mr-pipeline {
  visibility: hidden;
}
```

with

```
.pin-item:hover .pin-trailing,
.pin-item:focus-within .pin-trailing,
.pin-item:hover .pin-mr-pipeline,
.pin-item:focus-within .pin-mr-pipeline {
  visibility: hidden;
}
```

and replace

```
.pin-remove:hover {
  color: var(--error);
}
```

with

```
.pin-remove:hover {
  color: var(--error);
}

/* A pipeline's right edge: the small bell when armed, then the duration. */
.pin-trailing {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
}

.pin-bell-mark {
  font-size: 10px;
  line-height: 1;
}

/* The bell is a colour emoji, so "off" is grey and dim rather than a different colour. */
.pin-bell {
  filter: grayscale(1);
  opacity: 0.6;
}

.pin-bell:hover,
.pin-bell.armed {
  filter: none;
  opacity: 1;
}
```

- [ ] **Step 4: `popup.js`**

Make these exact replacements.

(a) `import { fetchPipeline } from './lib/pipeline-api.js';` →

```
import { fetchPipeline } from './lib/pipeline-api.js';
import { isFinalStatus } from './lib/watch.js';
```

(b) `  updatePinned,\n  setBase,` →

```
  updatePinned,
  setBase,
  setPinnedNotify,
```

(c) `const pinnedList = document.getElementById('pinned-list');` →

```
const pinnedList = document.getElementById('pinned-list');
const bellMessage = document.getElementById('bell-message');
```

(d) In `describePipeline`, replace

```
  duration.textContent = formatDuration(pipelineElapsedSeconds(entry.raw ?? {})) ?? '';

  return {
```

with

```
  duration.textContent = formatDuration(pipelineElapsedSeconds(entry.raw ?? {})) ?? '';

  // The right edge: a small bell when armed, then the duration.
  const trailing = document.createElement('span');
  trailing.className = 'pin-trailing';
  if (entry.notify) {
    const mark = document.createElement('span');
    mark.className = 'pin-bell-mark';
    mark.title = 'Notifying when this finishes';
    mark.textContent = '\u{1F514}';
    trailing.append(mark);
  }
  trailing.append(duration);

  return {
```

and replace

```
    trailing: duration,
    url: pipelineWebUrl(entry),
```

with

```
    trailing,
    // Not offered once finished: notifying at once would be pointless. A retry turns the
    // status back to running and the bell returns; an armed bell is always shown.
    bell: { armed: Boolean(entry.notify), available: !isFinalStatus(entry.status) },
    url: pipelineWebUrl(entry),
```

(e) In the `pipelinesList` definition, replace

```
  describeRow: describePipeline,
  navigate,
  onRender() {
```

with

```
  describeRow: describePipeline,
  navigate,
  onToggleBell: toggleBell,
  onRender() {
```

(f) Replace the whole `refreshPinned` function:

```
async function refreshPinned(kind) {
  const list = lists[kind];
  const entries = list.getEntries();
  if (entries.length === 0) return;

  const results = await Promise.allSettled(entries.map(FETCHERS[kind]));
  const updates = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (updates.length === 0) return;
```

with

```
// The popup is showing a finished pipeline's result, so an armed bell has done its job:
// switch it off without a notification.
function disarmFinished(entries, updates) {
  const armed = new Set(entries.filter((e) => e.notify).map((e) => `${e.base} ${e.id}`));
  return updates.map((u) =>
    armed.has(`${u.base} ${u.id}`) && isFinalStatus(u.status) ? { ...u, notify: false } : u,
  );
}

async function refreshPinned(kind) {
  const list = lists[kind];
  const entries = list.getEntries();
  if (entries.length === 0) return;

  const results = await Promise.allSettled(entries.map(FETCHERS[kind]));
  let updates = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (kind === 'pipelines') updates = disarmFinished(entries, updates);
  if (updates.length === 0) return;
```

(g) Replace `async function doPin() {` with:

```
const BELL_DENIED =
  'Notifications need your permission — click the bell again to allow them.';

async function toggleBell(entry) {
  clearError(bellMessage);

  if (entry.notify) {
    pipelinesList.setEntries(await setPinnedNotify(entry.base, entry.id, false));
    return;
  }

  // Must be the first await in a click handler, or the user gesture is lost. One request
  // covers both the notifications permission and GitLab access (for the checker's fetch).
  let granted = false;
  try {
    granted = await chrome.permissions.request({
      permissions: ['notifications'],
      origins: [originPattern(entry.base)],
    });
  } catch {
    granted = false;
  }

  if (!granted) {
    showError(bellMessage, BELL_DENIED);
    return;
  }

  ensurePipelineNoteScript(entry.base);
  pipelinesList.setEntries(await setPinnedNotify(entry.base, entry.id, true));
}

async function doPin() {
```

- [ ] **Step 5: Run the checks**

Run: `"$H/sync.sh" && "$H/bell-checks.py"; "$H/colours-checks.py"; "$H/regress.sh" | diff "$H/baseline.txt" - && echo IDENTICAL`
Expected: 6 `OK`; 8 `OK`; `IDENTICAL`.

- [ ] **Step 6: Look at the popup**

Run:

```bash
"$H/shot.sh" "scenario=rest" "$H/t7-rest.png"
```

The file must be over 20,000 bytes. Open it with the Read tool. In PINNED PIPELINES the first row (`Hotfix: login redirect loop`) shows a small 🔔 just before its duration; the other three rows show only their durations (or none). Describe exactly what you see.

Then look at the hover state. Export `H` and build a page that forces the fourth row's hover appearance:

```bash
export H=/private/tmp/claude-501/-Users-nuwan-projects-pet-projects/c8af2f41-ff45-41cc-8d23-0f71067c7865/scratchpad/bell-harness
python3 - <<'PYEOF'
import pathlib, os
h = pathlib.Path(os.environ['H'])
html = (h / 'harness.html').read_text()
style = ('<style>#pinned-list .pin-item:nth-child(4) .pin-actions { opacity: 1; pointer-events: auto; }'
         '#pinned-list .pin-item:nth-child(4) .pin-trailing { visibility: hidden; }'
         '#pinned-list .pin-item:nth-child(4) .pin-nav { background: var(--chip); }</style>')
(h / 'hover.html').write_text(html.replace('</head>', style + '</head>'))
PYEOF
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless --disable-gpu --hide-scrollbars --virtual-time-budget=3000 --window-size=330,1500 --screenshot="$H/t7-hover.png" "http://localhost:8768/hover.html?scenario=rest" >/dev/null 2>&1; ls -l "$H/t7-hover.png"
```

Open `t7-hover.png`: the fourth pipeline row shows a dim grey 🔔, ✎ and ✕ over its right edge. Describe what you see.

- [ ] **Step 7: Unit tests, lint, commit**

Run: `bun test && npx web-ext lint 2>&1 | grep -E "errors|notices|warnings"`
Expected: all pass, 0 fail; errors 0, notices 0, warnings 1 (the expected `BACKGROUND_SERVICE_WORKER_IGNORED`).

```bash
git add pinned-list.js popup.js popup.html popup.css
git commit -m "Add the bell to pinned pipelines in the popup"
```

---

### Task 8: Screenshots, docs, version 0.21.0

**Files:**
- Modify: `tools/screenshot.sh`, `docs/popup-light.png`, `docs/popup-dark.png`, `manifest.json`, `CHANGELOG.md`, `README.md`, `docs/superpowers/specs/2026-08-04-gitlab-navigate-design.md`

**Interfaces:**
- Consumes: the finished feature (Tasks 1–7).

- [ ] **Step 1: Sample bell rows in the screenshot script**

In `tools/screenshot.sh`, replace the `pins = [ … ]` list and the whole `pin_item` function (from `pins = [` through the line `        f'</li>')` that ends `pin_item`, i.e. the text below) with:

```python
pins = [
    ('running', '&#x25CF;', '2816150418', 'dev/1.0.11', '4m 12s',
     'Hotfix: login redirect loop', 'armed'),
    ('success', '&#x2713;', '2816150001', 'fix-plot-layout-pro-expansion-issue', '7m 3s',
     'Retry after flaky e2e', None),
    ('failed', '&#x2715;', '2815998877', '2846-regression-fix', '2m 41s', None, None),
]


def pin_item(status, glyph, pid, ref, duration, note, bell):
    # Mirrors describePipeline() in popup.js and buildNavButton()/buildBell()/buildActions()
    # in pinned-list.js. `bell` is 'armed', 'available' or None (finished pipelines).
    headline = (f'<span class="pin-note">{note}</span>' if note
                else f'<span class="pin-id">#{pid}</span>')
    subline = f'#{pid} &#xB7; {ref}' if note else ref
    mark = ('<span class="pin-bell-mark" title="Notifying when this finishes">&#x1F514;</span>'
            if bell == 'armed' else '')
    button = ''
    if bell:
        armed = bell == 'armed'
        label = 'Stop notifying' if armed else 'Notify me when this finishes'
        button = (f'<button type="button" class="pin-action pin-bell{" armed" if armed else ""}" '
                  f'aria-label="{label}" aria-pressed="{"true" if armed else "false"}">&#x1F514;</button>')
    return (
        f'<li class="pin-item">'
        f'<span class="pin-handle" aria-label="Drag to reorder"></span>'
        f'<button type="button" class="pin-nav">'
        f'<span class="pin-status" data-status="{status}">{glyph}</span>'
        f'<span class="pin-main">{headline}<span class="pin-ref">{subline}</span></span>'
        f'<span class="pin-trailing">{mark}<span class="pin-duration">{duration}</span></span>'
        f'</button>'
        f'<span class="pin-actions">'
        f'{button}'
        f'<button type="button" class="pin-action pin-note-edit" aria-label="Edit note">&#x270E;</button>'
        f'<button type="button" class="pin-action pin-remove" aria-label="Unpin this pipeline">&#x2715;</button>'
        f'</span>'
        f'</li>')
```

Run: `./tools/screenshot.sh && ls -l docs/popup-*.png`
Expected: two lines like `popup-light.png: 330x<height>  bg=(255, 255, 255)`, and both files over 20,000 bytes. Open both with the Read tool. In PINNED PIPELINES the first row (`Hotfix: login redirect loop`) shows a small 🔔 before `4m 12s`; the other two rows do not. Everything else matches the previous render (PINNED TICKETS, PINNED MRS with the full `→ dev/…` targets, CREATE MR, RECENT); nothing is cut off at the bottom; dark mode is readable.

- [ ] **Step 2: Version**

In `manifest.json`, replace `"version": "0.20.1",` with `"version": "0.21.0",`.

- [ ] **Step 3: CHANGELOG**

In `CHANGELOG.md`, replace

```
# Changelog

```

with

```
# Changelog

## 0.21.0

- **Runner colours.** Each runner's badge now has its own colour, so identical runners
  are spotted at a glance: `perentie-runner` is red, `huy-runner` orange and
  `nuwan-runner` green by default, and any other runner gets a steady automatic colour
  (blue, purple, teal, pink or slate, the same for a given tag name every time). Set
  your own under the new **Runner colours** setting as `tag=colour` pairs — a name like
  `red` or a hex like `#c2185b`. Saving recolours open GitLab pages at once.
- **Pipeline bell.** Hover an unfinished pinned pipeline and click 🔔 to be notified when
  it finishes. Even with the popup closed, the extension checks armed pipelines about
  once a minute and raises a browser notification — "Pipeline passed", "failed",
  "canceled" or "skipped" — naming your note (or the number) and the branch; clicking it
  opens the pipeline. The bell then switches itself off. A small 🔔 beside the duration
  shows which pipelines are armed, and opening the popup on a pipeline that has already
  finished switches its bell off quietly.
- New permissions: `alarms` (no install warning) and `notifications`, which is optional
  and only requested the first time you click a bell, so updating adds no install
  warning. The extension gains a background script (a service worker in Chrome, an event
  page in Firefox); `web-ext lint` notes that Firefox ignores the `service_worker` key,
  which is expected.
- Pinned-list writes are now serialised with a browser lock, because the popup and the
  background checker both update the list.

```

- [ ] **Step 4: README**

In `README.md`, make these exact replacements.

**1. The runner-badge introduction.** Replace

```
On your GitLab site's pipelines list and pipeline pages, each pipeline gets a grey badge
naming the runner it targets, such as `perentie-runner`, next to GitLab's own `latest` /
`branch` badges.
```

with

````
On your GitLab site's pipelines list and pipeline pages, each pipeline gets a coloured
badge naming the runner it targets, such as `perentie-runner`, next to GitLab's own
`latest` / `branch` badges. Every runner has its own colour, so identical runners can be
spotted without reading the tag.

**Colours.** `perentie-runner` is red, `huy-runner` orange and `nuwan-runner` green by
default; any other runner gets a steady automatic colour (blue, purple, teal, pink or
slate — always the same for the same tag name). Set your own under **Runner colours** in
settings, written as `tag=colour` and separated by commas, spaces or new lines:

```
perentie-runner=red, huy-runner=orange, nuwan-runner=#2e7d32
```

A colour is a name (`red`, `orange`, `green`, `blue`, `purple`, `teal`, `pink`, `slate`)
or a hex like `#c2185b`. A typo is rejected with a message and nothing is saved; an empty
box gives every runner an automatic colour. Open GitLab pages recolour as soon as you
save.
````

**2. The bell.** Replace the single line

```
Status is refreshed each time the popup opens. Cached values appear instantly and are
```

with

```
**Notifications.** Hover an unfinished pipeline and click 🔔 to be told when it
finishes. Even with the popup closed, the extension checks armed pipelines about once a
minute and raises a browser notification — "Pipeline passed" or "Pipeline failed", with
your note (or the number) and the branch. Click the notification to open the pipeline.
The bell then switches itself off, so arm it again for the next run. A small 🔔 beside
the duration shows which pipelines are armed. The first time, the browser asks for
permission to show notifications (and for GitLab access, if you haven't granted it).
Notifications only appear while the browser is running, and can arrive up to a minute or
so after the pipeline finishes.

Status is refreshed each time the popup opens. Cached values appear instantly and are
```

**3. Permissions.** Replace the single line

```
remove the access in your browser settings, the browser stops running that script too.
```

with

```
remove the access in your browser settings, the browser stops running that script too.

The bell adds the `alarms` permission (Chrome shows no warning for it) and asks for the
`notifications` permission only when you first click a bell, so updating never adds an
install warning.
```

**4. Settings.** Replace `The gear button holds four fields:` with `The gear button holds five fields:`. Then replace

```
  spaces; leave it empty to ignore nothing.

All four are kept
```

with

```
  spaces; leave it empty to ignore nothing.
- **Runner colours** — the colour of each runner's [badge](#runner-badges), as
  `tag=colour` pairs; see there for the format. Leave it empty to give every runner an
  automatic colour.

All five are kept
```

Check: `grep -n "five fields\|All five\|\*\*Notifications\.\*\*\|Runner colours\|alarms" README.md` prints at least 7 lines.

- [ ] **Step 5: Main design doc**

In `docs/superpowers/specs/2026-08-04-gitlab-navigate-design.md`, make these exact replacements.

(a) The file tree. Replace

```
  pinned-list.js    one pinned list: rows, drag-to-reorder, note editing
  content/shared.js          helpers shared by the GitLab page scripts
```

with

```
  pinned-list.js    one pinned list: rows, drag-to-reorder, note editing, the bell button
  background.js     alarm + notification checker for the pipeline bell
  content/shared.js          helpers shared by the GitLab page scripts
  content/colours.js         runner-badge palette and colour rules (page script and popup)
```

and replace

```
  lib/storage.js    chrome.storage read/write helpers
```

with

```
  lib/storage.js    chrome.storage read/write helpers
  lib/pipeline-api.js  the pinned-pipeline fetch shared by the popup and background.js
  lib/watch.js      bell decisions: final statuses, notification text, checkWatched
```

(b) Replace `and read `pinnedPipelines`, `runnerTags` and `ignoredJobTags` directly.` with `and read `pinnedPipelines`, `runnerTags`, `ignoredJobTags` and `runnerColours` directly.`

(c) Replace

```
2. Settings row (hidden by default): base repo URL, default MR target branch, your
   GitLab username, and job tags to ignore for runner badges, each its own labelled
   input + Save button + error line.
```

with

```
2. Settings row (hidden by default): base repo URL, default MR target branch, your
   GitLab username, job tags to ignore for runner badges, and runner colours, each its
   own labelled input + Save button + error line (the colours box is a two-row
   textarea, saved only by its button).
```

(d) Replace

```
getIgnoredJobTags() / setIgnoredJobTags(tags)  // chrome.storage.sync, key "ignoredJobTags"
```

with

```
getIgnoredJobTags() / setIgnoredJobTags(tags)  // chrome.storage.sync, key "ignoredJobTags"
getStoredRunnerColours() / setRunnerColours(pairs)  // chrome.storage.sync, key "runnerColours"
setPinnedNotify(base, id, on)                   // chrome.storage.local, pinnedPipelines[].notify
```

(e) Replace `Base URL, target branch, username and ignored job tags all live in `sync` so they follow the user` with `Base URL, target branch, username, ignored job tags and runner colours all live in `sync` so they follow the user`.

(f) Replace `  "version": "0.20.1",` with `  "version": "0.21.0",`, and replace

```
  "permissions": ["storage", "activeTab", "scripting"],
  "optional_host_permissions": ["*://*/*"],
```

with

```
  "permissions": ["storage", "activeTab", "scripting", "alarms"],
  "optional_permissions": ["notifications"],
  "optional_host_permissions": ["*://*/*"],
  "background": { "service_worker": "background.js", "scripts": ["background.js"], "type": "module" },
```

(g) Replace

```
Full design: `2026-09-22-table-notes-runner-tags-pinned-mrs-design.md`.

## Data Flow
```

with

```
Full design: `2026-09-22-table-notes-runner-tags-pinned-mrs-design.md`.

**Runner colours and the pipeline bell.** Runner badges take a colour from
`content/colours.js` — the palette, the user's `runnerColours` pairs, and an automatic
fallback hashed from the tag name — shared by the page script and the popup's settings
box. A pinned pipeline can carry `notify: true` (the 🔔). `background.js`, a Chrome
service worker and Firefox event page from one manifest entry, keeps a one-minute alarm
running while any bell is on; each tick `checkWatched` (in `lib/watch.js`, with its
fetch, update and notify steps injected) fetches the armed pipelines, notifies once for
each that reached `success`, `failed`, `canceled` or `skipped`, and switches its bell
off. `notifications` is an optional permission requested on the first click of a bell.
Because the popup and the checker both write the pinned lists, `lib/storage.js` wraps
every pinned mutation in a Web Lock. Full design:
`2026-10-01-runner-colours-and-pipeline-bell-design.md`.

## Data Flow
```

(h) Replace the testing lead-in (under `## Testing`)

```
`bun test` over `test/content-shared.test.js`, covering the pure helpers in
`content/shared.js` (pipeline URLs from links, the shared-job-tags rule), and
`test/parse.test.js`, covering `lib/parse.js`:
```

with

```
`bun test` over `test/content-shared.test.js` (the pure helpers in `content/shared.js`:
pipeline URLs from links, the shared-job-tags rule), `test/colours.test.js` (the runner
palette, parsing and resolution), `test/watch.test.js` (the bell's decisions),
`test/storage.test.js` (pinned-list mutations and write safety), `test/background.test.js`
(the checker, with a fake `chrome`), and `test/parse.test.js`, covering `lib/parse.js`:
```

- [ ] **Step 6: Final checks and commit**

Run: `bun test && npx web-ext lint 2>&1 | grep -E "errors|notices|warnings|BACKGROUND" && grep -c '"version": "0.21.0"' manifest.json`
Expected: all pass, 0 fail; errors 0, notices 0, warnings 1 with `BACKGROUND_SERVICE_WORKER_IGNORED`; `1`.

Run: `grep -rn "0\.20\.1" manifest.json docs/superpowers/specs/2026-08-04-gitlab-navigate-design.md | head -3`
Expected: no output.

```bash
git add tools/screenshot.sh docs/popup-light.png docs/popup-dark.png manifest.json CHANGELOG.md README.md docs/superpowers/specs/2026-08-04-gitlab-navigate-design.md
git commit -m "Release runner colours and the pipeline bell (0.21.0)"
```
