# Eval fixtures

The eval harness (`pnpm -F @learnbuddy/api eval`) replays each subdirectory
under this folder against the configured LLM gateway and asserts the result
matches `expected.json`. CI runs this on every PR that touches prompts so
quality regressions surface before they ship.

Doc reference: `docs/06-ai-pipeline.md` §Eval harness.

## Layout

```
evals/fixtures/{fixture-name}/
  meta.json        # vision input (locale, grade, subject, subject_kind, target_item_count)
  expected.json    # assertions the result must satisfy
  images/          # 0.jpg, 1.jpg, ... (optional; required for real Vertex runs)
```

`fixture-name` is freeform but should follow the inventory in Doc 06
("`de-grade7-math-linear-functions`", "`en-grade5-math-fractions`", etc.).

## meta.json

```json
{
  "locale": "de",
  "grade_level": 7,
  "subject": "Mathematik",
  "subject_kind": "math",
  "target_item_count": 10
}
```

Field shapes match the `VisionInput` type in
`apps/api/src/lib/llm/gateway.ts`:

- `locale` — one of `de | en | fr | es | it`
- `subject_kind` — one of `math | physics | chemistry | biology | geography
| history | language_native | language_foreign | religion_ethics | art_music
| general | other`

## expected.json

All fields optional. An empty `{}` only asserts the gateway returned no error.

```json
{
  "min_items": 6,
  "must_topics": ["Lineare Funktion", "Steigung"],
  "must_answer_kinds": ["formula", "numeric"],
  "must_template_count": 1,
  "max_cost_usd": 0.002,
  "must_diagrams": false,
  "expect_no_error": true
}
```

- `min_items` — `result.items.length >= min_items`
- `must_topics` — every entry must appear (substring match, case-insensitive)
  as `item.topic` on at least one item
- `must_answer_kinds` — every entry must appear as `item.answer_kind` on at
  least one item (`short | long | numeric | multiple_choice | formula |
fill_blank | diagram_label`)
- `must_template_count` — `problem_templates.length >= must_template_count`
- `max_cost_usd` — `usage.cost_usd_micros / 1_000_000 <= max_cost_usd`
- `must_diagrams` — when `true`, requires `diagrams.length >= 1`, requires
  at least one `diagram_label` item, and verifies each label's `target_xy`
  lies within its diagram's `bounding_box`
- `expect_no_error` — default `true`; fail when `result.error !== null`

## images/

Optional. Real Vertex runs need real photos. The Fake gateway ignores
`images[]` and emits a deterministic 3-item placeholder, so the
`example-de-grade7-math` fixture passes with no image files present.

When you record a fixture against real Vertex:

1. Take photos of the material (own kid's worksheet or stock).
2. Save them as `images/0.jpg`, `images/1.jpg`, …
3. Tune `expected.json` to the observed output (without overfitting — keep
   the assertions semantic, not byte-for-byte).
4. Commit. The next prompt revision either still passes or surfaces a
   regression in the diff output.

## Examples a real fixture should aim at (Doc 06)

- `de-grade7-math-linear-functions` — worksheet with linear equations + graph
- `de-grade7-math-percentages` — word problems, parameterizable variants
- `de-grade7-physics-mechanics` — speed/distance/time, numeric problems
- `de-grade7-chemistry-reactions` — simple chemical equations
- `de-grade7-biology-cell` — labeled cell diagram (`must_diagrams: true`)
- `de-grade7-geography-europe` — labeled map (`must_diagrams: true`)
- `de-grade7-history-french-revolution` — text-heavy dates / names
- `de-grade7-language-german-grammar` — fill-blank grammar
- `de-grade7-language-english-vocab` — vocabulary list
- `de-grade7-handwritten-notes` — handwritten math
- `en-grade5-math-fractions`
- `de-grade4-math-arithmetic`
- `de-grade10-physics-projectile`

## Running

```bash
pnpm -F @learnbuddy/api eval                      # all fixtures, fake gateway
pnpm -F @learnbuddy/api eval -- --fixture=foo     # one fixture only
pnpm -F @learnbuddy/api eval -- --backend=vertex  # real Gemini (needs GCP env)
pnpm -F @learnbuddy/api eval -- --dir=evals/some-other-dir
```

Exits non-zero on any failure.
