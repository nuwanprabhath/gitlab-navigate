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

  // Menu entries ({ label, section, href }) matching `query`, best first. Every
  // space-separated word must appear in the section name or the label, in any order, so
  // "deploy rel" finds Releases under Deploy. A match in the label ranks above one only in
  // the section name, and the same page listed twice (pinned and under its section) is
  // kept once, preferring the entry that names its section.
  function searchMenuItems(items, query) {
    const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const byHref = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      const known = byHref.get(item.href);
      if (!known || (!known.section && item.section)) byHref.set(item.href, item);
    }

    const ranked = [];
    for (const item of byHref.values()) {
      const label = item.label.toLowerCase();
      const haystack = `${item.section ?? ''} ${label}`.toLowerCase();
      if (!words.every((word) => haystack.includes(word))) continue;
      const inLabel = words.every((word) => label.includes(word));
      const startsLabel = label.startsWith(words[0]);
      ranked.push({ item, rank: startsLabel ? 0 : inLabel ? 1 : 2, order: ranked.length });
    }
    return ranked.sort((a, b) => a.rank - b.rank || a.order - b.order).map(({ item }) => item);
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

  globalThis.gitlabNavigate = {
    normalize,
    pipelineUrlFromHref,
    sharedJobTags,
    searchMenuItems,
    pinnedUrl,
    watch,
  };
})();
