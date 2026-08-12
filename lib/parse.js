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
    const branch = raw
      .replace(/^\/+|\/+$/g, '')
      .replace(/^refs\/heads\//, '')
      .replace(/^origin\//, '');
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
};

/**
 * @param {'ticket'|'mr'|'commit'|'history'} type
 * @param {string} raw   what the user typed or pasted
 * @param {string} base  normalized repo root URL
 * @returns {string} the URL to open
 */
export function buildUrl(type, raw, base) {
  const build = builders[type];
  if (!build) throw new ParseError(`Unknown reference type: ${type}`);

  const value = String(raw ?? '').trim();
  if (!value) throw new ParseError('Enter a value');

  // A pasted link already points where the user wants to go.
  if (asHttpUrl(value)) return value;

  if (!base) throw new ParseError('Set your GitLab repo URL first');

  return build(value, base);
}
