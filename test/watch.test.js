import { describe, expect, test } from 'bun:test';
import { FINAL_STATUSES, checkWatched, finishedNotice, isFinalStatus } from '../lib/watch.js';

const BASE = 'https://gitlab.com/ternandsparrow/paratoo-fdcp';
const entry = (overrides = {}) => ({ base: BASE, id: '100', notify: true, ...overrides });

describe('isFinalStatus', () => {
  test('is true for the four finished statuses', () => {
    expect(FINAL_STATUSES).toEqual(['success', 'failed', 'canceled', 'skipped']);
    for (const status of FINAL_STATUSES) expect(isFinalStatus(status)).toBe(true);
  });

  test('is false for every other GitLab pipeline status and for nothing', () => {
    for (const status of [
      'created', 'waiting_for_resource', 'preparing', 'pending', 'running',
      'canceling', 'manual', 'scheduled',
    ]) {
      expect(isFinalStatus(status)).toBe(false);
    }
    expect(isFinalStatus(undefined)).toBe(false);
  });
});

describe('finishedNotice', () => {
  test('uses the note as the headline with the branch in brackets', () => {
    expect(finishedNotice(entry({ note: 'Hotfix' }), { status: 'success', ref: 'dev/1.0.11' })).toEqual({
      title: 'Pipeline passed',
      message: 'Hotfix (dev/1.0.11)',
    });
  });

  test('falls back to the pipeline number without a note', () => {
    expect(finishedNotice(entry(), { status: 'failed', ref: 'dev/1.0.11' })).toEqual({
      title: 'Pipeline failed',
      message: '#100 (dev/1.0.11)',
    });
  });

  test('omits the brackets when no branch is known', () => {
    expect(finishedNotice(entry(), { status: 'failed' })).toEqual({
      title: 'Pipeline failed',
      message: '#100',
    });
  });

  test("uses the pinned entry's branch when the fetch has none", () => {
    expect(finishedNotice(entry({ ref: 'main' }), { status: 'success' }).message).toBe('#100 (main)');
  });

  test('titles canceled and skipped pipelines', () => {
    expect(finishedNotice(entry(), { status: 'canceled' }).title).toBe('Pipeline canceled');
    expect(finishedNotice(entry(), { status: 'skipped' }).title).toBe('Pipeline skipped');
  });

  test('is null for a pipeline that has not finished', () => {
    expect(finishedNotice(entry(), { status: 'running' })).toBeNull();
    expect(finishedNotice(entry(), { status: 'manual' })).toBeNull();
  });
});

describe('checkWatched', () => {
  function harness(results) {
    const updates = [];
    const notices = [];
    const fetched = [];
    let notifyFails = false;
    return {
      updates,
      notices,
      fetched,
      failNotify() {
        notifyFails = true;
      },
      deps: {
        fetchPipeline: async (e) => {
          fetched.push(e.id);
          const result = results[e.id];
          if (result instanceof Error) throw result;
          return { base: e.base, id: e.id, ...result };
        },
        update: async (fields) => {
          updates.push(fields);
        },
        notify: async (notice) => {
          if (notifyFails) throw new Error('notifications are blocked');
          notices.push(notice);
        },
      },
    };
  }

  test('notifies once and switches the bell off for each final status', async () => {
    for (const status of FINAL_STATUSES) {
      const h = harness({ 100: { status, ref: 'dev/1.0.11', webUrl: `${BASE}/-/pipelines/100` } });
      await checkWatched({ entries: [entry({ note: 'Hotfix' })], ...h.deps });
      expect(h.notices).toHaveLength(1);
      expect(h.notices[0].url).toBe(`${BASE}/-/pipelines/100`);
      expect(h.updates).toHaveLength(1);
      expect(h.updates[0]).toMatchObject({ base: BASE, id: '100', status, notify: false });
    }
  });

  test('builds the notification url from the entry when the fetch has no webUrl', async () => {
    const h = harness({ 100: { status: 'success' } });
    await checkWatched({ entries: [entry()], ...h.deps });
    expect(h.notices[0].url).toBe(`${BASE}/-/pipelines/100`);
  });

  test('leaves a running pipeline armed and saves its fresh status', async () => {
    const h = harness({ 100: { status: 'running', ref: 'dev/1.0.11' } });
    await checkWatched({ entries: [entry()], ...h.deps });
    expect(h.notices).toHaveLength(0);
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0]).toMatchObject({ id: '100', status: 'running' });
    expect('notify' in h.updates[0]).toBe(false);
  });

  test('ignores entries whose bell is off', async () => {
    const h = harness({ 100: { status: 'success' }, 200: { status: 'success' } });
    await checkWatched({ entries: [entry({ notify: undefined }), entry({ id: '200' })], ...h.deps });
    expect(h.fetched).toEqual(['200']);
  });

  test('skips a pipeline whose fetch fails, changing nothing', async () => {
    const h = harness({ 100: new Error('GitLab returned 500') });
    await checkWatched({ entries: [entry()], ...h.deps });
    expect(h.notices).toHaveLength(0);
    expect(h.updates).toHaveLength(0);
  });

  test('switches the bell off silently when the pipeline is gone (404)', async () => {
    const gone = Object.assign(new Error('GitLab returned 404'), { status: 404 });
    const h = harness({ 100: gone });
    await checkWatched({ entries: [entry()], ...h.deps });
    expect(h.notices).toHaveLength(0);
    expect(h.updates).toEqual([{ base: BASE, id: '100', notify: false }]);
  });

  test('keeps the bell armed when the notification cannot be shown, and carries on', async () => {
    const h = harness({ 100: { status: 'success' }, 200: { status: 'running' } });
    h.failNotify();
    await checkWatched({ entries: [entry(), entry({ id: '200' })], ...h.deps });
    expect(h.updates.map((u) => u.id)).toEqual(['200']);
  });

  test('handles several armed pipelines independently', async () => {
    const h = harness({ 100: { status: 'failed' }, 200: { status: 'success' }, 300: { status: 'running' } });
    await checkWatched({ entries: [entry(), entry({ id: '200' }), entry({ id: '300' })], ...h.deps });
    expect(h.notices.map((n) => n.title)).toEqual(['Pipeline failed', 'Pipeline passed']);
    expect(h.updates.map((u) => u.id)).toEqual(['100', '200', '300']);
  });
});
