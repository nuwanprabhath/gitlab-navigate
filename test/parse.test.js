import { describe, expect, test } from 'bun:test';
import {
  ParseError,
  assignedTicketsUrl,
  authoredPipelinesUrl,
  authoredTicketsUrl,
  buildUrl,
  formatDuration,
  inProgressTicketsUrl,
  mineMrUrl,
  myPipelinesUrl,
  normalizeBase,
  originPattern,
  parsePipelineUrl,
  pipelineApiUrl,
  pipelineElapsedSeconds,
  reviewerMrUrl,
  runningPipelinesUrl,
  swapMrBranches,
} from '../lib/parse.js';

const BASE = 'https://gitlab.com/ternandsparrow/paratoo-fdcp';

describe('normalizeBase', () => {
  test('keeps a clean repo URL unchanged', () => {
    expect(normalizeBase(BASE)).toBe(BASE);
  });

  test('trims surrounding whitespace', () => {
    expect(normalizeBase(`  ${BASE}  `)).toBe(BASE);
  });

  test('drops a trailing slash', () => {
    expect(normalizeBase(`${BASE}/`)).toBe(BASE);
  });

  test('drops a trailing /-/ path so any repo page can be pasted', () => {
    expect(normalizeBase(`${BASE}/-/merge_requests/1122`)).toBe(BASE);
  });

  test('accepts a self-hosted http URL', () => {
    expect(normalizeBase('http://gitlab.internal/team/repo')).toBe(
      'http://gitlab.internal/team/repo',
    );
  });

  test('rejects a URL that is not http(s)', () => {
    expect(() => normalizeBase('gitlab.com/team/repo')).toThrow(ParseError);
  });

  test('rejects empty input', () => {
    expect(() => normalizeBase('   ')).toThrow(ParseError);
  });
});

describe('buildUrl ticket', () => {
  test('builds a work item URL from a bare number', () => {
    expect(buildUrl('ticket', '2795', BASE)).toBe(`${BASE}/-/work_items/2795`);
  });

  test('strips a leading #', () => {
    expect(buildUrl('ticket', '#2795', BASE)).toBe(`${BASE}/-/work_items/2795`);
  });

  test('rejects a non-numeric ticket', () => {
    expect(() => buildUrl('ticket', 'abc', BASE)).toThrow(ParseError);
  });
});

describe('buildUrl mr', () => {
  test('builds a merge request URL from a bare number', () => {
    expect(buildUrl('mr', '1122', BASE)).toBe(`${BASE}/-/merge_requests/1122`);
  });

  test('strips a leading !', () => {
    expect(buildUrl('mr', '!1122', BASE)).toBe(`${BASE}/-/merge_requests/1122`);
  });

  test('rejects a non-numeric merge request', () => {
    expect(() => buildUrl('mr', '11a2', BASE)).toThrow(ParseError);
  });
});

describe('buildUrl commit', () => {
  const sha = '5c3f861c10886a5dbf5ba2f9be4f4c10d9767379';

  test('builds a commit URL from a full hash', () => {
    expect(buildUrl('commit', sha, BASE)).toBe(`${BASE}/-/commit/${sha}`);
  });

  test('accepts a short hash', () => {
    expect(buildUrl('commit', '5c3f861', BASE)).toBe(`${BASE}/-/commit/5c3f861`);
  });

  test('lowercases the hash', () => {
    expect(buildUrl('commit', '5C3F861', BASE)).toBe(`${BASE}/-/commit/5c3f861`);
  });

  test('rejects a hash that is too short', () => {
    expect(() => buildUrl('commit', '5c3f86', BASE)).toThrow(ParseError);
  });

  test('rejects a non-hex hash', () => {
    expect(() => buildUrl('commit', 'zzzzzzz', BASE)).toThrow(ParseError);
  });
});

describe('buildUrl history', () => {
  test('encodes slashes in the branch name and appends a trailing slash', () => {
    expect(buildUrl('history', 'dev/1.0.11', BASE)).toBe(
      `${BASE}/-/commits/dev%2F1.0.11/`,
    );
  });

  test('handles a branch with no slash', () => {
    expect(buildUrl('history', 'main', BASE)).toBe(`${BASE}/-/commits/main/`);
  });

  test('strips a leading origin/', () => {
    expect(buildUrl('history', 'origin/dev/1.0.11', BASE)).toBe(
      `${BASE}/-/commits/dev%2F1.0.11/`,
    );
  });

  test('strips a leading refs/heads/', () => {
    expect(buildUrl('history', 'refs/heads/main', BASE)).toBe(
      `${BASE}/-/commits/main/`,
    );
  });

  test('strips surrounding slashes', () => {
    expect(buildUrl('history', '/main/', BASE)).toBe(`${BASE}/-/commits/main/`);
  });
});

describe('buildUrl pipeline', () => {
  test('builds a pipeline URL from a bare number', () => {
    expect(buildUrl('pipeline', '2753700544', BASE)).toBe(
      `${BASE}/-/pipelines/2753700544`,
    );
  });

  test('strips a leading #', () => {
    expect(buildUrl('pipeline', '#2753700544', BASE)).toBe(
      `${BASE}/-/pipelines/2753700544`,
    );
  });

  test('rejects a non-numeric pipeline id', () => {
    expect(() => buildUrl('pipeline', 'abc', BASE)).toThrow(ParseError);
  });
});

describe('buildUrl job', () => {
  test('builds a job URL from a bare number', () => {
    expect(buildUrl('job', '15853756077', BASE)).toBe(`${BASE}/-/jobs/15853756077`);
  });

  test('strips a leading #', () => {
    expect(buildUrl('job', '#15853756077', BASE)).toBe(`${BASE}/-/jobs/15853756077`);
  });

  test('rejects a non-numeric job id', () => {
    expect(() => buildUrl('job', 'abc', BASE)).toThrow(ParseError);
  });
});

describe('buildUrl createMr', () => {
  const target = 'dev/1.0.11';

  test('builds a new MR URL from a source branch and the configured target', () => {
    expect(
      buildUrl('createMr', 'fix-plot-layout-pro-expansion-issue', BASE, target),
    ).toBe(
      `${BASE}/-/merge_requests/new?merge_request%5Bsource_branch%5D=fix-plot-layout-pro-expansion-issue&merge_request%5Btarget_branch%5D=dev%2F1.0.11`,
    );
  });

  test('encodes a source branch that contains slashes', () => {
    expect(buildUrl('createMr', 'feature/foo', BASE, target)).toBe(
      `${BASE}/-/merge_requests/new?merge_request%5Bsource_branch%5D=feature%2Ffoo&merge_request%5Btarget_branch%5D=dev%2F1.0.11`,
    );
  });

  test('strips a leading origin/ from the source branch', () => {
    expect(buildUrl('createMr', 'origin/my-branch', BASE, target)).toBe(
      `${BASE}/-/merge_requests/new?merge_request%5Bsource_branch%5D=my-branch&merge_request%5Btarget_branch%5D=dev%2F1.0.11`,
    );
  });

  test('strips a leading refs/heads/ from the source branch', () => {
    expect(buildUrl('createMr', 'refs/heads/my-branch', BASE, target)).toBe(
      `${BASE}/-/merge_requests/new?merge_request%5Bsource_branch%5D=my-branch&merge_request%5Btarget_branch%5D=dev%2F1.0.11`,
    );
  });

  test('strips a leading origin/ from the target branch too', () => {
    expect(buildUrl('createMr', 'my-branch', BASE, 'origin/dev/1.0.12')).toBe(
      `${BASE}/-/merge_requests/new?merge_request%5Bsource_branch%5D=my-branch&merge_request%5Btarget_branch%5D=dev%2F1.0.12`,
    );
  });

  test('rejects when no target branch is given', () => {
    expect(() => buildUrl('createMr', 'my-branch', BASE, '')).toThrow(ParseError);
  });

  test('rejects an empty source branch', () => {
    expect(() => buildUrl('createMr', '   ', BASE, target)).toThrow(ParseError);
  });
});

describe('swapMrBranches', () => {
  const newMrUrl =
    `${BASE}/-/merge_requests/new?merge_request%5Bsource_branch%5D=` +
    `fix-plot-layout-pro-expansion-issue&merge_request%5Btarget_branch%5D=dev%2F1.0.11`;

  test('swaps source and target branch query params', () => {
    const result = swapMrBranches(newMrUrl);
    const params = new URL(result).searchParams;
    expect(params.get('merge_request[source_branch]')).toBe('dev/1.0.11');
    expect(params.get('merge_request[target_branch]')).toBe(
      'fix-plot-layout-pro-expansion-issue',
    );
  });

  test('preserves the path and other query params', () => {
    const url = `${newMrUrl}&nav_source=navbar`;
    const result = swapMrBranches(url);
    const parsed = new URL(result);
    expect(parsed.pathname).toBe('/ternandsparrow/paratoo-fdcp/-/merge_requests/new');
    expect(parsed.searchParams.get('nav_source')).toBe('navbar');
  });

  test('swaps source and target project ids when both are present', () => {
    const url =
      `${newMrUrl}&merge_request%5Bsource_project_id%5D=1` +
      `&merge_request%5Btarget_project_id%5D=2`;
    const params = new URL(swapMrBranches(url)).searchParams;
    expect(params.get('merge_request[source_project_id]')).toBe('2');
    expect(params.get('merge_request[target_project_id]')).toBe('1');
  });

  test('leaves project ids alone when only one is present', () => {
    const url = `${newMrUrl}&merge_request%5Bsource_project_id%5D=1`;
    const params = new URL(swapMrBranches(url)).searchParams;
    expect(params.get('merge_request[source_project_id]')).toBe('1');
  });

  test('rejects a URL with no source branch', () => {
    const url = `${BASE}/-/merge_requests/new?merge_request%5Btarget_branch%5D=main`;
    expect(() => swapMrBranches(url)).toThrow(ParseError);
  });

  test('rejects a URL with no target branch', () => {
    const url = `${BASE}/-/merge_requests/new?merge_request%5Bsource_branch%5D=main`;
    expect(() => swapMrBranches(url)).toThrow(ParseError);
  });

  test('rejects something that is not a URL', () => {
    expect(() => swapMrBranches('not a url')).toThrow(ParseError);
  });
});

describe('buildUrl pasted URLs', () => {
  test('returns a pasted work item URL unchanged', () => {
    const url = `${BASE}/-/work_items/2795`;
    expect(buildUrl('ticket', url, BASE)).toBe(url);
  });

  test('returns a pasted merge request URL unchanged', () => {
    const url = `${BASE}/-/merge_requests/1122`;
    expect(buildUrl('mr', url, BASE)).toBe(url);
  });

  test('returns a pasted commit URL unchanged', () => {
    const url = `${BASE}/-/commit/5c3f861c10886a5dbf5ba2f9be4f4c10d9767379`;
    expect(buildUrl('commit', url, BASE)).toBe(url);
  });

  test('returns a pasted commits URL unchanged', () => {
    const url = `${BASE}/-/commits/dev%2F1.0.11/`;
    expect(buildUrl('history', url, BASE)).toBe(url);
  });

  test('returns a pasted pipeline URL unchanged', () => {
    const url = `${BASE}/-/pipelines/2753700544`;
    expect(buildUrl('pipeline', url, BASE)).toBe(url);
  });

  test('returns a pasted job URL unchanged', () => {
    const url = `${BASE}/-/jobs/15853756077`;
    expect(buildUrl('job', url, BASE)).toBe(url);
  });

  test('returns a pasted new-MR URL unchanged', () => {
    const url = `${BASE}/-/merge_requests/new?merge_request%5Bsource_branch%5D=my-branch`;
    expect(buildUrl('createMr', url, BASE, 'dev/1.0.11')).toBe(url);
  });
});

describe('buildUrl input handling', () => {
  test('trims whitespace around the reference', () => {
    expect(buildUrl('ticket', '  2795 \n', BASE)).toBe(`${BASE}/-/work_items/2795`);
  });

  test('rejects empty input', () => {
    expect(() => buildUrl('ticket', '   ', BASE)).toThrow(ParseError);
  });

  test('rejects an unknown type', () => {
    expect(() => buildUrl('bogus', '42', BASE)).toThrow(ParseError);
  });

  test('rejects a missing base URL', () => {
    expect(() => buildUrl('ticket', '2795', '')).toThrow(ParseError);
  });

  test('ParseError carries a human readable message', () => {
    try {
      buildUrl('ticket', 'abc', BASE);
      throw new Error('expected buildUrl to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError);
      expect(err.message.length).toBeGreaterThan(0);
    }
  });
});

describe('reviewerMrUrl', () => {
  test('builds the opened-MRs-where-I-am-reviewer URL', () => {
    expect(reviewerMrUrl(BASE, 'nuwan-tern')).toBe(
      `${BASE}/-/merge_requests/?sort=created_date&state=opened&reviewer_username=nuwan-tern&first_page_size=100`,
    );
  });

  test('encodes a username with special characters', () => {
    expect(reviewerMrUrl(BASE, 'a b')).toBe(
      `${BASE}/-/merge_requests/?sort=created_date&state=opened&reviewer_username=a+b&first_page_size=100`,
    );
  });

  test('rejects a missing base URL', () => {
    expect(() => reviewerMrUrl('', 'nuwan-tern')).toThrow(ParseError);
  });

  test('rejects a missing username', () => {
    expect(() => reviewerMrUrl(BASE, '')).toThrow(ParseError);
  });
});

describe('mineMrUrl', () => {
  test('builds the opened-MRs-assigned-to-me URL', () => {
    expect(mineMrUrl(BASE, 'nuwan-tern')).toBe(
      `${BASE}/-/merge_requests/?sort=created_date&state=opened&assignee_username=nuwan-tern&first_page_size=100`,
    );
  });

  test('encodes a username with special characters', () => {
    expect(mineMrUrl(BASE, 'a b')).toBe(
      `${BASE}/-/merge_requests/?sort=created_date&state=opened&assignee_username=a+b&first_page_size=100`,
    );
  });

  test('rejects a missing base URL', () => {
    expect(() => mineMrUrl('', 'nuwan-tern')).toThrow(ParseError);
  });

  test('rejects a missing username', () => {
    expect(() => mineMrUrl(BASE, '')).toThrow(ParseError);
  });
});

describe('ticket list URLs', () => {
  const U = 'nuwan-tern';

  test('assigned: work items assigned to me', () => {
    expect(assignedTicketsUrl(BASE, U)).toBe(
      `${BASE}/-/work_items?sort=created_date&state=all&assignee_username%5B%5D=nuwan-tern&first_page_size=100`,
    );
  });

  test('in progress: assigned to me with status In progress', () => {
    expect(inProgressTicketsUrl(BASE, U)).toBe(
      `${BASE}/-/work_items?sort=created_date&state=all&assignee_username%5B%5D=nuwan-tern&status=In%20progress&first_page_size=100`,
    );
  });

  test('authored: work items I opened', () => {
    expect(authoredTicketsUrl(BASE, U)).toBe(
      `${BASE}/-/work_items?sort=created_date&state=all&author_username=nuwan-tern&first_page_size=100`,
    );
  });

  test('encodes a space in the status as %20, not +', () => {
    expect(inProgressTicketsUrl(BASE, U)).toContain('status=In%20progress');
  });

  test('each rejects a missing base URL', () => {
    for (const fn of [assignedTicketsUrl, inProgressTicketsUrl, authoredTicketsUrl]) {
      expect(() => fn('', U)).toThrow(ParseError);
    }
  });

  test('each rejects a missing username', () => {
    for (const fn of [assignedTicketsUrl, inProgressTicketsUrl, authoredTicketsUrl]) {
      expect(() => fn(BASE, '')).toThrow(ParseError);
    }
  });
});

describe('pipeline list URLs', () => {
  test('running: all running pipelines, no user filter', () => {
    expect(runningPipelinesUrl(BASE)).toBe(
      `${BASE}/-/pipelines?status=running&scope=all`,
    );
  });

  test('mine: running pipelines triggered by me', () => {
    expect(myPipelinesUrl(BASE, 'nuwan-tern')).toBe(
      `${BASE}/-/pipelines?status=running&scope=all&username=nuwan-tern`,
    );
  });

  test('mine encodes a username with special characters', () => {
    expect(myPipelinesUrl(BASE, 'a b')).toContain('username=a%20b');
  });

  test('running rejects a missing base URL', () => {
    expect(() => runningPipelinesUrl('')).toThrow(ParseError);
  });

  test('mine rejects a missing base URL', () => {
    expect(() => myPipelinesUrl('', 'nuwan-tern')).toThrow(ParseError);
  });

  test('mine rejects a missing username', () => {
    expect(() => myPipelinesUrl(BASE, '')).toThrow(ParseError);
  });
});

describe('authoredPipelinesUrl', () => {
  test('all pipelines I triggered, any status', () => {
    expect(authoredPipelinesUrl(BASE, 'nuwan-tern')).toBe(
      `${BASE}/-/pipelines?username=nuwan-tern&scope=all`,
    );
  });

  test('carries no status filter, unlike the other two', () => {
    expect(authoredPipelinesUrl(BASE, 'nuwan-tern')).not.toContain('status=');
  });

  test('rejects a missing base URL', () => {
    expect(() => authoredPipelinesUrl('', 'nuwan-tern')).toThrow(ParseError);
  });

  test('rejects a missing username', () => {
    expect(() => authoredPipelinesUrl(BASE, '')).toThrow(ParseError);
  });
});

describe('parsePipelineUrl', () => {
  test('pulls base and id out of a pipeline page URL', () => {
    expect(parsePipelineUrl(`${BASE}/-/pipelines/2816150418`)).toEqual({
      base: BASE,
      id: '2816150418',
    });
  });

  test('ignores a trailing slash and query string', () => {
    expect(parsePipelineUrl(`${BASE}/-/pipelines/2816150418/?foo=1`)).toEqual({
      base: BASE,
      id: '2816150418',
    });
  });

  test('works for a self-hosted instance', () => {
    expect(parsePipelineUrl('https://gitlab.internal/team/repo/-/pipelines/7')).toEqual({
      base: 'https://gitlab.internal/team/repo',
      id: '7',
    });
  });

  test('returns null for the pipeline list page', () => {
    expect(parsePipelineUrl(`${BASE}/-/pipelines?status=running`)).toBeNull();
  });

  test('returns null for a job page', () => {
    expect(parsePipelineUrl(`${BASE}/-/jobs/15853756077`)).toBeNull();
  });

  test('returns null for a non-URL', () => {
    expect(parsePipelineUrl('chrome://extensions')).toBeNull();
  });
});

describe('pipelineApiUrl', () => {
  test('URL-encodes the project path', () => {
    expect(pipelineApiUrl(BASE, '2816150418')).toBe(
      'https://gitlab.com/api/v4/projects/ternandsparrow%2Fparatoo-fdcp/pipelines/2816150418',
    );
  });

  test('handles a nested subgroup path', () => {
    expect(pipelineApiUrl('https://gitlab.com/a/b/c', '7')).toBe(
      'https://gitlab.com/api/v4/projects/a%2Fb%2Fc/pipelines/7',
    );
  });

  test('rejects a missing base URL', () => {
    expect(() => pipelineApiUrl('', '7')).toThrow(ParseError);
  });
});

describe('originPattern', () => {
  test('builds a host permission pattern from the repo URL', () => {
    expect(originPattern(BASE)).toBe('https://gitlab.com/*');
  });

  test('keeps the scheme of a self-hosted instance', () => {
    expect(originPattern('http://gitlab.internal/team/repo')).toBe(
      'http://gitlab.internal/*',
    );
  });
});

describe('formatDuration', () => {
  test('seconds under a minute', () => {
    expect(formatDuration(45)).toBe('45s');
  });

  test('minutes and seconds', () => {
    expect(formatDuration(252)).toBe('4m 12s');
  });

  test('hours and minutes', () => {
    expect(formatDuration(3780)).toBe('1h 3m');
  });

  test('rounds down to whole seconds', () => {
    expect(formatDuration(9.8)).toBe('9s');
  });

  test('clamps a negative clock skew to zero', () => {
    expect(formatDuration(-5)).toBe('0s');
  });

  test('returns null when there is nothing to show', () => {
    expect(formatDuration(null)).toBeNull();
  });
});

describe('pipelineElapsedSeconds', () => {
  const now = Date.parse('2026-09-03T10:05:00Z');

  test('running: counts from started_at up to now', () => {
    const p = { status: 'running', started_at: '2026-09-03T10:00:48Z' };
    expect(pipelineElapsedSeconds(p, now)).toBe(252);
  });

  test('running but not yet started: counts from created_at', () => {
    const p = { status: 'pending', created_at: '2026-09-03T10:04:00Z' };
    expect(pipelineElapsedSeconds(p, now)).toBe(60);
  });

  test('finished: uses the reported duration, not the wall clock', () => {
    const p = { status: 'success', started_at: '2026-01-01T00:00:00Z', duration: 34 };
    expect(pipelineElapsedSeconds(p, now)).toBe(34);
  });

  test('finished without a duration: falls back to finished minus started', () => {
    const p = {
      status: 'failed',
      started_at: '2026-09-03T09:00:00Z',
      finished_at: '2026-09-03T09:01:30Z',
    };
    expect(pipelineElapsedSeconds(p, now)).toBe(90);
  });

  test('returns null when nothing can be derived', () => {
    expect(pipelineElapsedSeconds({ status: 'created' }, now)).toBeNull();
  });
});
