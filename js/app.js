/* kOS Visual: workspace setup, live preview, saving and export. */
(function () {
  'use strict';

  const C = window.KOS_COLOURS;
  const kos = window.kosGenerator;
  const STORAGE_KEY = 'kos-visual-workspace-v1';
  const FILENAME_KEY = 'kos-visual-filename';

  // ---- Toolbox ---------------------------------------------------------------
  const num = (n) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });
  const txt = (t) => ({ shadow: { type: 'text', fields: { TEXT: t } } });
  const blk = (type, inputs, fields) => ({ kind: 'block', type, inputs, fields });
  const cmp = (op, a, b) => ({
    block: { type: 'logic_compare', fields: { OP: op }, inputs: { A: a, B: b } },
  });
  const ship = (what) => ({ block: { type: 'kos_ship_value', fields: { WHAT: what } } });

  const toolbox = {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category', name: 'Program', colour: C.program,
        contents: [
          blk('kos_program'),
          blk('kos_comment'),
          blk('kos_clearscreen'),
          blk('kos_raw'),
          blk('kos_raw_value'),
        ],
      },
      {
        kind: 'category', name: 'Flight', colour: C.flight,
        contents: [
          blk('kos_lock_throttle', { VALUE: num(1) }),
          blk('kos_lock_steering', {
            VALUE: { block: { type: 'kos_heading', inputs: { COMPASS: num(90), PITCH: num(90) } } },
          }),
          blk('kos_unlock'),
          blk('kos_heading', { COMPASS: num(90), PITCH: num(90) }),
          blk('kos_direction'),
          blk('kos_lock_var', { VALUE: num(90) }),
          blk('kos_pilot_throttle', { VALUE: num(0) }),
        ],
      },
      {
        kind: 'category', name: 'Actions', colour: String(C.actions),
        contents: [blk('kos_stage'), blk('kos_toggle')],
      },
      {
        kind: 'category', name: 'Wait & triggers', colour: C.wait,
        contents: [
          blk('kos_wait', { SECONDS: num(1) }),
          blk('kos_wait_until', { COND: cmp('GT', ship('SHIP:ALTITUDE'), num(1000)) }),
          blk('kos_when', { COND: cmp('EQ', ship('SHIP:MAXTHRUST'), num(0)) }),
        ],
      },
      {
        kind: 'category', name: 'Loops & logic', colour: C.loops,
        contents: [
          blk('controls_if'),
          { kind: 'block', type: 'controls_if', extraState: { hasElse: true } },
          blk('kos_until', { COND: cmp('GT', ship('SHIP:APOAPSIS'), num(80000)) }),
          blk('kos_from', { FROM: num(1), TO: num(10), BY: num(1) }),
          blk('kos_break'),
          blk('logic_compare'),
          blk('logic_operation'),
          blk('logic_negate'),
          blk('logic_boolean'),
        ],
      },
      {
        kind: 'category', name: 'Ship info', colour: C.ship,
        contents: [
          blk('kos_ship_value'),
          blk('kos_ship_value', null, { WHAT: 'SHIP:APOAPSIS' }),
          blk('kos_ship_value', null, { WHAT: 'SHIP:VERTICALSPEED' }),
          blk('kos_eta'),
          blk('kos_resource'),
          blk('kos_stage_ready'),
        ],
      },
      {
        kind: 'category', name: 'Math', colour: C.math,
        contents: [
          blk('math_number'),
          blk('math_arithmetic', { A: num(1), B: num(1) }),
          blk('kos_negate', { X: num(1) }),
          blk('kos_round', { X: num(3.14159), DIGITS: num(1) }),
          blk('kos_minmax', { A: num(1), B: num(2) }),
          blk('kos_math_func', { X: num(9) }),
        ],
      },
      {
        kind: 'category', name: 'Terminal & text', colour: C.text,
        contents: [
          blk('kos_print', { VALUE: txt('Hello Kerbin!') }),
          blk('kos_print_at', { VALUE: txt('Alt: '), COL: num(0), ROW: num(5) }),
          blk('kos_hudtext', { VALUE: txt('Liftoff!'), SECONDS: num(5) }),
          blk('text'),
          blk('text_join'),
        ],
      },
      { kind: 'sep' },
      { kind: 'category', name: 'Variables', colour: 330, custom: 'VARIABLE' },
      { kind: 'category', name: 'Functions', colour: 290, custom: 'PROCEDURE' },
    ],
  };

  // ---- Theme -----------------------------------------------------------------
  const theme = Blockly.Theme.defineTheme('kosDark', {
    name: 'kosDark',
    base: Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: '#1b1e24',
      toolboxBackgroundColour: '#252931',
      toolboxForegroundColour: '#e6e6e6',
      flyoutBackgroundColour: '#2d323b',
      flyoutForegroundColour: '#ccc',
      flyoutOpacity: 0.95,
      scrollbarColour: '#555',
      insertionMarkerColour: '#fff',
      insertionMarkerOpacity: 0.3,
      cursorColour: '#d0d0d0',
    },
  });

  // ---- Workspace -------------------------------------------------------------
  // Toolbox flyout that keeps the same block size whatever the editor zoom is.
  const FLYOUT_SCALE = 0.9;
  class FixedScaleFlyout extends Blockly.VerticalFlyout {
    getFlyoutScale() {
      return FLYOUT_SCALE;
    }
  }
  Blockly.registry.register(
    Blockly.registry.Type.FLYOUTS_VERTICAL_TOOLBOX, 'kosFixedScale', FixedScaleFlyout, true);

  const workspace = Blockly.inject('blocklyDiv', {
    toolbox,
    plugins: { flyoutsVerticalToolbox: 'kosFixedScale' },
    theme,
    media: 'vendor/blockly/media/',
    trashcan: true,
    sounds: false,
    maxInstances: { kos_program: 1 },
    grid: { spacing: 24, length: 2, colour: '#2a2e36', snap: true },
    zoom: { controls: true, wheel: true, startScale: 0.9, maxScale: 2, minScale: 0.4 },
    move: { scrollbars: true, drag: true, wheel: false },
  });
  window.kosWorkspace = workspace;
  window.kosToolbox = toolbox;

  // Grey out blocks that are not attached under the program block.
  workspace.addChangeListener(Blockly.Events.disableOrphans);

  // ---- Example program -------------------------------------------------------
  const B = (type, fields, inputs, extra) => {
    const b = { type };
    if (fields) b.fields = fields;
    if (inputs) {
      b.inputs = {};
      for (const k in inputs) b.inputs[k] = { block: inputs[k] };
    }
    return Object.assign(b, extra || {});
  };
  const chain = (...blocks) => {
    for (let i = blocks.length - 2; i >= 0; i--) blocks[i].next = { block: blocks[i + 1] };
    return blocks[0];
  };
  const N = (n) => B('math_number', { NUM: n });
  const T = (t) => B('text', { TEXT: t });
  const S = (w) => B('kos_ship_value', { WHAT: w });
  const CMP = (op, a, b) => B('logic_compare', { OP: op }, { A: a, B: b });
  const V = (name) => B('variables_get', { VAR: { id: 'var_pitch' } });

  function exampleState() {
    const program = chain(
      B('kos_program', { CLEAR: true }),
      B('kos_comment', { TEXT: 'Simple gravity-turn launch to an 80 km apoapsis' }),
      B('kos_print', null, { VALUE: T('Launching in 3...') }),
      B('kos_wait', null, { SECONDS: N(3) }),
      B('kos_lock_throttle', null, { VALUE: N(1) }),
      B('kos_lock_steering', null, { VALUE: B('kos_heading', null, { COMPASS: N(90), PITCH: N(90) }) }),
      B('kos_stage'),
      B('kos_when', { PRESERVE: true }, {
        COND: B('logic_operation', { OP: 'AND' }, {
          A: CMP('EQ', S('SHIP:MAXTHRUST'), N(0)),
          B: B('kos_stage_ready'),
        }),
        DO: chain(B('kos_print', null, { VALUE: T('Staging') }), B('kos_stage')),
      }),
      B('kos_wait_until', null, { COND: CMP('GT', S('SHIP:ALTITUDE'), N(1000)) }),
      B('kos_print', null, { VALUE: T('Starting gravity turn') }),
      B('kos_lock_var', { VAR: { id: 'var_pitch' } }, {
        VALUE: B('kos_minmax', { FUNC: 'MAX' }, {
          A: N(5),
          B: B('math_arithmetic', { OP: 'MINUS' }, {
            A: N(90),
            B: B('math_arithmetic', { OP: 'DIVIDE' }, { A: S('SHIP:ALTITUDE'), B: N(500) }),
          }),
        }),
      }),
      B('kos_lock_steering', null, { VALUE: B('kos_heading', null, { COMPASS: N(90), PITCH: V('pitch') }) }),
      B('kos_until', null, {
        COND: CMP('GT', S('SHIP:APOAPSIS'), N(80000)),
        DO: chain(
          B('kos_print_at', null, {
            VALUE: B('text_join', null, { ADD0: T('Apoapsis: '), ADD1: B('kos_round', null, { X: S('SHIP:APOAPSIS'), DIGITS: N(0) }) }, { extraState: { itemCount: 2 } }),
            COL: N(0),
            ROW: N(5),
          }),
          B('kos_wait', null, { SECONDS: N(0.1) })
        ),
      }),
      B('kos_lock_throttle', null, { VALUE: N(0) }),
      B('kos_print', null, { VALUE: T('Apoapsis reached. Coasting.') }),
      B('kos_unlock', { WHAT: 'ALL' }),
      B('kos_pilot_throttle', null, { VALUE: N(0) })
    );
    program.x = 40;
    program.y = 40;
    return {
      blocks: { languageVersion: 0, blocks: [program] },
      variables: [{ name: 'pitch', id: 'var_pitch' }],
    };
  }

  function starterState() {
    const p = B('kos_program', { CLEAR: true });
    p.x = 40;
    p.y = 40;
    return { blocks: { languageVersion: 0, blocks: [p] } };
  }

  function loadState(state) {
    workspace.clear();
    Blockly.serialization.workspaces.load(state, workspace);
    workspace.scroll(20, 20);
  }

  // ---- Live preview ----------------------------------------------------------
  const codeEl = document.getElementById('code');
  const statusEl = document.getElementById('status');
  let currentCode = '';

  const KEYWORDS = new Set(
    ('set,to,lock,unlock,print,at,wait,until,when,then,if,else,from,step,do,stage,break,return,' +
      'local,is,clearscreen,and,or,not,true,false,on,off,all,steering,throttle,sas,rcs,gear,' +
      'lights,brakes,abort,function,parameter').split(',')
  );

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function highlight(code) {
    const re = /("[^"\n]*")|(\/\/[^\n]*)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g;
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(code))) {
      out += escapeHtml(code.slice(last, m.index));
      const t = escapeHtml(m[0]);
      if (m[1]) out += '<span class="tok-str">' + t + '</span>';
      else if (m[2]) out += '<span class="tok-com">' + t + '</span>';
      else if (m[3]) out += '<span class="tok-num">' + t + '</span>';
      else if (KEYWORDS.has(m[4].toLowerCase())) out += '<span class="tok-kw">' + t + '</span>';
      else out += t;
      last = re.lastIndex;
    }
    return out + escapeHtml(code.slice(last));
  }

  function generate() {
    try {
      currentCode = kos.programToCode(workspace);
    } catch (e) {
      console.error(e);
      currentCode = '// Could not generate code: ' + e.message + '\n';
    }
    const hasProgram = workspace.getBlocksByType('kos_program', false).length > 0;
    if (!hasProgram) {
      codeEl.innerHTML = '<span class="tok-com">// Drag a "kOS program" block from Program to start.</span>';
    } else {
      codeEl.innerHTML = highlight(currentCode) || '';
    }
    return currentCode;
  }

  let pending = false;
  workspace.addChangeListener((e) => {
    if (e.isUiEvent) return;
    if (!pending) {
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        generate();
        checkNames();
        save();
      });
    }
  });

  // ---- Name problems: warn on the block instead of renaming in the code ------
  const problemsEl = document.getElementById('problems');
  let problemCount = 0;
  const warned = new Map(); // block id -> warning text currently shown

  function checkNames() {
    const problems = kos.findNameProblems(workspace);
    const now = new Map(problems.map((p) => [p.block.id, p.messages.join('\n')]));
    for (const [id] of warned) {
      if (!now.has(id)) {
        const b = workspace.getBlockById(id);
        if (b) {
          b.setWarningText(null, 'kos-name');
          b.removeClass('kos-bad-name');
        }
        warned.delete(id);
      }
    }
    for (const p of problems) {
      const text = now.get(p.block.id);
      if (warned.get(p.block.id) !== text) {
        p.block.setWarningText(text, 'kos-name');
        p.block.addClass('kos-bad-name');
        warned.set(p.block.id, text);
      }
    }
    problemCount = problems.length;
    problemsEl.hidden = problems.length === 0;
    problemsEl.innerHTML = '';
    for (const p of problems) {
      for (const m of p.messages) {
        const row = document.createElement('button');
        row.className = 'problem';
        row.textContent = '⚠ ' + m + ' Rename it in the FUNCTION block.';
        row.title = 'Show this function block';
        row.addEventListener('click', () => {
          const b = workspace.getBlockById(p.block.id);
          if (!b) return;
          workspace.centerOnBlock(b.id);
          b.select();
        });
        problemsEl.appendChild(row);
      }
    }
  }

  const problemNote = () =>
    problemCount ? ' Note: ' + problemCount + ' function' + (problemCount === 1 ? ' has' : 's have') +
      ' a name kOS will reject (see the warnings).' : '';

  // ---- Autosave --------------------------------------------------------------
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Blockly.serialization.workspaces.save(workspace)));
    } catch (e) {
      /* storage full or disabled: ignore */
    }
  }

  // ---- File name -------------------------------------------------------------
  const nameInput = document.getElementById('filename');
  nameInput.value = localStorage.getItem(FILENAME_KEY) || 'launch.ks';
  nameInput.addEventListener('change', () => {
    nameInput.value = cleanName(nameInput.value);
    localStorage.setItem(FILENAME_KEY, nameInput.value);
  });

  function cleanName(n) {
    n = (n || '').trim().toLowerCase().replace(/[^a-z0-9_\-.]/g, '_');
    if (!n || n === '.ks') n = 'script.ks';
    if (!n.endsWith('.ks')) n += '.ks';
    return n;
  }

  function flash(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = 'status ' + (kind || '');
    clearTimeout(flash.t);
    flash.t = setTimeout(() => (statusEl.textContent = ''), 5000);
  }

  // ---- Export: File System Access API with download fallback -----------------
  const canPickFolder = 'showDirectoryPicker' in window;
  const folderBtn = document.getElementById('btn-folder');
  const saveBtn = document.getElementById('btn-save');
  const folderLabel = document.getElementById('folder-label');
  let dirHandle = null;

  // Remember the chosen folder between visits (handles can live in IndexedDB).
  const idb = {
    open() {
      return new Promise((res, rej) => {
        const r = indexedDB.open('kos-visual', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('handles');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    async get(key) {
      const db = await this.open();
      return new Promise((res) => {
        const r = db.transaction('handles').objectStore('handles').get(key);
        r.onsuccess = () => res(r.result || null);
        r.onerror = () => res(null);
      });
    },
    async set(key, value) {
      const db = await this.open();
      return new Promise((res) => {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(value, key);
        tx.oncomplete = res;
        tx.onerror = res;
      });
    },
  };

  function showFolder() {
    folderLabel.textContent = dirHandle ? 'Folder: ' + dirHandle.name : 'No folder chosen';
    saveBtn.textContent = dirHandle ? 'Save to ' + dirHandle.name : 'Save to Ships/Script…';
  }

  async function pickFolder() {
    try {
      dirHandle = await window.showDirectoryPicker({ id: 'kos-script', mode: 'readwrite' });
      await idb.set('scriptDir', dirHandle);
      showFolder();
      if (dirHandle.name.toLowerCase() !== 'script') {
        flash('Tip: kOS reads scripts from <KSP folder>/Ships/Script.', 'warn');
      }
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') flash('Could not open folder: ' + e.message, 'err');
      return false;
    }
  }

  async function ensurePermission(handle) {
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    return (await handle.requestPermission(opts)) === 'granted';
  }

  async function saveToFolder() {
    generate();
    if (!dirHandle && !(await pickFolder())) return;
    try {
      if (!(await ensurePermission(dirHandle))) {
        flash('Permission to write to the folder was refused.', 'err');
        return;
      }
      const name = cleanName(nameInput.value);
      nameInput.value = name;
      const fh = await dirHandle.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(currentCode);
      await w.close();
      flash('Saved ' + name + ' to ' + dirHandle.name + '. In kOS: RUNPATH("0:/' + name + '").' + problemNote(),
        problemCount ? 'warn' : 'ok');
    } catch (e) {
      flash('Save failed: ' + e.message, 'err');
    }
  }

  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (canPickFolder) {
    folderBtn.addEventListener('click', pickFolder);
    saveBtn.addEventListener('click', saveToFolder);
    idb.get('scriptDir').then((h) => {
      if (h) dirHandle = h;
      showFolder();
    }).catch(showFolder);
  } else {
    folderBtn.hidden = true;
    saveBtn.hidden = true;
    folderLabel.textContent = 'This browser can only download files. Move them into Ships/Script.';
  }

  document.getElementById('btn-download').addEventListener('click', () => {
    const name = cleanName(nameInput.value);
    nameInput.value = name;
    download(generate(), name, 'text/plain');
    flash('Downloaded ' + name + '. Move it into <KSP folder>/Ships/Script.' + problemNote(),
      problemCount ? 'warn' : 'ok');
  });

  document.getElementById('btn-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(generate());
      flash('Code copied.', 'ok');
    } catch (e) {
      flash('Copy failed: ' + e.message, 'err');
    }
  });

  // ---- Project buttons -------------------------------------------------------
  document.getElementById('btn-new').addEventListener('click', () => {
    if (workspace.getAllBlocks(false).length > 1 && !confirm('Clear the workspace and start over?')) return;
    loadState(starterState());
  });
  document.getElementById('btn-example').addEventListener('click', () => {
    if (workspace.getAllBlocks(false).length > 1 && !confirm('Replace the workspace with the launch example?')) return;
    loadState(exampleState());
  });
  document.getElementById('btn-export-project').addEventListener('click', () => {
    const name = cleanName(nameInput.value).replace(/\.ks$/, '') + '.blocks.json';
    download(JSON.stringify(Blockly.serialization.workspaces.save(workspace), null, 2), name, 'application/json');
  });
  const importInput = document.getElementById('import-file');
  document.getElementById('btn-import-project').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    importInput.value = '';
    if (!file) return;
    try {
      loadState(JSON.parse(await file.text()));
      flash('Opened ' + file.name, 'ok');
    } catch (e) {
      flash('Could not open that file: ' + e.message, 'err');
    }
  });

  // ---- Import .ks -----------------------------------------------------------
  const ksInput = document.getElementById('import-ks');
  document.getElementById('btn-import-ks').addEventListener('click', () => ksInput.click());
  ksInput.addEventListener('change', () => {
    const file = ksInput.files[0];
    ksInput.value = '';
    if (file) importKs(file);
  });

  async function importKs(file) {
    if (workspace.getAllBlocks(false).length > 1 &&
        !confirm('Replace the current blocks with ' + file.name + '?')) return;
    try {
      const { state, stats } = window.kosImport(await file.text());
      loadState(state);
      layoutFunctions();
      nameInput.value = cleanName(file.name);
      localStorage.setItem(FILENAME_KEY, nameInput.value);
      const kept = stats.raw + stats.rawExpr;
      flash('Imported ' + file.name + '.' + (kept
        ? ' ' + kept + ' part' + (kept === 1 ? '' : 's') + ' without a matching block kept as grey code blocks.'
        : ''), 'ok');
    } catch (e) {
      console.error(e);
      flash('Could not import ' + file.name + ': ' + e.message, 'err');
    }
  }

  // Put function definitions in a column to the right of the main program.
  function layoutFunctions() {
    const tops = workspace.getTopBlocks(true);
    const prog = tops.find((b) => b.type === 'kos_program');
    const x = prog ? prog.getRelativeToSurfaceXY().x + prog.getHeightWidth().width + 80 : 40;
    let y = prog ? prog.getRelativeToSurfaceXY().y : 40;
    for (const b of tops) {
      if (b === prog) continue;
      const xy = b.getRelativeToSurfaceXY();
      b.moveBy(x - xy.x, y - xy.y);
      y += b.getHeightWidth().height + 40;
    }
  }

  // Drop a .ks (or .blocks.json) file anywhere on the page.
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', async (e) => {
    const file = e.dataTransfer && e.dataTransfer.files[0];
    if (!file) return;
    e.preventDefault();
    if (/\.json$/i.test(file.name)) {
      try {
        loadState(JSON.parse(await file.text()));
        flash('Opened ' + file.name, 'ok');
      } catch (err) {
        flash('Could not open that file: ' + err.message, 'err');
      }
    } else {
      importKs(file);
    }
  });

  // ---- Start -----------------------------------------------------------------
  let initial = null;
  try {
    initial = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch (e) {
    initial = null;
  }
  try {
    loadState(initial && initial.blocks ? initial : exampleState());
  } catch (e) {
    console.error(e);
    loadState(exampleState());
  }
  generate();
  checkNames();
})();
