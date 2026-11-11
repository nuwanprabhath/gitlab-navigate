// A search box under the project name in GitLab's left sidebar. It lists the menu links
// whose name matches, with the section each one sits in, so a page several menus deep is
// one keystroke away. GitLab keeps every section's links in the page while it is
// collapsed, so nothing has to be opened; the results are copies and GitLab's own menu
// (rendered by Vue) is never changed. Relies on content/shared.js, which runs first.
(() => {
  const { searchMenuItems, watch } = globalThis.gitlabNavigate;
  const MARK = 'data-gitlab-navigate-search';
  const STYLE_MARK = 'data-gitlab-navigate-search-style';
  // The scrolling menu, which holds the project link and every section but not the Help
  // menu below it.
  const MENU = '#super-sidebar .gl-scroll-scrim';
  const PROJECT_LIST = '.gl-scroll-scrim > div > ul';
  const PINNED = '#super-sidebar-pinned-section';
  const MAX_RESULTS = 12;

  // currentColor and GitLab's own variables, so the box suits the light and dark themes
  // without a palette of its own.
  const STYLE = `
    [${MARK}] { margin: 0 0 0.75rem; }
    [${MARK}] input {
      box-sizing: border-box; width: 100%; padding: 0.375rem 0.625rem; font: inherit;
      color: inherit; background: transparent; border-radius: 0.25rem;
      border: 1px solid var(--gl-border-color-default, rgba(128, 128, 128, 0.6));
    }
    [${MARK}] input:focus { outline: 2px solid var(--gl-focus-ring-outer-color, #428fdc); outline-offset: 1px; }
    [${MARK}] ul { margin: 0.25rem 0 0; padding: 0; list-style: none; }
    [${MARK}] a {
      display: block; padding: 0.25rem 0.5rem; border-radius: 0.25rem; color: inherit;
      text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    [${MARK}] a:hover, [${MARK}] a:focus {
      background: var(--gl-background-color-strong, rgba(128, 128, 128, 0.2)); outline: none;
    }
    [${MARK}] small { margin-left: 0.5rem; opacity: 0.7; }
    [${MARK}] p { margin: 0.25rem 0 0; padding: 0 0.5rem; opacity: 0.7; }
  `;

  let box = null;
  let input = null;
  let results = null;

  function ensureStyle() {
    if (document.querySelector(`[${STYLE_MARK}]`)) return;
    const style = document.createElement('style');
    style.setAttribute(STYLE_MARK, '');
    style.textContent = STYLE;
    (document.head ?? document.documentElement).append(style);
  }

  const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  // Every link in the menu with the section it sits under; the pinned shortcuts have none.
  function readMenu() {
    const items = [];
    for (const link of document.querySelectorAll(`${MENU} a[href]`)) {
      if (link.closest(`[${MARK}]`)) continue;
      const label = link.getAttribute('aria-label') || text(link.querySelector('.nav-item-link-label')) || text(link);
      if (!label) continue;
      const section = link.closest(PINNED) ? '' : link.closest('ul[aria-label]')?.getAttribute('aria-label');
      items.push({ label, section: section ?? '', href: link.href });
    }
    return items;
  }

  function show(query) {
    results.replaceChildren();
    if (!query.trim()) return;

    const found = searchMenuItems(readMenu(), query);
    if (found.length === 0) {
      const none = document.createElement('p');
      none.textContent = 'No menu item matches.';
      results.append(none);
      return;
    }
    for (const { label, section, href } of found.slice(0, MAX_RESULTS)) {
      const row = document.createElement('li');
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      if (section) {
        const where = document.createElement('small');
        where.textContent = section;
        link.append(where);
      }
      row.append(link);
      results.append(row);
    }
  }

  function move(from, step) {
    const links = [...results.querySelectorAll('a')];
    const next = links.indexOf(from) + step;
    if (next < 0) input.focus();
    else links[Math.min(next, links.length - 1)]?.focus();
  }

  function build() {
    box = document.createElement('div');
    box.setAttribute(MARK, '');

    input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Search menu…';
    input.setAttribute('aria-label', 'Search the menu');
    input.autocomplete = 'off';
    input.addEventListener('input', () => show(input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        input.value = '';
        show('');
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        results.querySelector('a')?.focus();
      } else if (event.key === 'Enter') {
        results.querySelector('a')?.click();
      }
    });

    results = document.createElement('ul');
    results.addEventListener('keydown', (event) => {
      const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
      if (step === undefined) return;
      event.preventDefault();
      move(event.target.closest('a'), step);
    });

    box.append(input, results);
  }

  // Keeps the box right after the project link's list. Vue re-renders the sidebar, so it
  // is put back if it goes missing; it writes only then, since every write wakes the
  // observer.
  function apply() {
    const projectList = document.querySelector(PROJECT_LIST);
    if (!projectList) return;
    ensureStyle();
    if (!box) build();
    if (projectList.nextElementSibling !== box) projectList.after(box);
  }

  // A second copy of this script (an orphaned one from before an extension update) would
  // fight the first over the box forever.
  if (!document.querySelector(`[${MARK}]`)) {
    watch(apply);
    apply();
  }
})();
