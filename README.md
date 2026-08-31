# GitLab Navigate

A Chrome and Firefox extension that turns a bare GitLab reference into a tab. Open the
popup, paste a ticket number, MR number, commit hash, or branch name, press Enter.

## Install

### Chrome

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. Open the popup and set your GitLab repo URL, e.g.
   `https://gitlab.com/ternandsparrow/paratoo-fdcp`.

The popup is also bound to **Cmd+Shift+G** (**Ctrl+Shift+G** on Windows/Linux). Change
it at `chrome://extensions/shortcuts`.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and pick this folder's `manifest.json`.
3. Set your GitLab repo URL as above.

Three Firefox-specific things to know:

- Temporary add-ons unload when Firefox closes, so those steps repeat each session. For
  a permanent install, sign the folder as an unlisted add-on (`npx web-ext sign`) and
  install the resulting `.xpi`.
- The default shortcut collides with Firefox's built-in find-previous binding. Rebind it
  at `about:addons` > gear > **Manage Extension Shortcuts**.
- Loading logs one warning, `Reading manifest: Warning processing key`. That is Firefox
  ignoring the Chrome-only `key` property (see [Settings survive
  updates](#settings-survive-updates)). It is a warning, not an error, and nothing
  breaks.
- Minimum versions are Firefox **140** on desktop and **142** on Android. Both floors
  come from `data_collection_permissions`, which desktop gained in 140 and Android in
  142 — not from anything the extension itself does. 140 is deliberate: it is the
  current ESR, so the extension installs on ESR machines.

## MRs

Two buttons under the **MRs** heading, each opening a filtered MR list (open, newest
first, 100 per page):

- **Reviewer** — MRs where you're requested as a reviewer (`reviewer_username`).
- **Mine** — MRs assigned to you (`assignee_username`), i.e. the ones you have to deal
  with.

**Mine** is assignee-filtered rather than a true "authored or assigned" union because
GitLab can't express that in a URL: filter params AND together (`?author_username=you&
assignee_username=you` means *both*, which is narrower), the MR list has a `not` hash
but no `or` hash, and `scope` accepts only one of `created_by_me` / `assigned_to_me` /
`reviews_for_me` / `all`. Since GitLab's new-MR form assigns the author by default,
assignee covers your own MRs in practice — the one gap is an MR you opened and
assigned to somebody else.

Both need your GitLab username, set once in settings. Clicking either before the repo
URL or username is configured opens settings with an inline error instead of failing
quietly.

## Create

One box: paste a source branch, press Enter, and GitLab's new-merge-request page opens
with that source branch and your configured default target branch already selected —
no more re-picking the target away from `main` every time.

| Box    | You type                              | It opens                                                       |
|--------|---------------------------------------|----------------------------------------------------------------|
| Branch | `fix-plot-layout-pro-expansion-issue` | new MR page, that branch as source, your default target branch |

## Go to

Given the base URL above, each box under **Go to** takes a bare reference:

| Box      | You type       | It opens                                  |
|----------|----------------|-------------------------------------------|
| Ticket   | `2795`         | `.../paratoo-fdcp/-/work_items/2795`      |
| MR       | `1122`         | `.../paratoo-fdcp/-/merge_requests/1122`  |
| Commit   | `5c3f861…`     | `.../paratoo-fdcp/-/commit/5c3f861…`      |
| History  | `dev/1.0.11`   | `.../paratoo-fdcp/-/commits/dev%2F1.0.11/`|
| Pipeline | `2753700544`   | `.../paratoo-fdcp/-/pipelines/2753700544` |
| Job      | `15853756077`  | `.../paratoo-fdcp/-/jobs/15853756077`     |

Pipeline and job ids are both bare numbers with no way to tell them apart from the id
alone, so they get their own boxes rather than sharing one.

Input is forgiving everywhere: `#2795` and `!1122` work, commit hashes may be 7–40 hex
characters in any case, branch names may carry a leading `origin/` or `refs/heads/`,
and pasting a full GitLab URL into any box just opens that URL.

## Recent

The last 8 places you visited are listed under **Recent** and are one click away.
Hover (or tab to) an entry to reveal a 🗑 button that removes just that one. The type
badge sits in a fixed-width column so every value lines up at the same left edge.

## Swap branches on a "new merge request" page

If GitLab's active tab is already on a `.../-/merge_requests/new?...` page (typically
because you got there via the Create box), the popup shows a **Swap
source/target branches** button. Click it and that tab reloads with source and
target swapped — handy when GitLab reports "these branches already have an open
merge request" and you actually meant it the other way round.

This reads and rewrites the tab's URL only; it doesn't touch the page's DOM, so it
can't break when GitLab changes their UI.

## Settings

The gear button holds three fields:

- **GitLab repo URL** — paste any page from the repo and everything from `/-/` onward
  is stripped, so `…/paratoo-fdcp/-/merge_requests/1122` is stored as
  `…/paratoo-fdcp`. Self-hosted GitLab instances work; the URL just has to be http(s).
- **Default MR target branch** — used by the Create MR box, e.g. `dev/1.0.11`.
- **Your GitLab username** — used by the Reviewer and Mine buttons, e.g.
  `nuwan-tern`.

All three are kept in `chrome.storage.sync`, so they follow your Chrome profile. In
Firefox the same storage follows your Firefox Account; without one signed in it behaves
as local storage and stays on that machine. Recent history is kept in
`chrome.storage.local`.

### Settings survive updates

`manifest.json` carries a `key` that pins the extension ID. Without it, an unpacked
extension's ID is derived from its folder path, so re-adding it via **Load unpacked**
(or moving the folder) produces a different ID — and therefore an empty settings
bucket. With the key pinned, the ID is the same everywhere, so your repo URL, target
branch, and username persist across reinstalls, folder moves, and other machines.

Reloading in place with the ⟳ button on `chrome://extensions` never cleared settings;
removing and re-adding did.

## Development

No build step. Vanilla JS, Manifest V3, no background service worker.

One codebase covers both browsers. Firefox aliases the `chrome.*` namespace and, under
Manifest V3, returns promises from it, so every `chrome.tabs.*` and `chrome.storage.*`
call works unchanged with no polyfill. The only Firefox-specific manifest entry is
`browser_specific_settings.gecko`, which supplies the add-on ID that Manifest V3
requires. Chrome ignores that key, Firefox ignores `key`.

```
bun test        # unit tests for lib/parse.js
```

`lib/parse.js` is pure reference-to-URL translation with no Chrome dependencies;
`popup.js` holds all DOM and extension API wiring; `lib/storage.js` owns the storage
keys.

```
npx web-ext lint    # validates the manifest against Firefox/AMO rules
npx web-ext run     # launches a scratch Firefox with the extension loaded
```
