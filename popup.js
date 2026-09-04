import {
  ParseError,
  assignedTicketsUrl,
  authoredPipelinesUrl,
  authoredTicketsUrl,
  buildUrl,
  inProgressTicketsUrl,
  mineMrUrl,
  myPipelinesUrl,
  formatDuration,
  normalizeBase,
  originPattern,
  parsePipelineUrl,
  pipelineApiUrl,
  pipelineElapsedSeconds,
  reviewerMrUrl,
  runningPipelinesUrl,
  swapMrBranches,
} from './lib/parse.js';
import {
  getBase,
  getHistory,
  getTargetBranch,
  getUsername,
  getPinned,
  pinPipeline,
  pushHistory,
  removeHistory,
  unpinPipeline,
  updatePinned,
  setBase,
  setTargetBranch,
  setUsername,
} from './lib/storage.js';

const LABELS = {
  ticket: 'Ticket',
  mr: 'MR',
  commit: 'Commit',
  history: 'History',
  pipeline: 'Pipeline',
  job: 'Job',
  createMr: 'Create',
};

const settings = document.getElementById('settings');
const settingsToggle = document.getElementById('settings-toggle');
const baseInput = document.getElementById('base-input');
const baseSave = document.getElementById('base-save');
const baseError = document.getElementById('base-error');
const targetBranchInput = document.getElementById('target-branch-input');
const targetBranchSave = document.getElementById('target-branch-save');
const targetBranchError = document.getElementById('target-branch-error');
const usernameInput = document.getElementById('username-input');
const usernameSave = document.getElementById('username-save');
const usernameError = document.getElementById('username-error');
const refInputs = [...document.querySelectorAll('#refs input[data-type]')];
const ticketInput = document.getElementById('ticket');
const mrFrom = document.getElementById('mr-from');
const mrTo = document.getElementById('mr-to');
const fromToSwap = document.getElementById('from-to-swap');
const swapMr = document.getElementById('swap-mr');
const swapMrButton = document.getElementById('swap-mr-button');
const mrReviewer = document.getElementById('mr-reviewer');
const mrMine = document.getElementById('mr-mine');
const ticketsAssigned = document.getElementById('tickets-assigned');
const ticketsInProgress = document.getElementById('tickets-in-progress');
const ticketsAuthored = document.getElementById('tickets-authored');
const pipelinesRunning = document.getElementById('pipelines-running');
const pipelinesMine = document.getElementById('pipelines-mine');
const pipelinesAuthored = document.getElementById('pipelines-authored');
const pinPipelineSection = document.getElementById('pin-pipeline');
const pinPipelineButton = document.getElementById('pin-pipeline-button');
const pinned = document.getElementById('pinned');
const pinnedList = document.getElementById('pinned-list');
const recent = document.getElementById('recent');
const recentList = document.getElementById('recent-list');

let base = '';
let targetBranch = '';
let username = '';
let activeTabId = null;
let swappedUrl = '';
let pinnablePipeline = null;
let pinnedEntries = [];
let tickTimer = null;

function showError(element, message) {
  element.textContent = message;
  element.hidden = false;
}

function clearError(element) {
  element.textContent = '';
  element.hidden = true;
}

function errorFor(input) {
  return document.querySelector(`[data-error-for="${input.id}"]`);
}

function setInputsEnabled(enabled) {
  for (const input of [...refInputs, mrFrom, mrTo]) input.disabled = !enabled;
}

function openSettings() {
  settings.hidden = false;
  baseInput.value = base;
  targetBranchInput.value = targetBranch;
  usernameInput.value = username;
  baseInput.focus();
  baseInput.select();
}

function closeSettings() {
  settings.hidden = true;
  clearError(baseError);
  clearError(targetBranchError);
  clearError(usernameError);
}

function navigate(url) {
  chrome.tabs.create({ url });
  window.close();
}

function renderHistory(entries) {
  recentList.replaceChildren();
  recent.hidden = entries.length === 0;

  for (const entry of entries) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = LABELS[entry.type] ?? entry.type;

    const value = document.createElement('span');
    value.className = 'value';
    value.textContent = entry.value;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recent-nav';
    button.title = entry.url;
    button.append(badge, value);
    button.addEventListener('click', () => navigate(entry.url));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'recent-delete';
    deleteButton.title = 'Remove from recent';
    deleteButton.setAttribute('aria-label', 'Remove from recent');
    deleteButton.textContent = '\u{1F5D1}';
    deleteButton.addEventListener('click', async () => {
      renderHistory(await removeHistory(entry.url));
    });

    const item = document.createElement('li');
    item.className = 'recent-item';
    item.append(button, deleteButton);
    recentList.append(item);
  }
}

async function submitReference(input) {
  const error = errorFor(input);
  clearError(error);

  let url;
  try {
    url = buildUrl(input.dataset.type, input.value, base, targetBranch);
  } catch (err) {
    if (err instanceof ParseError) {
      showError(error, err.message);
      return;
    }
    throw err;
  }

  await pushHistory({ type: input.dataset.type, value: input.value.trim(), url });
  input.value = '';
  navigate(url);
}

const STATUS_GLYPHS = {
  success: '\u2713',
  failed: '\u2715',
  running: '\u25CF',
  pending: '\u25CB',
  created: '\u25CB',
  waiting_for_resource: '\u25CB',
  preparing: '\u25CB',
  canceled: '\u2298',
  canceling: '\u2298',
  skipped: '\u00BB',
  manual: '\u25B7',
  scheduled: '\u25F4',
};

function pipelineWebUrl(entry) {
  return entry.webUrl || `${entry.base}/-/pipelines/${entry.id}`;
}

function renderPinned() {
  pinnedList.replaceChildren();
  pinned.hidden = pinnedEntries.length === 0;

  for (const entry of pinnedEntries) {
    const status = document.createElement('span');
    status.className = 'pin-status';
    status.dataset.status = entry.status ?? 'unknown';
    status.textContent = STATUS_GLYPHS[entry.status] ?? '\u25CF';

    const id = document.createElement('span');
    id.className = 'pin-id';
    id.textContent = `#${entry.id}`;

    const ref = document.createElement('span');
    ref.className = 'pin-ref';
    ref.textContent = entry.ref ?? '';

    const main = document.createElement('span');
    main.className = 'pin-main';
    main.append(id, ref);

    const duration = document.createElement('span');
    duration.className = 'pin-duration';
    duration.dataset.pipelineId = entry.id;
    duration.textContent = formatDuration(pipelineElapsedSeconds(entry.raw ?? {})) ?? '';

    const nav = document.createElement('button');
    nav.type = 'button';
    nav.className = 'pin-nav';
    nav.title = entry.status
      ? `${entry.status}${entry.ref ? ` on ${entry.ref}` : ''}`
      : pipelineWebUrl(entry);
    nav.append(status, main, duration);
    nav.addEventListener('click', () => navigate(pipelineWebUrl(entry)));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'pin-remove';
    remove.title = 'Unpin';
    remove.setAttribute('aria-label', 'Unpin this pipeline');
    remove.textContent = '\u2715';
    remove.addEventListener('click', async () => {
      pinnedEntries = await unpinPipeline(entry.base, entry.id);
      renderPinned();
      await refreshPinButton();
    });

    const item = document.createElement('li');
    item.className = 'pin-item';
    item.append(nav, remove);
    pinnedList.append(item);
  }

  scheduleTick();
}

// Only running pipelines have a duration that moves, so the timer exists only for them.
function scheduleTick() {
  if (tickTimer) clearInterval(tickTimer);
  if (!pinnedEntries.some((e) => e.raw && !e.raw.finished_at && e.status !== 'success')) {
    return;
  }
  tickTimer = setInterval(() => {
    for (const entry of pinnedEntries) {
      const cell = pinnedList.querySelector(`[data-pipeline-id="${entry.id}"]`);
      if (cell) cell.textContent = formatDuration(pipelineElapsedSeconds(entry.raw ?? {})) ?? '';
    }
  }, 1000);
}

async function hasGitLabAccess() {
  if (!base) return false;
  try {
    return await chrome.permissions.contains({ origins: [originPattern(base)] });
  } catch {
    return false;
  }
}

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

// Cached values render immediately; the network refresh replaces them when it lands, so
// an offline or unauthenticated popup still shows the last known state.
async function refreshPinnedStatuses() {
  if (pinnedEntries.length === 0 || !(await hasGitLabAccess())) return;

  const results = await Promise.allSettled(pinnedEntries.map(fetchPipeline));
  const updates = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (updates.length === 0) return;

  pinnedEntries = await updatePinned(updates);
  renderPinned();
}

async function refreshPinButton() {
  const alreadyPinned = pinnablePipeline
    ? pinnedEntries.some(
        (e) => e.base === pinnablePipeline.base && e.id === pinnablePipeline.id,
      )
    : true;
  pinPipelineSection.hidden = !pinnablePipeline || alreadyPinned;
}

async function doPinPipeline() {
  if (!pinnablePipeline) return;

  // Must be the first await in a click handler, or the user gesture is lost.
  let granted = false;
  try {
    granted = await chrome.permissions.request({
      origins: [originPattern(pinnablePipeline.base)],
    });
  } catch {
    granted = false;
  }

  let entry = { ...pinnablePipeline };
  if (granted) {
    try {
      entry = await fetchPipeline(pinnablePipeline);
    } catch {
      // Keep the pin; it just shows as unknown until a later refresh succeeds.
    }
  }

  pinnedEntries = await pinPipeline(entry);
  renderPinned();
  await refreshPinButton();
}

async function submitCreateMr() {
  const fromError = errorFor(mrFrom);
  const toError = errorFor(mrTo);
  clearError(fromError);
  clearError(toError);

  if (!mrFrom.value.trim()) {
    showError(fromError, 'Enter a source branch name');
    return;
  }
  if (!mrTo.value.trim()) {
    showError(toError, 'Enter a target branch name');
    return;
  }

  let url;
  try {
    url = buildUrl('createMr', mrFrom.value, base, mrTo.value);
  } catch (err) {
    if (err instanceof ParseError) {
      showError(fromError, err.message);
      return;
    }
    throw err;
  }

  await pushHistory({
    type: 'createMr',
    value: `${mrFrom.value.trim()} \u2192 ${mrTo.value.trim()}`,
    url,
  });
  navigate(url);
}

function swapFromTo() {
  [mrFrom.value, mrTo.value] = [mrTo.value, mrFrom.value];
  clearError(errorFor(mrFrom));
  clearError(errorFor(mrTo));
  mrFrom.focus();
}

async function saveBase() {
  clearError(baseError);

  let normalized;
  try {
    normalized = normalizeBase(baseInput.value);
  } catch (err) {
    if (err instanceof ParseError) {
      showError(baseError, err.message);
      return;
    }
    throw err;
  }

  base = normalized;
  await setBase(base);
  closeSettings();
  setInputsEnabled(true);
  ticketInput.focus();
}

async function checkActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;

  pinnablePipeline = parsePipelineUrl(tab.url);
  await refreshPinButton();

  try {
    swappedUrl = swapMrBranches(tab.url);
  } catch {
    return;
  }
  activeTabId = tab.id;
  swapMr.hidden = false;
}

function doSwapMr() {
  if (!activeTabId || !swappedUrl) return;
  chrome.tabs.update(activeTabId, { url: swappedUrl });
  window.close();
}

async function saveTargetBranch() {
  clearError(targetBranchError);

  const trimmed = targetBranchInput.value.trim();
  if (!trimmed) {
    showError(targetBranchError, 'Enter a target branch name');
    return;
  }

  const previous = targetBranch;
  targetBranch = trimmed;
  await setTargetBranch(targetBranch);

  // Refresh the To box only while it still holds the old default, so a target the
  // user typed by hand for this one MR survives a settings save.
  if (!mrTo.value.trim() || mrTo.value.trim() === previous) mrTo.value = targetBranch;
}

async function saveUsername() {
  clearError(usernameError);

  const trimmed = usernameInput.value.trim();
  if (!trimmed) {
    showError(usernameError, 'Enter your GitLab username');
    return;
  }

  username = trimmed;
  await setUsername(username);
}

function goToBaseList(buildListUrl) {
  if (!base) {
    openSettings();
    showError(baseError, 'Set your GitLab repo URL first');
    return;
  }
  navigate(buildListUrl(base));
}

function goToUserList(buildListUrl) {
  if (!base) {
    openSettings();
    showError(baseError, 'Set your GitLab repo URL first');
    return;
  }
  if (!username) {
    openSettings();
    showError(usernameError, 'Set your GitLab username first');
    return;
  }
  navigate(buildListUrl(base, username));
}

for (const input of refInputs) {
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    submitReference(input);
  });
  input.addEventListener('input', () => clearError(errorFor(input)));
}

settingsToggle.addEventListener('click', () => {
  if (settings.hidden) openSettings();
  else if (base) closeSettings();
});

baseSave.addEventListener('click', saveBase);
baseInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  saveBase();
});

swapMrButton.addEventListener('click', doSwapMr);
pinPipelineButton.addEventListener('click', doPinPipeline);
fromToSwap.addEventListener('click', swapFromTo);

for (const input of [mrFrom, mrTo]) {
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    submitCreateMr();
  });
  input.addEventListener('input', () => clearError(errorFor(input)));
}

mrReviewer.addEventListener('click', () => goToUserList(reviewerMrUrl));
mrMine.addEventListener('click', () => goToUserList(mineMrUrl));

ticketsAssigned.addEventListener('click', () => goToUserList(assignedTicketsUrl));
ticketsInProgress.addEventListener('click', () => goToUserList(inProgressTicketsUrl));
ticketsAuthored.addEventListener('click', () => goToUserList(authoredTicketsUrl));

pipelinesRunning.addEventListener('click', () => goToBaseList(runningPipelinesUrl));
pipelinesMine.addEventListener('click', () => goToUserList(myPipelinesUrl));
pipelinesAuthored.addEventListener('click', () => goToUserList(authoredPipelinesUrl));

targetBranchSave.addEventListener('click', saveTargetBranch);
targetBranchInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  saveTargetBranch();
});

usernameSave.addEventListener('click', saveUsername);
usernameInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  saveUsername();
});

async function init() {
  base = await getBase();
  targetBranch = await getTargetBranch();
  username = await getUsername();
  mrTo.value = targetBranch;
  renderHistory(await getHistory());

  pinnedEntries = await getPinned();
  renderPinned();
  await checkActiveTab();
  refreshPinnedStatuses();

  if (base) {
    setInputsEnabled(true);
    ticketInput.focus();
  } else {
    // First run: explain what is missing instead of failing on submit.
    setInputsEnabled(false);
    openSettings();
  }
}

init();
