# kOS Visual (prototype)

A block-based editor that writes kOS (Kerboscript) scripts for Kerbal Space Program.
Plain static files, no build step and no backend. Blockly 13.5 is bundled in `vendor/`, so it works offline.

## Run it
- Open `index.html` in a browser (double-click works), or serve the folder with any static server,
  e.g. `python -m http.server` and visit http://localhost:8000.
- To host on GitHub Pages, push this folder to a repo and enable Pages for it.

## Use it
1. Stack blocks under the **kOS program** block. Blocks that are not attached turn grey and are left out.
   To find a block, type in the search box above the categories (or press `/`). It matches block text and
   dropdown choices, so "apoapsis" offers the ship block already set to apoapsis. Drag a result out, or press
   Enter to add the top result. Escape clears the search.
   To find blocks already in your script, press Ctrl+F (Cmd+F on Mac) or click **Find**. It also searches comment blocks and
   block comments (the ? icon). Matching blocks are brightened; Enter / Shift+Enter (or the arrows) step through them, and Escape closes the bar.
2. The Kerboscript appears live on the right.
3. Export:
   - **Save to Ships/Script…** (Chrome, Edge, Opera): pick `<KSP folder>/Ships/Script` once. The folder is remembered,
     and later saves write straight into it. In kOS, run it with `RUNPATH("0:/launch.ks").`
   - **Download .ks** (any browser, including Firefox and Safari): move the file into `Ships/Script` yourself.
   - **Copy** puts the code on the clipboard.
4. **Import .ks…** (or drop a `.ks` file on the page) turns an existing script into blocks.
   FUNCTION definitions at the top level of the file become function blocks, and calls to them become call blocks.
   Anything else without a matching block (LOCAL, lists, RUN, parameters with default values, etc.) is kept word for word as grey
   "⌨ code" blocks, so the script still does the same thing when you save it again. Formatting and blank lines
   are not kept, and `PRESERVE.` in a WHEN becomes the "keep watching" box (`RETURN TRUE.`).
5. The workspace autosaves in the browser. **Save blocks** / **Open…** move a project around as a `.blocks.json` file.

## Blocks
| Category | Blocks |
|---|---|
| Program | program start (optional CLEARSCREEN), comment, CLEARSCREEN, raw code line, raw code value |
| Flight | LOCK THROTTLE / STEERING, UNLOCK, HEADING(compass, pitch, optional roll), UP / prograde / retrograde / facing, LOCK variable, pilot throttle |
| Actions | STAGE, SAS / RCS / GEAR / LIGHTS / BRAKES / ABORT / AG1-10 ON/OFF |
| Wait & triggers | WAIT n, WAIT UNTIL, WHEN … THEN (optional "keep watching" = `RETURN TRUE.`) |
| Loops & logic | IF / ELSE IF / ELSE, UNTIL, FROM counting loop, BREAK, comparisons, AND / OR / NOT, TRUE / FALSE |
| Ship info | altitude, radar altitude, apoapsis, periapsis, speeds, velocity, mass, thrust, Q, lat/long, status, stage number, mission time, ETA, resources, STAGE:READY |
| Math | numbers, + - * / ^, negate, ROUND, MIN / MAX, ABS / SQRT / trig / logs |
| Terminal & text | PRINT, PRINT … AT, HUDTEXT, text, join |
| Variables | SET, change by, get |
| Functions | FUNCTION with parameters (with or without RETURN), early "if … return", and a call block for every function you define |

## Functions
- Open **Functions** and drag out a FUNCTION block. Name it, and use the gear icon to add parameters.
  Use the version with RETURN if the function gives back a value.
- Call blocks for each function appear in the same category, and follow renames and parameter changes.
- Function and parameter names are written into the code exactly as you type them. If kOS would reject one
  (a keyword or built-in name like `stage`, a space or symbol, or the same name twice), the FUNCTION block gets a
  dashed outline and a ⚠ warning, and a list above the code says what to fix. Click a line to jump to the block.
- Function blocks sit on their own outside the program block. Their code goes after the main program,
  which is fine because kOS lets a file call its top-level functions from anywhere in it.

## Notes
- "keep watching" on WHEN emits `RETURN TRUE.`, which needs kOS 1.1 or newer.
- kOS is case-insensitive, so a variable whose name clashes with a keyword or bound name (e.g. `altitude`) is renamed to `my_altitude`.
- kOS strings cannot contain `"`, so double quotes in text blocks become `'`.

## Files
- `index.html`, `css/app.css`
- `js/blocks.js`: block definitions
- `js/generator.js`: Kerboscript code generator
- `js/importer.js`: Kerboscript parser for .ks import
- `js/app.js`: toolbox, workspace, live preview, saving and export
- `js/search.js`: block search box
- `js/find.js`: find blocks in the script
- `vendor/blockly/`: Blockly (Apache 2.0)
