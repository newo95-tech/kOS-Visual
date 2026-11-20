/* kOS Visual: search box at the top of the block menu.
 * Type to list matching blocks in the flyout. Matches block text, category,
 * tooltip and dropdown choices (searching "apoapsis" offers the ship block
 * already set to apoapsis). Enter adds the first result to the editor,
 * Escape clears. Press "/" anywhere to jump to the search box. */
(function () {
  'use strict';

  const workspace = window.kosWorkspace;
  const toolbox = workspace.getToolbox();
  const MAX_RESULTS = 30;

  // ---- Index -----------------------------------------------------------------
  const scratch = new Blockly.Workspace(); // headless, for reading block text

  function describe(json) {
    let block;
    try {
      block = Blockly.serialization.blocks.append(json, scratch, { recordUndo: false });
    } catch (e) {
      return null;
    }
    const text = block.toString();
    const tooltip = typeof block.tooltip === 'string' ? block.tooltip : '';
    const dropdowns = [];
    for (const input of block.inputList) {
      for (const field of input.fieldRow) {
        if (field instanceof Blockly.FieldDropdown && !(field instanceof Blockly.FieldVariable) && field.name) {
          let options = [];
          try {
            options = field.getOptions(false);
          } catch (e) {
            /* dynamic options may need a real workspace */
          }
          dropdowns.push({
            name: field.name,
            current: field.getValue(),
            options: options
              .filter((o) => typeof o[0] === 'string')
              .map(([label, value]) => ({ label, value })),
          });
        }
      }
    }
    scratch.clear();
    return { text, tooltip, dropdowns };
  }

  function strip(item) {
    const json = { type: item.type };
    for (const k of ['fields', 'inputs', 'extraState']) if (item[k]) json[k] = item[k];
    return json;
  }

  let staticIndex = null;
  function buildStaticIndex() {
    const entries = [];
    for (const cat of window.kosToolbox.contents) {
      if (cat.kind !== 'category' || !cat.contents) continue;
      for (const item of cat.contents) {
        if (item.kind !== 'block') continue;
        const json = strip(item);
        const info = describe(json);
        if (!info) continue;
        entries.push({ json, category: cat.name, ...info });
      }
    }
    return entries;
  }

  // Variables and the user's own functions change, so index them on each search.
  function dynamicEntries() {
    const entries = [];
    for (const v of workspace.getVariableMap().getAllVariables()) {
      const name = v.getName();
      entries.push({ json: { type: 'variables_get', fields: { VAR: { id: v.getId() } } }, category: 'Variables', text: name, tooltip: 'variable', dropdowns: [] });
      entries.push({ json: { type: 'variables_set', fields: { VAR: { id: v.getId() } } }, category: 'Variables', text: 'set ' + name + ' to', tooltip: 'variable', dropdowns: [] });
    }
    for (const def of workspace.getAllBlocks(false)) {
      if (def.type !== 'procedures_defnoreturn' && def.type !== 'procedures_defreturn') continue;
      const [name, params, returns] = def.getProcedureDef();
      entries.push({
        json: { type: returns ? 'procedures_callreturn' : 'procedures_callnoreturn', extraState: { name, params } },
        category: 'Functions',
        text: name + (params.length ? ' with: ' + params.join(', ') : ''),
        tooltip: 'function call',
        dropdowns: [],
      });
    }
    return entries;
  }

  // ---- Search ----------------------------------------------------------------
  // Every query word must match the start of a word: "lock" finds LOCK, not "blocks".
  const wordsOf = (s) => s.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean);
  const matchAll = (queryWords, text) => {
    const hay = wordsOf(text);
    return queryWords.every((q) => hay.some((h) => h.startsWith(q)));
  };

  function search(query) {
    const words = wordsOf(query);
    if (!words.length) return [];
    if (!staticIndex) staticIndex = buildStaticIndex();
    const results = [];
    const seen = new Set();
    for (const e of dynamicEntries().concat(staticIndex)) {
      const base = e.text + ' ' + e.category + ' ' + e.tooltip;
      // Offer a copy with a dropdown already set when a choice matches.
      let variants = [];
      for (const dd of e.dropdowns) {
        for (const o of dd.options) {
          if (o.value === dd.current) continue;
          const optionText = o.label + ' ' + o.value;
          const optionHit = words.some((w) => wordsOf(optionText).some((h) => h.startsWith(w)));
          if (optionHit && matchAll(words, optionText + ' ' + e.text + ' ' + e.category)) {
            const json = JSON.parse(JSON.stringify(e.json));
            json.fields = Object.assign({}, json.fields, { [dd.name]: o.value });
            // A choice whose label starts with the query is the best match of all.
            variants.push({ json, score: o.label.toLowerCase().startsWith(words[0]) ? -1 : 1 });
          }
        }
      }
      if (matchAll(words, e.text)) {
        variants.unshift({ json: e.json, score: e.text.toLowerCase().startsWith(words[0]) ? 0 : 0.5 });
      } else if (matchAll(words, base)) {
        variants.push({ json: e.json, score: 2 }); // only the category or tooltip matched
      }
      for (const v of variants) {
        const key = JSON.stringify(v.json);
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(v);
      }
    }
    results.sort((a, b) => a.score - b.score);
    return results.slice(0, MAX_RESULTS).map((r) => r.json);
  }

  // ---- UI --------------------------------------------------------------------
  const box = document.createElement('div');
  box.className = 'block-search';
  box.innerHTML = '<input type="search" placeholder="Search  ( / )" spellcheck="false" aria-label="Search blocks">';
  const input = box.querySelector('input');
  const toolboxDiv = toolbox.HtmlDiv || document.querySelector('.blocklyToolbox');
  // Keep the toolbox its original width so the flyout still lines up with it.
  box.style.width = toolboxDiv.offsetWidth + 'px';
  toolboxDiv.insertBefore(box, toolboxDiv.firstChild);
  Blockly.svgResize(workspace);

  const flyout = toolbox.getFlyout();
  let lastResults = [];

  function showResults() {
    const q = input.value.trim();
    if (!q) {
      flyout.hide();
      return;
    }
    toolbox.clearSelection();
    lastResults = search(q);
    flyout.show(
      lastResults.length
        ? lastResults.map((json) => Object.assign({ kind: 'block' }, json))
        : [{ kind: 'label', text: 'No blocks match "' + q + '"' }]
    );
  }

  input.addEventListener('input', showResults);
  input.addEventListener('focus', () => input.value.trim() && showResults());
  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // keep the toolbox's arrow-key navigation out of the text box
    if (e.key === 'Escape') {
      input.value = '';
      flyout.hide();
      input.blur();
    } else if (e.key === 'Enter' && lastResults.length) {
      // Drop the first result near the top-left of the visible editor.
      const m = workspace.getMetricsManager().getViewMetrics(true);
      const json = Object.assign({}, lastResults[0], { x: m.left + 40, y: m.top + 40 });
      const block = Blockly.serialization.blocks.append(json, workspace);
      block.select();
      input.value = '';
      flyout.hide();
    }
  });
  // Clicking a category clears the search.
  toolboxDiv.addEventListener('click', (e) => {
    if (!box.contains(e.target)) input.value = '';
  });

  document.addEventListener('keydown', (e) => {
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  window.kosSearchBlocks = search; // handy for testing
})();
