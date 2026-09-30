import { beforeEach, describe, expect, test } from 'bun:test';

const BASE = 'https://gitlab.com/ternandsparrow/paratoo-fdcp';

// A fake `chrome` that records every listener registered on it and every call made.
function makeChrome({ notifications = true } = {}) {
  const listeners = {};
  const event = (name) => ({
    addListener: (fn) => {
      (listeners[name] ??= []).push(fn);
    },
  });
  const data = {};
  const alarmMap = new Map();
  const log = { alarmsCreated: [], alarmsCleared: [], notices: [], cleared: [], tabs: [] };
  const fake = {
    listeners,
    data,
    alarmMap,
    log,
    storage: {
      local: {
        async get(key) {
          return key in data ? { [key]: structuredClone(data[key]) } : {};
        },
        async set(values) {
          Object.assign(data, structuredClone(values));
        },
      },
      onChanged: event('storage.onChanged'),
    },
    runtime: { onInstalled: event('runtime.onInstalled'), onStartup: event('runtime.onStartup') },
    permissions: { onAdded: event('permissions.onAdded') },
    tabs: { create: (info) => log.tabs.push(info) },
  };
  fake.alarms = {
    get: async (name) => alarmMap.get(name),
    create: (name, info) => {
      alarmMap.set(name, info);
      log.alarmsCreated.push([name, info]);
    },
    clear: async (name) => {
      alarmMap.delete(name);
      log.alarmsCleared.push(name);
    },
    onAlarm: event('alarms.onAlarm'),
  };
  if (notifications) {
    fake.notifications = {
      create: async (id, options) => {
        log.notices.push({ id, options });
      },
      clear: async (id) => {
        log.cleared.push(id);
      },
      onClicked: event('notifications.onClicked'),
    };
  }
  return fake;
}

const pin = (id, extra = {}) => ({ base: BASE, id, status: 'running', ref: 'dev/1.0.11', ...extra });

// Serves GitLab's pipeline endpoint: id -> { status } | 'network' | 404, and the sign-in
// probe (/api/v4/user)
function serve(responses, { signedIn = true } = {}) {
  const fetched = [];
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/api/v4/user')) {
      fetched.push('user');
      return { ok: signedIn };
    }
    const id = String(url).split('/').pop();
    fetched.push(id);
    const response = responses[id];
    if (response === 'network') throw new TypeError('Failed to fetch');
    if (response === 404) return { ok: false, status: 404, json: async () => ({}) };
    return {
      ok: true,
      json: async () => ({
        ref: 'dev/1.0.11',
        web_url: `${BASE}/-/pipelines/${id}`,
        ...response,
      }),
    };
  };
  return fetched;
}

// Import once with a recording fake: the module registers its listeners at import time.
const first = makeChrome();
globalThis.chrome = first;
const background = await import('../background.js');
const recorded = first.listeners;

let fake;
beforeEach(() => {
  fake = makeChrome();
  globalThis.chrome = fake;
});

describe('registration at import', () => {
  test('registers each listener once', () => {
    for (const name of [
      'alarms.onAlarm',
      'runtime.onInstalled',
      'runtime.onStartup',
      'storage.onChanged',
      'notifications.onClicked',
      'permissions.onAdded',
    ]) {
      expect(recorded[name]).toHaveLength(1);
    }
  });

  test('the permissions.onAdded listener does not register the click handler twice', () => {
    recorded['permissions.onAdded'][0]();
    expect(recorded['notifications.onClicked']).toHaveLength(1);
  });
});

describe('syncAlarm', () => {
  test('creates the alarm when some pipeline has its bell on', async () => {
    fake.data.pinnedPipelines = [pin('1'), pin('2', { notify: true })];
    await background.syncAlarm();
    expect(fake.log.alarmsCreated).toEqual([['pipeline-watch', { periodInMinutes: 1 }]]);
  });

  test('does not create a second alarm', async () => {
    fake.data.pinnedPipelines = [pin('1', { notify: true })];
    await background.syncAlarm();
    await background.syncAlarm();
    expect(fake.log.alarmsCreated).toHaveLength(1);
  });

  test('creates the alarm once for two calls started together', async () => {
    fake.data.pinnedPipelines = [pin('1', { notify: true })];
    await Promise.all([background.syncAlarm(), background.syncAlarm()]);
    expect(fake.log.alarmsCreated).toHaveLength(1);
  });

  test('clears the alarm when no bell is on', async () => {
    fake.data.pinnedPipelines = [pin('1', { notify: true })];
    await background.syncAlarm();
    fake.data.pinnedPipelines = [pin('1')];
    await background.syncAlarm();
    expect(fake.log.alarmsCleared).toEqual(['pipeline-watch']);
    expect(fake.alarmMap.size).toBe(0);
  });

  test('does nothing when there is no alarm and no bell', async () => {
    fake.data.pinnedPipelines = [pin('1')];
    await background.syncAlarm();
    expect(fake.log.alarmsCreated).toHaveLength(0);
    expect(fake.log.alarmsCleared).toHaveLength(0);
  });
});

describe('runCheck', () => {
  test('notifies once when an armed pipeline finishes, then switches its bell off', async () => {
    fake.data.pinnedPipelines = [pin('1', { notify: true, note: 'Hotfix' })];
    serve({ 1: { status: 'failed' } });
    await background.runCheck();

    expect(fake.log.notices).toEqual([
      {
        id: `${BASE}/-/pipelines/1`,
        options: {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Pipeline failed',
          message: 'Hotfix (dev/1.0.11)',
        },
      },
    ]);
    const [entry] = fake.data.pinnedPipelines;
    expect(entry.status).toBe('failed');
    expect('notify' in entry).toBe(false);
    // Nothing is armed any more, so the alarm is cleared.
    expect(fake.alarmMap.size).toBe(0);
  });

  test('leaves a running pipeline armed and keeps the alarm', async () => {
    fake.data.pinnedPipelines = [pin('1', { notify: true })];
    fake.alarmMap.set('pipeline-watch', { periodInMinutes: 1 });
    serve({ 1: { status: 'running' } });
    await background.runCheck();

    expect(fake.log.notices).toHaveLength(0);
    expect(fake.data.pinnedPipelines[0].notify).toBe(true);
    expect(fake.alarmMap.has('pipeline-watch')).toBe(true);
  });

  test('keeps the bell on and changes nothing after a network failure', async () => {
    fake.data.pinnedPipelines = [pin('1', { notify: true })];
    serve({ 1: 'network' });
    await background.runCheck();

    expect(fake.log.notices).toHaveLength(0);
    expect(fake.data.pinnedPipelines[0]).toMatchObject({ status: 'running', notify: true });
  });

  test('switches the bell off silently for a deleted pipeline', async () => {
    fake.data.pinnedPipelines = [pin('1', { notify: true })];
    serve({ 1: 404 });
    await background.runCheck();

    expect(fake.log.notices).toHaveLength(0);
    expect('notify' in fake.data.pinnedPipelines[0]).toBe(false);
  });

  test('keeps the bell on after a 404 while signed out', async () => {
    fake.data.pinnedPipelines = [pin('1', { notify: true })];
    serve({ 1: 404 }, { signedIn: false });
    await background.runCheck();

    expect(fake.log.notices).toHaveLength(0);
    expect(fake.data.pinnedPipelines[0].notify).toBe(true);
    expect(fake.alarmMap.has('pipeline-watch')).toBe(true);
  });

  test('does not fetch pipelines whose bell is off', async () => {
    fake.data.pinnedPipelines = [pin('1'), pin('2', { notify: true })];
    const fetched = serve({ 1: { status: 'success' }, 2: { status: 'running' } });
    await background.runCheck();
    expect(fetched).toEqual(['2']);
  });

  test('does nothing, not even fetching, when the notifications permission is missing', async () => {
    fake = makeChrome({ notifications: false });
    globalThis.chrome = fake;
    fake.data.pinnedPipelines = [pin('1', { notify: true })];
    const fetched = serve({ 1: { status: 'success' } });
    await background.runCheck();

    expect(fetched).toHaveLength(0);
    expect(fake.data.pinnedPipelines[0].notify).toBe(true);
  });
});

describe('listeners', () => {
  test('the alarm listener runs a check only for its own alarm', async () => {
    fake.data.pinnedPipelines = [pin('1', { notify: true })];
    const fetched = serve({ 1: { status: 'success' } });

    await recorded['alarms.onAlarm'][0]({ name: 'something-else' });
    expect(fetched).toHaveLength(0);

    await recorded['alarms.onAlarm'][0]({ name: 'pipeline-watch' });
    expect(fetched).toEqual(['1']);
  });

  test('a change to the pinned pipelines re-syncs the alarm; other changes do not', async () => {
    fake.data.pinnedPipelines = [pin('1', { notify: true })];

    await recorded['storage.onChanged'][0]({ history: {} }, 'local');
    await recorded['storage.onChanged'][0]({ pinnedPipelines: {} }, 'sync');
    expect(fake.log.alarmsCreated).toHaveLength(0);

    await recorded['storage.onChanged'][0]({ pinnedPipelines: {} }, 'local');
    expect(fake.log.alarmsCreated).toHaveLength(1);
  });

  test('install and startup re-sync the alarm', async () => {
    fake.data.pinnedPipelines = [pin('1', { notify: true })];
    await recorded['runtime.onInstalled'][0]();
    expect(fake.log.alarmsCreated).toHaveLength(1);

    fake.alarmMap.clear();
    await recorded['runtime.onStartup'][0]();
    expect(fake.log.alarmsCreated).toHaveLength(2);
  });
});

describe('openNotification', () => {
  test('opens an http(s) notification id in a new tab and clears the notification', () => {
    background.openNotification(`${BASE}/-/pipelines/1`);
    expect(fake.log.tabs).toEqual([{ url: `${BASE}/-/pipelines/1` }]);
    expect(fake.log.cleared).toEqual([`${BASE}/-/pipelines/1`]);
  });

  test('never opens a non-http id, but still clears the notification', () => {
    background.openNotification('javascript:alert(1)');
    expect(fake.log.tabs).toHaveLength(0);
    expect(fake.log.cleared).toEqual(['javascript:alert(1)']);
  });
});
