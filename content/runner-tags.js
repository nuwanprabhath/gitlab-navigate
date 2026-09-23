// Shows the runner a pipeline targets as a grey badge: after GitLab's own badges in each
// pipelines-table row, and after the header badges on a pipeline page. GitLab does not
// keep a pipeline's inputs, so the runner comes from its jobs' tags.
// Relies on content/shared.js, which runs first.
(() => {
  const { pipelineUrlFromHref, sharedJobTags, watch } = globalThis.gitlabNavigate;
  const MARK = 'data-gitlab-navigate-runner';
  const TABLE_CELL = '[data-testid="pipeline-url-table-cell"]';
  const TABLE_LINK = '[data-testid="pipeline-url-link"]';
  const HEADER_JOBS = '[data-testid="pipeline-header"] [data-testid="total-jobs"]';
  const CACHE_KEY = 'runnerTags';
  const CACHE_LIMIT = 500;
  const MAX_IN_FLIGHT = 4;

  // Stored as an ordered array of [pipeline url, tags] pairs, oldest first, rather than an
  // object: chrome.storage returns object keys sorted alphabetically (Firefox keeps
  // insertion order), which would break newest-500 eviction.
  const isValidPair = (pair) =>
    Array.isArray(pair) && typeof pair[0] === 'string' && Array.isArray(pair[1]);

  // Pipeline URL -> the tags every tagged job shares, before the ignore list, so a
  // settings change applies without refetching.
  let cache = new Map();
  let ignored = new Set();
  let ready = false;
  const requested = new Set(); // fetched, or being fetched, during this page load
  const queue = [];
  let inFlight = 0;
  let writing = Promise.resolve();

  function setIgnored(tags) {
    ignored = new Set((Array.isArray(tags) ? tags : []).map((tag) => String(tag).toLowerCase()));
  }

  function visibleTags(url) {
    return (cache.get(url) ?? []).filter((tag) => !ignored.has(tag.toLowerCase()));
  }

  function badge(url, tag) {
    const outer = document.createElement('span');
    outer.setAttribute(MARK, url);
    outer.title = 'Runner tag';
    outer.className = 'gl-badge badge badge-pill badge-neutral';
    outer.style.marginLeft = '0.25rem';
    const inner = document.createElement('span');
    inner.className = 'gl-badge-content';
    inner.textContent = tag;
    outer.append(inner);
    return outer;
  }

  // Makes the marked badges directly inside `container` read `tags`, inserting before
  // `before` (null = at the end). Writes only when they differ: every write wakes the
  // observer, and an unconditional write would loop forever.
  function place(container, before, url, tags) {
    const existing = [...container.children].filter((child) => child.hasAttribute(MARK));
    const have = existing.map((el) => `${el.getAttribute(MARK)} ${el.textContent}`);
    const wanted = tags.map((tag) => `${url} ${tag}`);
    if (have.length === wanted.length && have.every((value, i) => value === wanted[i])) return;

    for (const el of existing) el.remove();
    for (const tag of tags) container.insertBefore(badge(url, tag), before);
  }

  function apply() {
    if (!ready) return;

    for (const cell of document.querySelectorAll(TABLE_CELL)) {
      const link = cell.querySelector(TABLE_LINK);
      const labels = cell.lastElementChild;
      if (!link || !labels || labels === link || labels.contains(link)) continue;
      const pipeline = pipelineUrlFromHref(link.href);
      if (pipeline) request(pipeline);
      place(labels, null, pipeline?.url ?? '', pipeline ? visibleTags(pipeline.url) : []);
    }

    const page = pipelineUrlFromHref(location.href);
    const jobsWrapper = document.querySelector(HEADER_JOBS)?.closest('div');
    if (page && jobsWrapper?.parentElement) {
      request(page);
      place(jobsWrapper.parentElement, jobsWrapper, page.url, visibleTags(page.url));
    }
  }

  function request(pipeline) {
    if (cache.has(pipeline.url) || requested.has(pipeline.url)) return;
    requested.add(pipeline.url);
    queue.push(pipeline);
    pump();
  }

  function pump() {
    while (inFlight < MAX_IN_FLIGHT && queue.length > 0) {
      const pipeline = queue.shift();
      inFlight += 1;
      fetchTags(pipeline)
        .then((tags) => {
          if (tags) remember(pipeline.url, tags);
        })
        .catch(() => {
          // Not cached, so the next page load tries again.
        })
        .finally(() => {
          inFlight -= 1;
          pump();
          apply();
        });
    }
  }

  // Null when there is nothing worth caching yet: an error, or no jobs so far.
  async function fetchTags({ projectPath, id }) {
    const response = await fetch(
      `${location.origin}/api/v4/projects/${encodeURIComponent(projectPath)}/pipelines/${id}/jobs?per_page=100`,
      { credentials: 'include' },
    );
    if (!response.ok) return null;
    const jobs = await response.json();
    return Array.isArray(jobs) && jobs.length > 0 ? sharedJobTags(jobs) : null;
  }

  // A pipeline's tags never change once it exists, so they are kept across page loads.
  // Writes are chained so this page's own fetches cannot overwrite each other's entries.
  function remember(url, tags) {
    cache.set(url, tags);
    writing = writing.then(async () => {
      try {
        const { [CACHE_KEY]: stored } = await chrome.storage.local.get(CACHE_KEY);
        const next = (Array.isArray(stored) ? stored : [])
          .filter((pair) => isValidPair(pair) && pair[0] !== url);
        next.push([url, tags]);
        await chrome.storage.local.set({ [CACHE_KEY]: next.slice(-CACHE_LIMIT) });
      } catch {
        // Orphaned after an extension update, or storage failed; the badge still shows.
      }
    });
  }

  async function load() {
    try {
      const [{ [CACHE_KEY]: stored }, { ignoredJobTags }] = await Promise.all([
        chrome.storage.local.get(CACHE_KEY),
        chrome.storage.sync.get('ignoredJobTags'),
      ]);
      cache = new Map(
        (Array.isArray(stored) ? stored : []).filter(isValidPair),
      );
      setIgnored(ignoredJobTags);
    } catch {
      // The extension was reloaded or updated; this copy of the script is orphaned.
      return;
    }
    ready = true;
    apply();
  }

  watch(apply);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.ignoredJobTags) {
      setIgnored(changes.ignoredJobTags.newValue);
      apply();
    }
  });
  load();
})();
