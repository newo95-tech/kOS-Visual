/* kOS Visual: Kerboscript code generator for Blockly. */
(function () {
  'use strict';

  const kos = new Blockly.CodeGenerator('Kerboscript');

  // Operator precedence, tightest first (follows the kOS grammar:
  // unary/NOT > ^ > * / > + - > comparisons > AND > OR). Binary levels are
  // spaced by 2 so a left operand can ask for order + 1: Blockly adds parens
  // when floor(outer) <= floor(inner), so left-associative chains stay clean.
  const Order = {
    ATOMIC: 0,
    CALL: 1,
    UNARY: 2,
    POWER: 4,
    MULT: 6,
    ADD: 8,
    RELATIONAL: 10,
    AND: 12,
    OR: 14,
    NONE: 99,
  };
  kos.Order = Order;
  kos.INDENT = '  ';

  // kOS is case-insensitive, so user variables must not collide with
  // keywords or bound variables like ALTITUDE or SHIP in any casing.
  const RESERVED = new Set(
    (
      'add,all,and,at,break,choose,clearscreen,compile,copy,declare,defined,delete,do,edit,' +
      'else,false,file,for,from,function,global,if,in,is,lazyglobal,list,local,lock,log,not,' +
      'off,on,once,or,parameter,preserve,print,reboot,remove,rename,return,run,runpath,' +
      'runoncepath,set,shutdown,stage,step,switch,then,to,toggle,true,unlock,unset,until,' +
      'volume,wait,when,' +
      'ship,target,altitude,alt,apoapsis,periapsis,velocity,heading,prograde,retrograde,' +
      'srfprograde,srfretrograde,up,north,body,time,eta,throttle,steering,wheelthrottle,' +
      'wheelsteering,sas,rcs,gear,lights,brakes,abort,legs,chutes,chutessafe,panels,status,mass,' +
      'verticalspeed,groundspeed,airspeed,facing,maxthrust,obt,orbit,missiontime,sessiontime,' +
      'terminal,core,addons,constant,kuniverse,homeconnection,controlconnection,encounter,' +
      'latitude,longitude,geoposition,sun,kerbin,mun,minmus,warp,warpmode,mapview,version,' +
      'config,hudtext,white,red,green,blue,yellow,black,abs,sqrt,round,floor,ceiling,min,max,' +
      'sin,cos,tan,arcsin,arccos,arctan,arctan2,ln,log10,mod,random,char,unchar,' +
      'ag1,ag2,ag3,ag4,ag5,ag6,ag7,ag8,ag9,ag10'
    ).split(',')
  );
  kos.addReservedWords(Array.from(RESERVED).join(','));
  kos.RESERVED = RESERVED;

  kos.init = function (workspace) {
    Object.getPrototypeOf(this).init.call(this, workspace);
    if (!this.nameDB_) {
      this.nameDB_ = new Blockly.Names(this.RESERVED_WORDS_);
    } else {
      this.nameDB_.reset();
    }
    this.nameDB_.setVariableMap(workspace.getVariableMap());
    this.nameDB_.populateVariables(workspace);
    // Function names and parameters are written exactly as typed; problems
    // are shown on the blocks (see findNameProblems) instead of renamed here.
    this.workspace_ = workspace;
    this.verbatimIds_ = new Set();
    for (const def of functionDefs(workspace)) {
      for (const m of def.getVarModels()) this.verbatimIds_.add(m.getId());
    }
    this.isInitialized = true;
  };

  kos.finish = function (code) {
    this.nameDB_ && this.nameDB_.reset();
    return Object.getPrototypeOf(this).finish.call(this, code);
  };

  /** Valid, non-reserved kOS identifier for a Blockly variable. */
  kos.varName = function (block, field) {
    return this.varNameById(block.getFieldValue(field));
  };
  kos.varNameById = function (id) {
    if (this.verbatimIds_ && this.verbatimIds_.has(id)) {
      const model = this.workspace_.getVariableMap().getVariableById(id);
      if (model) return model.getName();
    }
    let name = this.getVariableName(id);
    if (RESERVED.has(name.toLowerCase())) name = 'my_' + name;
    return name;
  };
  /** User function names are written exactly as typed. */
  kos.procName = function (name) {
    return name;
  };

  function functionDefs(workspace) {
    return workspace
      .getAllBlocks(false)
      .filter((b) => b.type === 'procedures_defnoreturn' || b.type === 'procedures_defreturn');
  }

  /** Why a name can't be used in kOS, or null if it is fine. */
  kos.checkName = function (name) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      return '"' + name + '" can only use letters, digits and _, and cannot start with a digit.';
    }
    if (RESERVED.has(name.toLowerCase())) {
      return '"' + name + '" is a kOS keyword or built-in name.';
    }
    return null;
  };

  /**
   * Function and parameter names that kOS would reject.
   * Returns [{ block, messages: [...] }] for each function definition with problems.
   */
  kos.findNameProblems = function (workspace) {
    const defs = functionDefs(workspace);
    const seen = new Map();
    for (const d of defs) {
      const key = d.getFieldValue('NAME').toLowerCase();
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    const varNames = new Set(
      workspace.getVariableMap().getAllVariables().map((v) => v.getName().toLowerCase())
    );
    const out = [];
    for (const d of defs) {
      const name = d.getFieldValue('NAME');
      const messages = [];
      const bad = kos.checkName(name);
      if (bad) messages.push('Function name ' + bad);
      else if (seen.get(name.toLowerCase()) > 1) {
        messages.push('Function name "' + name + '" is used twice (kOS ignores upper/lower case).');
      } else if (varNames.has(name.toLowerCase())) {
        messages.push('Function name "' + name + '" is also a variable name.');
      }
      const params = d.getVarModels().map((m) => m.getName());
      for (const p of params) {
        const pb = kos.checkName(p);
        if (pb) messages.push('Parameter ' + pb);
      }
      const lower = params.map((p) => p.toLowerCase());
      lower.forEach((p, k) => {
        if (lower.indexOf(p) !== k) messages.push('Parameter "' + params[k] + '" is used twice (kOS ignores upper/lower case).');
      });
      if (messages.length) out.push({ block: d, messages });
    }
    return out;
  };

  // Loose value blocks lying on the workspace produce nothing.
  kos.scrubNakedValue = function () {
    return '';
  };

  // Chain stacked blocks and turn block comments into // lines.
  kos.scrub_ = function (block, code, thisOnly) {
    let comment = '';
    if (!block.outputConnection) {
      const text = block.getCommentText && block.getCommentText();
      if (text) comment = this.prefixLines(text, '// ') + '\n';
    }
    const next = block.nextConnection && block.nextConnection.targetBlock();
    return comment + code + (thisOnly ? '' : this.blockToCode(next));
  };

  /** kOS strings have no escape sequences, so swap " for '. */
  kos.quote_ = function (s) {
    return '"' + String(s).replace(/"/g, "'").replace(/[\r\n]+/g, ' ') + '"';
  };

  const val = (block, name, order, fallback) =>
    kos.valueToCode(block, name, order) || fallback;
  const body = (block, name) => kos.statementToCode(block, name);

  const f = kos.forBlock;

  // ---- Program ---------------------------------------------------------------
  f['kos_program'] = (b) => (b.getFieldValue('CLEAR') === 'TRUE' ? 'CLEARSCREEN.\n' : '');
  f['kos_comment'] = (b) => '// ' + b.getFieldValue('TEXT') + '\n';
  f['kos_clearscreen'] = () => 'CLEARSCREEN.\n';
  f['kos_raw'] = (b) => b.getFieldValue('CODE') + '\n';
  f['kos_raw_value'] = (b) => [b.getFieldValue('CODE') || '0', Order.ATOMIC];

  // ---- Flight control --------------------------------------------------------
  f['kos_lock_steering'] = (b) =>
    'LOCK STEERING TO ' + val(b, 'VALUE', Order.NONE, 'SHIP:FACING') + '.\n';
  f['kos_lock_throttle'] = (b) =>
    'LOCK THROTTLE TO ' + val(b, 'VALUE', Order.NONE, '0') + '.\n';
  f['kos_unlock'] = (b) => 'UNLOCK ' + b.getFieldValue('WHAT') + '.\n';
  f['kos_lock_var'] = (b) =>
    'LOCK ' + kos.varName(b, 'VAR') + ' TO ' + val(b, 'VALUE', Order.NONE, '0') + '.\n';
  f['kos_pilot_throttle'] = (b) =>
    'SET SHIP:CONTROL:PILOTMAINTHROTTLE TO ' + val(b, 'VALUE', Order.NONE, '0') + '.\n';
  f['kos_stage'] = () => 'STAGE.\n';
  f['kos_toggle'] = (b) => b.getFieldValue('WHAT') + ' ' + b.getFieldValue('STATE') + '.\n';
  f['kos_heading'] = (b) => [
    'HEADING(' + val(b, 'COMPASS', Order.NONE, '90') + ', ' + val(b, 'PITCH', Order.NONE, '90') + ')',
    Order.CALL,
  ];
  f['kos_direction'] = (b) => [b.getFieldValue('DIR'), Order.ATOMIC];

  // ---- Waiting & triggers ----------------------------------------------------
  f['kos_wait'] = (b) => 'WAIT ' + val(b, 'SECONDS', Order.NONE, '0') + '.\n';
  f['kos_wait_until'] = (b) => 'WAIT UNTIL ' + val(b, 'COND', Order.NONE, 'TRUE') + '.\n';
  f['kos_when'] = (b) => {
    let inner = body(b, 'DO');
    if (b.getFieldValue('PRESERVE') === 'TRUE') inner += kos.INDENT + 'RETURN TRUE.\n';
    return 'WHEN ' + val(b, 'COND', Order.NONE, 'FALSE') + ' THEN {\n' + inner + '}\n';
  };

  // ---- Loops & logic ---------------------------------------------------------
  f['kos_until'] = (b) =>
    'UNTIL ' + val(b, 'COND', Order.NONE, 'FALSE') + ' {\n' + body(b, 'DO') + '}\n';

  f['kos_from'] = (b) => {
    const v = kos.varName(b, 'VAR');
    const from = val(b, 'FROM', Order.NONE, '0');
    const to = val(b, 'TO', Order.RELATIONAL, '0');
    const by = val(b, 'BY', Order.ADD, '1');
    // Count down when the step is a negative literal.
    const down = /^-/.test(by.replace(/[()\s]/g, ''));
    const cmp = down ? ' < ' : ' > ';
    return (
      'FROM { LOCAL ' + v + ' IS ' + from + '. } UNTIL ' + v + cmp + to +
      ' STEP { SET ' + v + ' TO ' + v + ' + ' + by + '. } DO {\n' + body(b, 'DO') + '}\n'
    );
  };
  f['kos_break'] = () => 'BREAK.\n';

  f['controls_if'] = (b) => {
    let n = 0;
    let code = '';
    do {
      const cond = val(b, 'IF' + n, Order.NONE, 'FALSE');
      code += (n > 0 ? ' ELSE ' : '') + 'IF ' + cond + ' {\n' + body(b, 'DO' + n) + '}';
      n++;
    } while (b.getInput('IF' + n));
    if (b.getInput('ELSE')) code += ' ELSE {\n' + body(b, 'ELSE') + '}';
    return code + '\n';
  };
  f['controls_ifelse'] = f['controls_if'];

  f['logic_compare'] = (b) => {
    const ops = { EQ: '=', NEQ: '<>', LT: '<', LTE: '<=', GT: '>', GTE: '>=' };
    const a = val(b, 'A', Order.RELATIONAL, '0');
    const c = val(b, 'B', Order.RELATIONAL, '0');
    return [a + ' ' + ops[b.getFieldValue('OP')] + ' ' + c, Order.RELATIONAL];
  };
  f['logic_operation'] = (b) => {
    const isAnd = b.getFieldValue('OP') === 'AND';
    const order = isAnd ? Order.AND : Order.OR;
    const a = val(b, 'A', order + 1, isAnd ? 'TRUE' : 'FALSE');
    const c = val(b, 'B', order, isAnd ? 'TRUE' : 'FALSE');
    return [a + (isAnd ? ' AND ' : ' OR ') + c, order];
  };
  f['logic_negate'] = (b) => ['NOT ' + val(b, 'BOOL', Order.UNARY, 'TRUE'), Order.UNARY];
  f['logic_boolean'] = (b) => [b.getFieldValue('BOOL') === 'TRUE' ? 'TRUE' : 'FALSE', Order.ATOMIC];

  // ---- Ship info -------------------------------------------------------------
  f['kos_ship_value'] = (b) => [b.getFieldValue('WHAT'), Order.ATOMIC];
  f['kos_eta'] = (b) => [b.getFieldValue('WHAT'), Order.ATOMIC];
  f['kos_resource'] = (b) => [b.getFieldValue('SCOPE') + ':' + b.getFieldValue('RES'), Order.ATOMIC];
  f['kos_stage_ready'] = () => ['STAGE:READY', Order.ATOMIC];

  // ---- Math ------------------------------------------------------------------
  f['math_number'] = (b) => {
    const n = Number(b.getFieldValue('NUM'));
    return [String(n), n < 0 ? Order.UNARY : Order.ATOMIC];
  };
  f['math_arithmetic'] = (b) => {
    const table = {
      ADD: [' + ', Order.ADD],
      MINUS: [' - ', Order.ADD],
      MULTIPLY: [' * ', Order.MULT],
      DIVIDE: [' / ', Order.MULT],
      POWER: ['^', Order.POWER],
    };
    const [op, order] = table[b.getFieldValue('OP')];
    // Left operand of + - * / needs no parens at equal precedence.
    const a = val(b, 'A', op === '^' ? order : order + 1, '0');
    const c = val(b, 'B', order, '0');
    return [a + op + c, order];
  };
  f['kos_math_func'] = (b) => [b.getFieldValue('FUNC') + '(' + val(b, 'X', Order.NONE, '0') + ')', Order.CALL];
  f['kos_round'] = (b) => [
    'ROUND(' + val(b, 'X', Order.NONE, '0') + ', ' + val(b, 'DIGITS', Order.NONE, '0') + ')',
    Order.CALL,
  ];
  f['kos_minmax'] = (b) => [
    b.getFieldValue('FUNC') + '(' + val(b, 'A', Order.NONE, '0') + ', ' + val(b, 'B', Order.NONE, '0') + ')',
    Order.CALL,
  ];
  f['kos_negate'] = (b) => ['-' + val(b, 'X', Order.UNARY, '0'), Order.UNARY];

  // ---- Text ------------------------------------------------------------------
  f['text'] = (b) => [kos.quote_(b.getFieldValue('TEXT')), Order.ATOMIC];
  f['text_join'] = (b) => {
    const parts = [];
    for (let i = 0; i < b.itemCount_; i++) {
      const code = kos.valueToCode(b, 'ADD' + i, Order.ADD);
      if (code) parts.push(code);
    }
    if (parts.length === 0) return ['""', Order.ATOMIC];
    // Make sure + means "join" rather than "add" when the first item is a number.
    const first = b.getInputTargetBlock('ADD0');
    if (!first || first.type !== 'text') parts.unshift('""');
    return [parts.join(' + '), Order.ADD];
  };
  f['kos_print'] = (b) => 'PRINT ' + val(b, 'VALUE', Order.NONE, '""') + '.\n';
  f['kos_print_at'] = (b) =>
    'PRINT ' + val(b, 'VALUE', Order.NONE, '""') + ' AT(' + val(b, 'COL', Order.NONE, '0') + ', ' +
    val(b, 'ROW', Order.NONE, '0') + ').\n';
  f['kos_hudtext'] = (b) =>
    'HUDTEXT(' + val(b, 'VALUE', Order.NONE, '""') + ', ' + val(b, 'SECONDS', Order.NONE, '5') +
    ', 2, 30, WHITE, FALSE).\n';

  // ---- Variables -------------------------------------------------------------
  f['variables_get'] = (b) => [kos.varName(b, 'VAR'), Order.ATOMIC];
  f['variables_set'] = (b) =>
    'SET ' + kos.varName(b, 'VAR') + ' TO ' + val(b, 'VALUE', Order.NONE, '0') + '.\n';
  f['math_change'] = (b) => {
    const v = kos.varName(b, 'VAR');
    return 'SET ' + v + ' TO ' + v + ' + ' + val(b, 'DELTA', Order.ADD, '1') + '.\n';
  };

  /** Code for the stack under the (single) program block, then the functions. */
  kos.programToCode = function (workspace) {
    this.init(workspace);
    const program = workspace.getBlocksByType('kos_program', false)[0];
    let code = program ? this.blockToCode(program) : '';
    // Functions at the top level of a file can be called from anywhere in it,
    // so they go after the main program.
    for (const top of workspace.getTopBlocks(true)) {
      if (top.type === 'procedures_defnoreturn' || top.type === 'procedures_defreturn') {
        code += '\n' + this.blockToCode(top);
      }
    }
    return this.finish(code);
  };

  // ---- Functions -------------------------------------------------------------
  function defineFunction(b) {
    const name = kos.procName(b.getFieldValue('NAME'));
    const params = b.getVarModels().map((m) => kos.varNameById(m.getId()));
    let inner = params.length ? kos.INDENT + 'PARAMETER ' + params.join(', ') + '.\n' : '';
    inner += body(b, 'STACK');
    if (b.getInput('RETURN')) {
      const ret = kos.valueToCode(b, 'RETURN', Order.NONE);
      if (ret) inner += kos.INDENT + 'RETURN ' + ret + '.\n';
    }
    return 'FUNCTION ' + name + ' {\n' + inner + '}\n';
  }
  f['procedures_defnoreturn'] = defineFunction;
  f['procedures_defreturn'] = defineFunction;

  const callArgs = (b) =>
    b.arguments_.map((_, k) => val(b, 'ARG' + k, Order.NONE, '0')).join(', ');
  f['procedures_callreturn'] = (b) => [
    kos.procName(b.getFieldValue('NAME')) + '(' + callArgs(b) + ')',
    Order.CALL,
  ];
  f['procedures_callnoreturn'] = (b) =>
    kos.procName(b.getFieldValue('NAME')) + '(' + callArgs(b) + ').\n';
  f['procedures_ifreturn'] = (b) => {
    const cond = val(b, 'CONDITION', Order.NONE, 'FALSE');
    const ret = b.hasReturnValue_ ? ' ' + val(b, 'VALUE', Order.NONE, '0') : '';
    return 'IF ' + cond + ' {\n' + kos.INDENT + 'RETURN' + ret + '.\n}\n';
  };

  window.kosGenerator = kos;
})();
