import { NOTE_MAX_LENGTH, normalizeNote } from './lib/parse.js';
import { reorderPinned, setPinnedNote, unpinItem } from './lib/storage.js';

/**
 * One pinned list: rendering, drag-to-reorder, ✎ note editing and ✕ unpin. Lists differ
 * only in what a row shows, which describeRow(entry) supplies:
 *
 *   { status, glyph, headline, headlineIsId, subline, editSubline, sublineTail, tooltip, trailing, url }
 *
 * `trailing` is an element for the row's right edge (a pipeline's duration) or null.
 * `sublineTail` is optional text appended after the subline that never shrinks (an MR's
 * target branch), shown in both the nav row and the edit row.
 * onRender(entries) runs after every render.
 */
// `idPrefix` is how the item's number is written: `#` for pipelines and tickets, `!` for MRs.
export function createPinnedList({
  kind,
  noun,
  idPrefix = '#',
  section,
  list,
  describeRow,
  navigate,
  onRender,
}) {
  let entries = [];
  let draggedIndex = null;
  // The row being edited, kept outside the DOM so list rebuilds cannot lose it:
  // { base, id, draft, selectionStart, selectionEnd, cancelled }
  let editing = null;
  // True while render() rebuilds the list; blurs it causes are not saves.
  let rendering = false;

  function clearDragOverMarkers() {
    for (const li of list.querySelectorAll('.pin-item')) {
      li.classList.remove('drag-over-top', 'drag-over-bottom');
    }
  }

  function statusGlyph(row) {
    const status = document.createElement('span');
    status.className = 'pin-status';
    status.dataset.status = row.status;
    status.textContent = row.glyph;
    return status;
  }

  function pinMain(headline, subline) {
    const main = document.createElement('span');
    main.className = 'pin-main';
    main.append(headline, subline);
    return main;
  }

  function pinSubline(text, tail) {
    const sub = document.createElement('span');
    if (!tail) {
      sub.className = 'pin-ref';
      sub.textContent = text;
      return sub;
    }

    sub.className = 'pin-ref pin-ref-split';
    const head = document.createElement('span');
    head.className = 'pin-ref-head';
    head.textContent = text;
    const tailSpan = document.createElement('span');
    tailSpan.className = 'pin-ref-tail';
    tailSpan.textContent = tail;
    sub.append(head, tailSpan);
    return sub;
  }

  function buildNavButton(row) {
    const headline = document.createElement('span');
    headline.className = row.headlineIsId ? 'pin-id' : 'pin-note';
    headline.textContent = row.headline;

    const nav = document.createElement('button');
    nav.type = 'button';
    nav.className = 'pin-nav';
    nav.title = row.tooltip;
    nav.append(statusGlyph(row), pinMain(headline, pinSubline(row.subline, row.sublineTail)));
    if (row.trailing) nav.append(row.trailing);
    nav.addEventListener('click', () => navigate(row.url));
    return nav;
  }

  function buildActions(entry) {
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'pin-action pin-note-edit';
    edit.title = entry.note ? 'Edit note' : 'Add note';
    edit.setAttribute('aria-label', edit.title);
    edit.textContent = '✎';
    edit.addEventListener('click', () => startEditing(entry));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'pin-action pin-remove';
    remove.title = 'Unpin';
    remove.setAttribute('aria-label', `Unpin this ${noun}`);
    remove.textContent = '✕';
    remove.addEventListener('click', async () => {
      entries = await unpinItem(kind, entry.base, entry.id);
      render();
    });

    const actions = document.createElement('span');
    actions.className = 'pin-actions';
    actions.append(edit, remove);
    return actions;
  }

  function rememberDraft(input) {
    if (!editing) return;
    editing.draft = input.value;
    editing.selectionStart = input.selectionStart;
    editing.selectionEnd = input.selectionEnd;
  }

  function buildEditor(entry, row) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'pin-note-input';
    input.maxLength = NOTE_MAX_LENGTH;
    input.placeholder = `What's this ${noun} for?`;
    input.setAttribute('aria-label', `Note for ${noun} ${idPrefix}${entry.id}`);
    input.value = editing.draft;

    for (const type of ['input', 'select', 'keyup', 'click']) {
      input.addEventListener(type, () => rememberDraft(input));
    }
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit();
      } else if (event.key === 'Escape') {
        // Flag first: if the browser closes the popup on Esc, the blur that
        // follows must not save.
        editing.cancelled = true;
        event.preventDefault();
        cancelEdit();
      }
    });
    input.addEventListener('blur', () => {
      if (rendering || !input.isConnected || !editing || editing.cancelled) return;
      commitEdit();
    });

    const editor = document.createElement('div');
    editor.className = 'pin-edit';
    editor.append(statusGlyph(row), pinMain(input, pinSubline(row.editSubline, row.sublineTail)));
    return editor;
  }

  function buildRow(entry, index) {
    const row = describeRow(entry);
    const isEditing = editing?.base === entry.base && editing?.id === entry.id;

    // A dedicated grab handle, rather than the whole row, so dragging never
    // fights with clicking nav or the hover actions.
    const handle = document.createElement('span');
    handle.className = 'pin-handle';
    handle.draggable = !isEditing;
    handle.title = 'Drag to reorder';
    handle.setAttribute('aria-label', 'Drag to reorder');

    const item = document.createElement('li');
    item.className = 'pin-item';
    if (isEditing) item.append(handle, buildEditor(entry, row));
    else item.append(handle, buildNavButton(row), buildActions(entry));

    handle.addEventListener('dragstart', (event) => {
      draggedIndex = index;
      item.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      // Firefox requires data to be set for the drag to actually start.
      event.dataTransfer.setData('text/plain', String(index));
    });

    handle.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      draggedIndex = null;
      clearDragOverMarkers();
    });

    item.addEventListener('dragover', (event) => {
      if (draggedIndex === null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      const isAfter = event.clientY - item.getBoundingClientRect().top > item.offsetHeight / 2;
      item.classList.toggle('drag-over-bottom', isAfter);
      item.classList.toggle('drag-over-top', !isAfter);
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    item.addEventListener('drop', async (event) => {
      event.preventDefault();
      clearDragOverMarkers();
      if (draggedIndex === null || draggedIndex === index) return;

      const isAfter = event.clientY - item.getBoundingClientRect().top > item.offsetHeight / 2;
      let targetIndex = isAfter ? index + 1 : index;
      if (draggedIndex < targetIndex) targetIndex -= 1;

      const moved = entries[draggedIndex];
      entries = await reorderPinned(kind, moved.base, moved.id, targetIndex);
      render();
    });

    return item;
  }

  function render() {
    rendering = true;
    try {
      list.replaceChildren(...entries.map(buildRow));
    } finally {
      rendering = false;
    }
    section.hidden = entries.length === 0;

    const input = list.querySelector('.pin-note-input');
    if (input) {
      input.focus();
      input.setSelectionRange(editing.selectionStart, editing.selectionEnd);
    }

    onRender?.(entries);
  }

  function startEditing(entry) {
    if (editing) commitEdit();
    const note = entry.note ?? '';
    editing = {
      base: entry.base,
      id: entry.id,
      draft: note,
      selectionStart: 0,
      selectionEnd: note.length,
      cancelled: false,
    };
    render();
  }

  // State is cleared before the write, but the list is only rebuilt after it, so a
  // click that caused this blur (e.g. ✎ on another row) still lands on its button.
  async function commitEdit() {
    if (!editing) return;
    const { base, id, draft } = editing;
    editing = null;
    entries = await setPinnedNote(kind, base, id, normalizeNote(draft));
    render();
  }

  function cancelEdit() {
    editing = null;
    render();
  }

  return {
    getEntries: () => entries,
    setEntries(next) {
      entries = next;
      render();
    },
    startEditing,
  };
}
