# Changelog

## 0.3.0

- Added a Create MR box. Paste a source branch name and it opens GitLab's new-MR page
  pre-filled with that source branch and a configurable default target branch (e.g.
  `dev/1.0.11`), skipping GitLab's default of proposing `main`.
- Settings gained a second field: default MR target branch, stored in
  `chrome.storage.sync` alongside the repo URL.

## 0.2.0

- Added Pipeline and Job boxes. Pipeline and job ids are both bare numbers with no
  way to tell them apart, so they're separate fields rather than one combined box.

## 0.1.0

- Initial release: popup with Ticket, MR, Commit, and History boxes that open the
  matching GitLab page in a new tab.
- Configurable repo URL, stored in `chrome.storage.sync`.
- Recent list of the last 8 navigations.
- `Cmd+Shift+G` / `Ctrl+Shift+G` opens the popup.
