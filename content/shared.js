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

  // The tags carried by every job that has any. Untagged jobs run on shared runners and say
  // nothing about the runner the pipeline targets.
  //
  // When no tag is on every job, some jobs are pinned to a fixed runner of their own (notify
  // jobs on `nectar`, unit tests on `fast-cpu`). A pipeline's chosen runner is added on top
  // of the pool tag (`[cypress, huy-runner]`), so the jobs with the most tags decide it, even
  // if sharded jobs that only carry the pool tag outnumber them.
  function sharedJobTags(jobs) {
    const tagLists = (Array.isArray(jobs) ? jobs : [])
      .map((job) => (Array.isArray(job?.tag_list) ? job.tag_list : []))
      .filter((tags) => tags.length > 0);
    if (tagLists.length === 0) return [];

    const common = (lists) => {
      const unique = [...new Set(lists.flat())];
      const carriedBy = (tag) => lists.filter((tags) => tags.includes(tag)).length;
      return { unique, carriedBy, shared: unique.filter((tag) => carriedBy(tag) === lists.length) };
    };

    const all = common(tagLists);
    if (all.shared.length > 0) return all.shared;

    const widest = Math.max(...tagLists.map((tags) => tags.length));
    const specific = common(tagLists.filter((tags) => tags.length === widest));

    // Keep what a large share of the most specific jobs carry; a tag on all of them counts too.
    const most = Math.max(...specific.unique.map(specific.carriedBy));
    return specific.unique.filter((tag) => specific.carriedBy(tag) >= most / 2);
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
