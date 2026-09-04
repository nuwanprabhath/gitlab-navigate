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

    // The target arrives from an editable box, so it gets the same tolerance as the
    // source: a pasted `origin/dev/1.0.12` must not become a literal branch name.
    const targetBranch = stripBranchPrefixes(String(target ?? '').trim());
    if (!targetBranch) throw new ParseError('Enter a target branch name');

    const params = new URLSearchParams({
      'merge_request[source_branch]': source,
      'merge_request[target_branch]': targetBranch,
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
 * GitLab's work-item list serialises filters as `assignee_username[]`, `author_username`
 * and `status` (confirmed against the URLs the list page itself produces). Spaces are
 * written as %20 rather than the `+` URLSearchParams emits, matching GitLab's own links.
 */
function ticketListUrl(base, username, filters) {
  if (!base) throw new ParseError('Set your GitLab repo URL first');
  if (!username) throw new ParseError('Set your GitLab username first');

  const params = new URLSearchParams({
    sort: 'created_date',
    state: 'all',
    ...filters,
    first_page_size: '100',
  });
  return `${base}/-/work_items?${params.toString().replace(/\+/g, '%20')}`;
}

/**
 * Work items assigned to the given user.
 */
export function assignedTicketsUrl(base, username) {
  return ticketListUrl(base, username, { 'assignee_username[]': username });
}

/**
 * Work items assigned to the given user whose status is "In progress".
 */
export function inProgressTicketsUrl(base, username) {
  return ticketListUrl(base, username, {
    'assignee_username[]': username,
    status: 'In progress',
  });
}

/**
 * Work items the given user opened.
 */
export function authoredTicketsUrl(base, username) {
  return ticketListUrl(base, username, { author_username: username });
}

/**
 * GitLab's pipeline list. `scope=all` spans every ref rather than just the default
 * branch. Each caller supplies its own params, since they differ in both content and
 * order from the URLs GitLab produces.
 */
function pipelineListUrl(base, params) {
  if (!base) throw new ParseError('Set your GitLab repo URL first');

  const query = new URLSearchParams(params);
  return `${base}/-/pipelines?${query.toString().replace(/\+/g, '%20')}`;
}

/**
 * Every currently running pipeline. Needs no username.
 */
export function runningPipelinesUrl(base) {
  return pipelineListUrl(base, { status: 'running', scope: 'all' });
}

/**
 * Running pipelines triggered by the given user.
 */
export function myPipelinesUrl(base, username) {
  if (!base) throw new ParseError('Set your GitLab repo URL first');
  if (!username) throw new ParseError('Set your GitLab username first');
  return pipelineListUrl(base, { status: 'running', scope: 'all', username });
}

/**
 * Every pipeline the given user triggered, in any state — no status filter, so this is
 * a superset of myPipelinesUrl.
 */
export function authoredPipelinesUrl(base, username) {
  if (!base) throw new ParseError('Set your GitLab repo URL first');
  if (!username) throw new ParseError('Set your GitLab username first');
  return pipelineListUrl(base, { username, scope: 'all' });
}

/**
 * Recognise a single-pipeline page, e.g. `.../-/pipelines/2816150418`.
 *
 * @returns {{base: string, id: string}|null} null for anything else, including the
 *   pipeline *list* page, so callers can use it as a plain "is this pinnable?" test.
 */
export function parsePipelineUrl(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const match = url.pathname.match(/^(.*)\/-\/pipelines\/(\d+)\/?$/);
  if (!match) return null;

  return { base: `${url.origin}${match[1]}`, id: match[2] };
}

/**
 * The REST endpoint for one pipeline. GitLab accepts a URL-encoded project path in
 * place of a numeric project id, so no lookup call is needed.
 */
export function pipelineApiUrl(base, id) {
  if (!base) throw new ParseError('Set your GitLab repo URL first');

  const url = new URL(base);
  const project = encodeURIComponent(url.pathname.replace(/^\/|\/$/g, ''));
  return `${url.origin}/api/v4/projects/${project}/pipelines/${id}`;
}

/**
 * The host permission pattern covering a repo's GitLab instance, for
 * chrome.permissions.request().
 */
export function originPattern(base) {
  return `${new URL(base).origin}/*`;
}

/**
 * @param {number|null} seconds
 * @returns {string|null} "45s", "4m 12s", "1h 3m" — null when there is nothing to show
 */
export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return null;

  const total = Math.max(0, Math.floor(seconds));
  if (total < 60) return `${total}s`;
  if (total < 3600) return `${Math.floor(total / 60)}m ${total % 60}s`;
  return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`;
}

const FINISHED = new Set(['success', 'failed', 'canceled', 'skipped', 'manual']);

/**
 * How long a pipeline has been going, or took.
 *
 * A finished pipeline reports its own `duration`, which must be preferred over the wall
 * clock — otherwise an old pinned pipeline would appear to still be counting up.
 *
 * @param {object} pipeline raw GitLab pipeline JSON
 * @param {number} now      epoch ms
 * @returns {number|null} seconds
 */
export function pipelineElapsedSeconds(pipeline, now = Date.now()) {
  const { status, started_at: started, finished_at: finished, created_at: created } =
    pipeline ?? {};

  if (FINISHED.has(status)) {
    if (typeof pipeline.duration === 'number') return pipeline.duration;
    if (started && finished) return (Date.parse(finished) - Date.parse(started)) / 1000;
    return null;
  }

  const from = started || created;
  return from ? Math.max(0, (now - Date.parse(from)) / 1000) : null;
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
