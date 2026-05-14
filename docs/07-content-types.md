# 07 — Content Types

This document is the canonical reference for the types and shapes of educational content the app handles: subjects, answer kinds, stimuli, formulas, diagrams, problem templates, and graphs. The data model (doc 03) realizes these as Postgres columns. The AI pipeline (doc 06) produces them. The mobile app (doc 05) renders them.

## 1. Subjects

A subject's `subject_kind` enum drives three things: the prompt branch in the vision pipeline, the default answer-kind mix, and the available extras on the math keyboard.

| `subject_kind` | German default name | Default answer-kind mix | Diagrams expected | Templates emitted |
|---|---|---|---|---|
| `math` | Mathematik | formula 30 % / numeric 30 % / short 25 % / fill_blank 10 % / multiple_choice 5 % | sometimes | yes |
| `physics` | Physik | numeric 35 % / formula 25 % / short 20 % / long 15 % / multiple_choice 5 % | sometimes | yes |
| `chemistry` | Chemie | short 30 % / formula 25 % / multiple_choice 20 % / long 15 % / fill_blank 10 % | yes | no |
| `biology` | Biologie | short 30 % / long 25 % / diagram_label 20 % / multiple_choice 15 % / fill_blank 10 % | yes | no |
| `geography` | Geografie | short 30 % / multiple_choice 30 % / diagram_label 25 % / long 15 % | yes | no |
| `history` | Geschichte | short 35 % / long 30 % / multiple_choice 25 % / fill_blank 10 % | rare | no |
| `language_native` | Deutsch | short 30 % / long 25 % / fill_blank 35 % / multiple_choice 10 % | no | no |
| `language_foreign` | Englisch / Französisch / … | fill_blank 40 % / short 30 % / long 20 % / multiple_choice 10 % | no | no |
| `religion_ethics` | Religion / Ethik | long 40 % / short 35 % / multiple_choice 25 % | no | no |
| `art_music` | Kunst / Musik | short 40 % / long 30 % / multiple_choice 30 % | sometimes | no |
| `general` | Sachunterricht / Sonstige | short 35 % / long 30 % / multiple_choice 25 % / fill_blank 10 % | rare | no |
| `other` | (custom) | balanced | rare | no |

These percentages are guidance for the prompt, not enforced exactly. The vision call mixes based on what the material actually warrants.

## 2. Stimuli

A stimulus is an optional visual that appears with a question. Items have `stimulus_kind` and `stimulus_data`. Multiple-choice items can additionally have `mc_option_stimuli` with one stimulus per option.

### 2.1 `none`

The default. No stimulus. `stimulus_data = {}`.

### 2.2 `study_asset`

A reference to a `study_assets` row by id. Used for diagrams, cropped graphs, and pre-rendered figures.

```json
{ "study_asset_id": "uuid" }
```

The mobile renders the asset's image (PNG from the `study-assets` bucket) at full width with pinch-zoom. For `diagram_label` items, the asset is the numbered version produced by the image processor (doc 06 §2).

### 2.3 `function_plot`

A small declarative DSL evaluated client-side with `mathjs` and rendered with `victory-native`. Used for math/physics graphs, both as a stimulus on an item and as the renderable output of a problem template.

```json
{
  "series": [
    { "kind": "line", "expression": "2*x + 3", "color": "#3F6BFD", "label": "y = 2x + 3" },
    { "kind": "points", "points": [[0,3],[1,5],[2,7]], "color": "#E25555", "label": "Messpunkte" }
  ],
  "x": { "min": -3, "max": 5, "tick_step": 1, "label": "x" },
  "y": { "min": -3, "max": 12, "tick_step": 2, "label": "y" },
  "grid": true,
  "highlights": [ { "x": 2, "y": 7, "label": "P" } ]
}
```

Server-side validation: each `expression` is parsed with `mathjs` and rejected if it uses any identifier outside `x`, the standard math constants/functions, and parameters declared in the surrounding problem template (if any). Each `series` of kind `points` must have ≥ 1 entry. Each `series` of kind `line` is evaluated at 200 evenly-spaced x values; if more than 25 % of evaluations throw or yield non-finite, the stimulus is rejected.

### 2.4 `svg`

A sanitized SVG fragment. Used for geometric figures (triangles, circles, angle diagrams) that an LLM can describe but a plot DSL cannot easily encode.

```json
{
  "viewBox": "0 0 400 300",
  "content": "<g><circle cx=\"200\" cy=\"150\" r=\"100\" fill=\"none\" stroke=\"#3F6BFD\" stroke-width=\"2\"/><text x=\"200\" y=\"150\" text-anchor=\"middle\" font-size=\"14\">A</text></g>"
}
```

Sanitization (server-side, before persist):

- Elements allowlist: `g, path, line, rect, circle, ellipse, polygon, polyline, text, defs, marker, tspan, title`.
- Attribute allowlist: `id, class, viewBox, x, y, x1, y1, x2, y2, cx, cy, r, rx, ry, d, points, transform, fill, stroke, stroke-width, stroke-dasharray, stroke-linecap, stroke-linejoin, font-size, font-account, font-weight, text-anchor, dominant-baseline, marker-end, marker-start, marker-mid, refX, refY, orient, markerWidth, markerHeight`.
- No `script`, no `style`, no `foreignObject`, no `<image>`, no event handlers, no external references (`url(...)` allowed only for fragment identifiers `#name`).
- Color values restricted to `#rrggbb`, `#rgb`, named colors, and `none`. No `rgb()`, no `rgba()`, no `currentColor`.
- Anything outside the whitelist causes the stimulus to be rejected during post-processing; the surrounding item retains `stimulus_kind='none'` and the learner only sees the text question.

### 2.5 `coord_grid`

A blank coordinate grid for plot-the-point questions.

```json
{
  "x": { "min": -5, "max": 5, "tick_step": 1, "label": "x" },
  "y": { "min": -5, "max": 5, "tick_step": 1, "label": "y" }
}
```

Mobile renders it via `<FunctionPlot>` with `series = []` and listens for taps; the learner's answer is the tapped coordinates (snapped to `tick_step / 2`).

## 3. Answer kinds

The `answer_kind` enum has seven values. Each defines: how items are persisted, how the mobile input renders, how the local evaluator works, and what the LLM evaluation prompt expects.

### 3.1 `short`

Single sentence or phrase. Persisted in `expected_answer` + `acceptable_answers[]`.

- Input: text or voice.
- Local evaluator: normalize both sides (NFKC, lowercase, strip punctuation, collapse whitespace, ß↔ss for de). Compare to expected and to each acceptable. Token-overlap ratio ≥ 0.9 AND length ≥ 70 % of reference → correct. Otherwise → unknown.
- LLM evaluator: P3 with empty kind-specific context.

### 3.2 `long`

A multi-sentence explanation. Same persistence as `short`.

- Input: text or voice.
- Local evaluator: only checks "obvious wrong" — empty answer or < 25 % of expected length → incorrect-locally. Otherwise → unknown (always delegates to LLM).
- LLM evaluator: P3 with empty kind-specific context.

### 3.3 `numeric`

A number with optional units. Persisted in `expected_answer` (canonical string form, e.g. "12.5"), `units` (e.g. "m/s"), `acceptable_answers[]` (alternative numeric strings, e.g. "12,5" for German comma decimal).

- Input: `MathInput` in numeric mode.
- Local evaluator: parse learner's input with `mathjs`. Strip units, recognize unit aliases (`Kilometer pro Stunde` → `km/h`). Compare to expected with ±1 % relative tolerance, or ±0.01 absolute when `|expected| < 1`. Match → correct. Parse failure or off → unknown.
- LLM evaluator: P3 with the numeric kind-specific block.

### 3.4 `multiple_choice`

Persisted in `mc_options[]` + `mc_correct_index`. Optionally `mc_option_stimuli` for visual options.

- Input: tappable cards. Each option may itself carry a stimulus.
- Local evaluator: exact index match → correct. Anything else → incorrect (local, no LLM call).
- LLM evaluator: not used for plain MC. If the learner types a free-text answer instead (in case of accessibility fallback), the multiple-choice index check skips and the LLM is asked with the mc block in context.

### 3.5 `formula`

A mathematical formula. Persisted in `expected_answer` (LaTeX string) + `latex_expected` + `latex_acceptable[]`.

- Input: `MathInput` in formula mode with MathLite parsing and live KaTeX preview.
- Local evaluator: parse learner's MathLite input to AST. Canonicalize both sides (sort commutative operands, normalize signs, lowercase variable names). If canonical AST matches expected or any acceptable, → correct. Otherwise → unknown.
- LLM evaluator: P3 with the formula kind-specific block.

### 3.6 `diagram_label`

The question is "Was ist Nummer 3 auf dem Bild?" (or equivalent). Persisted with `study_asset_id` and `diagram_label_index`; `expected_answer` is the label text.

- Input: text or voice.
- Local evaluator: same as `short`.
- LLM evaluator: P3 with the diagram_label kind-specific block.

### 3.7 `fill_blank`

A template text with one or more `___` placeholders. Persisted in `fill_blank_template` + `fill_blank_answers[]` (ordered, per blank). `expected_answer` mirrors the joined answers separated by " | " for display.

- Input: `FillBlank` component, inline text inputs.
- Local evaluator: per-blank normalize-and-compare against the corresponding entry in `fill_blank_answers`. All-correct → correct. Some-correct → unknown (LLM decides whether to give partial credit). None-correct → incorrect.
- LLM evaluator: P3 with the fill_blank kind-specific block.

## 4. Formula representation

Two representations exist:

- **LaTeX** — canonical, persisted, rendered, sent to LLM.
- **MathLite** — natural typed shorthand the learner writes; parsed to LaTeX and to an AST for evaluation.

### 4.1 LaTeX rules

- Inline math is wrapped in `$...$`. Display math in `$$...$$`.
- Variable identifiers single-letter unless multi-letter is unambiguous (`AB`, `\Delta x`).
- Decimals use a dot in LaTeX even for German content (the renderer turns it into a comma at display time when locale is de).
- Chemical equations: element symbols literal (`H_2O`, `Na^+`), `\rightarrow` for reaction arrow, `\rightleftharpoons` for reversible.
- Units in physics: `\,\text{m/s}` style with thin space before the unit text.

### 4.2 MathLite syntax

A small typed-math language that maps cleanly to LaTeX and to a `mathjs` AST. Designed so a learner types intuitively on a regular keyboard.

| MathLite | LaTeX rendering | `mathjs` interpretation |
|---|---|---|
| `x + 2` | `x + 2` | addition |
| `2*x` or `2x` | `2x` | multiplication |
| `(a+b)/(c-d)` | `\frac{a+b}{c-d}` | division |
| `x^2` | `x^{2}` | power |
| `x^(n+1)` | `x^{n+1}` | power with multi-char exponent |
| `sqrt(9)` | `\sqrt{9}` | square root |
| `sqrt[3](27)` | `\sqrt[3]{27}` | n-th root |
| `pi` | `\pi` | π |
| `e` | `e` | Euler's number when used as constant; otherwise variable |
| `inf` | `\infty` | infinity |
| `Delta x` | `\Delta x` | "delta x" variable |
| `>=` `<=` `!=` | `\geq` `\leq` `\neq` | comparison |
| `sin(x)` | `\sin(x)` | trig |
| `log(x)` | `\log(x)` | log base 10 |
| `ln(x)` | `\ln(x)` | natural log |
| `abs(x)` | `\lvert x \rvert` | absolute value |
| `(a; b)` | `(a;\,b)` | coordinate pair (geometry) |
| `[a, b]` | `[a, b]` | interval (display only; no semantic) |

Parser implementation lives in `packages/shared-math/src/mathlite.ts`. Both mobile and API import the same code so server-side validation matches learner-side parsing exactly.

Implementation notes:
- The parser is hand-written recursive descent. Roughly 250 lines.
- Implicit multiplication is supported only when unambiguous: `2x` yes, `xy` yes, `x2` no (treated as `x_2` variable name only if subscript syntax is requested).
- Mixed Greek words (`pi`, `Delta`, `lambda`, `theta`, etc.) are recognized as identifiers and converted to `\<name>` LaTeX where appropriate.
- Errors carry a position so the input UI can underline the offending token (but display "Wir verstehen es trotzdem — bitte abschicken" since the LLM can still grade fuzzy input).

### 4.3 Numeric normalization

For `answer_kind = numeric`, the input goes through `parseNumericInput`:

1. Replace German decimal comma with dot.
2. Strip thousands separators (`.` in de when context is clear; `,` in en).
3. Recognize unit aliases. Hard-coded map in `packages/shared-math/src/units.ts` includes common SI prefixes, German/English unit names (Kilometer pro Stunde, miles per hour, etc.).
4. Pass the remaining numeric string to `mathjs.evaluate`. If it evaluates to a finite number, that is the parsed value.

The unit string is compared against the item's `units` field. Mismatch → flagged but not auto-wrong; the LLM (if reached) decides whether to forgive based on context.

## 5. Diagrams

A diagram is content the LLM identifies as a labeled figure: a labeled drawing (cell, plant, organ), a labeled photo (machine parts), or a labeled map.

The vision pipeline (doc 06 §3 diagrams block) returns the bounding box, label texts, label text boxes, connector boxes, and target xy. The image processor (doc 06 §2) crops, masks the labels, and composites numbered markers into a study asset.

The resulting `study_assets` row has `kind='numbered_diagram'` and `metadata` of shape:

```json
{
  "label_positions": [
    { "index": 1, "x": 0.42, "y": 0.31 },
    { "index": 2, "x": 0.68, "y": 0.55 }
  ],
  "original_label_text": ["Zellkern", "Mitochondrium"],
  "fallback": "no_masking" | null
}
```

`diagram_label` items reference the asset via `study_asset_id` and the specific marker via `diagram_label_index` (1-based, matching `label_positions[].index`). The learner sees the question "Was ist Nummer 2?" and the numbered image; the learner types or speaks the label.

### Graph diagrams

A diagram the vision identifies as a graph (coordinate system) is processed slightly differently: masking is skipped, and the resulting study asset has `kind='cropped_graph'` with `metadata.graph_meta` preserved from the vision output.

Where the vision could read a clear function expression, items may also be generated with `stimulus_kind='function_plot'` instead of (or in addition to) `stimulus_kind='study_asset'`, so the learner sees a freshly-rendered, crisp graph rather than a photo of one. The two coexist: photo for "label this graph" questions, freshly-rendered plot for "use this graph to compute" questions.

## 6. Problem templates

Problem templates let the learner generate fresh variants of a math/physics problem without any LLM call.

### 6.1 Template shape

```json
{
  "template_text": "Löse die Gleichung: {a}x + {b} = {c}.",
  "params": [
    { "name": "a", "type": "int", "min": 2, "max": 9 },
    { "name": "b", "type": "int", "min": -20, "max": 20, "exclude": [0] },
    { "name": "c", "type": "int", "min": -50, "max": 50 }
  ],
  "constraints": [
    "(c - b) mod a == 0",
    "abs((c - b) / a) <= 20"
  ],
  "text_substitutions": [],
  "solution_expression": "(c - b) / a",
  "answer_kind": "numeric",
  "units": null,
  "stimulus_template": null,
  "topic": "Lineare Gleichungen",
  "difficulty": 2
}
```

Or with a stimulus that changes per variant:

```json
{
  "template_text": "Bestimme die Steigung der Geraden y = {m}x + {b}.",
  "params": [
    { "name": "m", "type": "int", "min": -5, "max": 5, "exclude": [0] },
    { "name": "b", "type": "int", "min": -8, "max": 8 }
  ],
  "constraints": [],
  "text_substitutions": [],
  "solution_expression": "m",
  "answer_kind": "numeric",
  "units": null,
  "stimulus_template": {
    "kind": "function_plot",
    "dataTemplate": {
      "series": [{ "kind": "line", "expression": "{m}*x + {b}", "color": "#3F6BFD" }],
      "x": { "min": -6, "max": 6, "tick_step": 1 },
      "y": { "min": -10, "max": 10, "tick_step": 2 },
      "grid": true
    }
  },
  "topic": "Lineare Funktionen",
  "difficulty": 2
}
```

### 6.2 Server validation

In `apps/api/lib/llm/postProcess.ts`, every template is validated before persistence:

1. Parse `template_text` for `{param}` placeholders. Every reference must be in `params`. Unused params are allowed but logged.
2. Each `params[i]`:
   - `name` matches `^[a-zA-Z_][a-zA-Z0-9_]*$` and is not a reserved math identifier.
   - `min < max`.
   - `exclude` values lie in `[min, max]`.
3. Parse each `constraints[i]` with the MathLite parser. Reject identifiers outside `params[].name` plus the built-in math constants/functions.
4. Parse `solution_expression`. Same identifier check.
5. Parse `text_substitutions[i].rule` if any (used for plural/singular agreement, see §6.4). Same identifier check.
6. Sample 5 random parameter combinations. For each:
   - Apply `exclude` filtering.
   - Evaluate every constraint; combination passes iff all return truthy.
   - On at least one passing combination, evaluate `solution_expression`; must return a finite numeric value (for `numeric` templates) or a non-empty string (for `formula`/`short`).
7. If passes < 3 out of 5, drop the template (`template_validation_dropped` event in Sentry).

### 6.3 Variant generation

Mobile-side, in `apps/mobile/lib/practice/generate.ts`. Identical algorithm runs in `apps/api/lib/math/templateGen.ts` for server-side eval-harness regression tests.

```
function generateVariant(template, alreadyShown):
  for attempt in 1..200:
    values = {}
    for p in template.params:
      values[p.name] = sampleFromRange(p)   // honors exclude and step
    if anyConstraintFails(template.constraints, values): continue
    key = serializeValues(values)
    if alreadyShown.has(key): continue
    text = substituteParams(template.template_text, values, template.text_substitutions)
    solution = evaluateMathLite(template.solution_expression, values)
    stimulus = template.stimulus_template
      ? buildStimulus(template.stimulus_template, values)
      : null
    return { text, solution, stimulus, values_key: key }
  throw new Error('cannot_generate_variant')
```

If 200 attempts fail, the mobile shows "Aufgabe variiert nicht weit genug — probier etwas anderes" and disables further variants on this template until a different practice run.

### 6.4 Text substitutions

For German grammar agreement (plural/singular, case), templates can declare substitutions. Example:

```json
{
  "template_text": "Wie viel kosten {n} {apple_word}?",
  "params": [{ "name": "n", "type": "int", "min": 2, "max": 10 }],
  "text_substitutions": [
    { "name": "apple_word", "rule": "n == 1 ? 'Apfel' : 'Äpfel'" }
  ],
  ...
}
```

`text_substitutions[i].rule` is a MathLite-compatible ternary expression. The substituted value (string literal or computed number) replaces `{name}` in the text.

### 6.5 Adaptive difficulty

After each practice run, the mobile updates a per-template `difficulty_adjustment` (range −2 to +2):

- Success rate ≥ 90 % and avg time < 12 s per problem → `difficulty_adjustment += 1` capped at +2.
- Success rate < 50 % → `difficulty_adjustment -= 1` capped at −2.
- Otherwise no change.

The adjustment biases parameter sampling: higher difficulty draws from the upper half of each param's range; lower difficulty draws from the narrower band around the midpoint.

The adjustment is persisted via `PATCH /templates/:id/practice-run/:run_id` in the response, and stored on `problem_templates.difficulty + difficulty_adjustment` — kept as separate fields so the learner's adjustment can be reset without touching the LLM-emitted base difficulty.

## 7. Renderer expectations

Concrete sizing and behavior expected of the mobile components from doc 05:

- `<LatexText>` renders inline `$...$` in line with surrounding `<Text>`, at the surrounding font size.
- `<FunctionPlot>` defaults to a square aspect with a 16-pt axis font and `victory-native`'s default light theme. Tick marks at `tick_step`. Both axes always labeled if present.
- `<SvgStimulus>` constrains height to 280 dp by default with `preserveAspectRatio="xMidYMid meet"`.
- `<DiagramQuestion>` constrains the asset to 70 % of viewport height. Pinch and double-tap zoom. The currently-asked-about marker has an animated 2-px ring pulsing at 1 Hz.

## 8. Edges and rejected cases

- Items whose `answer_kind` is `formula` but `latex_expected` is empty are rejected during post-processing.
- Items whose `stimulus_kind` is non-`none` but `stimulus_data` fails validation are downgraded to `none` and shipped without the stimulus.
- Items whose `answer_kind` is `diagram_label` but whose referenced `study_asset_id` failed image processing are dropped.
- Templates that pass validation but produce three consecutive variant-generation failures during a learner's practice run get an internal flag and stop being offered until validated again on the server.
