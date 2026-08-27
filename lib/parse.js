/**
 * Pure reference -> URL translation. No Chrome APIs, no DOM.
 */

export class ParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ParseError';
  }
}

function asHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * Turn anything the user pastes from a repo into the repo root URL.
 */
export function normalizeBase(input) {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) throw new ParseError('Enter your GitLab repo URL');

  if (!asHttpUrl(trimmed)) {
    throw new ParseError('Repo URL must start with http:// or https://');
  }

  const withoutSuffix = trimmed.split('/-/')[0];
  return withoutSuffix.replace(/\/+$/, '');
}

function stripBranchPrefixes(raw) {
  return raw
    .replace(/^\/+|\/+$/g, '')
    .replace(/^refs\/heads\//, '')
    .replace(/^origin\//, '');
}

const builders = {
  ticket(raw, base) {
    const digits = raw.replace(/^#/, '');
    if (!/^\d+$/.test(digits)) throw new ParseError('Ticket must be a number');
    return `${base}/-/work_items/${digits}`;
  },

  mr(raw, base) {
    const digits = raw.replace(/^!/, '');
    if (!/^\d+$/.test(digits)) throw new ParseError('MR must be a number');
    return `${base}/-/merge_requests/${digits}`;
  },

  commit(raw, base) {
    const hash = raw.toLowerCase();
    if (!/^[0-9a-f]{7,40}$/.test(hash)) {
      throw new ParseError('Commit must be 7-40 hex characters');
    }
    return `${base}/-/commit/${hash}`;
  },

  history(raw, base) {
    const branch = stripBranchPrefixes(raw);
    if (!branch) throw new ParseError('Enter a branch name');
    return `${base}/-/commits/${encodeURIComponent(branch)}/`;
  },

  pipeline(raw, base) {
    const digits = raw.replace(/^#/, '');
    if (!/^\d+$/.test(digits)) throw new ParseError('Pipeline must be a number');
    return `${base}/-/pipelines/${digits}`;
  },

  job(raw, base) {
    const digits = raw.replace(/^#/, '');
    if (!/^\d+$/.test(digits)) throw new ParseError('Job must be a number');
    return `${base}/-/jobs/${digits}`;
  },

  createMr(raw, base, target) {
    const source = stripBranchPrefixes(raw);
    if (!source) throw new ParseError('Enter a source branch name');
    if (!target) throw new ParseError('Set a default target branch first');

    const params = new URLSearchParams({
      'merge_request[source_branch]': source,
      'merge_request[target_branch]': target,
    });
    return `${base}/-/merge_requests/new?${params.toString()}`;
  },
};

function mrListUrl(base, username, usernameParam) {
  if (!base) throw new ParseError('Set your GitLab repo URL first');
  if (!username) throw new ParseError('Set your GitLab username first');

  const params = new URLSearchParams({
    sort: 'created_date',
    state: 'opened',
    [usernameParam]: username,
    first_page_size: '100',
  });
  return `${base}/-/merge_requests/?${params.toString()}`;
}

/**
 * Open MRs where the given user is requested as a reviewer, newest first.
 *
 * @param {string} base     normalized repo root URL
 * @param {string} username GitLab username, e.g. "nuwan-tern"
 * @returns {string} the URL to open
 */
export function reviewerMrUrl(base, username) {
  return mrListUrl(base, username, 'reviewer_username');
}

/**
 * Open MRs assigned to the given user, newest first — "the ones I have to deal with".
 *
 * GitLab cannot OR two filter fields in one URL (params AND together, and the MR list
 * has a `not` hash but no `or` hash), so this cannot be a true author-or-assignee
 * union. Assignee is the practical stand-in: GitLab's new-MR form assigns the author
 * by default, so a self-assigned MR shows up here too.
 *
 * @param {string} base     normalized repo root URL
 * @param {string} username GitLab username, e.g. "nuwan-tern"
 * @returns {string} the URL to open
 */
export function mineMrUrl(base, username) {
  return mrListUrl(base, username, 'assignee_username');
}

/**
 * Swap the source and target branch on a GitLab "new merge request" URL.
 * Operates on the URL alone, so it works without touching the live page.
 *
 * @param {string} urlString a `.../-/merge_requests/new?...` URL
 * @returns {string} the same URL with source_branch/target_branch swapped
 */
export function swapMrBranches(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new ParseError('Not a valid URL');
  }

  const params = url.searchParams;
  const source = params.get('merge_request[source_branch]');
  const target = params.get('merge_request[target_branch]');
  if (!source || !target) {
    throw new ParseError('This page has no source/target branch to swap');
  }
  params.set('merge_request[source_branch]', target);
  params.set('merge_request[target_branch]', source);

  const sourceProject = params.get('merge_request[source_project_id]');
  const targetProject = params.get('merge_request[target_project_id]');
  if (sourceProject && targetProject) {
    params.set('merge_request[source_project_id]', targetProject);
    params.set('merge_request[target_project_id]', sourceProject);
  }

  return url.toString();
}

/**
 * @param {'ticket'|'mr'|'commit'|'history'|'pipeline'|'job'|'createMr'} type
 * @param {string} raw     what the user typed or pasted
 * @param {string} base    normalized repo root URL
 * @param {string} [extra] type-specific extra input; the target branch for createMr
 * @returns {string} the URL to open
 */
export function buildUrl(type, raw, base, extra) {
  const build = builders[type];
  if (!build) throw new ParseError(`Unknown reference type: ${type}`);

  const value = String(raw ?? '').trim();
  if (!value) throw new ParseError('Enter a value');

  // A pasted link already points where the user wants to go.
  if (asHttpUrl(value)) return value;

  if (!base) throw new ParseError('Set your GitLab repo URL first');

  return build(value, base, extra);
}
