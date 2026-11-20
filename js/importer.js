/* kOS Visual: turn a Kerboscript (.ks) file back into blocks.
 *
 * Statements and expressions that have a matching block become that block.
 * Anything else is kept verbatim: whole statements become "kOS code" line
 * blocks, and parts of expressions become inline "code" blocks. So nothing is
 * lost, even when the script uses functions, lists or other features without
 * a block. Comments become comment blocks where they sit between statements,
 * and stay inside the raw text otherwise. Formatting is not preserved.
 */
(function () {
  'use strict';

  class ParseFail extends Error {}
  const fail = (msg) => {
    throw new ParseFail(msg || 'unsupported');
  };

  // ---- Tokenizer -------------------------------------------------------------
  function tokenize(src) {
    const toks = [];
    const n = src.length;
    let i = 0;
    const num = /\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?/y;
    const ident = /[A-Za-z_][A-Za-z0-9_]*/y;
    while (i < n) {
      const c = src[i];
      if (/\s/.test(c)) {
        i++;
        continue;
      }
      if (c === '/' && src[i + 1] === '/') {
        let j = src.indexOf('\n', i);
        if (j < 0) j = n;
        toks.push({ t: 'comment', v: src.slice(i + 2, j).replace(/\s+$/, ''), s: i, e: j });
        i = j;
        continue;
      }
      if (c === '"') {
        let j = src.indexOf('"', i + 1);
        if (j < 0) j = n - 1; // unterminated: take the rest
        toks.push({ t: 'str', v: src.slice(i + 1, j), s: i, e: j + 1 });
        i = j + 1;
        continue;
      }
      num.lastIndex = i;
      let m = num.exec(src);
      if (m) {
        toks.push({ t: 'num', v: m[0], s: i, e: i + m[0].length });
        i += m[0].length;
        continue;
      }
      ident.lastIndex = i;
      m = ident.exec(src);
      if (m) {
        toks.push({ t: 'id', v: m[0], lv: m[0].toLowerCase(), s: i, e: i + m[0].length });
        i += m[0].length;
        continue;
      }
      const two = src.substr(i, 2);
      if (two === '<=' || two === '>=' || two === '<>') {
        toks.push({ t: 'p', v: two, s: i, e: i + 2 });
        i += 2;
        continue;
      }
      toks.push({ t: 'p', v: c, s: i, e: i + 1 });
      i++;
    }
    return toks;
  }

  // ---- Known names -> blocks -------------------------------------------------
  const SHIP_VALUES = new Set([
    'SHIP:ALTITUDE', 'ALT:RADAR', 'SHIP:APOAPSIS', 'SHIP:PERIAPSIS', 'SHIP:VERTICALSPEED',
    'SHIP:GROUNDSPEED', 'SHIP:AIRSPEED', 'SHIP:VELOCITY:SURFACE:MAG', 'SHIP:VELOCITY:ORBIT:MAG',
    'SHIP:MASS', 'SHIP:MAXTHRUST', 'SHIP:AVAILABLETHRUST', 'SHIP:Q', 'SHIP:LATITUDE',
    'SHIP:LONGITUDE', 'SHIP:STATUS', 'STAGE:NUMBER', 'MISSIONTIME',
  ]);
  const DIRECTIONS = new Set([
    'UP', 'NORTH', 'SHIP:PROGRADE', 'SHIP:RETROGRADE', 'SHIP:SRFPROGRADE', 'SHIP:SRFRETROGRADE',
    'SHIP:FACING',
  ]);
  // Bare bound variables that mean the same as SHIP:<name>.
  const SHIP_ALIASES = new Set([
    'ALTITUDE', 'APOAPSIS', 'PERIAPSIS', 'VERTICALSPEED', 'GROUNDSPEED', 'AIRSPEED', 'MASS',
    'MAXTHRUST', 'STATUS', 'LATITUDE', 'LONGITUDE', 'PROGRADE', 'RETROGRADE', 'SRFPROGRADE',
    'SRFRETROGRADE', 'FACING',
  ]);
  const ETAS = new Set(['ETA:APOAPSIS', 'ETA:PERIAPSIS']);
  const RESOURCES = ['LIQUIDFUEL', 'OXIDIZER', 'SOLIDFUEL', 'MONOPROPELLANT', 'ELECTRICCHARGE'];
  const MATH_FUNCS = new Set([
    'ABS', 'SQRT', 'FLOOR', 'CEILING', 'SIN', 'COS', 'TAN', 'ARCSIN', 'ARCCOS', 'ARCTAN', 'LN', 'LOG10',
  ]);
  const TOGGLES = new Set(
    ['sas', 'rcs', 'gear', 'lights', 'brakes', 'abort'].concat(
      Array.from({ length: 10 }, (_, k) => 'ag' + (k + 1))
    )
  );
  const COMPARE = { '=': 'EQ', '<>': 'NEQ', '<': 'LT', '<=': 'LTE', '>': 'GT', '>=': 'GTE' };

  // ---- Parser ----------------------------------------------------------------
  function parse(src, knownFns) {
    const toks = tokenize(src);
    const reserved = window.kosGenerator.RESERVED;
    let i = 0;
    const stats = { blocks: 0, raw: 0, rawExpr: 0 };
    const vars = new Map(); // lower-case name -> { name, id }
    const fns = new Map(); // functions turned into blocks: lower name -> { name, params, returns }
    const defs = []; // their definition blocks
    const rawSpan = new WeakMap(); // single-line raw block -> token span

    const peek = (k = 0) => toks[i + k];
    const isKw = (t, w) => t && t.t === 'id' && t.lv === w;
    const atKw = (w) => isKw(peek(), w);
    const isP = (t, v) => t && t.t === 'p' && t.v === v;
    const atP = (v) => isP(peek(), v);
    const eatKw = (w) => (atKw(w) ? toks[i++] : fail('expected ' + w));
    const eatP = (v) => (atP(v) ? toks[i++] : fail('expected ' + v));
    const eatIdent = () => (peek() && peek().t === 'id' ? toks[i++] : fail('expected name'));
    const endStatement = () => eatP('.');
    const optionalDot = () => atP('.') && i++;
    const text = (a, b) => src.slice(toks[a].s, toks[b].e);

    function variable(name) {
      const key = name.toLowerCase();
      if (!vars.has(key)) vars.set(key, { name, id: 'imp_' + key.replace(/\W/g, '_') });
      return { id: vars.get(key).id };
    }
    const canBeVar = (name) => !reserved.has(name.toLowerCase());

    // -- Expressions (kOS precedence: or < and < compare < +- < */ < unary < ^ < suffix)
    const node = (type, s, props) => Object.assign({ type, s, e: i - 1 }, props);

    function parseExpr() {
      return parseOr();
    }
    function parseBinary(next, ops, isWord) {
      return function () {
        const s = i;
        let l = next();
        for (;;) {
          const t = peek();
          const op = t && (isWord ? t.t === 'id' && ops.includes(t.lv) && t.lv : t.t === 'p' && ops.includes(t.v) && t.v);
          if (!op) return l;
          i++;
          const r = next();
          l = node('bin', s, { op, l, r });
        }
      };
    }
    function parseUnary() {
      const s = i;
      const t = peek();
      if (isP(t, '-') || isP(t, '+')) {
        i++;
        return node('un', s, { op: t.v, x: parseUnary() });
      }
      if (isKw(t, 'not') || isKw(t, 'defined')) {
        i++;
        return node('un', s, { op: t.lv, x: parseUnary() });
      }
      return parsePower();
    }
    const parsePower = function () {
      const s = i;
      let l = parseSuffix();
      while (atP('^')) {
        i++;
        l = node('bin', s, { op: '^', l, r: parseSuffix() });
      }
      return l;
    };
    const parseMult = parseBinary(parseUnary, ['*', '/']);
    const parseAdd = parseBinary(parseMult, ['+', '-']);
    const parseCompare = parseBinary(parseAdd, ['=', '<>', '<', '<=', '>', '>=']);
    const parseAnd = parseBinary(parseCompare, ['and'], true);
    const parseOr = parseBinary(parseAnd, ['or'], true);

    function parseArgs() {
      eatP('(');
      const args = [];
      if (!atP(')')) {
        args.push(parseExpr());
        while (atP(',')) {
          i++;
          args.push(parseExpr());
        }
      }
      eatP(')');
      return args;
    }

    function parseSuffix() {
      const s = i;
      let n = parseAtom();
      for (;;) {
        if (atP(':') && peek(1) && peek(1).t === 'id') {
          i += 2;
          n = node('suffix', s, { base: n, name: toks[i - 1].v });
        } else if (atP('(')) {
          n = node('call', s, { fn: n, args: parseArgs() });
          n.e = i - 1;
        } else if (atP('[')) {
          i++;
          parseExpr();
          eatP(']');
          n = node('other', s);
        } else if (atP('#') && peek(1) && (peek(1).t === 'id' || peek(1).t === 'num')) {
          i += 2;
          n = node('other', s);
        } else {
          return n;
        }
      }
    }

    function skipBraces() {
      let depth = 0;
      do {
        const t = toks[i++] || fail('missing }');
        if (isP(t, '{')) depth++;
        else if (isP(t, '}')) depth--;
      } while (depth > 0);
    }

    function parseAtom() {
      const s = i;
      const t = peek() || fail('unexpected end');
      if (t.t === 'num') {
        i++;
        return node('num', s, { v: Number(t.v.replace(/_/g, '')) });
      }
      if (t.t === 'str') {
        i++;
        return node('str', s, { v: t.v });
      }
      if (t.t === 'id') {
        if (['to', 'is', 'then', 'at', 'do', 'step', 'until', 'else'].includes(t.lv)) fail('keyword');
        i++;
        if (t.lv === 'true' || t.lv === 'false') return node('bool', s, { v: t.lv === 'true' });
        return node('id', s, { name: t.v });
      }
      if (isP(t, '(')) {
        i++;
        const x = parseExpr();
        eatP(')');
        return node('paren', s, { x });
      }
      if (isP(t, '{')) {
        skipBraces(); // anonymous function: keep as raw code
        return node('other', s);
      }
      return fail('unexpected ' + t.v);
    }

    // -- Expression nodes -> blocks
    const pathOf = (n) =>
      n.type === 'id' ? n.name.toUpperCase()
        : n.type === 'suffix' && pathOf(n.base) ? pathOf(n.base) + ':' + n.name.toUpperCase()
          : null;
    const B = (type, fields, inputs, extra) => {
      stats.blocks++;
      const b = { type };
      if (fields) b.fields = fields;
      if (inputs) {
        b.inputs = {};
        for (const k in inputs) if (inputs[k]) b.inputs[k] = { block: inputs[k] };
      }
      return Object.assign(b, extra || {});
    };
    const rawValue = (n) => {
      stats.rawExpr++;
      let code = text(n.s, n.e);
      if (n.type === 'bin' || n.type === 'un') code = '(' + code + ')';
      return B('kos_raw_value', { CODE: code.replace(/\s*\n\s*/g, ' ') });
    };
    const isNegLiteral = (n) =>
      (n.type === 'num' && n.v < 0) || (n.type === 'un' && n.op === '-' && n.x.type === 'num');

    function toBlock(n) {
      switch (n.type) {
        case 'num':
          return B('math_number', { NUM: n.v });
        case 'str':
          return B('text', { TEXT: n.v });
        case 'bool':
          return B('logic_boolean', { BOOL: n.v ? 'TRUE' : 'FALSE' });
        case 'paren':
          return toBlock(n.x);
        case 'un':
          if (n.op === '-' && n.x.type === 'num') return B('math_number', { NUM: -n.x.v });
          if (n.op === '-') return B('kos_negate', null, { X: toBlock(n.x) });
          if (n.op === '+') return toBlock(n.x);
          if (n.op === 'not') return B('logic_negate', null, { BOOL: toBlock(n.x) });
          return rawValue(n);
        case 'bin':
          return binToBlock(n);
        case 'id':
        case 'suffix': {
          const p = pathOf(n);
          if (p) {
            const full = SHIP_ALIASES.has(p) ? 'SHIP:' + p : p;
            if (SHIP_VALUES.has(full)) return B('kos_ship_value', { WHAT: full });
            if (DIRECTIONS.has(full)) return B('kos_direction', { DIR: full });
            if (ETAS.has(p)) return B('kos_eta', { WHAT: p });
            if (p === 'STAGE:READY') return B('kos_stage_ready');
            const res = p.split(':');
            if (res.length === 2 && (res[0] === 'STAGE' || res[0] === 'SHIP') && RESOURCES.includes(res[1])) {
              return B('kos_resource', { SCOPE: res[0], RES: res[1] });
            }
            if (n.type === 'id' && canBeVar(n.name)) return B('variables_get', { VAR: variable(n.name) });
          }
          return rawValue(n);
        }
        case 'call': {
          const fn = n.fn.type === 'id' ? n.fn.name.toUpperCase() : null;
          const a = n.args;
          const user = fn && knownFns.get(fn.toLowerCase());
          if (user && user.returns && user.params.length === a.length) return userCall('procedures_callreturn', user, a);
          if (fn === 'HEADING' && a.length === 2) {
            return B('kos_heading', null, { COMPASS: toBlock(a[0]), PITCH: toBlock(a[1]) });
          }
          if (fn === 'ROUND' && (a.length === 1 || a.length === 2)) {
            return B('kos_round', null, {
              X: toBlock(a[0]),
              DIGITS: a[1] ? toBlock(a[1]) : B('math_number', { NUM: 0 }),
            });
          }
          if ((fn === 'MIN' || fn === 'MAX') && a.length === 2) {
            return B('kos_minmax', { FUNC: fn }, { A: toBlock(a[0]), B: toBlock(a[1]) });
          }
          if (MATH_FUNCS.has(fn) && a.length === 1) return B('kos_math_func', { FUNC: fn }, { X: toBlock(a[0]) });
          return rawValue(n);
        }
        default:
          return rawValue(n);
      }
    }

    function binToBlock(n) {
      if (COMPARE[n.op]) {
        return B('logic_compare', { OP: COMPARE[n.op] }, { A: toBlock(n.l), B: toBlock(n.r) });
      }
      if (n.op === 'and' || n.op === 'or') {
        return B('logic_operation', { OP: n.op.toUpperCase() }, { A: toBlock(n.l), B: toBlock(n.r) });
      }
      if (n.op === '+') {
        // "text" + a + b ... becomes a join block.
        const items = [];
        const flat = (x) => (x.type === 'bin' && x.op === '+' ? (flat(x.l), items.push(x.r)) : items.push(x));
        flat(n);
        if (items[0].type === 'str') {
          if (items[0].v === '' && items.length > 1) items.shift();
          const inputs = {};
          items.forEach((x, k) => (inputs['ADD' + k] = toBlock(x)));
          return B('text_join', null, inputs, { extraState: { itemCount: items.length } });
        }
      }
      const ops = { '+': 'ADD', '-': 'MINUS', '*': 'MULTIPLY', '/': 'DIVIDE', '^': 'POWER' };
      return B('math_arithmetic', { OP: ops[n.op] }, { A: toBlock(n.l), B: toBlock(n.r) });
    }

    // -- Statements
    function parseBody() {
      if (atP('{')) {
        i++;
        const list = parseStatements(true);
        eatP('}');
        return list;
      }
      return [parseStatement()];
    }

    function parseStatement() {
      const t = peek();
      if (!t || t.t !== 'id') fail();
      const w = t.lv;
      const s = i;

      if (w === 'set') {
        i++;
        const target = parseExpr();
        eatKw('to');
        const value = parseExpr();
        endStatement();
        const p = pathOf(target);
        if (p === 'SHIP:CONTROL:PILOTMAINTHROTTLE') return B('kos_pilot_throttle', null, { VALUE: toBlock(value) });
        if (target.type !== 'id' || !canBeVar(target.name)) fail();
        const v = variable(target.name);
        if (value.type === 'bin' && value.op === '+' && value.l.type === 'id' &&
            value.l.name.toLowerCase() === target.name.toLowerCase()) {
          return B('math_change', { VAR: v }, { DELTA: toBlock(value.r) });
        }
        return B('variables_set', { VAR: v }, { VALUE: toBlock(value) });
      }

      if (w === 'lock') {
        i++;
        const name = eatIdent();
        eatKw('to');
        const value = toBlock(parseExpr());
        endStatement();
        if (name.lv === 'steering') return B('kos_lock_steering', null, { VALUE: value });
        if (name.lv === 'throttle') return B('kos_lock_throttle', null, { VALUE: value });
        if (!canBeVar(name.v)) fail();
        return B('kos_lock_var', { VAR: variable(name.v) }, { VALUE: value });
      }

      if (w === 'unlock') {
        i++;
        const name = eatIdent();
        endStatement();
        if (!['steering', 'throttle', 'all'].includes(name.lv)) fail();
        return B('kos_unlock', { WHAT: name.lv.toUpperCase() });
      }

      if (w === 'print') {
        i++;
        const value = parseExpr();
        if (atKw('at')) {
          i++;
          const args = parseArgs();
          endStatement();
          if (args.length !== 2) fail();
          return B('kos_print_at', null, { VALUE: toBlock(value), COL: toBlock(args[0]), ROW: toBlock(args[1]) });
        }
        endStatement();
        return B('kos_print', null, { VALUE: toBlock(value) });
      }

      if (w === 'wait') {
        i++;
        if (atKw('until')) {
          i++;
          const cond = parseExpr();
          endStatement();
          return B('kos_wait_until', null, { COND: toBlock(cond) });
        }
        const secs = parseExpr();
        endStatement();
        return B('kos_wait', null, { SECONDS: toBlock(secs) });
      }

      if (w === 'when') {
        i++;
        const cond = parseExpr();
        eatKw('then');
        const body = parseBody();
        optionalDot();
        let preserve = false;
        const last = body[body.length - 1];
        if (last && last.type === 'kos_raw' && /^\s*(return\s+true|preserve)\s*\.\s*$/i.test(last.fields.CODE)) {
          body.pop();
          stats.raw--;
          preserve = true;
        }
        return B('kos_when', { PRESERVE: preserve }, { COND: toBlock(cond), DO: chain(body) });
      }

      if (w === 'until') {
        i++;
        const cond = parseExpr();
        const body = parseBody();
        optionalDot();
        return B('kos_until', null, { COND: toBlock(cond), DO: chain(body) });
      }

      if (w === 'from') {
        // Only the counting pattern the FROM block makes:
        // FROM { LOCAL i IS a. } UNTIL i > b STEP { SET i TO i + s. } DO { ... }
        i++;
        eatP('{');
        eatKw('local');
        const v = eatIdent();
        if (!atKw('is') && !atKw('to')) fail();
        i++;
        const from = parseExpr();
        eatP('.');
        eatP('}');
        eatKw('until');
        const cond = parseExpr();
        eatKw('step');
        eatP('{');
        eatKw('set');
        const v2 = eatIdent();
        eatKw('to');
        const step = parseExpr();
        eatP('.');
        eatP('}');
        eatKw('do');
        const body = parseBody();
        optionalDot();
        const same = (n) => n.type === 'id' && n.name.toLowerCase() === v.lv;
        if (v2.lv !== v.lv || !canBeVar(v.v)) fail();
        if (cond.type !== 'bin' || !same(cond.l) || (cond.op !== '>' && cond.op !== '<')) fail();
        if (step.type !== 'bin' || step.op !== '+' || !same(step.l)) fail();
        if ((cond.op === '<') !== isNegLiteral(step.r)) fail();
        return B('kos_from', { VAR: variable(v.v) }, {
          FROM: toBlock(from), TO: toBlock(cond.r), BY: toBlock(step.r), DO: chain(body),
        });
      }

      if (w === 'if') {
        i++;
        const branches = [[parseExpr(), parseBody()]];
        let elseBody = null;
        while (atKw('else')) {
          i++;
          if (atKw('if')) {
            i++;
            branches.push([parseExpr(), parseBody()]);
          } else {
            elseBody = parseBody();
            break;
          }
        }
        optionalDot();
        const inputs = {};
        branches.forEach(([c, b], k) => {
          inputs['IF' + k] = toBlock(c);
          inputs['DO' + k] = chain(b);
        });
        if (elseBody) inputs.ELSE = chain(elseBody) || undefined;
        const extraState = {};
        if (branches.length > 1) extraState.elseIfCount = branches.length - 1;
        if (elseBody) extraState.hasElse = true;
        return B('controls_if', null, inputs, { extraState });
      }

      if (w === 'stage' || w === 'clearscreen' || w === 'break') {
        i++;
        endStatement();
        return B('kos_' + w);
      }

      if (TOGGLES.has(w)) {
        i++;
        const state = eatIdent();
        endStatement();
        if (state.lv !== 'on' && state.lv !== 'off') fail();
        return B('kos_toggle', { WHAT: w.toUpperCase(), STATE: state.lv.toUpperCase() });
      }

      if (w === 'hudtext') {
        i++;
        const args = parseArgs();
        endStatement();
        // Only the exact form the block writes; other styles stay as code.
        const rest = args.slice(2).map((a) => text(a.s, a.e).toUpperCase()).join(',');
        if (args.length !== 6 || rest !== '2,30,WHITE,FALSE') fail();
        return B('kos_hudtext', null, { VALUE: toBlock(args[0]), SECONDS: toBlock(args[1]) });
      }

      // A statement that is just a call to one of the file's own functions.
      const user = knownFns.get(w);
      if (user && isP(peek(1), '(')) {
        const call = parseExpr();
        endStatement();
        if (call.type !== 'call' || user.returns || call.args.length !== user.params.length) fail();
        return userCall('procedures_callnoreturn', user, call.args);
      }

      i = s;
      return fail();
    }

    function userCall(type, fn, args) {
      const inputs = {};
      args.forEach((a, k) => (inputs['ARG' + k] = toBlock(a)));
      return B(type, null, inputs, { extraState: { name: fn.name, params: fn.params } });
    }

    // FUNCTION name { PARAMETER a, b. ... [RETURN x.] } at the top level of the file.
    function parseFunction() {
      eatKw('function');
      const name = eatIdent();
      if (!canBeVar(name.v) || fns.has(name.lv)) fail();
      eatP('{');
      const params = [];
      while (atKw('parameter') || (atKw('declare') && isKw(peek(1), 'parameter'))) {
        if (atKw('declare')) i++;
        i++;
        for (;;) {
          const p = eatIdent();
          if (!canBeVar(p.v)) fail();
          params.push(p.v);
          if (!atP(',')) break;
          i++;
        }
        eatP('.'); // a default value (PARAMETER x IS 1.) has no block: keep as code
      }
      const body = parseStatements(true);
      eatP('}');
      optionalDot();

      // A final RETURN <value>. becomes the block's RETURN slot.
      let ret = null;
      const last = body[body.length - 1];
      const span = last && rawSpan.get(last);
      if (span && isKw(toks[span.s], 'return') && !isP(toks[span.s + 1], '.')) {
        const save = i;
        const before = Object.assign({}, stats);
        try {
          i = span.s + 1;
          const value = parseExpr();
          if (i !== span.e || !isP(toks[i], '.')) fail();
          ret = toBlock(value);
          body.pop();
          stats.raw--;
        } catch (err) {
          if (!(err instanceof ParseFail)) throw err;
          Object.assign(stats, before);
          ret = null;
        }
        i = save;
      }

      fns.set(name.lv, { name: name.v, params, returns: !!ret });
      const inputs = { STACK: chain(body) };
      if (ret) inputs.RETURN = ret;
      return B(ret ? 'procedures_defreturn' : 'procedures_defnoreturn', { NAME: name.v }, inputs, {
        extraState: { params: params.map((p) => ({ name: p, id: variable(p).id })) },
      });
    }

    // Where a statement we cannot parse ends: a '.' or a closing '}' at depth 0.
    function rawExtent(s) {
      let depth = 0;
      for (let j = s; j < toks.length; j++) {
        const t = toks[j];
        if (t.t !== 'p') continue;
        if ('{(['.includes(t.v)) depth++;
        else if ('})]'.includes(t.v)) {
          depth--;
          if (depth < 0) return j - 1;
          if (depth === 0 && t.v === '}') {
            const nx = toks[j + 1];
            if (!nx) return j;
            if (nx.t === 'p' && nx.v !== '}' && nx.v !== '{') continue;
            if (isKw(nx, 'else') || isKw(nx, 'until') || isKw(nx, 'step') || isKw(nx, 'do') ||
                isKw(nx, 'and') || isKw(nx, 'or')) continue;
            return j;
          }
        } else if (t.v === '.' && depth === 0) {
          return j;
        }
      }
      return toks.length - 1;
    }

    // One "kOS code" block per source line, keeping relative indentation.
    function rawBlocks(s, e) {
      stats.raw++;
      const start = toks[s].s;
      const col = start - (src.lastIndexOf('\n', start - 1) + 1);
      const lines = src.slice(start, toks[e].e).split(/\r?\n/);
      return lines
        .map((line, k) => (k === 0 ? line : line.replace(new RegExp('^[ \\t]{0,' + col + '}'), '')))
        .filter((line) => line.trim() !== '')
        .map((line) => B('kos_raw', { CODE: line.replace(/\s+$/, '') }))
        .map((block, k, all) => (all.length === 1 && rawSpan.set(block, { s, e }), block));
    }

    function parseStatements(inBraces) {
      const out = [];
      for (;;) {
        const t = peek();
        if (!t) {
          if (inBraces) fail('missing }');
          break;
        }
        if (isP(t, '}')) {
          if (inBraces) break;
          out.push(B('kos_raw', { CODE: '}' }));
          i++;
          continue;
        }
        if (t.t === 'comment') {
          out.push(B('kos_comment', { TEXT: t.v.replace(/^ /, '') }));
          i++;
          continue;
        }
        if (isP(t, '.')) {
          i++;
          continue;
        }
        const save = i;
        const before = Object.assign({}, stats);
        try {
          if (!inBraces && isKw(t, 'function')) {
            const def = parseFunction();
            // Comments right above a function become its block comment.
            const notes = [];
            while (out.length && out[out.length - 1].type === 'kos_comment') notes.unshift(out.pop().fields.TEXT);
            if (notes.length) def.icons = { comment: { text: notes.join('\n'), pinned: false } };
            defs.push(def);
            continue;
          }
          out.push(parseStatement());
        } catch (err) {
          if (!(err instanceof ParseFail)) throw err;
          i = save;
          Object.assign(stats, before);
          const end = Math.max(save, rawExtent(save));
          out.push(...rawBlocks(save, end));
          i = end + 1;
        }
      }
      return out;
    }

    const statements = parseStatements(false);
    return { statements, defs, fns, stats, variables: Array.from(vars.values()) };
  }

  function chain(list) {
    for (let k = list.length - 2; k >= 0; k--) list[k].next = { block: list[k + 1] };
    return list[0];
  }

  /** Parse Kerboscript source into a Blockly workspace state. */
  window.kosImport = function (src) {
    src = String(src).replace(/^\uFEFF/, '');
    // Pass 1 finds which functions become blocks; pass 2 turns calls to them into call blocks.
    const first = parse(src, new Map());
    const { statements, defs, stats, variables } = parse(src, first.fns);
    let clear = false;
    if (statements[0] && statements[0].type === 'kos_clearscreen') {
      statements.shift();
      clear = true;
    }
    const program = { type: 'kos_program', fields: { CLEAR: clear }, x: 40, y: 40 };
    const head = chain(statements);
    if (head) program.next = { block: head };
    defs.forEach((d, k) => Object.assign(d, { x: 40, y: 100000 + k * 1000 })); // laid out after load
    return {
      state: { blocks: { languageVersion: 0, blocks: [program].concat(defs) }, variables },
      stats,
    };
  };
})();
