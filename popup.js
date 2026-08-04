import { ParseError, buildUrl, normalizeBase } from './lib/parse.js';
import { getBase, getHistory, pushHistory, setBase } from './lib/storage.js';

const LABELS = {
  ticket: 'Ticket',
  mr: 'MR',
  commit: 'Commit',
  history: 'History',
};

const settings = document.getElementById('settings');
const settingsToggle = document.getElementById('settings-toggle');
const baseInput = document.getElementById('base-input');
const baseSave = document.getElementById('base-save');
const baseError = document.getElementById('base-error');
const refInputs = [...document.querySelectorAll('#refs input[data-type]')];
const recent = document.getElementById('recent');
const recentList = document.getElementById('recent-list');

let base = '';

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
  baseInput.focus();
  baseInput.select();
}

function closeSettings() {
  settings.hidden = true;
  clearError(baseError);
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
    button.title = entry.url;
    button.append(badge, value);
    button.addEventListener('click', () => navigate(entry.url));

    const item = document.createElement('li');
    item.append(button);
    recentList.append(item);
  }
}

async function submitReference(input) {
  const error = errorFor(input);
  clearError(error);

  let url;
  try {
    url = buildUrl(input.dataset.type, input.value, base);
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
  refInputs[0].focus();
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

async function init() {
  base = await getBase();
  renderHistory(await getHistory());

  if (base) {
    setInputsEnabled(true);
    refInputs[0].focus();
  } else {
    // First run: explain what is missing instead of failing on submit.
    setInputsEnabled(false);
    openSettings();
  }
}

init();
