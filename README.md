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

Input is forgiving: `#2795` and `!1122` work, commit hashes may be 7–40 hex characters
in any case, branch names may carry a leading `origin/` or `refs/heads/`, and pasting a
full GitLab URL into any box just opens that URL.

The last 8 places you visited are listed under **Recent** and are one click away.

## Settings

The gear button holds the repo URL. Paste any page from the repo — everything from
`/-/` onward is stripped, so `…/paratoo-fdcp/-/merge_requests/1122` is stored as
`…/paratoo-fdcp`. Self-hosted GitLab instances work; the URL just has to be http(s).

The repo URL is kept in `chrome.storage.sync`, so it follows your Chrome profile.
Recent history is kept in `chrome.storage.local`.

## Development

No build step. Vanilla JS, Manifest V3.

```
bun test        # unit tests for lib/parse.js
```

`lib/parse.js` is pure reference-to-URL translation with no Chrome dependencies;
`popup.js` holds all DOM and Chrome API wiring; `lib/storage.js` owns the storage keys.
