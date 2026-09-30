import { pipelineApiUrl } from './parse.js';

const FETCH_TIMEOUT_MS = 30_000;

/**
 * One pinned pipeline from GitLab's REST API, authenticated by the browser's own session
 * cookie. Shared by the popup and the background checker. A non-OK response throws an
 * Error whose `status` is the HTTP status, so callers can tell a deleted pipeline (404)
 * from a passing failure.
 */
export async function fetchPipeline(entry) {
  const response = await fetch(pipelineApiUrl(entry.base, entry.id), {
    credentials: 'include',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    const error = new Error(`GitLab returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const raw = await response.json();
  return {
    base: entry.base,
    id: entry.id,
    status: raw.status,
    ref: raw.ref,
    webUrl: raw.web_url,
    raw,
  };
}

/**
 * Whether the browser's GitLab session is still signed in. GitLab answers 404, not 401, for a
 * private project when signed out, so a 404 only means "deleted" if this is true.
 */
export async function isSignedIn(base) {
  try {
    const response = await fetch(`${new URL(base).origin}/api/v4/user`, {
      credentials: 'include',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}
