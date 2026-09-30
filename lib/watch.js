/**
 * What the pipeline bell decides, separate from the browser APIs so it can be tested.
 */

// `manual` (waiting for someone to click) and `scheduled` are not finished.
export const FINAL_STATUSES = ['success', 'failed', 'canceled', 'skipped'];

export function isFinalStatus(status) {
  return FINAL_STATUSES.includes(status);
}

const TITLES = {
  success: 'Pipeline passed',
  failed: 'Pipeline failed',
  canceled: 'Pipeline canceled',
  skipped: 'Pipeline skipped',
};

/**
 * The notification for a pipeline that has just been fetched, or null if it has not
 * finished. The headline is the user's note, else the pipeline number.
 */
export function finishedNotice(entry, fetched) {
  const title = TITLES[fetched?.status];
  if (!title) return null;

  const headline = entry.note || `#${entry.id}`;
  const ref = fetched.ref ?? entry.ref;
  return { title, message: ref ? `${headline} (${ref})` : headline };
}

function pipelineUrl(entry, fetched) {
  return fetched.webUrl || entry.webUrl || `${entry.base}/-/pipelines/${entry.id}`;
}

/**
 * One pass of the background checker over the pinned pipelines. Everything it touches is
 * injected:
 *   fetchPipeline(entry) -> fetched fields, or throws (with `.status` for HTTP errors)
 *   update(fields)       -> saves `{ base, id, ...fields }` onto the pinned entry
 *   notify({ url, title, message }) -> shows the notification
 *
 * A finished pipeline is announced first and only then disarmed, so a notification that
 * cannot be shown is retried on the next pass instead of being lost.
 */
export async function checkWatched({ entries, fetchPipeline, update, notify }) {
  for (const entry of entries.filter((e) => e.notify)) {
    let fetched;
    try {
      fetched = await fetchPipeline(entry);
    } catch (error) {
      // A deleted pipeline can never finish; anything else is tried again next pass.
      if (error?.status === 404) await update({ base: entry.base, id: entry.id, notify: false });
      continue;
    }

    const notice = finishedNotice(entry, fetched);
    if (!notice) {
      await update(fetched);
      continue;
    }

    try {
      await notify({ url: pipelineUrl(entry, fetched), ...notice });
    } catch {
      continue;
    }
    await update({ ...fetched, notify: false });
  }
}
