import { pipelineApiUrl } from './parse.js';

/**
 * One pinned pipeline from GitLab's REST API, authenticated by the browser's own session
 * cookie. Shared by the popup and the background checker. A non-OK response throws an
 * Error whose `status` is the HTTP status, so callers can tell a deleted pipeline (404)
 * from a passing failure.
 */
export async function fetchPipeline(entry) {
  const response = await fetch(pipelineApiUrl(entry.base, entry.id), {
    credentials: 'include',
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
