/**
 * The only module that knows the storage keys.
 *
 * Base URL lives in sync so it follows the user across machines.
 * History lives in local because it is machine-specific noise.
 */

const BASE_KEY = 'baseUrl';
const TARGET_BRANCH_KEY = 'targetBranch';
const USERNAME_KEY = 'username';
const IGNORED_JOB_TAGS_KEY = 'ignoredJobTags';
const HISTORY_KEY = 'history';
const HISTORY_LIMIT = 8;
const PINNED_KEYS = { pipelines: 'pinnedPipelines', tickets: 'pinnedTickets' };
const PINNED_LIMIT = 10;

export async function getBase() {
  const { [BASE_KEY]: base } = await chrome.storage.sync.get(BASE_KEY);
  return base || '';
}

export async function setBase(url) {
  await chrome.storage.sync.set({ [BASE_KEY]: url });
}

export async function getTargetBranch() {
  const { [TARGET_BRANCH_KEY]: branch } = await chrome.storage.sync.get(
    TARGET_BRANCH_KEY,
  );
  return branch || '';
}

export async function setTargetBranch(branch) {
  await chrome.storage.sync.set({ [TARGET_BRANCH_KEY]: branch });
}

export async function getUsername() {
  const { [USERNAME_KEY]: username } = await chrome.storage.sync.get(USERNAME_KEY);
  return username || '';
}

export async function setUsername(username) {
  await chrome.storage.sync.set({ [USERNAME_KEY]: username });
}

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
  const { [HISTORY_KEY]: history } = await chrome.storage.local.get(HISTORY_KEY);
  return Array.isArray(history) ? history : [];
}

export async function pushHistory(entry) {
  const previous = await getHistory();
  const history = [
    { ...entry, ts: Date.now() },
    ...previous.filter((item) => item.url !== entry.url),
  ].slice(0, HISTORY_LIMIT);
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
  return history;
}

function pinnedKey(kind) {
  const key = PINNED_KEYS[kind];
  // chrome.storage.local.get(undefined) would return everything, so fail loudly instead.
  if (!key) throw new Error(`Unknown pinned list: ${kind}`);
  return key;
}

/**
 * @param {'pipelines'|'tickets'} kind which pinned list
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

export async function pinItem(kind, entry) {
  const previous = await getPinned(kind);
  const without = previous.filter((p) => !(p.base === entry.base && p.id === entry.id));
  return savePinned(kind, [{ ...entry, pinnedAt: Date.now() }, ...without].slice(0, PINNED_LIMIT));
}

export async function unpinItem(kind, base, id) {
  const previous = await getPinned(kind);
  return savePinned(kind, previous.filter((p) => !(p.base === base && p.id === id)));
}

/**
 * Merge freshly fetched fields into the pinned entries, keyed by base + id. Entries
 * that were unpinned while a fetch was in flight are simply not matched.
 */
export async function updatePinned(kind, updates) {
  const previous = await getPinned(kind);
  return savePinned(
    kind,
    previous.map((p) => {
      const update = updates.find((u) => u.base === p.base && u.id === p.id);
      return update ? { ...p, ...update } : p;
    }),
  );
}

/**
 * Set a pinned item's note, or remove it when `note` is ''.
 */
export async function setPinnedNote(kind, base, id, note) {
  const previous = await getPinned(kind);
  return savePinned(
    kind,
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
 * Move a pinned item to a new position in its list.
 * @param {number} targetIndex 0-based target position
 */
export async function reorderPinned(kind, base, id, targetIndex) {
  const previous = await getPinned(kind);
  const currentIndex = previous.findIndex((p) => p.base === base && p.id === id);
  if (currentIndex === -1) return previous;

  const reordered = [...previous];
  const [item] = reordered.splice(currentIndex, 1);
  reordered.splice(targetIndex, 0, item);
  return savePinned(kind, reordered);
}

export async function removeHistory(url) {
  const previous = await getHistory();
  const history = previous.filter((item) => item.url !== url);
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
  return history;
}
