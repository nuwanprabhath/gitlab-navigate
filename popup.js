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
  parseTicketUrl,
  pipelineApiUrl,
  pipelineElapsedSeconds,
  reviewerMrUrl,
  runningPipelinesUrl,
  swapMrBranches,
  ticketApiUrl,
} from './lib/parse.js';
import {
  getBase,
  getHistory,
  getTargetBranch,
  getUsername,
  getPinned,
  pinItem,
  pushHistory,
  removeHistory,
  updatePinned,
  setBase,
  setTargetBranch,
  setUsername,
} from './lib/storage.js';
import { createPinnedList } from './pinned-list.js';

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
const historyInput = document.getElementById('history');
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
const pinSection = document.getElementById('pin-page');
const pinButton = document.getElementById('pin-page-button');
const pinnedTickets = document.getElementById('pinned-tickets');
const pinnedTicketsList = document.getElementById('pinned-tickets-list');
const pinned = document.getElementById('pinned');
const pinnedList = document.getElementById('pinned-list');
const recent = document.getElementById('recent');
const recentList = document.getElementById('recent-list');

let base = '';
let targetBranch = '';
let username = '';
let activeTabId = null;
let swappedUrl = '';
// What the active tab shows, if it can be pinned: { kind, base, id }.
let pinnable = null;
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
  success: '✓',
  failed: '✕',
  running: '●',
  pending: '○',
  created: '○',
  waiting_for_resource: '○',
  preparing: '○',
  canceled: '⊘',
  canceling: '⊘',
  skipped: '»',
  manual: '▷',
  scheduled: '◴',
};

function pipelineWebUrl(entry) {
  return entry.webUrl || `${entry.base}/-/pipelines/${entry.id}`;
}

function idAndRef(entry) {
  return [`#${entry.id}`, entry.ref].filter(Boolean).join(' · ');
}

function describePipeline(entry) {
  const statusLine = entry.status
    ? `${entry.status}${entry.ref ? ` on ${entry.ref}` : ''}`
    : pipelineWebUrl(entry);

  const duration = document.createElement('span');
  duration.className = 'pin-duration';
  duration.dataset.pipelineId = entry.id;
  duration.textContent = formatDuration(pipelineElapsedSeconds(entry.raw ?? {})) ?? '';

  return {
    status: entry.status ?? 'unknown',
    glyph: STATUS_GLYPHS[entry.status] ?? '●',
    headline: entry.note || `#${entry.id}`,
    headlineIsId: !entry.note,
    subline: entry.note ? idAndRef(entry) : entry.ref ?? '',
    editSubline: idAndRef(entry),
    tooltip: entry.note ? `${entry.note}\n${statusLine}` : statusLine,
    trailing: duration,
    url: pipelineWebUrl(entry),
  };
}

const pipelinesList = createPinnedList({
  kind: 'pipelines',
  noun: 'pipeline',
  section: pinned,
  list: pinnedList,
  describeRow: describePipeline,
  navigate,
  onRender() {
    scheduleTick();
    refreshPinButton();
  },
});

// Only running pipelines have a duration that moves, so the timer exists only for them.
function scheduleTick() {
  if (tickTimer) clearInterval(tickTimer);
  const entries = pipelinesList.getEntries();
  if (!entries.some((e) => e.raw && !e.raw.finished_at && e.status !== 'success')) return;
  tickTimer = setInterval(() => {
    for (const entry of pipelinesList.getEntries()) {
      const cell = pinnedList.querySelector(`[data-pipeline-id="${entry.id}"]`);
      if (cell) cell.textContent = formatDuration(pipelineElapsedSeconds(entry.raw ?? {})) ?? '';
    }
  }, 1000);
}

function ticketWebUrl(entry) {
  return entry.webUrl || `${entry.base}/-/work_items/${entry.id}`;
}

const TICKET_GLYPHS = { opened: '○', closed: '✓' };
const TICKET_STATES = { opened: 'open', closed: 'closed' };

function describeTicket(entry) {
  const number = `#${entry.id}`;
  const headline = entry.note || entry.title || number;
  let subline = '';
  if (entry.note) subline = entry.title ? `${number} · ${entry.title}` : number;
  else if (entry.title) subline = number;

  return {
    status: entry.state ?? 'unknown',
    glyph: TICKET_GLYPHS[entry.state] ?? '●',
    headline,
    headlineIsId: !entry.note && !entry.title,
    subline,
    editSubline: entry.title ? `${number} · ${entry.title}` : number,
    tooltip: [headline, TICKET_STATES[entry.state]].filter(Boolean).join('\n'),
    trailing: null,
    url: ticketWebUrl(entry),
  };
}

const ticketsList = createPinnedList({
  kind: 'tickets',
  noun: 'ticket',
  section: pinnedTickets,
  list: pinnedTicketsList,
  describeRow: describeTicket,
  navigate,
  onRender: refreshPinButton,
});

const lists = { pipelines: pipelinesList, tickets: ticketsList };

async function hasGitLabAccess() {
  if (!base) return false;
  try {
    return await chrome.permissions.contains({ origins: [originPattern(base)] });
  } catch {
    return false;
  }
}

// Keeps its 0.19 id so existing installs update in place instead of gaining a second
// registration.
const PIPELINE_PAGE_SCRIPT = {
  id: 'pipeline-note',
  js: ['content/shared.js', 'content/pipeline-notes.js', 'content/runner-tags.js'],
  runAt: 'document_idle',
  persistAcrossSessions: true,
};

const sameList = (a, b) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

// Keeps the pipeline page scripts registered for the GitLab site in `forBase`. Runs on
// every popup open because browsers clear registered scripts when the extension
// updates, the repo URL may have moved to another GitLab site, and an update may have
// changed the script files.
async function ensurePipelineNoteScript(forBase) {
  try {
    const script = {
      ...PIPELINE_PAGE_SCRIPT,
      matches: [`${new URL(forBase).origin}/*/-/pipelines*`],
    };
    const [existing] = await chrome.scripting.getRegisteredContentScripts({ ids: [script.id] });
    if (!existing) await chrome.scripting.registerContentScripts([script]);
    else if (!sameList(existing.matches, script.matches) || !sameList(existing.js, script.js)) {
      await chrome.scripting.updateContentScripts([script]);
    }
  } catch {
    // Only the page notes and badges are lost; the popup itself is unaffected.
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

async function fetchTicket(entry) {
  const response = await fetch(ticketApiUrl(entry.base, entry.id), {
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`GitLab returned ${response.status}`);
  const raw = await response.json();
  return {
    base: entry.base,
    id: entry.id,
    title: raw.title,
    state: raw.state,
    webUrl: raw.web_url,
  };
}

const FETCHERS = { pipelines: fetchPipeline, tickets: fetchTicket };

async function refreshPinned(kind) {
  const list = lists[kind];
  const entries = list.getEntries();
  if (entries.length === 0) return;

  const results = await Promise.allSettled(entries.map(FETCHERS[kind]));
  const updates = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (updates.length === 0) return;

  try {
    list.setEntries(await updatePinned(kind, updates));
  } catch {
    // Storage failed; the list keeps showing the cached values.
  }
}

// Cached values render immediately; the network refresh replaces them when it lands, so
// an offline or unauthenticated popup still shows the last known state.
async function refreshAllPinned() {
  if (!(await hasGitLabAccess())) return;
  ensurePipelineNoteScript(base);
  refreshPinned('pipelines');
  refreshPinned('tickets');
}

function refreshPinButton() {
  const alreadyPinned =
    Boolean(pinnable) &&
    lists[pinnable.kind]
      .getEntries()
      .some((e) => e.base === pinnable.base && e.id === pinnable.id);
  pinSection.hidden = !pinnable || alreadyPinned;
  if (pinnable) {
    const noun = pinnable.kind === 'tickets' ? 'ticket' : 'pipeline';
    pinButton.textContent = `\u{1F4CC} Pin this ${noun}`;
  }
}

async function doPin() {
  if (!pinnable) return;
  const { kind, base: itemBase, id } = pinnable;

  // Must be the first await in a click handler, or the user gesture is lost.
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: [originPattern(itemBase)] });
  } catch {
    granted = false;
  }

  if (granted) ensurePipelineNoteScript(itemBase);

  let entry = { base: itemBase, id };
  if (granted) {
    try {
      entry = await FETCHERS[kind](entry);
    } catch {
      // Keep the pin; it just shows as unknown until a later refresh succeeds.
    }
  }

  const list = lists[kind];
  list.setEntries(await pinItem(kind, entry));
  // A pipeline is only a number, so ask for a note; a ticket already shows its title.
  if (kind === 'pipelines') {
    list.startEditing(list.getEntries().find((p) => p.base === entry.base && p.id === entry.id));
  }
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

  const pipeline = parsePipelineUrl(tab.url);
  const ticket = pipeline ? null : parseTicketUrl(tab.url);
  if (pipeline) pinnable = { kind: 'pipelines', ...pipeline };
  else if (ticket) pinnable = { kind: 'tickets', ...ticket };
  refreshPinButton();

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

  // Refresh the To/History boxes only while they still hold the old default, so a
  // branch the user typed by hand for this one lookup survives a settings save.
  if (!mrTo.value.trim() || mrTo.value.trim() === previous) mrTo.value = targetBranch;
  if (!historyInput.value.trim() || historyInput.value.trim() === previous) {
    historyInput.value = targetBranch;
  }
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
pinButton.addEventListener('click', doPin);
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
  historyInput.value = targetBranch;
  renderHistory(await getHistory());

  ticketsList.setEntries(await getPinned('tickets'));
  pipelinesList.setEntries(await getPinned('pipelines'));
  await checkActiveTab();
  refreshAllPinned();

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
