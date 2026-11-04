// Helpers shared by the GitLab page scripts, which run after this one in the same
// isolated world. A classic script (content scripts cannot use static ES module
// imports). It touches no chrome.* or document at load time, so bun can import it for
// tests.
(() => {
  function normalize(url) {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
    } catch {
      return '';
    }
  }

  const PIPELINE_PATH = /^\/(.+)\/-\/pipelines\/(\d+)(?:\/.*)?$/;

  // A single pipeline's URL, from its page, one of its tabs or a link to it.
  function pipelineUrlFromHref(href, baseUrl) {
    let parsed;
    try {
      parsed = new URL(href, baseUrl);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

    const match = parsed.pathname.match(PIPELINE_PATH);
    if (!match) return null;
    return {
      url: `${parsed.origin}/${match[1]}/-/pipelines/${match[2]}`,
      projectPath: match[1],
      id: match[2],
    };
  }

  // The tags carried by every job that has any, or failing that by a large share of them.
  // Untagged jobs run on shared runners and say nothing about the runner the pipeline targets.
  function sharedJobTags(jobs) {
    const tagLists = (Array.isArray(jobs) ? jobs : [])
      .map((job) => (Array.isArray(job?.tag_list) ? job.tag_list : []))
      .filter((tags) => tags.length > 0);
    if (tagLists.length === 0) return [];

    const unique = [...new Set(tagLists.flat())];
    const carriedBy = (tag) => tagLists.filter((tags) => tags.includes(tag)).length;

    const shared = unique.filter((tag) => carriedBy(tag) === tagLists.length);
    if (shared.length > 0) return shared;

    // No tag is on every job: a few jobs are pinned to another runner (e.g. notify jobs on
    // a fixed one), so the pipeline's runner is what a large share of jobs carry. Judged
    // against the most common tag rather than by rank, since a tag like `cypress` can sit
    // on one job more than the runner does.
    const most = Math.max(...unique.map(carriedBy));
    return unique.filter((tag) => carriedBy(tag) >= most / 2);
  }

  function pinnedUrl(entry) {
    return normalize(entry.webUrl || `${entry.base}/-/pipelines/${entry.id}`);
  }

  // Calls back once per batch of DOM changes. GitLab re-renders with Vue after load and
  // while pipelines run, and its table can reuse a row element for another pipeline, so
  // href and text changes count as well as added and removed nodes. A microtask rather
  // than an animation frame, which pauses in background tabs and never fires headless.
  function watch(callback) {
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      Promise.resolve().then(() => {
        scheduled = false;
        callback();
      });
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['href'],
    });
  }

  globalThis.gitlabNavigate = { normalize, pipelineUrlFromHref, sharedJobTags, pinnedUrl, watch };
})();
