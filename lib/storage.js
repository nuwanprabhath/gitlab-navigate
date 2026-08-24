/**
 * The only module that knows the storage keys.
 *
 * Base URL lives in sync so it follows the user across machines.
 * History lives in local because it is machine-specific noise.
 */

const BASE_KEY = 'baseUrl';
const TARGET_BRANCH_KEY = 'targetBranch';
const USERNAME_KEY = 'username';
const HISTORY_KEY = 'history';
const HISTORY_LIMIT = 8;

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

export async function removeHistory(url) {
  const previous = await getHistory();
  const history = previous.filter((item) => item.url !== url);
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
  return history;
}
