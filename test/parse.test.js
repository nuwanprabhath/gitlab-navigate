import { describe, expect, test } from 'bun:test';
import { ParseError, buildUrl, normalizeBase } from '../lib/parse.js';

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

  test('rejects when no target branch is configured', () => {
    expect(() => buildUrl('createMr', 'my-branch', BASE, '')).toThrow(ParseError);
  });

  test('rejects an empty source branch', () => {
    expect(() => buildUrl('createMr', '   ', BASE, target)).toThrow(ParseError);
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
