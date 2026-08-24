# GitLab Navigate

A Chrome extension that turns a bare GitLab reference into a tab. Open the popup,
paste a ticket number, MR number, commit hash, or branch name, press Enter.

## Install

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and pick this folder.
3. Open the popup and set your GitLab repo URL, e.g.
   `https://gitlab.com/ternandsparrow/paratoo-fdcp`.

The popup is also bound to **Cmd+Shift+G** (**Ctrl+Shift+G** on Windows/Linux). Change
it at `chrome://extensions/shortcuts`.

## What each box does

Given the base URL above:

| Box     | You type       | It opens                                                     |
|---------|----------------|--------------------------------------------------------------|
| Ticket  | `2795`         | `.../paratoo-fdcp/-/work_items/2795`                          |
| MR      | `1122`         | `.../paratoo-fdcp/-/merge_requests/1122`                      |
| Commit  | `5c3f861…`     | `.../paratoo-fdcp/-/commit/5c3f861…`                          |
| History | `dev/1.0.11`   | `.../paratoo-fdcp/-/commits/dev%2F1.0.11/`                    |
| Pipeline| `2753700544`   | `.../paratoo-fdcp/-/pipelines/2753700544`                      |
| Job     | `15853756077`  | `.../paratoo-fdcp/-/jobs/15853756077`                          |
| Create MR | `fix-plot-layout-pro-expansion-issue` | new MR page, source `fix-plot-layout-pro-expansion-issue`, target set to your configured default branch |

Pipeline and job ids are both bare numbers with no way to tell them apart from the id
alone, so they get their own boxes rather than sharing one.

**Create MR** paste a source branch, press Enter, and GitLab's new-merge-request page
opens with that source branch and your configured default target branch already
selected — no more re-picking the target away from `main` every time.

Input is forgiving: `#2795` and `!1122` work, commit hashes may be 7–40 hex characters
in any case, branch names may carry a leading `origin/` or `refs/heads/`, and pasting a
full GitLab URL into any box just opens that URL.

The last 8 places you visited are listed under **Recent** and are one click away.

## Header buttons

Next to the "GitLab Navigate" title:

- **MR-c** — opens a blank new-MR page, letting you (or GitLab) pick both branches
  from scratch. Unlike the Create MR box, it doesn't prefill anything.
- **MR-a** — opens MRs where you're requested as a **reviewer**: open, newest first,
  100 per page.
- **MR-as** — opens MRs where you're the **assignee**: same filters, different
  GitLab field. GitLab treats "reviewer" and "assignee" as separate roles on an MR,
  so this is deliberately a second button rather than one that mixes both.

Both MR-a and MR-as need your GitLab username, set once in settings. Clicking any of
the three before the repo URL (or username, for MR-a/MR-as) is configured opens
settings with an inline error instead of failing quietly.

## Swap branches on a "new merge request" page

If GitLab's active tab is already on a `.../-/merge_requests/new?...` page (typically
because you got there via the Create MR box), the popup shows a **Swap
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
- **Your GitLab username** — used by MR-a to filter MRs down to the ones assigned to
  you for review, e.g. `nuwan-tern`.

All three are kept in `chrome.storage.sync`, so they follow your Chrome profile.
Recent history is kept in `chrome.storage.local`.

## Development

No build step. Vanilla JS, Manifest V3.

```
bun test        # unit tests for lib/parse.js
```

`lib/parse.js` is pure reference-to-URL translation with no Chrome dependencies;
`popup.js` holds all DOM and Chrome API wiring; `lib/storage.js` owns the storage keys.
