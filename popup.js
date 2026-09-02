import {
  ParseError,
  assignedTicketsUrl,
  authoredPipelinesUrl,
  authoredTicketsUrl,
  buildUrl,
  inProgressTicketsUrl,
  mineMrUrl,
  myPipelinesUrl,
  normalizeBase,
  reviewerMrUrl,
  runningPipelinesUrl,
  swapMrBranches,
} from './lib/parse.js';
import {
  getBase,
  getHistory,
  getTargetBranch,
  getUsername,
  pushHistory,
  removeHistory,
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
const refInputs = [...document.querySelectorAll('input[data-type]')];
const ticketInput = document.getElementById('ticket');
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
const recent = document.getElementById('recent');
const recentList = document.getElementById('recent-list');

let base = '';
let targetBranch = '';
let username = '';
let activeTabId = null;
let swappedUrl = '';

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
  for (const input of refInputs) input.disabled = !enabled;
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

async function checkSwapMr() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;

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

  targetBranch = trimmed;
  await setTargetBranch(targetBranch);
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
  renderHistory(await getHistory());
  checkSwapMr();

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
