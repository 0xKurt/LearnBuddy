# Maths checking, exercise generation, figures and diagram labelling: architecture options for LearnBuddy

Research date: 2026-09-26. Environment note: the egress proxy blocked geogebra.org, docs.stack-assessment.org, ai.google.dev, simedw.com (and GitHub REST API calls returned nothing), so several primary pages could only be read through search snippets or GitHub mirrors. npm registry data (version, date, licence, dependencies) was queried directly on 2026-09-26 and counts as **verified**. Anything under "Inferences" is reasoning or prior knowledge that was **not re-verified in this session**.

## Q1. How do Khan Academy (Perseus), GeoGebra, bettermarks, IXL, Mathletics, Brilliant, Serlo and Photomath check answers, generate variants and draw diagrams?

### Takeaway

Only Khan Academy's stack was verifiable in this session. It is fully open source under MIT: the Perseus item format and renderer, the KAS expression-equivalence CAS, the math-input keypad, and a separate scoring package. It is actively published (2026-09). It draws graphs with Mafs. The other vendors' internals are proprietary, and no primary sources on them could be fetched.

### Cited Findings

- Perseus is "Khan Academy's exercise question editor and renderer". It holds the code "to take a problem in the Perseus format and present it, allow interaction, and grade the result of a learner's work". Licence: MIT. — [Khan/perseus](https://github.com/Khan/perseus), [LICENSE](https://github.com/Khan/perseus/blob/main/LICENSE)
- KAS is "a lightweight JavaScript CAS for comparing expressions and equations", used throughout Khan Academy's interactive exercises (MIT). Example: it treats `(1-x)(-1-6x)` as equal to `(6x+1)(x-1)`, and `2w+50/w=25` as equivalent to `w(12.5-w)=25`. API: `KAS.parse()`, `KAS.compare()`, `.simplify()`, `.expand()`, `.factor()`, `.collect()`. — [Khan/KAS README](https://github.com/Khan/KAS/blob/master/README.md)
- The standalone Khan/KAS repo was archived on 2023-02-06. KAS lives on as `@khanacademy/kas` inside the Perseus monorepo: version 2.2.6, published 2026-08-11, MIT. — [Khan/KAS](https://github.com/Khan/KAS); npm registry (queried 2026-09-26)
- `@khanacademy/perseus` 87.2.2 was published 2026-09-23 (MIT). Its runtime dependencies include `mafs`, `@khanacademy/kas`, `@khanacademy/kmath`, `@khanacademy/math-input`, `@khanacademy/perseus-score`, `@khanacademy/perseus-linter`, `@dnd-kit/*` and `jquery`. Its peer dependencies are `react ^18.2`, `react-dom`, `aphrodite` and about 20 `@khanacademy/wonder-blocks-*` packages. — npm registry (queried 2026-09-26)
- `@khanacademy/math-input` (the keypad) is at 28.0.0, published 2026-09-23 (MIT). Its peer dependencies are `react-dom`, `aphrodite`, `@khanacademy/mathjax-renderer` and wonder-blocks, so it is a DOM/web component, not React Native. — npm registry (queried 2026-09-26)
- GeoGebra: apps are free for non-commercial use (teachers and students). "Any use of GeoGebra for a commercial purpose is subject to and requires a special license", arranged via office@geogebra.org. Whether a use is non-commercial "depends on the use, not the user". — [GeoGebra License (search snippet; page blocked)](https://www.geogebra.org/license); ScanCode lists it as "geogebra-ncla-2022" — [LicenseDB](https://scancode-licensedb.aboutcode.org/geogebra-ncla-2022.html)
- GeoGebra offers a JavaScript Apps API and embedding examples. — [geogebra/math-apps-examples](https://github.com/geogebra/math-apps-examples), [geogebra/integration](https://github.com/geogebra/integration)

### Inferences

- (Inferred from package metadata.) Perseus cannot be dropped into Expo React Native: it depends on react-dom, jquery and aphrodite. The parts worth reusing are:
  - the **item-format ideas**, such as widgets and answer forms;
  - **`@khanacademy/kas`**, which may run in Node/Hermes because its only dependency is one package; this is untested;
  - possibly **`@khanacademy/perseus-score`** on the API. Its RN/Node purity is untested.
- (Prior knowledge, not re-verified.) Perseus "expression" answers have per-answer options that make KAS require the same form as the key: "simplified" or "factored". The "numeric-input" widget accepts forms such as proper, improper, mixed, decimal or pi, and has a "strict" / simplify setting (required, optional, enforced). This maps closely to our grade-6 fraction needs: "Kürze den Bruch" = simplified required.
- (Prior knowledge, not re-verified.) bettermarks (German, commercial) is known for step-level input and misconception-specific feedback, which it authors per exercise. IXL and Mathletics use large banks of parameterised generators. Photomath solves with its own solver engine, and its OCR front end is proprietary. None of this could be sourced here.
- (Prior knowledge, not re-verified.) Serlo (de.serlo.org, a German non-profit) has an open-source editor with exercise types (input, single/multiple choice) on GitHub under the `serlo` org. Its input checking is basic: exact string/number or simple expression match. It is a German content source (CC BY-SA), not a CAS benchmark.

### Gaps

- bettermarks, IXL, Mathletics, Brilliant and Photomath: no primary technical documentation could be fetched. Treat all claims about them as unverified.
- Serlo licence and activity could not be checked (GitHub API unavailable).
- The GeoGebra licence text itself could not be read (domain blocked). The quoted wording comes from a search snippet of that page.

## Q2. Parameterised template systems: STACK, WeBWorK, Numbas, Perseus, H5P. Randomisation, answer tests, misconception feedback

### Takeaway

STACK is the reference design for "checking by rules". It has a named library of answer tests that separate _mathematical equivalence_ (AlgEquiv) from _required form_ (FacForm, LowestTerms, Expanded, SingleFrac, EqualComAss), plus unit and numeric-precision tests. Potential response trees chain these tests to give misconception-specific feedback. That taxonomy can be copied into a TypeScript/zod schema without using Maxima.

### Cited Findings

- STACK: "An answer test is used to compare two expressions to establish whether they satisfy some mathematical criteria"; the prototype test is algebraic equivalence. — [STACK Answer tests (UAlberta mirror)](https://eclass.srv.ualberta.ca/question/type/stack/doc/doc.php/Authoring/Answer_tests.md)
- The full STACK answer-test list, by category:
  - **Equivalence:** AlgEquiv, AlgEquivNouns, SubstEquiv, CasEqual, SameType, SysEquiv.
  - **Syntactic form:** FacForm, PartFrac, SingleFrac, CompSquare, Expanded, LowestTerms.
  - **Rules-based:** EqualComAss, EqualComAssRules.
  - **Numerical:** NumRelative, NumAbsolute, NumSigFigs, NumDecPlaces, GT, GTE.
  - **Units:** Units, UnitsStrict, UnitsRelative, UnitsAbsolute.
  - **Calculus:** Diff, Int, Antidiff, AddConst.
  - **Other:** Sets, String, StringSloppy, Levenshtein, SRegExp, Equiv (reasoning by equivalence), PropLogic.

  Source: [moodle-qtype_stack doc/en/Authoring/Answer_Tests](https://github.com/maths/moodle-qtype_stack/blob/master/doc/en/Authoring/Answer_Tests/index.md)

- "Arguments to AlgEquiv are simplified." EqualComAss checks equivalence "up to commutativity and associativity"; its arguments are **not** simplified, so it "does not think that 2^2*3 and 2*2\*3 are the same". This is how STACK expresses "must be in simplified form". — [STACK answer tests (UNSW mirror)](https://moodle.telt.unsw.edu.au/question/type/stack/doc/doc.php/Authoring/Answer_tests.md)
- A potential response tree runs once the input is valid. Each node applies an answer test and branches (true/false) to feedback and score changes. Settings control Maxima's `simp` for feedback variables. — [STACK PRT docs (GitHub)](https://github.com/maths/moodle-qtype_stack/blob/master/doc/en/Authoring/Potential_response_trees.md), [UNSW mirror](https://moodle.telt.unsw.edu.au/question/type/stack/doc/doc.php/Authoring/Potential_response_trees.md)
- STACK also supports "reasoning by equivalence" (line-by-line algebra checking). — [STACK Equivalence reasoning](https://moodle.telt.unsw.edu.au/question/type/stack/doc/doc.php/CAS/Equivalence_reasoning.md)
- WeBWorK problems are authored in PG (Perl-based) and can be embedded in PreTeXt books. — [PreTeXt guide §WeBWorK problems](https://pretextbook.org/doc/guide/html/webwork-source.html)

### Inferences

- (Prior knowledge, not re-verified.) Randomisation in each system:
  - **STACK:** "question variables" in Maxima, with `rand(n)` and `rand([list])`, seeded per attempt, plus "deployed variants" that are pre-generated and teacher-checked.
  - **WeBWorK:** `random(a,b,step)` with a per-student seed. Answer checkers are `MathObjects` contexts such as `Context("Fraction")` and `Context("LimitedPolynomial")`, which enforce form (for example "reduced fraction"). Custom checkers produce misconception messages.
  - **Numbas:** JSON exam format; variables are written in JME. Marking algorithms are scripts, with per-part feedback and "adaptive marking" that uses the student's earlier answers. Licence is believed to be Apache-2.0, but this is unverified here because GitHub API access failed.
  - **H5P:** has no CAS. Its maths content types check text/number match only.
- Suggested design for LearnBuddy: define a zod `AnswerSpec` with a STACK-like `test` enum. Candidate values:
  - `numEqual{tol}` and `algEquiv`;
  - `lowestTerms`, `mixedNumber`, `factored`, `expanded`;
  - `unitsEqual{unit, tol}`, `setEqual`, `choice`.

  Add an ordered list of `misconceptions: [{match: AnswerSpec, feedbackKey}]`, which is a flattened PRT. The LLM writes the spec once; code evaluates it. This satisfies CLAUDE.md hard rules 1 and 3, because decisions come from validated structure, not word lists.

### Gaps

- STACK randomisation docs, Numbas docs and WeBWorK PG docs could not be fetched directly. Numbas and WeBWorK licence and maintenance status for 2025–2026 are unverified.
- H5P "math" content types: no source fetched.

## Q3. JS/TS packages for algebraic equivalence and "is it simplified", plus server-side options

### Takeaway

Four packages were checked:

- **Cortex Compute Engine** (MIT, released daily in 2026) is the most capable maintained JS CAS. Its package is large.
- **mathjs** (Apache-2.0) is maintained but has no reliable general equivalence check.
- **KAS** (MIT, maintained inside Perseus) and **math-expressions** (GPL-3.0 OR Apache-2.0, 3.0 alpha in 2026) use randomised numeric sampling. That is fast and good enough for school algebra.
- **nerdamer** and **algebrite** have been unmaintained since 2021.

For "simplified or reduced", every system uses form-specific structural tests, not a general "is simplified" oracle.

### Cited Findings

- npm registry data (queried 2026-09-26):

  | Package                     | Version       | Published  | Licence               | Unpacked size |
  | --------------------------- | ------------- | ---------- | --------------------- | ------------- |
  | `@cortex-js/compute-engine` | 0.136.1       | 2026-09-26 | MIT                   | ~46 MB        |
  | `mathjs`                    | 15.2.0        | 2026-04-07 | Apache-2.0            | ~9.4 MB       |
  | `nerdamer`                  | 1.1.13        | 2021-11-17 | MIT                   | —             |
  | `algebrite`                 | 1.4.0         | 2021-04-14 | MIT                   | —             |
  | `math-expressions`          | 3.0.0-alpha.1 | 2026-09-20 | GPL-3.0 OR Apache-2.0 | ~4.2 MB       |
  | `@khanacademy/kas`          | 2.2.6         | 2026-08-11 | MIT                   | ~0.9 MB       |

  Unpacked size includes all builds and is not the bundle size. — [npm registry](https://registry.npmjs.org/)

- The Compute Engine can "parse LaTeX to MathJSON, serialize MathJSON to LaTeX or MathASCII, format, simplify and evaluate MathJSON expressions", solve equations, and do symbolic and numeric computation. Licence: MIT. — [cortex-js/compute-engine](https://github.com/cortex-js/compute-engine). Its changelog documents `.isEqual()` / `isSame` for comparing expressions — [Compute Engine changelog](https://mathlive.io/compute-engine/changelog/). Bundlephobia has an entry for it — [bundlephobia](https://bundlephobia.com/package/@cortex-js/compute-engine) (size not captured).
- math-expressions works client or server side. It parses expressions and does "numerically identifying equivalent expressions". Its equality algorithm "randomly samples the two expressions in a neighborhood of the real line of the complex plane and demands approximate numeric equality most of the time"; the authors say it "is not a perfect algorithm" and may be replaced. — [Doenet/math-expressions](https://github.com/Doenet/math-expressions), [README](https://github.com/Doenet/math-expressions/blob/main/README.md)

### Inferences

- (Prior knowledge, not re-verified.)
  - **Compute Engine:** `ce.parse(latex)` yields canonical boxed expressions. `expr.isSame(other)` is structural identity; `expr.isEqual(other)` is mathematical equality, attempted symbolically and then numerically. You can parse with `{canonical: false}` to inspect the raw form the student typed, which is exactly what "is this fraction reduced / is this in simplest form" needs.
  - **mathjs:** has `simplify`, `rationalize` and `derivative`, but no robust `equals` for symbolic expressions. A common workaround is to evaluate both sides at random points, which is effectively what KAS and math-expressions do.
- Hermes/React Native: none of these packages document RN support, and there was no source for it. They are pure JS (Compute Engine has 2 dependencies, KAS 1), so they are _likely_ to run on Hermes. Risks are BigInt/`Intl`, `Decimal` performance and bundle weight. **This needs a live test in our app.** Recommended placement: run the checker **in the API (Node)** as the source of truth, and optionally mirror a light subset (numbers, fractions, KAS-style sampling) on the device for instant offline feedback.
- For grade 6–8 content, the deterministic core can be small and fully ours, extending MathLite:
  - exact rational arithmetic, including fraction lowest-terms, mixed numbers, and decimal↔fraction;
  - random-point sampling for polynomial and rational equivalence, with domain-exclusion checks;
  - structural form tests on the unsimplified parse tree.

  Compute Engine is the upgrade path for equations and functions later.

- Server-side SymPy (BSD) or Giac (GPL-3; its GPL licence would matter only if distributed) would need a Python or C++ sidecar. That contradicts "one TS API" and adds latency. It is useful only as an offline **validator** in the template-authoring pipeline, not per-answer. (Inference.)

### Gaps

- Actual minified and gzipped bundle sizes and Hermes compatibility for each package were not measured. Bundlephobia pages were not readable.
- SymPy and Giac were not researched with sources in this session.

## Q4. Math input for children on a phone: MathLive, MathQuill, custom keypads; Khan and GeoGebra keypads

### Takeaway

MathLive is MIT, actively released (0.110.0, 2026-06) and has a built-in virtual keyboard, but it is a DOM web component. In Expo it needs a WebView (native) or runs directly on web. MathQuill is effectively unmaintained on npm (2016). Khan's keypad (`@khanacademy/math-input`) is also DOM/react-dom only. For a 12-year-old, a custom native keypad that emits our own structured AST or LaTeX, as we already have, remains the most controllable option.

### Cited Findings

- `mathlive`: version 0.110.0, published 2026-06-09, MIT. `mathquill`: latest on npm is 0.10.1-a from 2016-06-13, MPL-2.0. `react-native-webview`: 14.0.1, 2026-06-20, MIT. — npm registry (queried 2026-09-26)
- MathLive provides a math field with "mobile-ready virtual keyboards" and 800+ LaTeX commands. — [mathlive (npm)](https://www.npmjs.com/package/mathlive)
- React Native math rendering without a WebView exists, for example `react-native-math-view` ("No WebView!") and `react-native-mathjax-text-svg` (Expo-installable, MathJax → SVG). — [react-native-math-view](https://github.com/ShaMan123/react-native-math-view), [react-native-mathjax-text-svg](https://github.com/oguzhankurumm/react-native-mathjax-text-svg)
- `@khanacademy/math-input` 28.0.0 has peer dependencies on `react-dom`, `aphrodite` and `@khanacademy/mathjax-renderer`. — npm registry (queried 2026-09-26)

### Inferences

- (Prior knowledge, not re-verified.) Khan's mobile keypad replaces the OS keyboard with pages of keys (numbers/operators, then fractions, exponents, radicals) and a cursor-aware tree editor. The keypad set is configured **per item** (e.g. "fractions keypad" vs "expression keypad"). GeoGebra's mobile apps similarly use their own keyboard with 123 / f(x) / ABC / symbol tabs. Lesson for us: configure the keypad per exercise, from `AnswerSpec`, and show only the keys a kid needs.
- A WebView-based MathLive costs startup time, adds keyboard/focus quirks in a `KeyboardAvoidingView`, and weakens accessibility. It does not fit hard rule 15 (form CTA pinned) as cleanly as a native keypad. (Inference.)

### Gaps

- There was no primary source on Khan's or GeoGebra's keypad design (docs not fetched).

## Q5. Figures: Mafs, JSXGraph, function-plot, GeoGebra Apps API, react-native-svg, victory-native; native vs WebView

### Takeaway

Only react-native-svg and victory-native (Skia) are native React Native. Mafs (MIT, but last release 2024-10) needs react-dom. JSXGraph (MIT or LGPL, active) and function-plot (MIT, active) are DOM libraries, so they need a WebView on native. GeoGebra needs a commercial licence for a commercial product. Our existing approach (spec → our own react-native-svg renderer) is consistent with how Khan works: Perseus renders its graphs with Mafs, driven by item data.

### Cited Findings

- npm registry (queried 2026-09-26):

  | Package            | Version | Published  | Licence                  | Peer dependencies / notes                                                                           |
  | ------------------ | ------- | ---------- | ------------------------ | --------------------------------------------------------------------------------------------------- |
  | `mafs`             | 0.21.0  | 2024-10-20 | MIT                      | react ≥18, react-dom ≥18; uses katex, @use-gesture/react                                            |
  | `jsxgraph`         | 1.13.3  | 2026-09-07 | MIT OR LGPL-3.0-or-later | —                                                                                                   |
  | `function-plot`    | 1.25.4  | 2026-04-26 | MIT                      | —                                                                                                   |
  | `victory-native`   | 42.0.1  | 2026-08-31 | MIT                      | `@shopify/react-native-skia` ≥2.6 <3, react-native-reanimated ≥3.19.1, react-native-gesture-handler |
  | `react-native-svg` | 15.15.5 | 2026-05-11 | MIT                      | —                                                                                                   |

- JSXGraph is "dual licensed under the GNU LGPL or MIT License". — [jsxgraph/jsxgraph](https://github.com/jsxgraph/jsxgraph), [LICENSE.MIT](https://github.com/jsxgraph/jsxgraph/blob/main/LICENSE.MIT)
- Perseus lists `mafs` as a runtime dependency. — npm registry
- GeoGebra commercial use requires a special licence (see Q1). — [GeoGebra License](https://www.geogebra.org/license)

### Inferences

- Recommendation (inference):
  - Keep one declarative `FigureSpec` (zod-validated) → our own react-native-svg components. This works on iOS, Android and web identically, with no WebView, and stays in our design tokens.
  - Borrow Mafs' API vocabulary (Coordinates.Cartesian, Plot.OfX, Point, Polygon, Vector, MovablePoint) as the spec shape.
  - Use victory-native only if chart needs grow; it adds Skia and Reanimated.
  - Avoid GeoGebra unless a commercial agreement is signed.
- Interactive figure answers (drag a point to (3,2), mark 3/4 on a number line) are checked by comparing the final coordinates against the spec with a tolerance. That is deterministic and instant. (Inference; this matches the Perseus interactive-graph concept.)
- Mafs' last release was 2024-10, so treat it as a design reference, not a dependency. (Inference from release date.)

### Gaps

- Whether Mafs is still maintained (repo activity) was not checked beyond the npm release date.
- GeoGebra Apps API offline or bundled terms: not readable.

## Q6. Can an LLM reliably write parameterised templates or figure specs that deterministic code validates? Published experience

### Takeaway

No published study was found on LLMs authoring STACK, WeBWorK or Perseus items specifically. The general pattern is established in AI research: the LLM emits a symbolic template or code, and a CAS or solver verifies it (GSM-Symbolic templates; SymCode with SymPy and self-debugging; verifier-backed problem generation). School-question generation studies rely on human review. So "LLM writes once, code validates and runs" is plausible, but it must include a generate → validate → reject/repair loop.

### Cited Findings

- GSM-Symbolic: 100 symbolic templates derived from GSM8K. Each specifies "variables, constraints, and a step-by-step solution procedure", treating numbers and names as parameters. — [ICLR 2025 paper (proceedings PDF)](https://proceedings.iclr.cc/paper_files/paper/2025/file/4e5f5e4504759e3957e3eef2a44a535e-Paper-Conference.pdf) (identified via search snippet)
- SymCode: the LLM translates a problem into SymPy code that a CAS executes, with a self-debugging loop. — [arXiv 2510.25975](https://arxiv.org/html/2510.25975)
- Verifier-backed generation, e.g. SymPy-backed hard verifiers for integrals enabling systematic variations. — [arXiv 2605.06660](https://arxiv.org/html/2605.06660)
- CHASE generates problems with LLMs by decomposing generation into "independently verifiable sub-tasks". — [OpenReview](https://openreview.net/forum?id=2VhFZPYqjE)
- School-level question generation with GPT-4 Turbo, Llama and Gemini Pro was evaluated by humans. Few-shot (eight-shot) prompting improved alignment. — [ScienceDirect 2025](https://www.sciencedirect.com/science/article/pii/S2666920X25000104)
- Question-generation pipelines with independent expert verification: in one, three experts checked each item single-blind — [arXiv 2505.06591](https://arxiv.org/html/2505.06591v1). In QUEST-AI, an ensemble of LLMs flagged incorrect items before correction — [medRxiv](https://www.medrxiv.org/content/10.1101/2023.04.25.23288588.full.pdf).

### Inferences

- Deterministic validation steps LearnBuddy can run on every LLM-authored template (inference):
  1. zod schema check.
  2. Instantiate N (e.g. 50) seeds.
  3. For each seed, compute the answer **by code from the template formula**, not from an LLM string, and check the constraints: integer results, denominators ≤ 12, no division by zero, answer is not trivial.
  4. Check that the distractor and misconception answers differ from the correct one under the answer test.
  5. Render the FigureSpec and check geometric consistency (e.g. the labelled side length matches the coordinates).
  6. Reject on failure and repair with the error message, at most k tries.

  This keeps the model in "interprets and plans" and code in "enforces" (CLAUDE.md rule 1).

- Accuracy numbers for LLM-authored school maths templates after such validation are not published. We would need our own measurement (e.g. % templates passing validation first try, and % flagged by a human spot check).

### Gaps

- There was no source for LLM-generated STACK, WeBWorK or Perseus items, and no EDM/AIED paper found with symbolic verification of school items in this session's searches.

## Q7. Diagram labelling: app patterns, open formats, LLM localisation vs learner-drawn regions

### Takeaway

The standard pattern is to store regions or drop zones plus labels as structured data, then check drops or taps geometrically. QTI 3 standardises this as `hotspotInteraction` and `graphicGapMatchInteraction`; H5P has Drag and Drop, Image Hotspots and Find the Hotspot; Anki uses learner-drawn occlusion masks. Gemini returns approximate, non-deterministic boxes, reported as roughly YOLOv3-level on COCO for 2.5 Pro. That is fine for _proposing_ zones for a learner or parent to confirm, but not for silently deciding correctness.

### Cited Findings

- QTI GraphicGapMatchInteraction: the first set of choices is text or images, the second set are gaps within a background image, typically done by drag and drop. HotspotInteraction in QTI 3 can include img, picture or object and binds to an identifier response (single or multiple cardinality). — [QTI v3 Best Practices](https://www.imsglobal.org/spec/qti/v3p0/impl), [QTI 2.2 Implementation Guide](https://www.imsglobal.org/question/qtiv2p2/imsqti_v2p2_impl.html)
- Learnosity converts QTI 2.1 items, including HotspotInteraction and GraphicGapMatchInteraction, to and from its JSON. Open-source QTI renderers exist, e.g. Citolab qti-components and OAT qti-sdk. — [learnosity-qti](https://github.com/Learnosity/learnosity-qti), [Citolab issue #213](https://github.com/Citolab/qti-components/issues/213), [oat-sa/qti-sdk](https://github.com/oat-sa/qti-sdk/blob/master/src/qtism/data/content/interactions/HotspotInteraction.php)
- Gemini bounding boxes are `[y_min, x_min, y_max, x_max]`, "normalized from 0 to 1000", with the origin at top-left. Guidance: use `response_mime_type="application/json"` with a `response_schema`, and scale back to pixels. — [google/skills bounding_box.md](https://github.com/google/skills/blob/main/skills/cloud/gemini-api/references/bounding_box.md) (the fetch summary named "gemini-3.8-flash" as the example model; treat that model name as unconfirmed); [Gemini image understanding docs](https://ai.google.dev/gemini-api/docs/image-understanding) (blocked, snippet only)
- One benchmark (blog): "Gemini 2.5 Pro is a decent object detector, matching YOLOv3 from 2018 on MS-COCO val", and Gemini 3 Pro Preview improved mAP 0.34 → 0.41. The Prompt2Box README warns boxes "are approximate and won't be pixel-tight" and are "non-deterministic". — [SimEdw blog (snippet; page blocked)](https://simedw.com/2025/07/10/gemini-bounding-boxes/), [Prompt2Box](https://github.com/hebula-labs/Prompt2Box)

### Inferences

- (Prior knowledge, not re-verified.)
  - **H5P:** content is JSON (`content.json` plus `h5p.json`). Drag and Drop stores drop zones as x/y/width/height percentages, with correct elements per zone. Image Hotspots is display-only (info popups). Find the Hotspot stores rectangles or ellipses as percentages. H5P core is MIT, but the content types are not RN-native.
  - **Anki Image Occlusion:** built into Anki since 23.10. The user draws rectangles, ellipses or polygons over an image; each mask becomes a card ("hide one, guess one" / "hide all, guess one").
  - **Quizlet Diagrams:** the creator places pins on an image and learners match terms to pins.
- For the reference user (cell parts, rivers on a map), recommended flow (inference):
  - **(a) Worksheet photo:** Gemini proposes label anchors or boxes, normalised 0–1000 and zod-validated. The learner or adult sees the proposed dots and can fix them by drag, or add missing ones by tap (Anki style). Only confirmed zones are stored, as percentages.
  - **(b) Practice:** tap-the-zone or drag-label-to-pin. Correctness is a point-in-region test in code: instant, free and deterministic.
  - **(c)** Model the stored data on QTI graphicGapMatch/hotspot semantics (zones with an identifier and shape/coords; labels with identifiers; a correct mapping), so export stays possible.

  This follows CLAUDE.md rule 5 (never claim what isn't proven): model-detected positions are "prepared", learner-confirmed ones are "confirmed".

- Small targets such as organelles in a hand-drawn worksheet cell are the hardest case for Gemini boxes, given the reported COCO-level accuracy. Expect misplacements, and do not auto-grade from unconfirmed boxes. (Inference.)

### Gaps

- There was no accuracy report specific to worksheet or diagram label localisation, nor for Gemini 2.5 Flash as opposed to Pro.
- Kahoot's diagram/pin question format was not researched (no source).
- H5P JSON schemas and the Anki occlusion format were not fetched this session.
