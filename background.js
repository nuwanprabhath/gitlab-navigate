// Checks armed pipelines about once a minute while the popup is closed, and raises a
// notification when one finishes. A service worker in Chrome and an event page in
// Firefox (see manifest.json): every listener is registered at the top level, and nothing
// is kept in memory between wake-ups because all state — the bell flags — is in storage.
import { fetchPipeline, isSignedIn } from './lib/pipeline-api.js';
import { getPinned, updatePinned } from './lib/storage.js';
import { checkWatched } from './lib/watch.js';

const ALARM = 'pipeline-watch';
const PINNED_KEY = 'pinnedPipelines';

async function applyAlarm() {
  const armed = (await getPinned('pipelines')).some((entry) => entry.notify);
  const existing = await chrome.alarms.get(ALARM);
  if (armed && !existing) await chrome.alarms.create(ALARM, { periodInMinutes: 1 });
  else if (!armed && existing) await chrome.alarms.clear(ALARM);
}

// Calls overlap (every pinned write fires storage.onChanged), and check-then-act must not
// interleave, so they run one after another. A failed call does not block the next.
let pending = Promise.resolve();

// Keeps the alarm running exactly while some pinned pipeline has its bell on.
export function syncAlarm() {
  const run = pending.then(applyAlarm, applyAlarm);
  pending = run.catch(() => {});
  return run;
}

async function notify({ url, title, message }) {
  // Only options both Chrome and Firefox accept. The pipeline's URL is the id, so a click
  // knows where to go without any state.
  await chrome.notifications.create(url, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
  });
}

export async function runCheck() {
  // `notifications` is an optional permission; without it there is nothing to do.
  if (!chrome.notifications) return;

  await checkWatched({
    entries: await getPinned('pipelines'),
    fetchPipeline,
    update: (update) => updatePinned('pipelines', [update]),
    notify,
    isSignedIn: (entry) => isSignedIn(entry.base),
  });
  await syncAlarm();
}

export function openNotification(id) {
  // Only ever open what we put there: an http(s) pipeline URL.
  if (/^https?:\/\//.test(id)) chrome.tabs.create({ url: id });
  chrome.notifications.clear(id);
}

let clickHandlerAdded = false;

// Registered at the top level when the permission is already held, and again when it is
// granted later (the API does not exist before then).
function addClickHandler() {
  if (clickHandlerAdded || !chrome.notifications) return;
  clickHandlerAdded = true;
  chrome.notifications.onClicked.addListener(openNotification);
}

// An error here has nowhere useful to go; the next alarm or change simply tries again.
const quietly = (task) => task().catch(() => {});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) return quietly(runCheck);
});
chrome.runtime.onInstalled.addListener(() => quietly(syncAlarm));
chrome.runtime.onStartup.addListener(() => quietly(syncAlarm));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[PINNED_KEY]) return quietly(syncAlarm);
});
addClickHandler();
chrome.permissions.onAdded.addListener(addClickHandler);
