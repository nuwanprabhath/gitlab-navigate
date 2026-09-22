// Shows pinned pipelines' notes on GitLab: after the number in a pipeline page's
// heading, and after each pinned pipeline's number in the pipelines table.
// Relies on content/shared.js, which runs first.
(() => {
  const { pipelineUrlFromHref, pinnedUrl, watch } = globalThis.gitlabNavigate;
  const MARK = 'data-gitlab-navigate-note';
  const HEADING_ID = '[data-testid="pipeline-header"] [data-testid="pipeline-id"]';
  const TABLE_LINKS =
    '[data-testid="pipeline-url-table-cell"] [data-testid="pipeline-url-link"]';
  const STYLE =
    'margin-left: 0.5rem; font-weight: 400; color: var(--gl-text-color-subtle, #626168);';

  let notes = new Map(); // pipeline url -> note

  // Keeps one marked note span at the end of `container`, or none when `note` is ''.
  // Writes only when something is wrong: every write wakes the observer, and an
  // unconditional write would loop forever.
  function place(container, url, note) {
    const existing = [...container.children].find((child) => child.hasAttribute(MARK));
    if (!note) {
      existing?.remove();
      return;
    }

    const text = `\u{1F4CC} ${note}`;
    if (existing) {
      if (existing.getAttribute(MARK) !== url) existing.setAttribute(MARK, url);
      if (existing.textContent !== text) existing.textContent = text;
      return;
    }

    const span = document.createElement('span');
    span.setAttribute(MARK, url);
    span.textContent = text;
    span.style.cssText = STYLE;
    container.append(span);
  }

  function apply() {
    const headingId = document.querySelector(HEADING_ID);
    const page = pipelineUrlFromHref(location.href);
    if (headingId?.parentElement && page) {
      place(headingId.parentElement, page.url, notes.get(page.url) ?? '');
    }

    // Inside the link, so a long note truncates with GitLab's ellipsis and a click on it
    // opens the pipeline like the number does.
    for (const link of document.querySelectorAll(TABLE_LINKS)) {
      const pipeline = pipelineUrlFromHref(link.href);
      place(link, pipeline?.url ?? '', pipeline ? notes.get(pipeline.url) ?? '' : '');
    }
  }

  async function loadNotes() {
    let pinnedPipelines;
    try {
      ({ pinnedPipelines } = await chrome.storage.local.get('pinnedPipelines'));
    } catch {
      // The extension was reloaded or updated; this copy of the script is orphaned.
      return;
    }

    notes = new Map();
    for (const entry of Array.isArray(pinnedPipelines) ? pinnedPipelines : []) {
      const url = pinnedUrl(entry);
      if (entry.note && url && !notes.has(url)) notes.set(url, entry.note);
    }
    apply();
  }

  watch(apply);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.pinnedPipelines) loadNotes();
  });
  loadNotes();
})();
