// Shows a pinned pipeline's note next to the pipeline number on its GitLab page.
// Registered by the popup for the user's GitLab site. A classic script: content
// scripts cannot use static ES module imports.
(() => {
  const MARK = 'data-gitlab-navigate-note';
  const PIPELINE_ID = '[data-testid="pipeline-header"] [data-testid="pipeline-id"]';
  let note = '';

  function normalize(url) {
    try {
      const parsed = new URL(url, location.href);
      return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
    } catch {
      return '';
    }
  }

  // The pipeline's own page or one of its tabs, e.g. `…/-/pipelines/<id>/builds`.
  function isThisPipeline(entry) {
    const target = normalize(entry.webUrl || `${entry.base}/-/pipelines/${entry.id}`);
    const here = normalize(location.href);
    return Boolean(target) && (here === target || here.startsWith(`${target}/`));
  }

  function apply() {
    const existing = document.querySelector(`[${MARK}]`);
    const pipelineId = document.querySelector(PIPELINE_ID);
    if (!note || !pipelineId) {
      existing?.remove();
      return;
    }

    const text = `\u{1F4CC} ${note}`;
    if (existing?.parentElement === pipelineId.parentElement) {
      if (existing.textContent !== text) existing.textContent = text;
      return;
    }

    existing?.remove();
    const span = document.createElement('span');
    span.setAttribute(MARK, '');
    span.textContent = text;
    span.style.cssText =
      'margin-left: 0.5rem; font-weight: 400; color: var(--gl-text-color-subtle, #626168);';
    pipelineId.parentElement.append(span);
  }

  async function loadNote() {
    let pinnedPipelines;
    try {
      ({ pinnedPipelines } = await chrome.storage.local.get('pinnedPipelines'));
    } catch {
      // The extension was reloaded or updated; this copy of the script is orphaned.
      return;
    }
    const match = (Array.isArray(pinnedPipelines) ? pinnedPipelines : []).find(
      (entry) => entry.note && isThisPipeline(entry),
    );
    note = match?.note ?? '';
    apply();
  }

  // GitLab renders the header with Vue after load and re-renders it while the pipeline
  // runs; put the note back whenever it goes missing.
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    Promise.resolve().then(() => {
      scheduled = false;
      apply();
    });
  }).observe(document.body, { childList: true, subtree: true });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.pinnedPipelines) loadNote();
  });

  loadNote();
})();
