# Runner Colours and the Pipeline Bell — Design

Date: 2026-10-01
Target version: 0.21.0

## Goals

1. Give each runner tag its own badge colour, settable in Settings, so identical runners
   are spotted by colour rather than by reading.
2. Let a pinned pipeline carry a bell: when it finishes, raise a browser notification,
   even with the popup closed.

## Part 1: Runner colours

### Palette

Solid fills in GitLab's pill shape. `fg` is the text colour; every pairing has a WCAG
contrast ratio of at least 4.5:1 (`textColourFor` picks white or `#1f1e24`, whichever
contrasts more, for hex colours).

| name | background | fg | contrast |
|------|------------|----|----------|
| red | `#c91c00` | `#ffffff` | 5.75 |
| orange | `#ee8220` | `#1f1e24` | 6.18 |
| green | `#217645` | `#ffffff` | 5.61 |
| blue | `#1f6fc2` | `#ffffff` | 5.11 |
| purple | `#7b58cf` | `#ffffff` | 5.07 |
| teal | `#0a7c80` | `#ffffff` | 4.99 |
| pink | `#b8336a` | `#ffffff` | 5.65 |
| slate | `#5c6770` | `#ffffff` | 5.79 |

Solid fills with their own text colour read the same in GitLab's light and dark themes.

### Resolution

`resolveRunnerColour(tag, pairs)` → `{ background, color }`:

1. If `pairs` has an entry for `tag` (compared case-insensitively), use its colour: a
   palette name, or a hex (`#rgb` / `#rrggbb`, normalized to `#rrggbb`).
2. Otherwise an **automatic** colour: the FNV-1a 32-bit hash of the lower-cased tag,
   modulo 5, indexing `[blue, purple, teal, pink, slate]` — the palette minus the three
   default colours. Pure function of the tag name, so a tag is the same colour on every
   page and in every browser.

### Defaults and storage

`DEFAULT_RUNNER_COLOURS = [['perentie-runner', 'red'], ['huy-runner', 'orange'],
['nuwan-runner', 'green']]`.

`chrome.storage.sync` key `runnerColours`: an array of `[tag, colour]` pairs, in the
order the user wrote them. An array, not an object, because Chrome returns object keys
sorted alphabetically and the box should keep the user's order.

- Absent → the defaults apply and the Settings box shows them.
- `[]` → the user cleared the box: no explicit colours, every runner automatic.
- Read values that are not an array of valid `[string, string]` pairs count as absent.

### Settings field

A fifth field, **Runner colours** (label `Runner colours`), with a Save button and an
error line like the others. The box shows the effective pairs as `tag=colour`, joined by
`, `. `parseRunnerColours(text)` → `{ pairs }` or `{ error }`:

- Entries are separated by commas, whitespace or new lines; each is `tag=colour`.
- The colour is a palette name or a hex; names are lower-cased, hex is normalized.
- Errors (nothing is saved; the message names the entry):
  - `Use tag=colour, e.g. perentie-runner=red` — an entry with no `=`, an empty tag or an
    empty colour.
  - `Unknown colour "orang" for huy-runner` — not a palette name or valid hex.
  - `perentie-runner is listed twice` — the same tag twice, compared case-insensitively.
- Empty input is valid and saves `[]`.
- After a successful save the box is rewritten from the saved pairs.
- The box is a two-row textarea (entries can be long and may be separated by new lines);
  only the Save button saves, since Enter inserts a new line.

### On the page

`content/runner-tags.js` resolves each badge's colour with `resolveRunnerColour` and
sets `background-color` and `color` inline on the badge (the pill keeps
`gl-badge badge badge-pill`; `badge-neutral` goes). Each badge carries
`data-gitlab-navigate-runner-colour="<background>"`, and the "does this container
already match?" comparison includes the colour, so a recolour redraws and an unchanged
pass still writes nothing. The script reads `runnerColours` from sync storage on load
(absent or invalid → defaults) and listens for `chrome.storage.onChanged` (`sync`,
`runnerColours`), redrawing open tabs at once.

### Shared file

`content/colours.js` is a classic script defining `globalThis.gitlabNavigateColours =
{ PALETTE, DEFAULT_RUNNER_COLOURS, parseRunnerColours, resolveRunnerColour,
textColourFor }`. It touches no `chrome.*` or `document`, so bun imports it for tests.
The page script gets it through the registered `js` list (before `runner-tags.js`), and
the popup through a `<script src="content/colours.js">` tag before `popup.js`, so the
palette and rules exist in one place.

## Part 2: The pipeline bell

### The bell

- Pinned **pipelines** only. Stored as `notify: true` on the entry; turning it off
  deletes the key.
- **At rest:** an armed row shows 🔔 beside its duration.
- **On hover:** a bell button is the first of the hover actions (before ✎ and ✕).
  Armed it is highlighted; unarmed it is dimmed. Titles: `Notify me when this finishes`
  / `Stop notifying`. Its `aria-label` is the same.
- **Not offered** on a pipeline already known to be finished (`success`, `failed`,
  `canceled`, `skipped`) — notifying at once would be pointless; a retry turns it back
  to running and the bell returns. An armed row always shows the bell, so a stale armed
  bell can be switched off.
- `describeRow` returns `bell: { armed, available }` (absent for tickets and MRs);
  `createPinnedList` gains an optional `onToggleBell(entry)`.

### Arming

Clicking the bell on an unarmed row calls
`chrome.permissions.request({ permissions: ['notifications'], origins:
[originPattern(base)] })` as the **first await** of the click handler (browsers only
honour the request inside a user gesture). Granted → `notify: true` is saved. Denied or
an error → the bell stays off and the pinned-pipelines section shows the line
`Notifications need your permission — click the bell again to allow them.` Clicking an
armed bell turns it off without asking.

### The checker: `background.js`

An ES module declared as both the Chrome service worker and the Firefox event page. It
registers every listener at top level and keeps no state in memory (all state is in
storage), so it survives being stopped and restarted.

- **Alarm** `pipeline-watch`, `periodInMinutes: 1`. `syncAlarm()` creates it when any
  pinned pipeline has `notify: true` and clears it when none does. It runs on
  `runtime.onInstalled`, `runtime.onStartup` and whenever `pinnedPipelines` changes
  (`storage.onChanged`), so updates, restarts and arming from the popup all converge.
- **`checkWatched()`** on each alarm: for each armed entry, `fetchPipeline(entry)` (the
  same call the popup makes, in `lib/pipeline-api.js`). For each result:
  - `isFinalStatus(status)` (`success`, `failed`, `canceled`, `skipped`): notify, then
    save the fresh status fields and turn the bell off in **one** write. `manual`,
    `scheduled`, `created`, `pending`, `running` and the rest are not final: save the
    fresh status, leave the bell on.
  - HTTP 404: the pipeline is gone, so turn the bell off silently.
  - Any other failure (network, logged out, 5xx): skip; try again next minute.
- **Notification:** `chrome.notifications.create(pipelineUrl, { type: 'basic',
  iconUrl: 'icons/icon128.png', title, message })`. `title` is `Pipeline passed` /
  `failed` / `canceled` / `skipped`. `message` is the note, or `#<id>` with no note,
  followed by ` (<ref>)` when the branch is known. Only options both browsers accept
  are used. The notification id is the pipeline's URL.
- **Click:** `chrome.notifications.onClicked` opens the id (only if it is http/https) in
  a new tab and clears the notification. The listener is registered at top level when
  `chrome.notifications` exists, and again on `chrome.permissions.onAdded` (the
  permission is optional, so the API may appear after the worker started). It is
  idempotent. If `chrome.notifications` is missing when an alarm fires, `checkWatched`
  returns without fetching or disarming anything.
- **Host access:** the fetch needs the GitLab host permission the popup already holds;
  without it the fetch fails and is skipped like any other failure.

### Popup changes

- `refreshPinned('pipelines')`: for an armed entry whose fetched status is final, the
  update written by `updatePinned` also carries `notify: false` (which `updatePinned`
  stores by deleting the key). The user is looking at
  the result, so no notification follows. Unarmed entries are untouched.
- `describePipeline` adds the bell to `trailing` (an element wrapping the 🔔 and the
  duration) and returns the `bell` descriptor.
- `fetchPipeline` moves from `popup.js` to `lib/pipeline-api.js` and is shared.

### Write safety

The popup and the checker both read-modify-write `pinnedPipelines`. Every such mutation
in `lib/storage.js` (`pinItem`, `unpinItem`, `updatePinned`, `setPinnedNote`,
`reorderPinned`, and the new `setPinnedNotify`) goes through one helper that holds
`navigator.locks.request('gitlab-navigate-pinned', …)` for the read and the write, so
neither overwrites the other's change. Where `navigator.locks` does not exist the helper
runs the mutation directly.

### Manifest

- `permissions` gains `"alarms"` (no install warning).
- `optional_permissions: ["notifications"]` — Chrome's install warning for
  `notifications` ("Display notifications") is therefore never shown at install or
  update.
- `background: { "service_worker": "background.js", "scripts": ["background.js"],
  "type": "module" }`. Chrome 121+ uses the service worker and Firefox 121+ the event
  page from the same entry; Firefox's minimum here is 140. `web-ext lint` then reports
  exactly one warning, `BACKGROUND_SERVICE_WORKER_IGNORED` (Firefox ignores
  `service_worker`, which is why `scripts` is listed beside it), and 0 errors and 0
  notices. Checked on a scratch copy of the manifest before this was written down.
- Version `0.21.0`.

## Data

- `pinnedPipelines` entries gain an optional `notify: true`. Nothing else changes, so
  existing pins are unaffected.
- `runnerColours` (`chrome.storage.sync`): `[tag, colour][]`, see Part 1.

## Code

| File | Change |
|------|--------|
| `content/colours.js` (new) | palette, defaults, `parseRunnerColours`, `resolveRunnerColour`, `textColourFor` |
| `content/runner-tags.js` | coloured badges, reads `runnerColours`, redraws on change |
| `lib/watch.js` (new) | `FINAL_STATUSES`, `isFinalStatus(status)`, `finishedNotice(entry, fetched)` → `{ title, message }` or `null`, `checkWatched({ entries, fetchPipeline, update, notify })` |
| `lib/pipeline-api.js` (new) | `fetchPipeline(entry)`, moved from `popup.js` |
| `lib/storage.js` | lock helper around pinned mutations; `setPinnedNotify`; `getRunnerColours` / `setRunnerColours` |
| `background.js` (new) | alarm, notification and click handling; exports `runCheck`, `syncAlarm`, `openNotification` |
| `pinned-list.js` | optional `bell` descriptor and `onToggleBell`; bell button in the hover actions |
| `popup.js`, `popup.html`, `popup.css` | Runner colours field; bell wiring, permission request, popup disarm; styles; `<script src="content/colours.js">` |
| `popup.js` | `ensurePipelineNoteScript`'s `js` list gains `content/colours.js` |
| `manifest.json` | `alarms`, optional `notifications`, `background`, version 0.21.0 |
| `tools/screenshot.sh`, `docs/popup-*.png` | bell on a sample pipeline row; regenerated |
| `CHANGELOG.md`, `README.md`, `docs/superpowers/specs/2026-08-04-gitlab-navigate-design.md` | 0.21.0 docs |

## Testing

- **Unit (bun):**
  - `parseRunnerColours`: names, hex (`#rgb`, `#rrggbb`, upper case), separators (commas,
    spaces, new lines), empty input, each of the three errors, trailing separators.
  - `resolveRunnerColour`: explicit match, case-insensitive match, automatic colour
    stable and only from the five automatic colours, unknown tag vs defaults.
  - `textColourFor`: picks the higher-contrast of white and `#1f1e24`; every palette pair
    meets 4.5:1.
  - `isFinalStatus` for every GitLab pipeline status; `finishedNotice`: title per
    status, message with and without a note and with and without a ref, `null` for a
    non-final status.
- **Popup harness** (headless Chrome, real popup, stubbed `chrome.*`):
  - Bell: hidden on a finished row, shown on others; arming calls `permissions.request`
    first with both the permission and the origin; declining leaves it off and shows the
    message; disarming needs no request; an armed row shows 🔔 at rest; opening the
    popup disarms an armed row whose fetched status is final and leaves other armed rows.
  - Runner colours field: defaults shown, a valid save stored and re-rendered, each error
    shown with nothing saved, empty saved as `[]`.
  - The 0.20 pipeline, ticket and MR scenarios as a regression check.
- **Background checker (bun, no browser):** the decision logic is `checkWatched(deps)` in
  `lib/watch.js`, with the fetch, update and notify steps injected, and `background.js`
  is tested with a fake `chrome` and a fake `fetch` (it exports `runCheck`,
  `syncAlarm` and `openNotification`, and registers its listeners at import). Covered:
  notifies once and disarms for each final status; leaves a running pipeline armed;
  skips and keeps the bell on after a network failure; disarms silently on 404; a
  failing notification leaves the bell armed and does not stop the other pipelines; the
  alarm is created and cleared as bells come and go and is not duplicated; nothing
  happens when `chrome.notifications` is missing; the click handler opens only http(s)
  ids; the alarm listener ignores other alarms.
- **Storage (bun, fake `chrome.storage` and Web Locks):** the pinned-list mutations still
  behave (pin, unpin, note, reorder, cap), `setPinnedNotify` and `updatePinned`'s
  `notify: false` add and remove the key, and two concurrent mutations both persist.
- **Page harness:** badges take their colours in the table and on the pipeline page;
  unlisted tags take stable automatic colours; saving new colours recolours open pages;
  the no-op pass still writes nothing (the existing feedback-loop guard).
- **Screenshots:** opened and byte-size checked (> 20 KB) before being trusted.
- **Lint:** `web-ext lint` reports 0 errors, 0 notices and the one expected
  `BACKGROUND_SERVICE_WORKER_IGNORED` warning.
- **Manual, real browser:** a real service worker waking on the alarm, a real system
  notification and clicking it, and Firefox.

## Known limitations

- Latency is up to about a minute, and Chrome may delay alarms further. While the
  computer sleeps, missed alarms fire when it wakes.
- Notifications only appear while the browser is running.
- A pipeline that finishes and is retried between two checks is missed.
- Revoking the notifications permission leaves bells armed but silent; clicking the
  bell asks again.
- Notifications use only options both browsers accept, so there is no
  "stay until dismissed" option.
- Automatic colours can collide: five colours for any number of other runners.
- The checker is not exercised in a real browser by the automated tests.

## Release

0.21.0: `manifest.json`, CHANGELOG, README (Runner colours; the bell), main design doc,
screenshots. Committed locally; pushed only when the user asks.

## Out of scope

Bells on tickets or MRs, a configurable check interval, sounds, notifying on every
status change, a colour picker.
