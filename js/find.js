/* kOS Visual: find blocks in the script.
 * Ctrl+F (Cmd+F on Mac) or the Find button opens a bar over the editor.
 * Every block whose text contains the search is outlined; Enter / Shift+Enter
 * (or the arrows) step through them, centring each one. Escape closes. */
(function () {
  'use strict';

  const workspace = window.kosWorkspace;
  const host = document.getElementById('blocklyDiv');

  const bar = document.createElement('div');
  bar.className = 'find-bar';
  bar.hidden = true;
  bar.innerHTML =
    '<input type="search" placeholder="Find in script" spellcheck="false" aria-label="Find in script">' +
    '<span class="find-count"></span>' +
    '<button type="button" data-step="-1" title="Previous (Shift+Enter)">▲</button>' +
    '<button type="button" data-step="1" title="Next (Enter)">▼</button>' +
    '<button type="button" class="find-close" title="Close (Esc)">✕</button>';
  host.appendChild(bar);
  const input = bar.querySelector('input');
  const count = bar.querySelector('.find-count');

  let hits = [];
  let current = -1;

  /** The text on a block itself (labels, fields, dropdown choices, its comment), not its children. */
  function ownText(block) {
    const parts = [];
    for (const inputRow of block.inputList) {
      for (const field of inputRow.fieldRow) {
        const t = field.getText();
        if (t) parts.push(t);
      }
    }
    // Comments attached to the block (the ? icon), e.g. a function's description.
    const note = block.getCommentText && block.getCommentText();
    if (note) parts.push(note);
    return parts.join(' ').replace(/\s+/g, ' ');
  }

  function clearMarks() {
    for (const b of hits) {
      if (!b.isDeadOrDying()) {
        b.removeClass('kos-find-hit');
        b.removeClass('kos-find-current');
      }
    }
  }

  function run(keepPosition) {
    const q = input.value.trim().toLowerCase();
    const previous = hits[current];
    clearMarks();
    hits = q
      ? workspace.getAllBlocks(true).filter((b) => ownText(b).toLowerCase().includes(q))
      : [];
    hits.forEach((b) => b.addClass('kos-find-hit'));
    current = keepPosition && previous ? hits.indexOf(previous) : -1;
    if (current < 0 && hits.length && !keepPosition) current = 0;
    show(!keepPosition);
  }

  function show(scroll) {
    for (const b of hits) b.removeClass('kos-find-current');
    if (!input.value.trim()) count.textContent = '';
    else if (!hits.length) count.textContent = 'No matches';
    else count.textContent = (current >= 0 ? current + 1 : 0) + ' of ' + hits.length;
    count.classList.toggle('none', !!input.value.trim() && !hits.length);
    const b = hits[current];
    if (b) {
      b.addClass('kos-find-current');
      if (scroll) scrollTo(b);
    }
  }

  // Bring the block's own top-left corner into view (centring on the block would
  // use the size of everything stacked under it, which can push it off screen).
  function scrollTo(block) {
    const xy = block.getRelativeToSurfaceXY();
    const view = workspace.getMetricsManager().getViewMetrics(false); // pixels
    const scale = workspace.scale;
    workspace.scroll(60 - xy.x * scale, view.height / 3 - xy.y * scale);
  }

  function step(dir) {
    if (!hits.length) return;
    current = (current + dir + hits.length) % hits.length;
    show(true);
  }

  function open() {
    bar.hidden = false;
    input.focus();
    input.select();
    if (input.value.trim()) run(false);
  }

  function close() {
    bar.hidden = true;
    clearMarks();
    hits = [];
    current = -1;
  }

  input.addEventListener('input', () => run(false));
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      close();
    }
  });
  bar.querySelectorAll('[data-step]').forEach((btn) =>
    btn.addEventListener('click', () => step(Number(btn.dataset.step)))
  );
  bar.querySelector('.find-close').addEventListener('click', close);
  const findBtn = document.getElementById('btn-find');
  if (findBtn) findBtn.addEventListener('click', () => (bar.hidden ? open() : close()));

  // Keep the matches up to date while the script changes.
  let pending = false;
  workspace.addChangeListener((e) => {
    if (bar.hidden || e.isUiEvent || pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (!bar.hidden) run(true);
    });
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') {
      const t = e.target;
      const typing = t && t !== input && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
      if (typing) return; // leave the browser's own find alone inside other text boxes
      e.preventDefault();
      open();
    }
  });

  window.kosFind = { open, close, step, hits: () => hits.slice(), current: () => current };
})();
