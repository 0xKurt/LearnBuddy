# LLM quality per euro for LearnBuddy tasks (as of 26 Sep 2026)

**How reliable these notes are:** the egress proxy blocked direct fetches of artificialanalysis.ai, ai.google.dev, blog.google and vellum.ai (tested 2026-09-26). So **every number below comes from a search-engine snippet** of the linked page (label [S]), not from a full read of the page. Items labelled [I] are my own inference. Nothing here counts as [F] (verified from a full source). Prices are in USD per 1M tokens as published; convert to EUR at the current rate. The Artificial Analysis (AA) Intelligence Index has had several versions, so scores taken at different dates cannot be compared (see the conflicts in Q1).

## Q1: Price/quality frontier, speed and latency (AA, LMArena, OpenRouter, Vellum)

### Takeaway

There are four Gemini tiers in the EU: 3.1 Flash-Lite at $0.25/$1.50, 3.5 Flash-Lite at $0.30/$2.50, 3.8 Flash at $0.75/$3.75 (promotional price until 31 Dec 2026), and 3.6 Flash at $1.50/$7.50. At its promotional price, 3.8 Flash is both the smartest and the cheapest Flash model and has the fastest output AA has measured. Of the other providers' cheap models, only GPT-5.4 nano ($0.20/$1.25) and Mistral Small 4 ($0.15/$0.60) cost less than Flash-Lite. Claude Haiku 4.5 ($1/$5) and GPT-5.4 mini ($0.75/$4.50) cost as much as Flash or more. With thinking enabled, Flash-Lite has a long time to first token (6–12 s), so it can only meet a < 1 s target with thinking at minimal or off.

### Cited Findings

- Gemini 3.8 Flash was released 2 Sep 2026, Google's third Flash release in six weeks [S] — [9to5Google](https://9to5google.com/2026/09/02/gemini-3-8-flash-launch/); [Google blog](https://blog.google/innovation-and-ai/models-and-research/gemini-models/3-8-flash-and-3-8-flash-cyber/)
- 3.8 Flash scores ~59 on the AA Intelligence Index (high effort) at ~305 output tok/s, "the fastest output speed [AA] has measured". Price: $0.75 input / $3.75 output until 31 Dec 2026, then $1.50/$7.50 [S] — [AA 3.8 Flash release page](https://artificialanalysis.ai/models/releases/gemini-3-8-flash); [DataCamp](https://www.datacamp.com/blog/gemini-3-8-flash-cyber); [Vellum](https://www.vellum.ai/blog/gemini-3-8-flash-benchmarks-explained)
- 3.8 Flash headline scores are agentic and coding: DeepSWE v1.1 73.7%, Terminal-Bench 2.1 89.4% (another snippet says 90.8%, up from 81.6% for 3.7 Flash) [S, the two snippets disagree] — [Vellum](https://www.vellum.ai/blog/gemini-3-8-flash-benchmarks-explained); [llm-stats](https://llm-stats.com/models/gemini-3.8-flash)
- Gemini 3.6 Flash costs $1.50/$7.50 (3.5 Flash was $1.50/$9.00) and scores 50 on AA, the same as 3.5 Flash. 3.5 Flash-Lite costs $0.30/$2.50 and scores 36 on AA, up 11 points from 3.1 Flash-Lite (25). AA says both new models "halve time per task" [S] — [AA article](https://artificialanalysis.ai/articles/gemini-3-6-flash-3-5-flash-lite-halving-time); [AA on X](https://x.com/ArtificialAnlys/status/2079596244339707956)
- Gemini 3.5 Flash scored 55 on AA in its launch article (+9 over Gemini 3 Flash), >280 tok/s, and cost $1,552 to run the index, 5.5× Gemini 3 Flash and 75% more than Gemini 3.1 Pro, because it uses many tokens [S] — [AA 3.5 Flash article](https://artificialanalysis.ai/articles/gemini-3-5-flash-everything-you-need-to-know)
  - **Conflict:** 3.5 Flash is 55 in the launch article but 50 in the 3.6 Flash article. 3.1 Flash-Lite is 34 at launch ([AA on X](https://x.com/ArtificialAnlys/status/2028882198456352852)), 25 in the 3.6 article, and 16 on the current model page ([AA](https://artificialanalysis.ai/models/gemini-3-1-flash-lite-preview)). [I] The index was probably re-based between versions. Only compare models scored by the same version.
- Gemini 3.1 Flash-Lite on Vertex: $0.25/$1.50, 1M context, 65k output [S] — [Requesty](https://www.requesty.ai/models/vertex/gemini-3.1-flash-lite). AA measures 292.5 tok/s and a **TTFT of 5.80 s** (reasoning mode; peer median 2.20 s) [S] — [AA](https://artificialanalysis.ai/models/gemini-3-1-flash-lite-preview). Google says it has 2.5× faster time-to-first-answer-token than 2.5 Flash and 45% higher output speed [S] — [Google blog](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-flash-lite/)
- Gemini 3.5 Flash-Lite: 351 tok/s on Google's API (another snippet says 489.9 tok/s, 2nd of 152 models) but a **TTFT of 8.4–11.7 s** with thinking time included. One reviewer calls the long wait "a contradiction" for latency-sensitive use [S] — [AA providers](https://artificialanalysis.ai/models/gemini-3-5-flash-lite/providers); [BuildFastWithAI](https://www.buildfastwithai.com/blogs/gemini-3-5-flash-lite-review-price-benchmarks)
- Other providers' prices: Claude Haiku 4.5 $1/$5, Sonnet 5 $2/$10, Opus 5 $5/$25; GPT-5.4 mini $0.75/$4.50, GPT-5.4 nano $0.20/$1.25, GPT-5.5 $5/$30 [S] — [CloudZero Claude pricing](https://www.cloudzero.com/blog/claude-pricing/); [BenchLM OpenAI pricing](https://benchlm.ai/openai/api-pricing); [finout](https://www.finout.io/blog/openai-vs-anthropic-api-pricing-comparison)
- Mistral prices: Medium 3.5 $1.50/$7.50 (EU-hosted, open weights under a modified MIT licence), Large 3 $0.50/$1.50, Small 4 $0.15/$0.60 (released 16 Mar 2026; multimodal and reasoning). Medium 3.5 is reported at AA 14 and GPQA 74.8% [S; the AA 14 looks implausibly low next to that GPQA score and is probably a different index version or variant] — [BenchLM Mistral](https://benchlm.ai/mistral/api-pricing); [OpenRouter Small 4](https://openrouter.ai/mistralai/mistral-small-2603); [AA Medium 3.5](https://artificialanalysis.ai/models/mistral-medium-3-5)
- One comparison blog rates Haiku 4.5 "the most accurate on ... tool calling, structured output, code" in the cheap tier and Gemini Flash the cheapest and fastest [S, blog opinion] — [tech-insider](https://tech-insider.org/claude-haiku-vs-gemini-flash-vs-gpt-5-4-mini-2026/)
- Gemini 2.5 Flash retires on Vertex on 16 Oct 2026 (the release notes say 16 Oct, the lifecycle page says 20 Oct; the date was originally June 2026). Google recommends **Gemini 3.6 Flash** as the replacement [S] — [benchr](https://benchr.org/deprecations/gemini-2-5-pro); [Vorp Labs](https://vorplabs.com/models/google-model-retirements); [Vertex release notes](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes)

### Inferences

- [I] **Migration is urgent.** 2.5 Flash is about three weeks from retirement. For task (b), 3.8 Flash at $0.75/$3.75 beats 3.6 Flash on price and quality until the end of the year. Plan the budget at $1.50/$7.50 from Jan 2027, when it costs the same as 3.6 Flash.
- [I] The AA scores for Flash-Lite are with reasoning on. For tasks (c) and (b) the thinking level decides latency: TTFT of 6–12 s with thinking vs. sub-second without. So set thinking to minimal or off for (c) and to low for (b), and measure p50/p95 in the EU region. AA's numbers come from the global endpoint, not the EU multi-region one.
- [I] 3.5 Flash showed that high-effort Flash models can cost more per task than Pro because they use many tokens. Budget by cost per task, measured on our own prompts, not by list price.
- [I] Haiku 4.5 and GPT-5.4 mini cost about 1.3–1.5× 3.8 Flash's promotional price, and their EU availability on Vertex/Bedrock/Azure needs checking. I found no evidence that they are better at German or at teaching. Mistral Small 4 is the cheapest EU-native fallback, but no education or German evals turned up.

### Gaps

- Exact AA TTFT and output speed for 3.8 Flash and 3.6 Flash at low or minimal thinking, and for the Vertex EU multi-region: not found.
- LMArena overall and German rankings, and OpenRouter usage rankings for Sep 2026: not retrieved (no fetch access, snippets did not cover them).
- Whether 3.8 Flash and 3.5 Flash-Lite are GA in the Vertex EU multi-region (vs. global only): not verified.
- Current prices and scores for Qwen3.x, Llama 4, DeepSeek V4 and gpt-oss: only mentioned in passing (Qwen3.7 Max leads MMLU-ProX, see Q2). None of them is on Vertex EU as a managed Google model, so they are less relevant to us.

## Q2: German and French quality

### Takeaway

I found no German-specific leaderboard covering the current Flash-tier models. Public multilingual boards (MMLU-ProX, MMMLU) are topped by frontier models (Qwen3.7 Max, GPT-5.4, Claude Opus 4.6). We will need our own German evals.

### Cited Findings

- MMLU-ProX covers 29 languages including German and French, with 11,829 identical questions per language, so languages can be compared directly [S] — [MMLU-ProX](https://mmluprox.github.io/); [arXiv 2503.10497](https://arxiv.org/pdf/2503.10497)
- BenchLM's Sep 2026 multilingual table: Qwen3.7 Max first on MMLU-ProX, GPT-5.4 second, Claude Opus 4.6 third (strong on MGSM) [S, aggregator] — [BenchLM multilingual](https://benchlm.ai/multilingual)
- The llm-stats Multilingual MMLU board (updated Aug 2026) lists only 5 models, led by o3-mini (0.807), so it is too thin to use [S] — [llm-stats](https://llm-stats.com/benchmarks/multilingual-mmlu)

### Inferences

- [I] Gemini models have historically done well on German. But "child-appropriate German at grade 6 level" (simple syntax, du-form, no anglicisms) is not measured by any public benchmark. Build a small internal eval: about 50 Buddy turns and 50 hints, rated by a German-speaking adult, across the candidate models.

### Gaps

- German scores for Gemini 3.5/3.6/3.8 Flash, Flash-Lite, Haiku and GPT-5.4 mini on MMLU-ProX-de, Global-MMLU or INCLUDE: not found.
- German-specific leaderboards (e.g. a German LLM arena): not found in this pass.

## Q3: OCR of documents and handwriting

### Takeaway

On handwriting, even the best model (Gemini 3.1 Pro, 71.85% on WildHandBench) is below the human baseline (77.09%). Flash-Lite is usable for printed pages. For task (a), which runs once per worksheet, a Flash or Pro model is worth its price.

### Cited Findings

- WildHandBench (arXiv 2608.22959, Aug 2026) has 500 handwritten documents (free text, tables, formulas) in 4 languages. Gemini 3.1 Pro leads every category at 71.85% overall; humans score 77.09%. Claude Opus 4.8 and Gemini 3.5 Flash were also evaluated (their scores were not in the snippet) [S] — [arXiv](https://arxiv.org/abs/2608.22959)
- socOCRbench added Gemini 3.1 Flash-Lite in Mar 2026 at 0.6546, against olmOCR-2 at 0.3678 (re-run with the correct prompt) [S] — [socOCRbench](https://noahdasanaike.github.io/posts/sococrbench.html)
- OmniDocBench (CVPR 2025) evaluates Gemini 3 Flash and Pro on document parsing [S] — [OmniDocBench](https://github.com/opendatalab/OmniDocBench)
- A paper on grading handwritten exam answers with foundation models exists (arXiv 2606.11477); its results were not in the snippet — [arXiv](https://arxiv.org/pdf/2606.11477)

### Inferences

- [I] Task (a) runs about once per worksheet, so even 3.6 or 3.8 Flash at high thinking costs only cents per page. A realistic pattern: run Flash on every page, and send pages with handwriting or low confidence (e.g. illegible spans the model flags in its schema) to Gemini 3.1 Pro. Children's handwriting is harder than WildHandBench's adult handwriting.

### Gaps

- olmOCR-Bench and OCRBench v2 scores for 3.5/3.8 Flash and Haiku: not found.
- A German children's-handwriting benchmark: none found.

## Q4: Structured output and tool-calling reliability

### Takeaway

BFCL v4 (Apr 2026) now weights agentic and multi-turn use at 70%. The gap between the best closed and open models is 3–4 points. The snippets did not include Flash or Haiku scores.

### Cited Findings

- BFCL v4 weights: agentic 40%, multi-turn 30%, live 10%, non-live 10%, hallucination 10%. The Sep 2026 board has 22 models, led by BTL-3 (88.5%) and Qwen3.7 Max (75.0%) [S] — [llm-stats BFCL v4](https://llm-stats.com/benchmarks/bfcl-v4); [BenchLM](https://benchlm.ai/benchmarks/bfcl-v4); [Gorilla leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html)
- The Spheron guide says open-weight models are within 3–4 points of closed ones on BFCL v4 overall [S, vendor blog] — [Spheron](https://www.spheron.network/blog/tool-calling-benchmarks-bfcl-tau-bench-latency-optimization/)
- 3.8 Flash's strongest gains are on agentic benchmarks, where it "edges frontier models that cost six to seven times more" [S] — [Vellum](https://www.vellum.ai/blog/gemini-3-8-flash-benchmarks-explained)

### Inferences

- [I] LearnBuddy validates the model's output with zod and resolves aliases on the server (CLAUDE.md rules 2–3), so failures show up as validation errors, not silent mistakes. Measure the zod-reject rate per model on the real Buddy schema; it is the metric that matters. Gemini's constrained decoding (`responseSchema`) removes most syntax errors, leaving semantic mistakes (wrong alias, wrong tool).

### Gaps

- BFCL v4 and tau-bench scores for 3.5 Flash-Lite, 3.8 Flash, Haiku 4.5 and GPT-5.4 mini/nano: not found in snippets.

## Q5: Education-specific evals (tutoring, not giving answers away)

### Takeaway

Solving ability and teaching ability are only weakly correlated (r = 0.42 on MathTutorBench). A strong solver is not automatically a good Socratic tutor, so prompts and our own evals for "don't reveal the answer" matter more than which model we pick.

### Cited Findings

- On MathTutorBench (EMNLP 2025), LearnLM-1.5-Pro was the most balanced model (solving 0.94, scaffolding 0.64–0.66) and the only one that stayed consistent across difficulty levels [S] — [arXiv 2502.18940](https://arxiv.org/pdf/2502.18940); [GitHub](https://github.com/eth-lre/mathtutorbench)
- Across 8 public MathTutorBench models, the solving and pedagogy composites correlate at only 0.421 [S] — [arXiv 2606.16206 "Measuring Whether LLM Tutors Teach or Solve"](https://arxiv.org/abs/2606.16206)
- The Pedagogy Benchmark (FabInc, arXiv 2506.18710) uses 920 multiple-choice questions from teacher exams. On its SEND variant, Gemini 2.5 Pro scored 86%, Claude Opus 4 Thinking 84%, and o3 and GPT-5 82%. Models with reasoning scored higher [S] — [arXiv 2506.18710](https://arxiv.org/pdf/2506.18710); [Jisc](https://nationalcentreforai.jiscinvolve.org/wp/2025/08/07/how-to-choose-the-right-models-llms-in-education-explained/)
- In the LearnLM report "Evaluating Gemini in an Arena for Learning", Gemini 2.5 Pro was compared with Claude 3.7 Sonnet, GPT-4o and o3 [S] — [Jisc](https://nationalcentreforai.jiscinvolve.org/wp/2025/08/07/how-to-choose-the-right-models-llms-in-education-explained/)
- Newer work: "Auditable Release Control for Pedagogical Leakage in LLM Tutors" (arXiv 2608.00515), TeachBench (2601.21375), KMP-Bench (2603.02775), L2-Bench for second-language teaching (2607.08842). Only titles were available, no results — [2608.00515](https://arxiv.org/pdf/2608.00515); [2601.21375](https://arxiv.org/pdf/2601.21375); [2603.02775](https://arxiv.org/pdf/2603.02775); [2607.08842](https://arxiv.org/pdf/2607.08842)

### Inferences

- [I] The answer leak in task (c) is best handled with the architecture, following CLAUDE.md rule 1 (code enforces). The judge model gets the key, but the hint text is produced by a call that doesn't see the full solution, or code checks the hint for overlap with the solution before it is shown. arXiv 2608.00515 seems to take a similar "release control" approach [title only].
- [I] The pedagogy evals are dominated by Pro and frontier models. There is no published evidence that Flash-Lite tutors well. Test it internally before relying on it for (c) and (e).

### Gaps

- Pedagogy scores for current Flash, Flash-Lite, Haiku and mini models: none found. Anthropic and OpenAI education reports: not retrieved in this pass.

## Q6: School-level maths (grades 5–10)

### Takeaway

Grade 5–10 maths is far below the level where current benchmarks separate models (GSM8K and MGSM are saturated). All current Flash-tier models should be enough if thinking is on. The real risks are arithmetic slips inside generated problems and wrong answer keys, and code can catch those.

### Cited Findings

- On MathTutorBench, the best models' problem-solving accuracy is around 0.94 [S] — [arXiv 2502.18940](https://arxiv.org/pdf/2502.18940)
- Claude Opus 4.6 is strong on MGSM, the multilingual grade-school maths benchmark [S] — [BenchLM multilingual](https://benchlm.ai/multilingual)

### Inferences

- [I] For task (d), generate parameterised problems and have code (or a CAS) compute the answer key, rather than trusting the model's arithmetic. Then even Flash-Lite at low thinking is enough for templating, and 3.8 Flash handles worked solutions.

### Gaps

- MATH/AIME scores for 3.5 Flash-Lite, 3.8 Flash and GPT-5.4 nano, and any German school-maths eval: not found.

## Q7: Routing, cascades and caching

### Takeaway

Published cascades save 30–85% at 95%+ of quality. Savings are largest when most traffic is easy, as with LearnBuddy's short tutor turns. Self-reported model confidence is poorly calibrated, so escalation needs a calibrated signal or a hard rule.

### Cited Findings

- UCCI (arXiv 2605.18796, May 2026) cut inference cost by 31% at micro-F1 0.91 on 75k production NER queries, beating entropy, conformal and FrugalGPT baselines, using an isotonic calibration of token margins [S] — [arXiv](https://arxiv.org/html/2605.18796)
- Cluster, Route, Escalate (arXiv 2606.27457, Jun 2026) keeps easy queries on a cheap model and escalates when a quality estimator flags weak answers. Savings grow with how skewed traffic is toward easy queries [S] — [arXiv](https://arxiv.org/pdf/2606.27457)
- Reported figures: RouteLLM cut cost 85% on MT-Bench at 95% of GPT-4 quality; FrugalGPT up to 98%; routing generally 45–85% [S, secondary blog] — [TianPan](https://tianpan.co/blog/2025-11-03-llm-routing-model-cascades)
- "LLM self-reported confidence is poorly calibrated" [S] — [TianPan](https://tianpan.co/blog/2025-11-03-llm-routing-model-cascades); "Cost-Saving LLM Cascades with Early Abstention" (arXiv 2502.09054) — [arXiv](https://arxiv.org/pdf/2502.09054)

### Inferences (per-task proposal, all [I], to validate with internal evals)

- **(a) Worksheet to exercises:** 3.8 Flash at medium/high thinking, with escalation to 3.1 Pro (the WildHandBench leader) for handwriting-heavy pages or zod/consistency failures. Latency doesn't matter much here.
- **(b) Buddy:** 3.8 Flash at low thinking with `responseSchema`; cache the system prompt, tool schemas and learner context. After Jan 2027, compare it against 3.6 Flash and 3.5 Flash-Lite at the same prices.
- **(c) Tutor judge and hint:** 3.1 or 3.5 Flash-Lite with thinking off or minimal. If a comparison against the key is exact or normalised, code decides without a model. Escalate to Flash only when the judge is unsure (use a structured `verdict: unsure` field rather than a self-rated confidence number).
- **(d) Maths:** code generates parameters and computes answers; Flash-Lite writes the problem text; Flash writes worked solutions.
- **(e) Explanations:** 3.8 Flash; pre-generate and cache per topic and grade, since the same topic recurs across learners.
- Escalation signals: zod rejection, a structured "unsure" verdict, disagreement between two cheap calls. Not the model's self-rated confidence.

### Gaps

- Context-caching prices and minimum sizes for the 3.x Flash models on Vertex: not verified (the pricing page was blocked).
- No published cascade study for education or tutoring was found.
