# How language-learning and flashcard apps check answers without LLMs

Research date: 2026-09-26. Scope: deterministic (non-LLM) answer checking in Duolingo (historical, pre-LLM), Babbel/Busuu/Memrise/Rosetta Stone, Anki, Quizlet, phase6, open-source apps, JS/TS packages, and German school apps.

**Research-environment note (affects how much is verified):** the egress proxy blocked direct fetches of `blog.duolingo.com`, `sharedtask.duolingo.com`, `aclanthology.org`, `help.quizlet.com`, `www.phase-6.de` and `docs.ankiweb.net`. For those domains the findings below come from **search-engine snippets of the named page**, not from reading the full page, and are marked "(snippet)". Findings marked "(read)" come from reading the primary source in full: Anki source code, the Anki manual (GitHub mirror), LibreLingo source code (cloned), the ts-fsrs README, the srs-benchmark README and npm registry metadata.

---

## 1. Duolingo, pre-LLM: how typed translations were graded

### Takeaway

Duolingo grades typed translations by matching the learner's response against a **large, human-curated set of acceptable translations** (on average more than 200 per sentence, up to around 30,000), stored compactly and matched with a finite-state transducer. It tolerates small typos and missing accents with a warning, and fills gaps through a **"Report → my answer should be accepted"** loop, which a machine-learning triage model helps process. Duolingo has published no exact typo threshold.

### Cited Findings

- Grading compares "each learner response against a list of acceptable translations curated by expert translators" (snippet, STAPLE shared-task description) — [2020 Duolingo Shared Task](https://sharedtask.duolingo.com); [Mayhew et al., STAPLE 2020](http://sharedtask.duolingo.com/papers/mayhew.staple20.pdf)
- "The average number of acceptable answers to a Duolingo translation exercise [is] more than 200, and some longer sentences hav[e] as many as 30,000"; example: "No necesito un taxi, vivo cerca" has 2,156 acceptable English translations (snippet) — [Duolingo blog: how user reports improve course content](https://blog.duolingo.com/how-user-reports-improve-course-content)
- "Getting them all on the first try is close to impossible", so Duolingo asks learners to flag missed answers with the "Report" flag, and each report shows up in the backend for staff and contributors to review (snippet) — [Duolingo blog: how user reports improve course content](https://blog.duolingo.com/how-user-reports-improve-course-content)
- Once a course matures, learners send hundreds of thousands of reports; about 10% are correct and need a fix, and most of the other 90% contain some kind of mistake (often typos the learner did not notice). Duolingo built an ML system to rank reports so contributors find the correct ones quickly (snippet) — [Duolingo blog: how machine learning helps prioritize course improvements](https://blog.duolingo.com/how-machine-learning-helps-duolingo-prioritize-course-improvements)
- STAPLE corpus: more than 3 million English sentence ↔ multiple-translation pairs (pt, hu, ja, ko, vi); the task was to generate the _set_ of acceptable learner translations, which shows Duolingo treats accepted answers as a weighted set, not a single reference (snippet) — [ACL CFP: 2020 Duolingo Shared Task](https://www.aclweb.org/portal/content/cfp-2020-duolingo-shared-task-translation-paraphrase); [JHU submission](https://aclanthology.org/2020.ngt-1.22/)
- The Half-Life Regression (HLR) paper describes a **finite-state transducer** used to parse and grade answers to translation exercises against the correct-answer set, and **lexeme tags** (root lexeme, part of speech, morphology) for each word (snippet) — [Settles & Meeder, ACL 2016, "A Trainable Spaced Repetition Model for Language Learning"](https://aclanthology.org/anthology-files/pdf/P/P16/P16-1174.pdf)
- HLR model: recall probability p = 2^(−Δ/h), with half-life ĥ = 2^(Θ·x) (x = features such as correct and incorrect counts and lexeme tags). The paper reports much lower prediction error than Leitner/Pimsleur baselines and a roughly 12% gain in daily engagement in a live experiment. (From prior knowledge of the paper; **not re-fetched in this session** because aclanthology.org was blocked, so treat the numbers as unverified.) — [Settles & Meeder 2016](https://aclanthology.org/anthology-files/pdf/P/P16/P16-1174.pdf)
- Typos: when a learner types an adjacent key on a phone keyboard, Duolingo sometimes accepts the answer and says they made a typo; users report this is inconsistent (snippet, secondary sources) — [Facebook Welsh Duolingo group](https://www.facebook.com/groups/welshduolingo/posts/3558668994267697/); [mvanec substack: duolingo annoyances](https://mvanec.substack.com/p/duolingo-annoyances)
- Accents: historically, Duolingo showed a "Pay attention to the accents!" note that pointed out the error **without marking the answer wrong**. Users also report cases where a missing accent (e.g. "Lopez" for "López") was marked wrong (snippet, forum or user sources) — [Duolingo forum archive](https://duolingo.hobune.stream/comment/31314056); [Duolingo forum: No accent now not accepted?](https://forum.duolingo.com/comment/2343258/No-accent-now-not-accepted)
- Constrained exercise types: Duolingo scaffolds writing with word banks (tap tiles) before free typing. It says tapping words in word-bank exercises still trains writing, and learners can switch from the word bank to the keyboard (snippet) — [Duolingo blog: How Duolingo teaches writing skills](https://blog.duolingo.com/covering-all-the-bases-duolingos-approach-to-writing-skills/)
- Pre-LLM Duolingo also had a SLAM shared task (2018, second-language acquisition modelling) and the STAPLE task (2020) as public research data sets. Duolingo lists them on its research page — [research.duolingo.com](https://research.duolingo.com/)
- Current (LLM era, marked as non-historical): "Explain my Answer" in Duolingo Max is powered by GPT-4 and later became free, so LLMs now handle **explanations** of grading, not the grading itself — [Duolingo Max](https://blog.duolingo.com/duolingo-max/); [explain my answer now free](https://blog.duolingo.com/explain-my-answer-now-free)

### Inferences

- The core Duolingo mechanism is "accepted-answer set + normalisation + small edit tolerance + human correction loop". LearnBuddy can copy all of this without an LLM at check time. For vocabulary (single words or short phrases), the accepted set is small (typically 1–5 variants), so a plain list works; no FST or lattice is needed.
- Word banks, tiles, matching pairs and select-image exercises exist partly because they make grading **exactly decidable**: the answer space is closed. That fits LearnBuddy's rule of deterministic checks.
- The report loop ("my answer should be accepted") maps to LearnBuddy's "LLM only for edge cases": a rejected answer the learner disputes can go to an LLM judge or an adult, and an accepted dispute becomes a new accepted variant (learning from reports, like Duolingo's content fix).

### Gaps

- No primary source found for Duolingo's exact typo threshold (edit distance, per-word vs per-sentence, length scaling). It is not published. Duolingo patents on grading were not found (the search surfaced only an unrelated "automatic test personalization" patent: [FreePatentsOnline US 2017/0116870](https://www.freepatentsonline.com/y2017/0116870.html)).
- The exact compact representation of the accepted-answer set (bracket/slash notation that expands to a lattice) is known from community lore of the Duolingo Incubator but was not verified from a primary source here.

---

## 2. Babbel, Busuu, Memrise, Rosetta Stone

### Takeaway

Primary documentation was found only for **Memrise**: it ignores accents, punctuation, hyphens and apostrophes in typing tests unless the course creator marks the course "strict". For Babbel, Busuu and Rosetta Stone, no reliable primary source on typed-answer tolerance was found.

### Cited Findings

- Memrise: "Punctuation marks and accents will be ignored when answering a test (unless the course has been marked strict by the course creator)". "que pasa" is accepted for "¿qué pasa?". Hyphens and apostrophes are ignored, so "mia jai" is accepted for "Mi-a j'ai". Learners cannot see or change strictness (snippet) — [Memrise help: A Guide to Typing Tests, Tapping Tests and Memrise Punctuation](https://memrise.zendesk.com/hc/en-us/articles/360015886897-A-Guide-to-Typing-Tests-Tapping-Tests-and-Memrise-Punctuation)
- Memrise's classic exercise types include typing tests and "tapping tests" (building the answer from given tiles) (snippet) — same source.

### Inferences

- Memrise's default of "strip accents and punctuation, then compare" is a simple and cheap baseline. For French with a 12-year-old, a better choice is "accept, but show the accent" (like Anki's diff or Duolingo's warning), so the spelling is still taught.

### Gaps

- Babbel: search found no help-center or engineering source on typo or accent tolerance. Not verified.
- Busuu and Rosetta Stone: not researched in depth because of the tool-call budget and no primary source surfacing. (Rosetta Stone is known for speech recognition and image-choice exercises, but that was not verified here.)

---

## 3. Anki: type-in-the-answer, FSRS vs SM-2, self-grading

### Takeaway

Anki's "type the answer" does **no automatic grading**: it only shows a character-level diff (Python `difflib`-style SequenceMatcher) with CSS classes `typeGood`, `typeBad` and `typeMissed`, and the learner then grades themselves (Again/Hard/Good/Easy). Diacritics can be ignored with `type:nc:`. FSRS (default desired retention 90%) beats SM-2 on prediction in about 99.6% of benchmarked collections.

### Cited Findings

- Syntax: `{{type:Field}}`. Anki "will show you which parts you got right and which parts you got wrong". "This feature does not change how the cards are answered, so it's still up to you to decide how well you remembered or not." Only one type comparison per card, single line only. For cloze cards, `{{type:cloze:Text}}` is used, with multiple answers separated by commas (read) — [Anki manual, templates/fields.md (GitHub)](https://github.com/ankitects/anki-manual/blob/main/src/templates/fields.md)
- `{{type:nc:Front}}` ignores diacritics: "elite" is treated the same as "élite", and "بطيخ" the same as "بَطِّيخ" (read) — same source.
- The diff is rendered in a monospaced `<code id=typeans>`. CSS classes are `typeGood`, `typeBad` and `typeMissed`; AnkiMobile supports only `typeGood` and `typeBad` (read) — same source.
- Implementation (`rslib/src/typeanswer.rs`) (read):
  - Normalisation: NFC in the normal mode. In `nc` mode, NFKD and then all combining marks are dropped (`typed.nfkd().filter(|&c| !is_combining_mark(c))`).
  - The expected text is stripped of AV tags, `<br>`, `<div>` and HTML.
  - The diff uses the Rust `difflib` crate's `SequenceMatcher::new(typed, expected)`; its opcodes equal/delete/insert/replace become spans `<span class=typeGood|typeBad|typeMissed>`.
  - There is no case folding: "¿Y ahora" differs from "y ahora".
  - Source: [ankitects/anki rslib/src/typeanswer.rs](https://github.com/ankitects/anki/blob/main/rslib/src/typeanswer.rs)
- Self-grading guidance: **Again** is for incorrect answers, and a partial answer counts as a fail "if it counts as a fail in a real-life context outside of Anki" (typically 5–20% of the time). **Hard** means correct but with doubts or slow. **Good** means correct with some effort (80–95% of the time). **Easy** means no effort. Learners may use only Again and Good (read) — [Anki manual, studying.md](https://github.com/ankitects/anki-manual/blob/main/src/studying.md)
- FSRS in Anki: supported since Anki 23.10. Desired retention defaults to 90%: "Above 90% the workload increases very quickly, and above 97% the workload can be overwhelming". FSRS "can adapt to almost any habit, except … pressing 'Hard' instead of 'Again' when you forget" (read) — [Anki manual, deck-options.md](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md)
- Benchmark: about 727M reviews from 10k Anki users, with 349,923,850 reviews used for evaluation. Log loss: FSRS-6 0.3460, FSRS-4.5 0.3625, HLR 0.4694. RMSE (bins): FSRS-6 0.0653, HLR 0.1275 (read) — [open-spaced-repetition/srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark)
- FSRS-6 has a lower log loss than Anki's SM-2 for 99.6% of collections (snippet, benchmark site) — [Expertium: Benchmark of Spaced Repetition Algorithms](https://expertium.github.io/Benchmark.html)
- Caveat: SM-2 does not natively predict probabilities, and no preregistered RCT shows that better prediction leads to better learning. The claim of "20–30% fewer reviews" comes from simulation (snippet, secondary blog) — [DeckStudy: FSRS vs SM-2](https://deckstudy.com/blog/fsrs-vs-sm2-modern-spaced-repetition)
- Evidence on self-assessment: in Kornell & Bjork (2008), letting students **drop flashcards they believed they knew** had "small but consistently negative effects on learning"; self-regulated study depends on accurate metacognitive monitoring (snippet) — [Kornell & Bjork 2008, Memory 16(2)](https://www.tandfonline.com/doi/abs/10.1080/09658210701763899); [PDF](https://sites.williams.edu/nk2/files/2011/08/Kornell.Bjork_.2008b.pdf); [Bjork, Dunlosky & Kornell 2013, "Self-regulated learning: beliefs, techniques, and illusions"](https://sanlab.psych.ucla.edu/wp-content/uploads/sites/13/2016/07/RBjork_Dunlosky_Kornell_2012.pdf)

### Inferences

- For LearnBuddy, the Anki approach splits into two pieces:
  1. A **diff display** (typed vs expected, coloured spans), which is cheap and useful as "almost right" feedback.
  2. **Self-grading**, which is risky for 12-year-olds: the Kornell & Bjork results suggest that self-judgement of "known" is unreliable. Machine grading of typed or constrained answers plus an "I was right" override (Quizlet style) is probably safer than pure Again/Hard/Good/Easy.
- ts-fsrs can take a _derived_ rating: map exact to Good, accepted typo to Hard, wrong to Again, and fast exact to Easy (optional). No learner-facing four-button UI is needed. This is an inference and follows the Anki manual's warning that Hard means "recalled".
- Anki's `nc` normalisation (NFKD + drop combining marks) is exactly the diacritic fold LearnBuddy needs. In JS it is `s.normalize('NFKD').replace(/\p{M}/gu, '')`.

### Gaps

- No study was found that measures the accuracy of self-grading specifically for children or for vocabulary flashcards in Anki-style four-button UIs.

---

## 4. Quizlet and phase6

### Takeaway

Quizlet's written grading (non-"smart") is rule-based:

- alternatives are separated by `/`, `,` or `;`;
- any text inside parentheses is optional;
- a visible **"Override: I was correct"** button handles typos;
- an optional paid "smart grading" layer (NLP) accepts synonyms, rephrasing and typos.

phase6 uses a 6-phase Leitner box with a configurable penalty after a wrong answer (one phase down, or a full reset), and a setting that decides whether typos count as errors.

### Cited Findings

- Quizlet Write mode: after a spelling error you can select "Override: I was correct" and the answer is marked correct (snippet) — [Quizlet help: Studying with Write mode](https://help.quizlet.com/hc/en-us/articles/360030990531-Studying-with-Write-mode)
- Quizlet: Write mode is no longer available as a separate mode; written questions are now a question type inside Learn (Options → Question types → Written) (snippet) — same source; [Studying with Learn](https://help.quizlet.com/hc/en-us/articles/360030986971-Studying-with-Learn)
- Alternatives: "separate answers by a slash ( / ), comma ( , ) or a semicolon ( ; )" for flexible grading; multiple correct answers in a definition must be separated this way (snippet) — [Quizlet help: Using grading options (US)](https://help.quizlet.com/hc/en-us/articles/360048313652-Using-grading-options-US)
- Parentheses: text in parentheses is optional. Quizlet's own blog says you can put "literally anything you want" inside parentheses and it is still marked correct, and that parentheses, brackets and curly braces all work at the beginning, middle and end (snippet) — [Quizlet blog: Quizlet hacks I wish I had known](https://quizlet.com/blog/quizlet-hacks-i-wish-i-had-known-last-semester); [How to create the best Quizlet sets](https://quizlet.com/blog/how-to-create-the-best-quizlet-sets)
- Smart grading (Quizlet Plus) "uses natural language processing to understand the meaning of your answers", accepting synonyms, rephrasing and typos at certain grading levels (snippet) — [Quizlet help: Changing grading settings](https://help.quizlet.com/hc/en-ca/articles/360031170512-Changing-grading-settings); [Quizlet blog: How Smart Grading helps students](https://quizlet.com/blog/how-smart-grading-helps-students)
- Learn offers "Retype correct answers" for missed written questions (snippet) — [Quizlet help: Changing grading settings](https://help.quizlet.com/hc/en-ca/articles/360031170512-Changing-grading-settings)
- phase6: by default each card goes through six phases before reaching long-term memory, and the higher the phase, the longer the interval (snippet) — [phase6 Help: Die bewährte phase6-Systematik](https://www.phase-6.de/help/knowledge-base/phase6-systematik/)
- phase6 settings (snippet) — [phase6 Help: Einstellungen für die Abfrage](https://www.phase-6.de/help/knowledge-base/einstellungen-fuer-die-abfrage/):
  - After a wrong answer, the card either moves down one phase or resets to phase 0/1; the help recommends only reducing progress.
  - "If the setting is activated, typing errors are also counted as errors" (Tippfehler as Fehler).
- The phase6 vocabulary trainer is also the engine behind the Cornelsen Vokabeltrainer app, whose content is tailored to Cornelsen textbooks (snippet) — [Cornelsen: Vokabeltrainer-App](https://www.cornelsen.de/vokabeltrainer); [Cornelsen: Die phase6 Vokabeltrainer-App](https://www.cornelsen.de/empfehlungen/vokabeln/vokabeltrainer-app)

### Inferences

- The Quizlet notation (`/ , ;` for alternatives, `( … )` optional) is a proven authoring format that the LLM can emit once when it extracts worksheet vocabulary. For example, "(to) run / (to) jog" or "le chat (m.)". The server expands it into the accepted set. Schoolbook vocabulary lists already use this notation (e.g. "(to) go", "sb./sth.").
- "Override: I was correct" is the cheap, instant answer to false negatives. For children it should be logged and optionally reviewed (LLM or adult) rather than trusted blindly, following the Kornell & Bjork finding.
- phase6 intervals per phase: exact day values were not in the snippets.

### Gaps

- phase6's exact phase intervals, its article handling ("the", "le/la") and its case-sensitivity rules could not be read (domain blocked).
- Quizlet's exact non-smart typo rule (whether an edit-distance threshold exists outside smart grading) is unverified.

---

## 5. Open source: LibreLingo and others

### Takeaway

LibreLingo (AGPL) implemented Duolingo-style checking in about 80 lines of TypeScript:

- normalisation: lower-case and collapse whitespace;
- Levenshtein distance ≤ 1 against every accepted variant counts as correct, with the message "Correct spelling: …";
- a second pass ignores `!¡?¿,.` and reports "Watch out for punctuation!".

Accepted variants are authored as explicit lists in YAML. The current LibreLingo main branch is a Next.js rewrite that no longer contains this checker.

### Cited Findings

- `apps/answer-corrector/src/index.ts` (package `@librelingo/answer-corrector` 1.0.0, AGPL-3.0-or-later, dependency `js-levenshtein` 1.1.6) at commit f70cec9 (tag `@librelingo/web-v1.9.1`, 2021-05-11) (read) — [LibreLingo repo](https://github.com/LibreLingo/LibreLingo):
  - `normalize = ignoreWhitespace(ignoreCasing(form))`
  - `areSentencesSimilar = levenshtein(normalize(a), normalize(b)) <= 1`, a fixed threshold of 1 for the whole sentence regardless of length
  - Pass 1: raw forms. If the answer is similar but not identical, it is correct with the suggestion `Correct spelling: ${form}`.
  - Pass 2 (only if pass 1 fails): the valid answers are mapped through `ignorePunctuation = s.replace(/[!¡?¿,.]/g, "")`, and the suggestion is `Watch out for punctuation! Correct spelling: …`.
  - The web UI (`ShortInputChallenge.svelte`) shows "You have a typo!" for these cases.
- No diacritic folding and no article handling in that checker (read, same file).
- Course authoring: each phrase has `Alternative versions` and `Alternative translations` lists in YAML, e.g. "The woman says hello" / "The woman says hi"; a `Mini-dictionary` lists word glosses (read) — [LibreLingo docs/courses/skill.md](https://github.com/LibreLingo/LibreLingo/tree/main/docs/courses)
- Community issue: "Correct punctuation should not be considered a typo" (the pass-2 message fired even for correct punctuation in some cases) (snippet) — [LibreLingo-ES-from-EN issue #19](https://github.com/LibreLingo/LibreLingo-ES-from-EN/issues/19)
- Current main (checked 2026-06 commit 3c4bcfb) has only a small Next.js app (`apps/librelingo-web`) with no challenge or answer code (read, cloned repo).

### Inferences

- LibreLingo's fixed threshold ("≤1 edit for the whole sentence") is too loose for very short words ("cat" and "car" are 1 edit apart, both real words) and too strict for long sentences. A **length-scaled Damerau-Levenshtein** threshold works better for vocabulary. A good rule: 0 edits for ≤3–4 letters, 1 for 5–8, 2 for longer. It should also never accept a typo that exactly equals _another_ word in the lesson or a known wrong answer. This is an inference; no primary source gives these numbers.
- Anki's source (`typeanswer.rs`) is the reusable reference for the _display_. LibreLingo's `answer-corrector` is the reusable reference for the _decision_. Beware its AGPL licence; the logic is trivial to re-implement.

### Gaps

- Other open-source Duolingo-like apps (e.g. community clones) were not surveyed because of the budget.

---

## 6. Reusable JS/TS packages

### Takeaway

All needed pieces exist as small MIT/BSD packages: `fastest-levenshtein` or `js-levenshtein` (edit distance), `damerau-levenshtein` or `talisman` (transpositions and more metrics), `diff` or `fast-diff` (Anki-style diff display), `ts-fsrs` (scheduling). Diacritic folding needs no package (`String.prototype.normalize`).

### Cited Findings (npm registry, read 2026-09-26)

| Package               | Version | License      | Notes                                                                                                                                                                                                                                                                                                |
| --------------------- | ------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ts-fsrs`             | 5.4.2   | MIT          | FSRS in TS; ESM, CJS and UMD; `createEmptyCard()`, `fsrs()`, `scheduler.repeat()` (preview all four outcomes), `scheduler.next()`; `Rating` Again, Hard, Good, Easy; Node ≥ 20; optimizer in `@open-spaced-repetition/binding` — [ts-fsrs GitHub](https://github.com/open-spaced-repetition/ts-fsrs) |
| `fastest-levenshtein` | 1.0.16  | MIT          | about 21 KB unpacked — [repo](https://github.com/ka-weihe/fastest-levenshtein)                                                                                                                                                                                                                       |
| `js-levenshtein`      | 1.1.6   | MIT          | about 6 KB; used by LibreLingo — [repo](https://github.com/gustf/js-levenshtein)                                                                                                                                                                                                                     |
| `damerau-levenshtein` | 1.0.8   | BSD-2-Clause | also returns relative distance — [repo](https://github.com/tad-lispy/node-damerau-levenshtein)                                                                                                                                                                                                       |
| `talisman`            | 1.1.4   | MIT          | fuzzy matching and NLP building blocks (Damerau-Levenshtein, Jaro-Winkler, phonetic keys, etc.) — [repo](https://github.com/yomguithereal/talisman)                                                                                                                                                  |
| `diff` (jsdiff)       | 9.0.0   | BSD-3-Clause | `diffChars` for Anki-style display — [repo](https://github.com/kpdecker/jsdiff)                                                                                                                                                                                                                      |
| `fast-diff`           | 1.3.0   | Apache-2.0   | small char diff — [repo](https://github.com/jhchen/fast-diff)                                                                                                                                                                                                                                        |

- Anki's diacritic fold is NFKD plus removal of combining marks (read, `typeanswer.rs`). The JS equivalent: `s.normalize('NFKD').replace(/\p{M}/gu,'')`. Careful with German: this folds "ü" to "u" and "ß" is unaffected, which is fine for EN/FR target answers. (The JS equivalent is an inference.)

### Inferences

- The performance budget (<100 ms) is trivially met. Levenshtein on words shorter than 50 characters against 1–20 variants takes microseconds, so checking can run **on-device** (Expo) with a server-side re-check for recorded results.
- Suggested pipeline (inference):
  1. Trim, collapse whitespace, NFC.
  2. Case-fold (except where case is taught, e.g. German nouns).
  3. Unify apostrophes and quotes (’ → ').
  4. Strip terminal punctuation.
  5. Expand the accepted set from `/ ; ,` and optional `( … )`.
  6. Try an exact match, then a match with an optional article or particle stripped ("the", "to", "a/an", "le/la/l'/les/un/une"), marked as "article missing" when the article is pedagogically required, e.g. French gender.
  7. Try an accent-folded match, meaning "correct, mind the accent" (show the accent).
  8. Try a length-scaled Damerau-Levenshtein match, meaning "almost right, typo" (show the diff). Reject if the candidate equals another item's answer.
  9. Otherwise the answer is wrong. Show the diff and the "Ich hatte recht" override, and route disputes to the LLM or an adult.

---

## 7. Best practice: when to accept a near miss, and how to show "almost right"

### Takeaway

The established pattern across Duolingo, Anki, Quizlet and LibreLingo is: **accept small typos and accent slips as correct-with-note, show the correct form with the difference highlighted, and give the learner a way to dispute or override.** Strictness is a per-course or per-user setting (Memrise "strict", phase6 "Tippfehler als Fehler", Anki `nc`).

### Cited Findings

- Duolingo: typo accepted with a note; accents noted without penalty (historical) (snippet) — see §1 sources.
- LibreLingo: "You have a typo!" plus "Correct spelling: X"; a separate punctuation message (read) — see §5.
- Anki: coloured diff, with the grading decision left to the learner (read) — see §3.
- Quizlet: "Override: I was correct"; "Retype correct answers" after misses (snippet) — see §4.
- Memrise: accents and punctuation ignored unless strict (snippet) — see §2.
- phase6: typo strictness is a user setting; a wrong answer demotes the card (snippet) — see §4.

### Inferences

- For a 12-year-old: count typos as correct but schedule them as "Hard" in FSRS, and show "Fast richtig — so schreibt man's: …" with the diff. This matches the CLAUDE.md tone rule.
- A missing French accent should count as correct with the accent highlighted. A wrong or missing French _article or gender_ should count as not correct if the teacher's list includes the article (it is part of the learning target).
- "Retype the correct answer" after a miss (Quizlet) is a cheap, deterministic reinforcement step.

### Gaps

- No controlled study was found comparing typo-tolerant vs strict grading on vocabulary retention in children.

---

## 8. German school-oriented vocabulary apps (phase6, Cornelsen/Klett, ANTON, Scoyo)

### Takeaway

German school vocabulary trainers are deterministic:

- phase6, which also powers the Cornelsen Vokabeltrainer, uses typed or self-check answers in a Leitner-like 6-phase box with configurable typo strictness;
- cabuu offers Klett, Westermann and Cornelsen textbook lists;
- ANTON advertises 200+ exercise types, mostly closed formats.

Primary documentation of their exact checking rules was not reachable.

### Cited Findings

- Cornelsen's vocabulary trainer app is based on phase6 and is aligned with Cornelsen textbooks; it repeats difficult vocabulary more often (snippet) — [Cornelsen Vokabeltrainer](https://www.cornelsen.de/vokabeltrainer)
- phase6 offers textbook-aligned English vocabulary ("passgenau zu den Lehrwerken") (snippet) — [phase6 Vokabeltrainer Englisch](https://www.phase-6.de/classic/lerninhalte/vokabeltrainer/englisch/)
- cabuu offers vocabulary collections from Klett, Westermann and Cornelsen (snippet) — [cabuu](https://www.cabuu.app/en/vokabeln-aus-dem-schulbuch-klett-cornelsen-westermann)
- ANTON: "over 200,000 tasks and over 200 exercise types"; the English grade 3–5 topics include numbers, colours and school (snippet) — [ANTON Englisch](https://anton.app/de/lernen/englisch-3-klasse/thema-03-numbers/uebungen-01-one-to-ten/); [Gütesiegel Lern-Apps: ANTON Englisch](https://www.guetesiegel-lernapps.at/lern-apps/anton-englisch)

### Inferences

- The German school market expects:
  - textbook-aligned lists (LearnBuddy gets these from worksheet photos);
  - a Leitner or phase metaphor;
  - typed answers with configurable strictness, i.e. deterministic checks.
- There is no evidence any of them used LLMs for per-answer grading in the pre-LLM era.

### Gaps

- The Klett vocabulary trainer, the Scoyo checking rules, ANTON's typo handling and phase6's article and case handling were not verified: domains were blocked or no primary pages were found.
