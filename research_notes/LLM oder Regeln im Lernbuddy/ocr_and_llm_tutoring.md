# Worksheet photo reading (OCR vs multimodal LLM) and LLM tutoring best practices: speed, cost, pedagogy

Research date: 2026-09-26. **Verification note:** the egress proxy blocked most primary sources (pnas.org, nature.com, arxiv.org, docs.cloud.google.com, ai.google.dev, blog.khanacademy.org, pact.cs.cmu.edu, pmc.ncbi.nlm.nih.gov, cloudzero.com). Most "Cited Findings" below come from **search-result extracts of the named source page**, not a full read of it. They are cited to that page's URL, but numbers should be spot-checked before they go into an ADR. Where I relied on a third-party aggregator rather than the primary publisher, I say so. Everything in "Inferences" is my reasoning, not sourced.

## A1) Worksheet reading: multimodal LLM vs classic OCR (accuracy, cost, latency)

### Takeaway

In 2025–26 benchmarks, frontier multimodal LLMs are at or near the top for _handwriting_. Classic OCR (Cloud Vision at about $1.50 per 1,000 pages) is cheap, but it only returns text and boxes. LearnBuddy would still need an LLM call to turn that text into items, so OCR does not remove the LLM step. On-device ML Kit handles printed Latin/German text well, but its handwriting support is weak. Keep one Gemini multimodal call. Speed it up by streaming items and by using a cheaper tier. Do not add an OCR stage.

### Cited Findings

- On olmOCR-Bench, Gemini 3 Flash scored 77.5% overall: 99.8% on base documents, 88.2% tiny text, 75.9% tables, 73.7% multi-column, 66.5% arXiv math, 46.0% old scans. The benchmark has splits for handwriting, tiny text, math, multi-column and old scans. — [Falcon Perception paper, arXiv 2603.27365](https://arxiv.org/pdf/2603.27365) (via search extract)
- In AIMultiple's OCR benchmark, GPT-5 was strongest on handwriting, "closely followed by olmOCR-2-7B and Gemini 2.5 Pro". — [AIMultiple OCR accuracy benchmark](https://aimultiple.com/ocr-accuracy) (aggregator/vendor benchmark; methodology not reviewed)
- Newer handwriting-specific benchmarks exist and report that MLLMs still struggle on in-the-wild handwriting: WildHandBench (2026) and a 2026 handwritten-forms digitisation benchmark. — [WildHandBench arXiv 2608.22959](https://arxiv.org/pdf/2608.22959); [Handwritten forms benchmark arXiv 2604.16504](https://arxiv.org/pdf/2604.16504) (titles/abstract only; numbers not retrieved)
- OmniDocBench (CVPR 2025) is the main document-parsing benchmark comparing pipeline OCR and VLMs. — [OmniDocBench GitHub](https://github.com/opendatalab/OmniDocBench) (not fetched in detail)
- Pricing for Google Cloud Vision DOCUMENT_TEXT_DETECTION: $1.50 per 1,000 units after the first 1,000 free each month, and $1.00 per 1,000 above 5M. Handwriting uses the same feature and returns page/block/paragraph/word/character boxes. — [Build MVP Fast summary of Cloud Vision pricing](https://www.buildmvpfast.com/alternatives/google-vision); [Cloud Vision handwriting docs](https://docs.cloud.google.com/vision/docs/handwriting) (search extract)
- Azure Document Intelligence supports handwriting in 9 languages, German among them. Google Vision is said to cover 50+ handwriting languages. — [imagetotable.ai cloud OCR comparison 2026](https://imagetotable.ai/blog/google-vs-aws-vs-azure-ocr-2026) (aggregator)
- On-device, ML Kit Text Recognition v2 recognises Latin script, including German. According to secondary write-ups, handwriting and broader language support need the cloud API. — [ML Kit Text Recognition v2](https://developers.google.com/ml-kit/vision/text-recognition/v2); [ML Kit supported languages](https://developers.google.com/ml-kit/vision/text-recognition/v2/languages) (handwriting limitation from secondary blog snippets, not confirmed on Google's page)
- Gemini 2.5 Flash-Lite (non-reasoning) has TTFT of about 0.30 s and about 301 output tokens/s on Google's API, per Artificial Analysis. — [Artificial Analysis: Gemini 2.5 Flash-Lite providers](https://artificialanalysis.ai/models/gemini-2-5-flash-lite/providers)

### Inferences

- Cost per page, rough estimate: a phone photo is about 1–2k image tokens in Gemini, plus about 500–1,500 output tokens of items. On 2.5 Flash-class pricing that comes to a fraction of a cent per page. Cloud Vision at $0.0015/page is similar or more expensive **and** still needs the LLM structuring call afterwards. So for LearnBuddy, OCR+LLM is **not** cheaper than one multimodal call. It adds a network hop, plus an extra processor under GDPR.
- Doing OCR on-device before the LLM call could save roughly 0.3–1 s of image upload and image-token cost. It has three weaknesses:
  - handwriting (student answers, teacher notes) degrades;
  - layout and structure (gaps, tables, numbering, math) are lost;
  - Expo needs a native module (ML Kit / Apple Vision), so an extra build dependency.

  It is only worth it as an **instant preview** ("Ich sehe 8 Aufgaben …") shown while the cloud call runs, not as the source of truth.

- The biggest latency win for 2.5–6 s: **stream the item list** (for example one JSON object per item, NDJSON-style) so the first item shows in about 1 s. Also downscale and compress the image client-side (about 1,500 px on the long side) before upload.
- Benchmarks are English-heavy. I found **no German school-worksheet or German children's handwriting benchmark**. LearnBuddy needs its own small eval set of about 30–50 real photos to decide between Flash-Lite and Flash.

### Gaps

- No Tesseract/PaddleOCR/Apple Vision numbers for German handwriting were retrieved. No OCRBench v2 scores were retrieved (the primary pages were blocked).
- No verified per-page cost for GPT-4o-mini or Claude Haiku image input. I did not research them because the model stack is Gemini.
- Apple Vision (VNRecognizeTextRequest) German handwriting accuracy: no source found.

## A2) Current Gemini pricing, model lifecycle, caching and latency (2025–2026)

### Takeaway

**Urgent:** secondary sources report that Gemini 2.5 Flash and 2.5 Flash-Lite on Vertex retire **no earlier than 16 Oct 2026**, about three weeks from now. The successor models (3.x Flash / Flash-Lite) cost more. Implicit caching gives about a 90% discount on Vertex for repeated prefixes of at least 1,024 tokens. However, Vertex's zero-data-retention setup requires turning off in-memory caching, and that probably also removes implicit caching.

### Cited Findings

- Gemini 2.5 Flash-Lite costs $0.10 input / $0.40 output per 1M tokens. Cached input is 10% of the input price. It "retires October 16, 2026, after which the floor is Gemini 3.1 Flash-Lite at $0.25/$1.50". — [CloudZero Gemini pricing 2026](https://www.cloudzero.com/blog/gemini-pricing/) (aggregator; search extract only)
- On Vertex, Gemini 2.5 Flash will be discontinued "no earlier than October 16, 2026". It was originally set for June 2026. The final date follows Gemini 3 GA, with at least six months' notice. On the Gemini Enterprise Agent Platform the date is given as 20 Oct 2026. — [benchr deprecations](https://benchr.org/deprecations/gemini-2-5-pro); [Vorp Labs model retirements](https://vorplabs.com/models/google-model-retirements); [Vertex AI release notes](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes) (the primary page was not fetchable, so treat the exact date as **unverified**)
- Gemini 3.1 Flash-Lite costs $0.25 / $1.50 per 1M tokens and is described as a "stable, long-term model" for low-cost high-volume tasks. — [devtk.ai](https://devtk.ai/en/models/gemini-3-1-flash-lite/); [OpenRouter Gemini 3.1 Flash Lite](https://openrouter.ai/google/gemini-3.1-flash-lite)
- Gemini 3 Flash Preview costs $0.50 / $3.00 per 1M tokens and has thinking levels minimal/low/medium/high. — [OpenRouter Gemini 3 Flash Preview](https://openrouter.ai/google/gemini-3-flash-preview)
- Newer 3.5–3.8 Flash models exist. One aggregator lists Gemini 3.5 Flash on Vertex/Agent Platform at $1.50 / $9.00. Another quotes 3.6–3.8 Flash at an introductory $0.75 / $3.75 until 31 Dec 2026, then $1.50 / $7.50. It also says EU data residency covers 3.5–3.8 Flash in europe-west4. — [BenchLM / pricepertoken search extracts](https://benchlm.ai/google/api-pricing); [Requesty gemini-3.5-flash-eu](https://www.requesty.ai/models/vertex/gemini-3.5-flash-eu) (**conflicting and unverified**; check the [Agent Platform pricing page](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing) directly)
- Implicit caching applies to Gemini 2.5. The minimum request size was reduced to 1,024 tokens for 2.5 Flash and 2,048 for 2.5 Pro. A request gets a cache hit when it shares a common prefix with an earlier one, so put stable content first and variable content last. — [Google Developers Blog: implicit caching](https://developers.googleblog.com/gemini-2-5-models-now-support-implicit-caching/)
- The discount is 75% on the Gemini Developer API (at the 2025 launch) and 90% on Vertex / Agent Platform. — [search extract of Google Developers Blog and Agent Platform context-cache overview](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/context-cache/context-cache-overview)
- Thinking tokens are billed as output tokens. This is called a common budgeting surprise. — [CloudZero Gemini pricing 2026](https://www.cloudzero.com/blog/gemini-pricing/) (title/extract)
- Gemini supports structured output via `responseMimeType: application/json` + `responseSchema`. Whether streaming works with structured output is raised as a question on Google's forum, and I found no clear doc statement either way. — [Firebase AI Logic structured output](https://firebase.google.com/docs/ai-logic/generate-structured-output); [Google AI forum thread](https://discuss.ai.google.dev/t/do-stream-responses-support-structured-output/79482)

### Inferences

- LearnBuddy's current tutor call is about $0.0004 on 2.5 Flash. Moving to 3.1 Flash-Lite ($0.25/$1.50) or 3.x Flash ($0.50/$3.00+) could raise the per-call cost by 2–6×. That is still a fraction of a cent, but the migration is forced and needs its own eval (thinking quality, latency in europe-west4). **Check the exact retirement date on the primary Vertex page now.**
- In practice, streaming structured JSON means reading the SSE stream and running an incremental JSON parser (e.g. `partial-json`, or the AI SDK's `streamObject`). Show fields such as `feedback_text` as they arrive, but only **apply** the zod-validated full object, which fits hard rule 4 (the context fence). Alternative: put the learner-facing text first as plain text and the structured verdict in a second, short non-streamed call or a tool call.
- Caching layout: system prompt + pedagogy rules + item (question, answer key, hint ladder) as a fixed prefix of at least 1,024 tokens, then the learner's attempt last. That would make most tutor calls cache hits.

### Gaps

- Official Vertex prices for Sept 2026 and the exact retirement dates could not be fetched from Google's pages. Aggregators disagree.
- No TTFT numbers specifically for europe-west4. Artificial Analysis measures global endpoints.
- No official statement found on whether disabling in-memory caching for ZDR also disables the implicit-caching discount (see B5).

## B1) Khanmigo's approach (Socratic, no answers, guardrails)

### Takeaway

Khanmigo's core rule is "never give the answer": a Socratic tutor built with prompt engineering. Khan Academy says the model "defaulted to answering" despite instructions. So they track guardrail metrics such as **answer given away before the student responded**, math error rate and turns per thread. The specific mechanisms (pre-computed answers, a calculator tool) could not be verified because their blog was blocked.

### Cited Findings

- Khan's Chief Learning Officer: "We quickly learned how to write ('engineer') the instructions … to get it to ask questions. Even with those instructions, it really defaulted to answering questions… But we got better at prompt engineering." — [Khan Academy blog: 7-step approach to prompt engineering](https://blog.khanacademy.org/khan-academys-7-step-approach-to-prompt-engineering-for-khanmigo) (search extract)
- Khan Academy tracked guardrail metrics in every test: "instances of giving the answer away before a student submitted a response, math error rates, and interactions per thread". — [Khan Academy blog: building a better AI tutor](https://blog.khanacademy.org/how-khan-academy-is-building-a-better-ai-tutor-our-most-recent-learnings/) (search extract)
- The core design principle is described as "never gives you the answer … the Socratic method, scaled through prompt engineering". — [buildmvpfast Khanmigo case study](https://www.buildmvpfast.com/blog/ai-tutoring-khanmigo-case-study-2026) (secondary)

### Inferences

- "Never give the answer" as an absolute rule is exactly the old app's failure mode ("never gave the solution after 5 tries"). The research in B2 argues for a **bounded** ladder that ends in a worked example. The better lesson from Khan is the **metric**: count "answer revealed before an attempt" and "same explanation repeated" in evals.

### Gaps

- Khanmigo's published system prompts, whether it gives the model a pre-computed answer or calculator, and when it switches to worked examples: not retrieved (blog blocked).

## B2) Hint sequences, bottom-out hints, worked examples, gaming the system

### Takeaway

The research supports a short graded hint ladder that ends in a **bottom-out hint / worked example**. Withholding the answer forever is not supported. Then give the learner a **similar new problem**, possibly with faded steps. Gaming the system (clicking through hints to get the answer) predicts lower learning as strongly as prior knowledge does, so detect fast hint-clicking and slow it down rather than refusing help.

### Cited Findings

- The assistance dilemma: withholding information can push students to work things out themselves but can cause frustration and wasted time; giving help reduces frustration but can lead to shallow learning. — Koedinger & Aleven 2007, _Educational Psychology Review_ 19:239–264, [Springer](https://link.springer.com/article/10.1007/s10648-007-9049-0) (search extract)
- In Geometry Cognitive Tutor logs, students often jumped to bottom-out hints without reading the earlier hints. This was traditionally called gaming or help abuse, but "some examples of this behavior are not abusive and bottom-out hints can act as worked examples". — [Shih, Koedinger & Scheines 2008, "A Response-Time Model for Bottom-Out Hints as Worked Examples"](http://pact.cs.cmu.edu/koedinger/pubs/Shih,%20Koedinger,%20Scheines-08.pdf) (search extract)
- Baker, Corbett, Koedinger et al. (CHI 2004): gaming the system, meaning systematically using feedback and help regularities to get answers, "was strongly associated with reduced learning". Gaming frequency correlated with post-test score about as strongly as prior knowledge and general achievement. — [ACM DL: Off-task behavior in the cognitive tutor classroom](https://dl.acm.org/doi/10.1145/985692.985741) (search extract)
- In an ASSISTments RCT, students with earlier access to on-demand progressive hints did not do better than students who only had later access or a bottom-out hint, and they took significantly more time. — [Contextual factors affecting hint utility, IJ STEM Ed 2018](https://link.springer.com/article/10.1186/s40594-018-0107-6) (search extract; the exact arm definitions should be read in the paper)
- ASSISTments runs RCTs on hints vs explanations vs video. A recent RCT compared LLM-generated hint styles (scaffolding, Socratic, teacher-style) with no-hint and teacher-authored hints. — [ASSISTments student supports](https://new.assistments.org/individual-resource/student-supports); [Evaluating Pedagogical Styles of LLM-Generated Hint Sets, Springer](https://link.springer.com/chapter/10.1007/978-3-032-29794-5_60) (results not retrieved)
- Faded worked examples: a full example, then partial examples with steps removed one by one, then independent solving. Backward fading (Renkl & Atkinson 2003) was more time-efficient with no loss of transfer. Fading addresses the expertise-reversal effect, where worked examples lose value as expertise grows. — [Wikipedia: Worked-example effect](https://en.wikipedia.org/wiki/Worked-example_effect); [Renkl et al., "How fading worked solution steps works", Instructional Science](https://link.springer.com/article/10.1023/B:TRUC.0000021815.74806.f6)
- A Barbieri et al. 2023 meta-analysis found that adding self-explanation prompts moderated worked-example effects, with a _negative_ effect compared with worked examples without prompts. — (search extract citing Barbieri et al. 2023; [Miller-Cotto 2026, BJEP](https://bpspsychub.onlinelibrary.wiley.com/doi/full/10.1111/bjep.12781) context) (**verify**; I did not read the meta-analysis)

### Inferences

- I found no single canonical "N hints before the answer". Cognitive Tutor and ASSISTments ladders are typically about 2–4 levels (point to the relevant principle, name the step, then the bottom-out). That count comes from my knowledge of those systems and is **not verified here**. A defensible LearnBuddy design:
  1. After a wrong answer: targeted feedback on the specific error (misconception feedback, if pre-generated).
  2. Next: a conceptual hint.
  3. Then: a step hint.
  4. Then: a worked solution with an explanation, then a _parallel item_ to retry.

  So at most about 3 attempts before the bottom-out. Each rung has **different content** (the rung index is stored and enforced in code, so explanations don't repeat).

- Gaming guard: fast successive hint requests (for example under 5–10 s, without an attempt) → Buddy asks for an attempt first ("Was würdest du als ersten Schritt probieren?"). Keep the bottom-out reachable. Record `revealed=true` so the item is re-scheduled rather than counted as mastered.
- "Revealed too early" and "never revealed" become code-enforced state (hard rule 1: the model picks the wording, code picks the rung).

### Gaps

- The Koedinger & Aleven full text and specific hint-count experiments were not accessible (blocked).
- I did not retrieve results for Carnegie Learning's current MATHia hint design.

## B3) Recent LLM-tutor studies: what designs worked

### Takeaway

The pattern across studies is consistent. **Unguarded GPT-4 helps during practice but lowers exam scores. A guarded tutor that is given the teacher's solution and hints is neutral or positive. The strongest effect (Harvard) came from a tutor given pre-written step-by-step solutions and a carefully engineered pedagogy prompt.** Pedagogically fine-tuned models (LearnLM) matched human tutors, with about 0.1% factual errors in the drafts.

### Cited Findings

- **Bastani et al., PNAS 2025.** Nearly 1,000 students in grades 9–11 at a Turkish high school, four 90-minute sessions, three arms:
  - GPT Base (ChatGPT-4-like);
  - GPT Tutor (teacher input; guides with hints instead of giving answers);
  - control.

  Results:
  - practice problems: +127% for GPT Tutor and +48% for GPT Base vs control;
  - exam without AI: GPT Base −17% (significant); GPT Tutor "essentially eradicated" the harm, with no significant positive effect;
  - the safeguards that mattered were "asking the AI tutor to provide teacher-designed hints instead of giving away answers".

  — [PNAS 10.1073/pnas.2422633122](https://www.pnas.org/doi/10.1073/pnas.2422633122); [Wharton summary](https://knowledge.wharton.upenn.edu/article/without-guardrails-generative-ai-can-harm-education/); a correction was published: [PNAS correction](https://www.pnas.org/doi/10.1073/pnas.2518204122) (content of the correction not retrieved)

- **Kestin et al., Scientific Reports 15:17458 (June 2025), Harvard physics RCT (Fall 2023).** Students learned significantly more in less time with the AI tutor than in an in-class active-learning session, and reported more engagement and motivation.
  - Effect size: 0.63 SD by linear regression, and 0.73–1.3 SD by quantile regression (which corrects for the ceiling effect).
  - Built on the GPT API. Conversations were "pre-vetted" with content-rich prompts, and best practices were built in through system-prompt engineering.
  - A review notes that the tutor still needed pre-written solutions and careful scaffolding to prevent errors.

  — [Scientific Reports article](https://www.nature.com/articles/s41598-025-97652-6); [Carl Hendrick review](https://carlhendrick.substack.com/p/the-algorithmic-turn-the-emerging); [ETC Journal review](https://etcjournal.com/2025/11/10/review-of-kestin-et-al-s-june-2025-harvard-study-on-ai-tutoring/)

- **LearnLM (Google).**
  - The approach is framed as "pedagogical instruction following": system instructions describe the desired pedagogy.
  - Experts preferred LearnLM over GPT-4o (+31%), Claude 3.5 Sonnet (+11%) and Gemini 1.5 Pro (+13%).
  - LearnLM was folded into Gemini 2.5 (I/O 2025).

  — [LearnLM: Improving Gemini for Learning, arXiv 2412.16429](https://arxiv.org/abs/2412.16429); [Google blog I/O 2025](https://blog.google/outreach-initiatives/education/google-gemini-learnlm-update/)

- **LearnLM × Eedi RCT (UK), Nov/Dec 2025.** 165 students in 5 UK secondary schools, on the Eedi maths platform.
  - Outcomes: LearnLM-supported tutoring was at least as good as human tutors on every outcome, and 5.5 pp more likely to solve novel problems on later topics (66.2% vs 60.7%).
  - Supervising tutors approved 76.4% of drafted messages with zero or minimal edits.
  - Only 0.1% of messages had factual errors.
  - Tutors praised its Socratic questions.

  — [arXiv 2512.23633](https://arxiv.org/abs/2512.23633); [Dan Meyer's critical review](https://danmeyer.substack.com/p/research-review-aihuman-tutors-match) (note: the design was human-in-the-loop, and the sample is small/"exploratory")

- **Tutor CoPilot (Stanford, Wang, Demszky et al. 2024).**
  - 900 human tutors and 1,800 K-12 students; the LLM suggests expert-like moves to human tutors in real time.
  - +4 pp topic mastery overall, and +9 pp for students of lower-rated tutors.
  - Costs about $20 per tutor per year.
  - 550k+ messages were analysed: more guiding questions and prompting students to explain, fewer answers given away.

  — [arXiv 2410.03017](https://arxiv.org/abs/2410.03017v2); [Stanford EduNLP project page](https://edunlp.stanford.edu/projects/tutor-copilot) (the strategy-shift detail is from my recollection of the paper and is not re-verified here)

### Inferences

- The common success factor is **ground truth given to the model**: teacher solutions (Bastani), pre-written step-by-step solutions (Kestin), or a curated item bank with misconceptions (Eedi). For LearnBuddy, this means generating and validating the answer key and solution steps **once, at item creation**, and passing them to every tutor call. The tutor then judges against a key instead of solving live, which is both faster and more accurate.
- The pedagogy is carried by structure (rung, reveal state) plus instructions; Gemini 2.5+ already contains LearnLM tuning. So a focused system prompt with explicit pedagogy attributes fits Google's own "pedagogical instruction following" framing.

### Gaps

- Exact GPT Tutor prompt from Bastani (the SI was not fetched), and GPT-4's error rate on those problems (widely reported as about 42%; **not verified here**).
- Kestin tutor's system prompt text (in the paper's SI; not fetched).

## B4) Pre-generating hints, answer keys and misconception feedback vs live generation

### Takeaway

Evidence and practice favour **authoring or pre-generating at item-creation time** (answer key, accepted variants, hint ladder, common wrong answers with misconception feedback), then using the live model only to match the learner's answer to that material and phrase the response. Mapping wrong answers to misconceptions is hard for generic LLMs (Eedi/Kaggle). Pre-generated items should be validated, not trusted blindly.

### Cited Findings

- Bastani: the key safeguard was **teacher-designed hints**, as opposed to free-form help. — [PNAS](https://www.pnas.org/doi/10.1073/pnas.2422633122)
- Kestin: pre-written solutions plus scaffolding were needed to avoid errors. — [Carl Hendrick review](https://carlhendrick.substack.com/p/the-algorithmic-turn-the-emerging)
- Eedi diagnostic questions are MCQs with 1 correct answer and 3 distractors, each distractor tied to a misconception code.
  - The Kaggle task: rank the top 25 of 2.5k+ misconceptions for a wrong answer, scored by MAP@25.
  - Many test misconceptions were unseen, and "not the kind of task that generic language models handle well out of the box".

  — [Kaggle: Eedi Mining Misconceptions](https://www.kaggle.com/competitions/eedi-mining-misconceptions-in-mathematics); [Eedi blog](https://www.eedi.com/news/from-wrong-answers-to-real-insights-how-we-used-a-kaggle-challenge-to-map-student-misconceptions); [Learning Agency case study](https://the-learning-agency.com/the-cutting-ed/article/case-study-math-misconceptions-competition/)

- ASSISTments uses teacher/author-created hints and explanations and is now testing LLM-generated hint sets against teacher-authored ones in RCTs. — [ASSISTments student supports](https://new.assistments.org/individual-resource/student-supports); [Springer chapter](https://link.springer.com/chapter/10.1007/978-3-032-29794-5_60)

### Inferences

- Architecture that fits the 1–3 s target:
  1. At worksheet import, one larger call (can be slower, and can use more thinking) produces per item:
     - `answer_key`;
     - `accepted_answers` / normalisation rules (e.g. "0,5" = "1/2" = "0.5");
     - 2–3 `hint_rungs`;
     - `worked_solution`;
     - `common_errors[{pattern, feedback}]`.
  2. At answer time:
     - **Deterministic check first** (exact or normalised match, numeric tolerance): feedback in under 100 ms, with no LLM for correct answers.
     - **Pre-generated misconception feedback** if the answer matches a stored common error: instant.
     - **LLM only for open or unmatched answers**: short prompt, cached prefix, Flash-Lite-class model, streamed text.
- This also improves evaluation quality: the live model grades against a key rather than solving the problem itself.
- Deterministic matching of _numeric or normalised_ answers is fine under hard rule 3, which bans word lists for language understanding, not answer normalisation. Free-text meaning must still go to the model.

### Gaps

- I found no direct RCT comparing pre-generated vs live-generated LLM hints for learning outcomes (the ASSISTments LLM-hint-style RCT results were not retrieved).

## B5) Latency and cost engineering (streaming, caching, routing, thinking, prefetch, Vercel)

### Takeaway

The biggest levers, in order:

1. Avoid the LLM when the answer can be checked deterministically.
2. Stream learner-facing text.
3. Cacheable prompt prefix.
4. Route classification and judging to a non-thinking small model, and keep thinking only for Buddy planning turns.
5. Prefetch the next item's hint and feedback in the background.
6. Run Vercel functions in fra1 (not the iad1 default) with Fluid compute.

### Cited Findings

- Gemini 2.5 Flash-Lite non-reasoning has TTFT of about 0.30 s and about 300 tokens/s. — [Artificial Analysis](https://artificialanalysis.ai/models/gemini-2-5-flash-lite/providers)
- Implicit caching: prefix of at least 1,024 tokens for 2.5 Flash; put stable content first. — [Google Developers Blog](https://developers.googleblog.com/gemini-2-5-models-now-support-implicit-caching/)
- Fluid compute is on by default for new projects since 23 Apr 2025. It brings:
  - optimized concurrency;
  - bytecode caching (Node 20+, production only);
  - pre-warmed instances;
  - automatic concurrency scaling.

  — [Vercel docs: Fluid compute](https://vercel.com/docs/fluid-compute); [Vercel KB: cold start performance](https://vercel.com/kb/guide/improve-function-cold-start-performance-on-vercel); [Vercel blog: scale to one](https://vercel.com/blog/scale-to-one-how-fluid-solves-cold-starts)

- Vercel functions default to **iad1 (US East)**; the region is configurable (e.g. fra1). — [Vercel KB](https://vercel.com/kb/guide/improve-function-cold-start-performance-on-vercel) (search extract)
- Gemini 3.x Flash thinking levels are minimal/low/medium/high. One secondary source claims "minimal" costs about 73.6% less (for 3.6 Flash). — [OpenRouter](https://openrouter.ai/google/gemini-3-flash-preview); [evolink.ai](https://evolink.ai/blog/gemini-3-6-flash-thinking-level-cost) (secondary)

### Inferences

- If the API runs in iad1 and Vertex in europe-west4, every model call crosses the Atlantic twice, adding roughly 100–200 ms or more. Check `vercel.json` / project settings, and pin fra1 (Frankfurt is close to europe-west4 in the Netherlands). This also matters for GDPR.
- Routing proposal:
  - Answer judging with a key: 2.5 Flash-Lite (or 3.1 Flash-Lite after migration), thinking off, structured output, text streamed. Expected about 0.4–0.9 s.
  - Buddy chat and planning: Flash with a small thinking budget, as now.
  - Worksheet import: Flash with thinking, streamed item by item.
- Speculative prefetch: when an item is shown, pre-generate the _next rung's_ hint text in the background (cheap, since it can be cached). Then "Tipp" appears instantly. Only do this if the item doesn't already have pre-generated rungs.
- Perceived latency: show Buddy's typing orb immediately, and stream the first sentence. The UI must still distinguish "judging…" from "confirmed correct" (hard rule 5): stream the prose, but only reveal correct/incorrect state after the validated object arrives.

### Gaps

- Measured TTFT from fra1 to europe-west4 for Gemini: none found. Measure it with a script.
- Official statement on streaming with `responseSchema` on Vertex: not found.

## B6) Children, privacy and regulation (GDPR Art. 8, EU AI Act, Vertex data governance)

### Takeaway

- In Germany, consent-based processing for under-16s needs parental consent or authorisation (Art. 8 GDPR, age 16).
- EU AI Act Annex III §3 lists AI that evaluates learning outcomes or steers learning "in educational and vocational training institutions" as high-risk. After the Digital Omnibus, those obligations apply from **2 Dec 2027**. A consumer app used outside a school may fall outside the "institutions" wording, which is a legal judgement to confirm.
- Article 50 transparency (disclose that it's an AI) applies from Aug 2026.
- On Vertex, zero data retention requires disabling in-memory caching and opting out of abuse-monitoring prompt logging.

### Cited Findings

- Art. 8 GDPR: processing based on a child's consent for information society services is lawful at 16 or older; below that it needs a parent's consent or authorisation. Member states may lower the age to no less than 13, and Germany keeps 16. The controller must make reasonable efforts to verify parental consent. — [gdpr-info.eu Art. 8](https://gdpr-info.eu/art-8-gdpr/); [EuConsent](https://euconsent.eu/digital-age-of-consent-under-the-gdpr/)
- Annex III point 3 (education) high-risk uses cover:
  - access or admission;
  - evaluating learning outcomes, "including when those outcomes are used to steer the learning process of natural persons in educational and vocational training institutions at all levels";
  - assessing the appropriate level of education;
  - monitoring prohibited behaviour during tests.

  — [AI Act Service Desk (europa.eu) Annex III](https://ai-act-service-desk.ec.europa.eu/en/ai-act/annex-3); [artificialintelligenceact.eu Annex III](https://artificialintelligenceact.eu/annex/3/) (wording from search extract)

- Digital Omnibus on AI:
  - political agreement 7 May 2026, EP vote 16 June, Council 29 June, in force 27 July 2026;
  - stand-alone Annex III high-risk obligations deferred from 2 Aug 2026 to **2 Dec 2027** (Annex I products to 2 Aug 2028);
  - Art. 50 transparency still applies from Aug 2026.

  — [Gibson Dunn](https://www.gibsondunn.com/eu-ai-act-omnibus-agreement-postponed-high-risk-deadlines-and-other-key-changes/); [Usercentrics](https://usercentrics.com/knowledge-hub/eu-ai-act-high-risk-delay-article-50-transparency-consent/); [Praxikon](https://www.praxikon.com/en/posts/digital-omnibus-high-risk-postponement-december-2027)

- Vertex zero data retention: Gemini caches data in memory (RAM only, project-isolated, 24 h TTL) by default to reduce latency and cost. For ZDR you must disable that caching. Prompt logging for abuse monitoring applies to customers on GCP ToS without invoiced billing, and you can request an exception. — [Agent Platform ZDR docs](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention); [Vertex abuse monitoring](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/abuse-monitoring); [Gemini API ZDR](https://ai.google.dev/gemini-api/docs/zdr) (search extracts)
- Google does not train on Vertex customer data under its data governance commitments. — [Vertex data governance page](https://cloud.google.com/vertex-ai/generative-ai/docs/data-governance?hl=vi) (search listing only; the wording was not retrieved, so **verify**)

### Inferences

- LearnBuddy steers practice based on a learner's performance. If it is ever sold to or used by schools, it is plausibly Annex III §3(b) high-risk. As a private consumer app, the "in … institutions" qualifier probably excludes it, but get this confirmed by a lawyer. Designing now for human oversight, logging and transparency is cheap insurance before Dec 2027.
- **Trade-off to decide explicitly:** full ZDR (caching off) probably loses the implicit-caching discount and latency gain. For a minor-focused app, ZDR plus the abuse-monitoring exception is the more defensible privacy default. If caching stays on, document it in `docs/privacy.md` (RAM only, 24 h, project-isolated) and minimise PII in prompts (pseudonymous learner alias, no names in the cached prefix).
- Worksheet photos can contain children's names, school names and handwriting. Strip EXIF on the client, and consider cropping to the task area before upload.

### Gaps

- Whether ZDR (in-memory caching disabled) also disables implicit context caching discounts on Vertex: **not confirmed**.
- Whether a consumer tutoring app outside school institutions is in scope of Annex III §3: no authoritative guidance found (the Commission's high-risk guidelines were not retrieved).
- The German BDSG/KMK position on AI tutors in schools was not researched.
