# Changelog

## 0.2.0

- Added Pipeline and Job boxes. Pipeline and job ids are both bare numbers with no
  way to tell them apart, so they're separate fields rather than one combined box.

## 0.1.0

- Initial release: popup with Ticket, MR, Commit, and History boxes that open the
  matching GitLab page in a new tab.
- Configurable repo URL, stored in `chrome.storage.sync`.
- Recent list of the last 8 navigations.
- `Cmd+Shift+G` / `Ctrl+Shift+G` opens the popup.
