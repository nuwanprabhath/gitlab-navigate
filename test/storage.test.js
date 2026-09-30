import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  pinItem,
  reorderPinned,
  setPinnedNote,
  setPinnedNotify,
  unpinItem,
  updatePinned,
  getPinned,
} from '../lib/storage.js';

const BASE = 'https://gitlab.com/ternandsparrow/paratoo-fdcp';
const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

// chrome.storage.local with a small delay on every call, so unserialised
// read-modify-write sequences really do interleave.
function fakeLocal() {
  const data = {};
  return {
    data,
    async get(key) {
      await tick();
      return key in data ? { [key]: structuredClone(data[key]) } : {};
    },
    async set(values) {
      await tick();
      Object.assign(data, structuredClone(values));
    },
  };
}

// A minimal Web Locks stand-in: one mutex per call order, recording the names requested.
function fakeLocks() {
  let chain = Promise.resolve();
  const requests = [];
  return {
    requests,
    request(name, task) {
      requests.push(name);
      const run = chain.then(() => task());
      chain = run.catch(() => {});
      return run;
    },
  };
}

let local;
beforeEach(() => {
  local = fakeLocal();
  globalThis.chrome = { storage: { local } };
});
afterEach(() => {
  delete globalThis.navigator.locks;
});

const pin = (id, extra = {}) => ({ base: BASE, id, ...extra });

describe('pinned list mutations (unchanged behaviour)', () => {
  test('pinItem puts the newest first and replaces a repeat of the same item', async () => {
    await pinItem('pipelines', pin('1', { status: 'running' }));
    await pinItem('pipelines', pin('2'));
    const result = await pinItem('pipelines', pin('1', { status: 'success' }));
    expect(result.map((p) => [p.id, p.status ?? null])).toEqual([['1', 'success'], ['2', null]]);
  });

  test('pinItem keeps at most 10 entries', async () => {
    for (let i = 1; i <= 12; i += 1) await pinItem('pipelines', pin(String(i)));
    const result = await getPinned('pipelines');
    expect(result).toHaveLength(10);
    expect(result[0].id).toBe('12');
  });

  test('unpinItem removes just that item', async () => {
    await pinItem('pipelines', pin('1'));
    await pinItem('pipelines', pin('2'));
    expect((await unpinItem('pipelines', BASE, '1')).map((p) => p.id)).toEqual(['2']);
  });

  test('setPinnedNote adds a note, and an empty note removes it', async () => {
    await pinItem('pipelines', pin('1'));
    expect((await setPinnedNote('pipelines', BASE, '1', 'Hotfix'))[0].note).toBe('Hotfix');
    expect('note' in (await setPinnedNote('pipelines', BASE, '1', ''))[0]).toBe(false);
  });

  test('reorderPinned moves an item to the target position', async () => {
    for (const id of ['1', '2', '3']) await pinItem('pipelines', pin(id));
    // stored order is 3, 2, 1
    expect((await reorderPinned('pipelines', BASE, '1', 0)).map((p) => p.id)).toEqual(['1', '3', '2']);
  });

  test('reorderPinned leaves the list alone for an unknown item', async () => {
    await pinItem('pipelines', pin('1'));
    expect((await reorderPinned('pipelines', BASE, '9', 0)).map((p) => p.id)).toEqual(['1']);
  });

  test('rejects an unknown list kind', async () => {
    await expect(getPinned('nope')).rejects.toThrow('Unknown pinned list: nope');
  });
});

describe('the pipeline bell flag', () => {
  test('setPinnedNotify(true) adds notify, and false deletes the key', async () => {
    await pinItem('pipelines', pin('1'));
    expect((await setPinnedNotify(BASE, '1', true))[0].notify).toBe(true);
    expect('notify' in (await setPinnedNotify(BASE, '1', false))[0]).toBe(false);
  });

  test('setPinnedNotify only touches the matching pipeline', async () => {
    await pinItem('pipelines', pin('1'));
    await pinItem('pipelines', pin('2'));
    const result = await setPinnedNotify(BASE, '1', true);
    expect(result.find((p) => p.id === '2').notify).toBeUndefined();
  });

  test('updatePinned merges fields and keeps an armed bell', async () => {
    await pinItem('pipelines', pin('1'));
    await setPinnedNotify(BASE, '1', true);
    const [entry] = await updatePinned('pipelines', [{ base: BASE, id: '1', status: 'running' }]);
    expect(entry).toMatchObject({ status: 'running', notify: true });
  });

  test('updatePinned stores notify: false by deleting the key', async () => {
    await pinItem('pipelines', pin('1'));
    await setPinnedNotify(BASE, '1', true);
    const [entry] = await updatePinned('pipelines', [
      { base: BASE, id: '1', status: 'success', notify: false },
    ]);
    expect(entry.status).toBe('success');
    expect('notify' in entry).toBe(false);
  });

  test('updatePinned leaves unmatched entries untouched', async () => {
    await pinItem('pipelines', pin('1'));
    const result = await updatePinned('pipelines', [{ base: BASE, id: '9', status: 'running' }]);
    expect(result[0].status).toBeUndefined();
  });
});

describe('write safety', () => {
  test('two concurrent mutations both persist when Web Locks are available', async () => {
    const locks = fakeLocks();
    globalThis.navigator.locks = locks;
    await pinItem('pipelines', pin('1'));
    locks.requests.length = 0;

    await Promise.all([
      setPinnedNote('pipelines', BASE, '1', 'Hotfix'),
      setPinnedNotify(BASE, '1', true),
    ]);

    const [entry] = await getPinned('pipelines');
    expect(entry).toMatchObject({ note: 'Hotfix', notify: true });
    expect(locks.requests).toEqual(['gitlab-navigate-pinned', 'gitlab-navigate-pinned']);
  });

  test('mutations still work where Web Locks do not exist', async () => {
    expect(globalThis.navigator.locks).toBeUndefined();
    await pinItem('pipelines', pin('1'));
    expect((await setPinnedNotify(BASE, '1', true))[0].notify).toBe(true);
  });
});
