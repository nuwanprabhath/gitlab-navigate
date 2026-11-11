import { describe, expect, test } from 'bun:test';
import '../content/shared.js';

const { normalize, pipelineUrlFromHref, sharedJobTags, searchMenuItems, pinnedUrl } =
  globalThis.gitlabNavigate;
const BASE = 'https://gitlab.com/ternandsparrow/paratoo-fdcp';
const tagged = (tags, count) => Array.from({ length: count }, () => ({ tag_list: tags }));

describe('normalize', () => {
  test('keeps origin and path, dropping trailing slashes, query and hash', () => {
    expect(normalize(`${BASE}/-/pipelines/12/?page=2#top`)).toBe(`${BASE}/-/pipelines/12`);
  });

  test('returns an empty string for something that is not a URL', () => {
    expect(normalize('not a url')).toBe('');
  });
});

describe('pipelineUrlFromHref', () => {
  const expected = {
    url: `${BASE}/-/pipelines/2866034605`,
    projectPath: 'ternandsparrow/paratoo-fdcp',
    id: '2866034605',
  };

  test('reads an absolute pipeline URL', () => {
    expect(pipelineUrlFromHref(`${BASE}/-/pipelines/2866034605`)).toEqual(expected);
  });

  test('resolves a relative href against the base URL', () => {
    expect(
      pipelineUrlFromHref('/ternandsparrow/paratoo-fdcp/-/pipelines/2866034605', `${BASE}/-/pipelines`),
    ).toEqual(expected);
  });

  test('reads a pipeline tab as its pipeline', () => {
    expect(pipelineUrlFromHref(`${BASE}/-/pipelines/2866034605/builds`)).toEqual(expected);
  });

  test('ignores a trailing slash', () => {
    expect(pipelineUrlFromHref(`${BASE}/-/pipelines/2866034605/`)).toEqual(expected);
  });

  test('returns null for the pipelines list', () => {
    expect(pipelineUrlFromHref(`${BASE}/-/pipelines?scope=finished`)).toBeNull();
  });

  test('returns null for the new pipeline page', () => {
    expect(pipelineUrlFromHref(`${BASE}/-/pipelines/new`)).toBeNull();
  });

  test('returns null for the pipeline charts page', () => {
    expect(pipelineUrlFromHref(`${BASE}/-/pipelines/charts`)).toBeNull();
  });

  test('returns null for a non-http URL', () => {
    expect(pipelineUrlFromHref('javascript:void(0)')).toBeNull();
  });
});

describe('sharedJobTags', () => {
  test('finds the runner tag in a real paratoo-fdcp pipeline shape', () => {
    const jobs = [
      ...tagged(['cypress', 'perentie-runner'], 28),
      ...tagged(['perentie-runner'], 2),
      ...tagged([], 11),
    ];
    expect(sharedJobTags(jobs)).toEqual(['perentie-runner']);
  });

  test('keeps every tag when all tagged jobs carry the same set', () => {
    expect(sharedJobTags(tagged(['cypress', 'perentie-runner'], 3))).toEqual([
      'cypress',
      'perentie-runner',
    ]);
  });

  test('is not hidden by a few jobs pinned to another runner (pipeline 3017090706)', () => {
    const jobs = [
      ...tagged(['cypress', 'nuwan-runner'], 19),
      ...tagged(['nectar'], 3),
      ...tagged([], 14),
    ];
    expect(sharedJobTags(jobs)).toEqual(['cypress', 'nuwan-runner']);
  });

  test('keeps the runner when another tag is on one job more (pipeline 3026078955)', () => {
    const jobs = [
      ...tagged(['cypress', 'nuwan-runner'], 19),
      ...tagged(['cypress'], 1),
      ...tagged(['fast-cpu'], 4),
      ...tagged(['nectar'], 3),
      ...tagged([], 20),
    ];
    expect(sharedJobTags(jobs)).toEqual(['cypress', 'nuwan-runner']);
  });

  test('prefers the tags every job shares over the majority', () => {
    const jobs = [...tagged(['cypress', 'perentie-runner'], 5), ...tagged(['perentie-runner'], 1)];
    expect(sharedJobTags(jobs)).toEqual(['perentie-runner']);
  });

  test('prefers the jobs with the most tags when others are pinned elsewhere (pipeline 3015622379)', () => {
    const jobs = [
      ...tagged(['cypress', 'nuwan-runner'], 3),
      ...tagged(['nectar'], 3),
      ...tagged([], 10),
    ];
    expect(sharedJobTags(jobs)).toEqual(['cypress', 'nuwan-runner']);
  });

  test('finds the runner when sharded jobs only carry the pool tag (pipeline 3025821619)', () => {
    const jobs = [
      ...tagged(['cypress'], 16),
      ...tagged(['cypress', 'huy-runner'], 4),
      ...tagged(['fast-cpu'], 4),
      ...tagged(['nectar'], 3),
      ...tagged([], 17),
    ];
    expect(sharedJobTags(jobs)).toEqual(['cypress', 'huy-runner']);
  });

  test('keeps what most equally specific jobs carry when they disagree', () => {
    const jobs = [
      ...tagged(['cypress', 'nuwan-runner'], 5),
      ...tagged(['cypress', 'huy-runner'], 1),
      ...tagged(['nectar'], 2),
    ];
    expect(sharedJobTags(jobs)).toEqual(['cypress', 'nuwan-runner']);
  });

  test('skips jobs without a tag_list', () => {
    expect(sharedJobTags([{ name: 'lint' }, ...tagged(['huy-runner'], 1)])).toEqual(['huy-runner']);
  });

  test('returns nothing when no job has tags, or there are no jobs', () => {
    expect(sharedJobTags(tagged([], 3))).toEqual([]);
    expect(sharedJobTags([])).toEqual([]);
    expect(sharedJobTags(undefined)).toEqual([]);
  });
});

describe('searchMenuItems', () => {
  const item = (label, section, href = `/p/-/${label.toLowerCase().replace(/\W+/g, '-')}`) => ({
    label,
    section,
    href,
  });
  const menu = [
    item('Members', ''),
    item('Members', 'Manage'),
    item('Releases', 'Deploy'),
    item('Pipelines', 'Build'),
    item('Pipeline schedules', 'Build'),
    item('CI/CD analytics', 'Analyze'),
    item('Jobs', 'Build'),
  ];
  const labels = (query) => searchMenuItems(menu, query).map((entry) => entry.label);

  test('matches any part of a label, ignoring case', () => {
    expect(labels('SCHED')).toEqual(['Pipeline schedules']);
    expect(labels('ci/cd')).toEqual(['CI/CD analytics']);
  });

  test('puts labels that start with the query before ones that only contain it', () => {
    expect(labels('pipeline')).toEqual(['Pipelines', 'Pipeline schedules']);
    expect(labels('sched')).toEqual(['Pipeline schedules']);
    expect(searchMenuItems([item('Wiki pipelines', 'Plan'), item('Pipelines', 'Build')], 'pipe').map((e) => e.label)).toEqual(['Pipelines', 'Wiki pipelines']);
  });

  test('needs every word, in any order, across the section and the label', () => {
    expect(labels('deploy rel')).toEqual(['Releases']);
    expect(labels('rel deploy')).toEqual(['Releases']);
    expect(labels('build rel')).toEqual([]);
  });

  test('finds everything in a section by its name, after label matches', () => {
    expect(labels('build')).toEqual(['Pipelines', 'Pipeline schedules', 'Jobs']);
  });

  test('lists a page once, naming the section when it has one', () => {
    const found = searchMenuItems(
      [item('Members', '', '/p/-/members'), item('Members', 'Manage', '/p/-/members')],
      'members',
    );
    expect(found).toEqual([item('Members', 'Manage', '/p/-/members')]);
  });

  test('returns nothing for a blank query or no menu', () => {
    expect(searchMenuItems(menu, '')).toEqual([]);
    expect(searchMenuItems(menu, '   ')).toEqual([]);
    expect(searchMenuItems(menu, undefined)).toEqual([]);
    expect(searchMenuItems(undefined, 'jobs')).toEqual([]);
  });
});

describe('pinnedUrl', () => {
  test("prefers the entry's webUrl, normalized", () => {
    expect(pinnedUrl({ base: BASE, id: '12', webUrl: `${BASE}/-/pipelines/12/` })).toBe(
      `${BASE}/-/pipelines/12`,
    );
  });

  test('falls back to base and id', () => {
    expect(pinnedUrl({ base: BASE, id: '12' })).toBe(`${BASE}/-/pipelines/12`);
  });
});
