# Changelog

## 0.12.0

- Added a **Pipelines** section with two buttons, both scoped to running pipelines
  across all refs (`status=running&scope=all`):
  - **Running** — every running pipeline in the repo.
  - **Mine** — running pipelines you triggered (`username`).
- **Running** is the first list button that needs only the repo URL, not the username,
  so it goes through its own guard and works before a username is set.

## 0.11.0

- Added a **Tickets** section with three buttons, all filtering GitLab's work-item list
  for your configured username:
  - **Assigned** — work items assigned to you.
  - **In progress** — assigned to you with status `In progress`.
  - **Authored** — work items you opened.
- "In progress" uses GitLab's native work-item Status field, not a label; GitLab's issue
  `state` is only `opened`/`closed` and cannot express it. The URLs match what the
  work-item list produces itself: `assignee_username[]` (bracketed), `author_username`
  (not bracketed), and `status`, with spaces encoded as `%20`.
- All three use `state=all`, matching the views already in use, so closed work items are
  included.

## 0.10.0

- Added Firefox support. Manifest V3 in Firefox requires an explicit add-on ID, so
  `manifest.json` now carries a `browser_specific_settings.gecko` block; without it
  Firefox refuses to load the extension at all.
- No JavaScript changed. Firefox aliases the `chrome.*` namespace and returns promises
  from it under Manifest V3, so the existing `chrome.tabs.*` and `chrome.storage.*`
  calls work as-is, with no polyfill and no `browser.*` rewrite. The extension has no
  background service worker, which is the usual Manifest V3 porting blocker.
- One manifest serves both browsers. Chrome's `key` is kept so existing Chrome installs
  keep their pinned extension ID and their settings; Firefox ignores it and logs a
  harmless "unexpected property" warning, which the README now explains.
- Minimum Firefox is 140 on desktop, declared separately from 142 on Android via
  `gecko_android`. Both floors come only from `data_collection_permissions` support
  (desktop 140, Android 142). A single 142 floor would have excluded Firefox ESR,
  currently 140.x, which is what managed machines run.
- README gained a Firefox install section covering temporary add-ons, signing an
  unlisted `.xpi` for a permanent install, and the shortcut collision with Firefox's
  find-previous binding.

## 0.9.0

- Replaced the **Author** button with **Mine** (`assignee_username`) — one button for
  the MRs you have to deal with, without an author/assignee split.
- GitLab cannot return a true "author OR assignee" list: MR filter params AND
  together, the MR list supports a `not` hash but no `or` hash, and `scope` is
  single-select (`created_by_me` / `assigned_to_me` / `reviews_for_me` / `all`).
  Assignee is the practical stand-in, since GitLab's new-MR form assigns the author by
  default. An MR you authored but assigned to someone else will not appear.

## 0.8.0

- Reorganised the popup into labelled sections. The MR list buttons moved out of the
  cramped header into an **MRs** section and were renamed for clarity: **Reviewer**
  (MRs awaiting my review) and **Author** (MRs I opened). The Create MR box moved to
  its own **Create** section, and the remaining reference boxes sit under **Go to**.
- Removed the **MR-c** button. The Create section covers creating an MR, and the blank
  new-MR page it opened is one click away inside GitLab.
- **Author** now filters on `author_username`. The button it replaces (MR-as) filtered
  on `assignee_username`; see README for why the label and the filter now match.
- Pinned the extension ID with a manifest `key`, so settings survive a re-install or a
  move of the extension folder instead of landing in a fresh, empty storage bucket.
- Recent entries now align: the type badge sits in a fixed-width column, so every
  value starts at the same left edge regardless of badge length.

## 0.7.0

- Recent entries now show a 🗑 delete button on hover (or keyboard focus), so a
  single stale/wrong item can be removed without clearing the whole list.

## 0.6.0

- Added a third header button, **MR-as**, for MRs where you're the assignee
  (`assignee_username`) — distinct from **MR-a**, which filters by reviewer
  (`reviewer_username`). Same opened/newest-first/100-per-page filters, same
  username setting.

## 0.5.0

- Added two header buttons next to the "GitLab Navigate" title:
  - **MR-c** opens a blank new-MR page (`.../-/merge_requests/new`), letting GitLab
    pick the branches.
  - **MR-a** opens open MRs where you're requested as reviewer, sorted newest first,
    100 per page.
- Settings gained a third field: **Your GitLab username**, used by MR-a. Clicking
  either header button before the repo URL (and, for MR-a, the username) is set
  opens settings with an inline error instead of failing silently.

## 0.4.0

- Added a "Swap source/target branches" button. When the active tab is a GitLab new-MR
  page (`.../-/merge_requests/new?...`), the popup shows it; clicking swaps the
  `source_branch`/`target_branch` (and project ids, if present) in that tab's URL and
  reloads it — no more re-picking branches by hand when GitLab reports "these branches
  already have an open merge request".
- Adds the `activeTab` permission, scoped to the tab the popup is opened against —
  no content script, no host permissions, no broad "read data on all sites" warning.

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
