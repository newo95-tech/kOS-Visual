/* kOS Visual: custom Kerboscript block definitions.
 * Built-in Blockly blocks (if/else, comparisons, numbers, text, variables)
 * are reused as-is; their kOS code comes from generator.js. */
(function () {
  'use strict';

  const C = {
    program: 30,
    flight: 210,
    wait: 290,
    loops: 120,
    ship: 180,
    math: 230,
    text: 160,
    actions: 0,
  };
  window.KOS_COLOURS = C;
  Blockly.Msg['TEXT_JOIN_TITLE_CREATEWITH'] = 'join';
  // Friendlier wording for Blockly's built-in function blocks.
  Blockly.Msg['PROCEDURES_DEFNORETURN_COMMENT'] = '';
  Blockly.Msg['PROCEDURES_DEFRETURN_COMMENT'] = '';
  Blockly.Msg['PROCEDURES_DEFNORETURN_TITLE'] = 'FUNCTION';
  Blockly.Msg['PROCEDURES_DEFRETURN_TITLE'] = 'FUNCTION';
  Blockly.Msg['PROCEDURES_DEFNORETURN_PROCEDURE'] = 'do_something';
  Blockly.Msg['PROCEDURES_DEFRETURN_PROCEDURE'] = 'calculate';
  Blockly.Msg['PROCEDURES_BEFORE_PARAMS'] = 'with parameters:';
  Blockly.Msg['PROCEDURES_CALL_BEFORE_PARAMS'] = 'with:';
  Blockly.Msg['PROCEDURES_DEFRETURN_RETURN'] = 'RETURN';

  const stmt = { previousStatement: null, nextStatement: null };

  Blockly.common.defineBlocksWithJsonArray([
    // ---- Program -----------------------------------------------------------
    {
      type: 'kos_program',
      message0: '🚀 kOS program %1 clear screen first',
      args0: [{ type: 'field_checkbox', name: 'CLEAR', checked: true }],
      nextStatement: null,
      colour: C.program,
      tooltip: 'Your script starts here. Only blocks attached below this run.',
    },
    {
      type: 'kos_comment',
      message0: '// %1',
      args0: [{ type: 'field_input', name: 'TEXT', text: 'note' }],
      ...stmt,
      colour: 60,
      tooltip: 'A comment. kOS ignores it.',
    },
    {
      type: 'kos_raw',
      message0: '⌨ %1',
      args0: [{ type: 'field_input', name: 'CODE', text: 'PRINT "any kOS code".', spellcheck: false }],
      ...stmt,
      colour: '#5f6670',
      tooltip: 'One line of kOS code, written out exactly as typed. Imported code without a matching block lands here.',
    },
    {
      type: 'kos_raw_value',
      message0: '⌨ %1',
      args0: [{ type: 'field_input', name: 'CODE', text: 'TIME:SECONDS', spellcheck: false }],
      output: null,
      colour: '#5f6670',
      tooltip: 'A kOS expression, written out exactly as typed.',
    },
    {
      type: 'kos_clearscreen',
      message0: 'CLEARSCREEN',
      ...stmt,
      colour: C.text,
      tooltip: 'Clear the kOS terminal.',
    },

    // ---- Flight control ----------------------------------------------------
    {
      type: 'kos_lock_steering',
      message0: 'LOCK STEERING TO %1',
      args0: [{ type: 'input_value', name: 'VALUE' }],
      ...stmt,
      colour: C.flight,
      tooltip: 'Keep pointing the ship at a direction, e.g. HEADING(90, 45).',
    },
    {
      type: 'kos_lock_throttle',
      message0: 'LOCK THROTTLE TO %1',
      args0: [{ type: 'input_value', name: 'VALUE' }],
      ...stmt,
      colour: C.flight,
      tooltip: 'Keep the throttle at a value from 0 (off) to 1 (full).',
    },
    {
      type: 'kos_unlock',
      message0: 'UNLOCK %1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'WHAT',
          options: [
            ['STEERING', 'STEERING'],
            ['THROTTLE', 'THROTTLE'],
            ['ALL', 'ALL'],
          ],
        },
      ],
      ...stmt,
      colour: C.flight,
      tooltip: 'Release a lock so the pilot (or SAS) has control again.',
    },
    {
      type: 'kos_lock_var',
      message0: 'LOCK %1 TO %2',
      args0: [
        { type: 'field_variable', name: 'VAR', variable: 'pitch' },
        { type: 'input_value', name: 'VALUE' },
      ],
      ...stmt,
      colour: C.flight,
      tooltip: 'Make a variable that is recalculated every time it is read.',
    },
    {
      type: 'kos_pilot_throttle',
      message0: 'SET pilot throttle TO %1',
      args0: [{ type: 'input_value', name: 'VALUE' }],
      ...stmt,
      colour: C.flight,
      tooltip:
        'Set the throttle the player has after the script ends. Use 0 to stop the engines restarting when the script unlocks THROTTLE.',
    },
    {
      type: 'kos_stage',
      message0: 'STAGE',
      ...stmt,
      colour: C.actions,
      tooltip: 'Activate the next stage, like pressing space.',
    },
    {
      type: 'kos_toggle',
      message0: '%1 %2',
      args0: [
        {
          type: 'field_dropdown',
          name: 'WHAT',
          options: [
            ['SAS', 'SAS'],
            ['RCS', 'RCS'],
            ['GEAR', 'GEAR'],
            ['LIGHTS', 'LIGHTS'],
            ['BRAKES', 'BRAKES'],
            ['ABORT', 'ABORT'],
          ].concat(
            Array.from({ length: 10 }, (_, i) => ['AG' + (i + 1), 'AG' + (i + 1)])
          ),
        },
        {
          type: 'field_dropdown',
          name: 'STATE',
          options: [
            ['ON', 'ON'],
            ['OFF', 'OFF'],
          ],
        },
      ],
      ...stmt,
      colour: C.actions,
      tooltip: 'Switch SAS, RCS, gear, lights, brakes or an action group on or off.',
    },
    {
      type: 'kos_heading',
      message0: 'HEADING( compass %1 pitch %2 roll %3 )',
      args0: [
        { type: 'input_value', name: 'COMPASS', check: 'Number' },
        { type: 'input_value', name: 'PITCH', check: 'Number' },
        { type: 'input_value', name: 'ROLL', check: 'Number' },
      ],
      inputsInline: true,
      output: 'Direction',
      colour: C.flight,
      tooltip:
        'A direction: compass 90 is east; pitch 90 is straight up, 0 is the horizon. ' +
        'Roll is optional: leave it empty to let kOS choose, or give an angle in degrees.',
    },
    {
      type: 'kos_direction',
      message0: '%1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'DIR',
          options: [
            ['UP', 'UP'],
            ['prograde (orbit)', 'SHIP:PROGRADE'],
            ['retrograde (orbit)', 'SHIP:RETROGRADE'],
            ['prograde (surface)', 'SHIP:SRFPROGRADE'],
            ['retrograde (surface)', 'SHIP:SRFRETROGRADE'],
            ['current facing', 'SHIP:FACING'],
            ['NORTH', 'NORTH'],
          ],
        },
      ],
      output: 'Direction',
      colour: C.flight,
      tooltip: 'A ready-made direction to steer towards.',
    },

    // ---- Waiting & triggers ------------------------------------------------
    {
      type: 'kos_wait',
      message0: 'WAIT %1 seconds',
      args0: [{ type: 'input_value', name: 'SECONDS', check: 'Number' }],
      inputsInline: true,
      ...stmt,
      colour: C.wait,
      tooltip: 'Pause the script for a number of seconds.',
    },
    {
      type: 'kos_wait_until',
      message0: 'WAIT UNTIL %1',
      args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }],
      ...stmt,
      colour: C.wait,
      tooltip: 'Pause the script until the condition is true.',
    },
    {
      type: 'kos_when',
      message0: 'WHEN %1 THEN',
      args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }],
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      message2: 'keep watching afterwards %1',
      args2: [{ type: 'field_checkbox', name: 'PRESERVE', checked: false }],
      ...stmt,
      colour: C.wait,
      tooltip:
        'Set up a trigger: the script carries on, and the blocks inside run in the background as soon as the condition becomes true. Tick "keep watching" to let it fire again (adds RETURN TRUE).',
    },

    // ---- Loops -------------------------------------------------------------
    {
      type: 'kos_until',
      message0: 'UNTIL %1',
      args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }],
      message1: 'repeat %1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      ...stmt,
      colour: C.loops,
      tooltip: 'Repeat the blocks inside until the condition becomes true.',
    },
    {
      type: 'kos_from',
      message0: 'FROM %1 = %2 UNTIL it passes %3 STEP %4',
      args0: [
        { type: 'field_variable', name: 'VAR', variable: 'i' },
        { type: 'input_value', name: 'FROM', check: 'Number' },
        { type: 'input_value', name: 'TO', check: 'Number' },
        { type: 'input_value', name: 'BY', check: 'Number' },
      ],
      message1: 'DO %1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      inputsInline: true,
      ...stmt,
      colour: C.loops,
      tooltip: 'Count from one number to another, running the blocks inside each time.',
    },
    {
      type: 'kos_break',
      message0: 'BREAK out of loop',
      previousStatement: null,
      colour: C.loops,
      tooltip: 'Leave the loop this block is inside.',
    },

    // ---- Ship info ---------------------------------------------------------
    {
      type: 'kos_ship_value',
      message0: 'ship %1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'WHAT',
          options: [
            ['altitude (m)', 'SHIP:ALTITUDE'],
            ['radar altitude (m)', 'ALT:RADAR'],
            ['apoapsis (m)', 'SHIP:APOAPSIS'],
            ['periapsis (m)', 'SHIP:PERIAPSIS'],
            ['vertical speed (m/s)', 'SHIP:VERTICALSPEED'],
            ['ground speed (m/s)', 'SHIP:GROUNDSPEED'],
            ['airspeed (m/s)', 'SHIP:AIRSPEED'],
            ['surface velocity (m/s)', 'SHIP:VELOCITY:SURFACE:MAG'],
            ['orbital velocity (m/s)', 'SHIP:VELOCITY:ORBIT:MAG'],
            ['mass (t)', 'SHIP:MASS'],
            ['max thrust (kN)', 'SHIP:MAXTHRUST'],
            ['available thrust (kN)', 'SHIP:AVAILABLETHRUST'],
            ['dynamic pressure Q', 'SHIP:Q'],
            ['latitude', 'SHIP:LATITUDE'],
            ['longitude', 'SHIP:LONGITUDE'],
            ['status', 'SHIP:STATUS'],
            ['current stage number', 'STAGE:NUMBER'],
            ['mission time (s)', 'MISSIONTIME'],
          ],
        },
      ],
      output: null,
      colour: C.ship,
      tooltip: 'Read a value from the active vessel.',
    },
    {
      type: 'kos_eta',
      message0: 'ETA to %1 (s)',
      args0: [
        {
          type: 'field_dropdown',
          name: 'WHAT',
          options: [
            ['apoapsis', 'ETA:APOAPSIS'],
            ['periapsis', 'ETA:PERIAPSIS'],
          ],
        },
      ],
      output: 'Number',
      colour: C.ship,
      tooltip: 'Seconds until the ship reaches apoapsis or periapsis.',
    },
    {
      type: 'kos_resource',
      message0: '%1 %2',
      args0: [
        {
          type: 'field_dropdown',
          name: 'SCOPE',
          options: [
            ['current stage', 'STAGE'],
            ['whole ship', 'SHIP'],
          ],
        },
        {
          type: 'field_dropdown',
          name: 'RES',
          options: [
            ['liquid fuel', 'LIQUIDFUEL'],
            ['oxidizer', 'OXIDIZER'],
            ['solid fuel', 'SOLIDFUEL'],
            ['monopropellant', 'MONOPROPELLANT'],
            ['electric charge', 'ELECTRICCHARGE'],
          ],
        },
      ],
      output: 'Number',
      colour: C.ship,
      tooltip: 'Amount of a resource left.',
    },
    {
      type: 'kos_stage_ready',
      message0: 'staging is ready',
      output: 'Boolean',
      colour: C.ship,
      tooltip: 'True when kOS is allowed to STAGE again (STAGE:READY).',
    },

    // ---- Math --------------------------------------------------------------
    {
      type: 'kos_math_func',
      message0: '%1 ( %2 )',
      args0: [
        {
          type: 'field_dropdown',
          name: 'FUNC',
          options: [
            ['ABS', 'ABS'],
            ['SQRT', 'SQRT'],
            ['FLOOR', 'FLOOR'],
            ['CEILING', 'CEILING'],
            ['SIN', 'SIN'],
            ['COS', 'COS'],
            ['TAN', 'TAN'],
            ['ARCSIN', 'ARCSIN'],
            ['ARCCOS', 'ARCCOS'],
            ['ARCTAN', 'ARCTAN'],
            ['LN', 'LN'],
            ['LOG10', 'LOG10'],
          ],
        },
        { type: 'input_value', name: 'X', check: 'Number' },
      ],
      inputsInline: true,
      output: 'Number',
      colour: C.math,
      tooltip:
        'Maths functions: SQRT (square root), ABS (absolute value), FLOOR / CEILING (round down / up), ' +
        'SIN / COS / TAN and their inverses (angles in degrees), LN / LOG10 (logarithms).',
    },
    {
      type: 'kos_round',
      message0: 'ROUND( %1 to %2 decimals )',
      args0: [
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'DIGITS', check: 'Number' },
      ],
      inputsInline: true,
      output: 'Number',
      colour: C.math,
      tooltip: 'Round a number, e.g. for printing.',
    },
    {
      type: 'kos_minmax',
      message0: '%1 ( %2 , %3 )',
      args0: [
        {
          type: 'field_dropdown',
          name: 'FUNC',
          options: [
            ['MIN', 'MIN'],
            ['MAX', 'MAX'],
          ],
        },
        { type: 'input_value', name: 'A', check: 'Number' },
        { type: 'input_value', name: 'B', check: 'Number' },
      ],
      inputsInline: true,
      output: 'Number',
      colour: C.math,
      tooltip: 'The smaller (MIN) or larger (MAX) of two numbers.',
    },
    {
      type: 'kos_negate',
      message0: '- %1',
      args0: [{ type: 'input_value', name: 'X', check: 'Number' }],
      inputsInline: true,
      output: 'Number',
      colour: C.math,
      tooltip: 'Negative of a number.',
    },

    // ---- Text / terminal ---------------------------------------------------
    {
      type: 'kos_print',
      message0: 'PRINT %1',
      args0: [{ type: 'input_value', name: 'VALUE' }],
      ...stmt,
      colour: C.text,
      tooltip: 'Show text or a value on the kOS terminal.',
    },
    {
      type: 'kos_print_at',
      message0: 'PRINT %1 AT column %2 row %3',
      args0: [
        { type: 'input_value', name: 'VALUE' },
        { type: 'input_value', name: 'COL', check: 'Number' },
        { type: 'input_value', name: 'ROW', check: 'Number' },
      ],
      inputsInline: true,
      ...stmt,
      colour: C.text,
      tooltip: 'Print at a fixed spot on the terminal. Good for live readouts in a loop.',
    },
    {
      type: 'kos_hudtext',
      message0: 'show on screen %1 for %2 s',
      args0: [
        { type: 'input_value', name: 'VALUE' },
        { type: 'input_value', name: 'SECONDS', check: 'Number' },
      ],
      inputsInline: true,
      ...stmt,
      colour: C.text,
      tooltip: 'Show a message in the middle of the KSP screen (HUDTEXT).',
    },
  ]);
})();

// Show function call arguments in one row: clamp(x, lo, hi).
(function () {
  for (const type of ['procedures_callreturn', 'procedures_callnoreturn']) {
    const def = Blockly.Blocks[type];
    const init = def.init;
    def.init = function () {
      init.call(this);
      this.setInputsInline(true);
    };
  }
})();
