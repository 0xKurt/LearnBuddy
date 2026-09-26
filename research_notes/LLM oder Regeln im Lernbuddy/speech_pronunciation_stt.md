# Pronunciation assessment, speech-to-text and TTS for LearnBuddy (status 2026-09-26)

Method note: learn.microsoft.com, azure.microsoft.com, arxiv.org, openreview.net, speechsuper.com and speechace.com were **blocked by the session's egress proxy**. For those, facts come from search-result snippets of the official pages (URL cited), from the MicrosoftDocs GitHub mirror (fetched in full), or from the installed `expo-speech-recognition@57.1.0` README in `node_modules` (read in full). Everything not tied to a source is under "Inferences" or "Gaps". Search snippets are paraphrases by the search tool; exact numbers should be re-checked on the vendor pages before a contract decision.

## 1. How do classic apps assess pronunciation, and what are forced alignment and GOP?

### Takeaway

Classic assessment does **not** transcribe. It already knows the target sentence, uses an acoustic model to find where each expected phoneme sits in the audio (forced alignment), then asks "how likely was this phoneme compared with every other phoneme the model could have heard here?" (GOP). This is exactly why it catches accent-level errors that a transcript auto-corrects away. Consumer apps expose the result mostly as pass/fail.

### Cited Findings

- GOP (Witt & Young, 2000) is "the earliest and most successful phoneme-level speech assessment method"; it approximates each phoneme's posterior probability as the ratio between the forced-alignment likelihood and the likelihood of free phone-loop decoding (GMM-HMM originally) — [ScienceDirect, Phonological level wav2vec2-based MDD](https://www.sciencedirect.com/science/article/pii/S0167639325000640); [ResearchGate, Witt & Young](https://www.researchgate.net/publication/222526897_Phone-level_pronunciation_scoring_and_assessment_for_interactive_language_learning)
- Forced alignment = aligning the canonical (expected) phonemes to the signal to find the most likely mapping between phonemes and time regions; GOP scores are posteriors from an ASR acoustic model trained on native speech — [Segmentation-free GOP, arXiv 2507.16838](https://arxiv.org/html/2507.16838v2)
- DNN-era GOP: negative log of the mean softmax probability of the target phoneme over its aligned frames — [Logit-based GOP, arXiv 2506.12067](https://arxiv.org/html/2506.12067v2)
- Reference implementation of GOP with Kaldi exists: [gop-pykaldi](https://github.com/JazminVidal/gop-pykaldi)
- Rosetta Stone TruAccent compares spoken words to "millions of examples from native speakers", uses feature-based adaptation "to ensure learners are scored fairly regardless of vocal register"; result is typically a checkmark (pass/fail) — [Rosetta Stone blog](https://blog.rosettastone.com/truaccent-learning-with-rosetta-stone/); [Rosetta Stone enterprise blog](https://enterpriseblog.rosettastone.com/accent-reduction/); pass/fail characterisation from a third-party review [growwithless.com](https://growwithless.com/honest-pronunciation-feedback/)
- Duolingo's standard speaking exercises are "lighter and often binary" — they check whether the response was recognised, no sound-by-sound coaching — [growwithless.com](https://growwithless.com/honest-pronunciation-feedback/) (secondary source, not Duolingo)
- ELSA runs its own recognition/assessment stack returning sentence-, word- and phoneme-level feedback plus intonation/fluency — [ELSA API](https://elsaspeak.com/en/elsa-api/); [api-evangelist/elsa](https://github.com/api-evangelist/elsa)

### Inferences

- Plain-language explanation for the team: _forced alignment_ = "the app knows the kid should say /ð ə k æ t/; it slides those slots over the waveform to find where each sound is". _GOP_ = "for each slot, how sure is a native-trained model that it heard exactly this sound rather than a neighbour (e.g. /z/ instead of /ð/)?" Low GOP → that sound gets flagged. Because the reference is fixed, the system cannot "auto-correct" into the right word.
- Children and learners: acoustic models trained on adult native speech give lower posteriors for children's voices in general; vendors add age/leniency knobs to compensate (see SpeechSuper below). Thresholds must be tuned per age group, otherwise correct child speech gets flagged — the same symptom LearnBuddy sees with Gemini ("almost" for correct speech).
- Babbel: no primary source found on its method (gap).

### Gaps

- Duolingo's and Babbel's actual algorithms are not publicly documented in sources I could reach.

## 2. Commercial pronunciation-assessment services

### Takeaway

**Azure AI Speech Pronunciation Assessment** is the only mainstream option that covers all five target languages (de, en, fr, es, it), gives phoneme-level scores, streams, documents no-retention for this feature, and costs the same as STT (~$1.32/h, billed per second). Its real limit: IPA phoneme names and prosody only for en-US; for fr-FR you get phoneme-level scores but less diagnostic detail. Google has no pronunciation-assessment product. SpeechSuper/SpeechAce/ELSA are specialist alternatives with weaker EU/child-data documentation.

### Cited Findings

**Azure AI Speech – Pronunciation Assessment**

- Locales (33): incl. **de-DE, en-GB, en-US, en-AU, en-CA, en-IN, fr-FR, fr-CA, es-ES, es-MX, it-IT**, nl-NL, pl-PL, pt-BR/PT, ru-RU, sv-SE, zh-CN … — [MicrosoftDocs language-support include (GitHub)](https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/includes/language-support/pronunciation-assessment.md)
- Granularity: `Phoneme` (full text + word + syllable + phoneme scores), `Word`, `FullText` — [how-to-pronunciation-assessment.md (GitHub mirror of Learn page)](https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/how-to-pronunciation-assessment.md)
- Phoneme alphabet: **IPA phoneme names only for en-US**; SAPI names for en-US and zh-CN. `NBestPhonemeCount` returns alternative phoneme candidates with confidence (i.e. "you said /z/ instead of /ð/") — same source
- **Prosody (stress, intonation, rate, rhythm) only en-US** — same source; also [Learn language support page (search snippet)](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=pronunciation-assessment)
- Scripted mode (reference text → Accuracy, Fluency, Completeness, Prosody) and unscripted mode (no completeness) — same source
- Audio >30 s → continuous mode; streaming mode supports unlimited duration — same source
- SDKs: C#, C++, Java, Python, **JavaScript**, Objective-C, Swift (not Go) — same source
- Content assessment (preview) retired from Speech SDK 1.46.0+ — same source
- Price: pronunciation assessment billed like standard STT; Microsoft Q&A answer quotes **$1.32/hour ≈ $0.000367/s** (US East, Nov 2025), short files prorated per second (8 s ≈ $0.0029); PA spend counts toward STT commitment tiers — [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/5608069/pricing-and-usage-of-pronunciation-assessment-feat); official page [Azure Speech pricing](https://azure.microsoft.com/en-us/pricing/details/speech/) could not be fetched
- Data: "When doing real-time speech to text, fast transcription, **pronunciation assessment**, and speech translation, Microsoft does not retain or store the data" — [Data, privacy, and security for Speech to text (search snippet)](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/speech-to-text/data-privacy-security)
- Microsoft puts responsibility for notice/consent on the customer if biometric data (GDPR Art. 4) is processed — same source (snippet); transparency note exists: [Transparency note Pronunciation Assessment](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/pronunciation-assessment/transparency-note-pronunciation-assessment)

**Google Cloud**

- No pronunciation-assessment product found in any search; Google Cloud STT (Chirp) only transcribes (see §5).

**SpeechSuper**

- 8 languages: English, Mandarin, **German, French, Spanish**, Korean, Japanese, Russian (no Italian) — [SpeechSuper-API-Samples (GitHub)](https://github.com/speechsuper/SpeechSuper-API-Samples); [saasworthy](https://www.saasworthy.com/product/speechsuper)
- Phoneme mispronunciation detection, syllable stress, real-time; **customised scoring by age group**, lenient/strict setting — search snippets of [speechsuper.com/pricing](https://www.speechsuper.com/pricing.html)
- Price: **$0.004–0.008 per scripted assessment, $20 monthly minimum**; prepay tiers $500–5,000+ — same snippet source (page itself blocked)

**SpeechAce**

- Pronunciation, fluency, grammar, vocabulary, relevance; Spanish and French speaking practice mentioned; free trial on all plans; prices not visible in snippets — [Speechace API docs](https://api-docs.speechace.com/); [api-plans](https://www.speechace.com/api-plans/)

**ELSA API**

- B2B partner API, **English only** (English Language Speech Assistant); scripted and unscripted; sentence/word/phoneme feedback, intonation, fluency — [ELSA API](https://elsaspeak.com/en/elsa-api/); [Elsa API docs](https://api-external-doc.elsanow.co/)

**Speechmatics**

- No pronunciation-assessment product found (only transcription) — searched, nothing returned.

**Open-source "Azure alternative"**

- OpenPronounce: English phoneme-level assessment via wav2vec2 + espeak-ng + DTW, self-hosted, ~1.2 GB checkpoints — [GitHub Halleck45/OpenPronounce](https://github.com/Halleck45/OpenPronounce)

### Inferences

- Cost per practice sentence (≈4 s audio) with Azure ≈ 4 × $0.000367 ≈ **$0.0015**, about 2× today's Gemini call ($0.0007) — but it replaces a subjective IPA guess with a phoneme-accurate score. Calculated, not measured.
- Azure fits LearnBuddy's hard rule 1 ("model interprets, code enforces"): the service returns numbers; code maps AccuracyScore/phoneme scores to the UI states; Gemini can still phrase the kind feedback ("Fast richtig — nur das _th_ …").
- For fr-FR, without IPA names we get per-phoneme scores in Azure's own phoneme set/labels; the mapping to learner-friendly hints needs to be built and tested (unverified exactly what fr-FR phoneme labels look like).
- EU residency: Azure Speech is offered in EU regions (e.g. West Europe, Germany West Central) — **inferred from general knowledge, not verified in this session** because the Azure regions page was blocked. Must be checked, together with the Microsoft Products and Services DPA and EU Data Boundary coverage, before use with minors.
- SpeechSuper/SpeechAce: company domicile, server region and DPA are undocumented in reachable sources → risky for children's data under GDPR Art. 8 until a DPA and EU hosting are confirmed in writing.

### Gaps

- Exact official Azure price in EUR / West Europe and whether PA has any surcharge (the Q&A says no); official page blocked.
- Azure latency numbers for PA (not found; streaming is supported).
- SpeechSuper/SpeechAce server locations, retention, DPA, child policy; SpeechAce price list; ELSA API pricing (not public).
- Whether Azure PA scores are calibrated for children (the transparency note likely addresses this; not readable here).

## 3. Open-source and on-device assessment

### Takeaway

A wav2vec2/XLS-R phoneme recogniser (e.g. `facebook/wav2vec2-lv-60-espeak-cv-ft`, which has an ONNX export) plus alignment to the espeak-ng phonemisation of the target sentence is the standard DIY route and is multilingual. It is feasible on a small server; on a phone the "large" model (~1.2 GB) is too big. Research shows wav2vec2-based methods beat classic GOP, but non-native **children's** speech remains the hardest case. This is a build-your-own project, not a drop-in.

### Cited Findings

- `onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX`: ONNX version of facebook/wav2vec2-lv-60-espeak-cv-ft, fine-tuned on CommonVoice to output **multilingual phonetic labels**; a dictionary is needed to map phones to words — [Hugging Face](https://huggingface.co/onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX); [Wav2Vec2Phoneme docs](https://huggingface.co/docs/transformers/model_doc/wav2vec2_phoneme)
- OpenPronounce downloads two checkpoints of ~1.2 GB each — [OpenPronounce](https://github.com/Halleck45/OpenPronounce)
- sherpa-onnx: offline STT, TTS, VAD on Android, iOS, embedded, servers; 12 programming languages — [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)
- wav2vec2-based methods reported to outperform DNN-GOP on disordered and foreign-accented speech; studies on Dutch **children** speaking English (MPC dataset) and Mandarin children; non-native children's speech called "particularly challenging" due to acoustic variability — [Interspeech 2023, Shekar et al.](https://www.isca-archive.org/interspeech_2023/shekar23b_interspeech.html); [arXiv 2203.15937](https://arxiv.org/pdf/2203.15937); [ScienceDirect 2025](https://www.sciencedirect.com/science/article/pii/S0167639325000640)
- Logit-based GOP from CTC/wav2vec2 models is an active evaluation topic (2025) — [arXiv 2506.12067](https://arxiv.org/html/2506.12067v2); segmentation-free GOP avoids explicit forced alignment for CTC models — [arXiv 2507.16838](https://arxiv.org/html/2507.16838v2)

### Inferences

- Server option: run the ONNX wav2vec2 phoneme model on a small CPU/GPU container in europe-west4 (not on Vercel serverless — model size and cold starts). Pipeline: espeak-ng(target text, lang) → expected phones; model → heard phones (CTC posteriors); align (DTW/Levenshtein or CTC forced alignment) → per-phoneme GOP-like score. All data stays in own EU infrastructure — strongest GDPR story, but engineering + calibration effort (child thresholds per language) is weeks, not days.
- On-device: large wav2vec2 (~300M params) is impractical on mid-range phones; base-size models or quantised variants might fit but accuracy on children's L2 speech is unknown.
- Kaldi GOP, Montreal Forced Aligner, WhisperX, Vosk: known tools (MFA/WhisperX do alignment, not scoring; Vosk is ASR). Not researched in depth in this session — **from general knowledge, unverified**. WhisperX aligns words via a wav2vec2 model but inherits Whisper's auto-correction on the transcript side, so it doesn't solve the core problem.

### Gaps

- Allosaurus accuracy on children / German-accented English: no source found.
- Measured on-device latency for wav2vec2 phoneme models on mid-range phones: no source found.
- No public children's L2 French pronunciation dataset/benchmark found.

## 4. Is "multimodal LLM listens and judges" a sound approach?

### Takeaway

It is useful for **feedback wording and gross errors** (wrong word), but the research consensus in 2025–2026 is that **zero-shot audio-LLMs are poorly calibrated and systematically over-score / imprecise at phoneme level**; they reach good correlation with human ratings only when fine-tuned or combined with classic features. This matches LearnBuddy's observation (accent → "almost", correct → sometimes "almost").

### Cited Findings

- GPT-4o evaluated on Speechocean762 at multiple granularities; authors conclude integrating LMMs **with traditional methods** is effective — [arXiv 2503.11229](https://arxiv.org/abs/2503.11229) (abstract via search snippets; full text blocked)
- Zero-shot speech LLMs "judge delivery badly and systematically over-score"; Qwen2-Audio fluency PCC 0.053 (chance); direct-match accuracy r = 0.140 but r = 0.671 with ±2 tolerance; speech LLMs "overpredict low-quality speech scores and lack precision in error detection" — [arXiv 2601.16230 / SLaTE 2025, Parikh et al.](https://www.isca-archive.org/slate_2025/parikh25_slate.html)
- In a comparison, gemini-2.0-flash was the best-performing model on Speechocean762 data (gpt-4o-mini on MultiPA) — [Read to Hear, EMNLP 2025](https://aclanthology.org/2025.emnlp-main.134.pdf) (snippet)
- LoRA-fine-tuned speech MLLM reaches PCC > 0.7 with human scores on Speechocean762 for APA and MDD jointly — [arXiv 2509.02915](https://arxiv.org/html/2509.02915v1)
- "Pronunciation Assessment with Multi-modal LLMs" (2024) exists as further evidence — [arXiv 2407.09209](https://arxiv.org/html/2407.09209v2) (not read)

### Inferences

- The IPA-transcription prompt still passes through a language model that "knows" the target text and normalises toward it — the same auto-correction bias as STT, just weaker. Hence "almost" for real errors and false "almost" for correct speech.
- Speechocean762 is adult Mandarin-L1 English; no benchmark covers German-L1 children speaking French → LLM behaviour for LearnBuddy's reference user is unmeasured.
- Sensible role for Gemini: take Azure's structured phoneme scores as input and write the kind, age-appropriate feedback (fits CLAUDE.md rule 3: decisions from structured output, not from free-text).

### Gaps

- Exact GPT-4o/Gemini PCC numbers vs GOP baselines from 2503.11229 (paper blocked).
- No study found with children or with French/German targets.

## 5. Speech-to-text for spoken answers

### Takeaway

Keep on-device recognition via expo-speech-recognition as the primary path (free, private, low latency), but tune it: `maxAlternatives` (default 5) for n-best, `addsPunctuation: false`, `contextualStrings` with the expected answer(s) sparingly, and grade with a fuzzy match against all alternatives. For robust fallback in the EU, Gemini transcription is already cheap; Azure STT (same resource as pronunciation) or Deepgram are alternatives. whisper.rn is viable only with tiny/base models and brings the same "auto-correct" bias.

### Cited Findings

**expo-speech-recognition 57.1.0 (installed README, `node_modules/.../expo-speech-recognition/README.md`; repo [jamsawamsa/expo-speech-recognition](https://github.com/jamsawamsa/expo-speech-recognition))**

- Wraps iOS SFSpeechRecognizer, Android SpeechRecognizer, Web SpeechRecognition.
- `maxAlternatives` default 5; `interimResults`; `continuous` (not Android ≤12); `requiresOnDeviceRecognition` (default false); `addsPunctuation` default false (Android 13+ only with on-device); `contextualStrings`; `androidIntentOptions` (e.g. `EXTRA_LANGUAGE_MODEL: "web_search"`, silence length); `iosTaskHint` (`dictation|search|confirmation`); `recordingOptions.persist` saves the recognised audio to a file (Android 13+, iOS).
- Feature matrix: on-device recognition Android 13+ and iOS 17+; **word confidence & timing iOS 17+, Android 14+ only on-device**; contextual strings "seems to work better on iOS"; language detection Android 14+ only.
- Android: on-device requires the locale model to be downloaded (`getSupportedLocales()`, `androidTriggerOfflineModelDownload()`); on Android 13+ "you likely won't see any locales installed" by default; service package `com.google.android.tts` (13+) or Google app (≤12). README recommends `requiresOnDeviceRecognition: Platform.OS === "ios"`.
- Web: Chrome uses Google server-based recognition; Safari ≥16 uses Siri.

**iOS SFSpeechRecognizer**

- `requiresOnDeviceRecognition` forces local inference (no audio to Apple); on-device model may need a download; languages checked via `supportedLocales()` / `supportsOnDeviceRecognition`; limits **1 minute audio per request, 1,000 requests/device/hour**; `contextualStrings` recommended ≤100 short phrases — [Picovoice iOS guide 2026](https://picovoice.ai/blog/ios-speech-recognition/) (secondary); iOS 26 adds SpeechAnalyzer as successor — [Anton Gubarenko](https://antongubarenko.substack.com/p/ios-26-speechanalyzer-guide)

**whisper on device**

- Whisper tiny ≈2.4× faster than base, ≈4.8× faster than small; tiny.en INT8 <40 MB, <300 ms per 30 s chunk on Snapdragon 8 Gen 1 with NNAPI; budget phones 2–4× real-time — [MVP Factory](https://mvpfactory.io/blog/wiring-android-s-neural-networks-api-to-a-quantized-whisper-model-for-real-time); [Ionio](https://www.ionio.ai/blog/running-transcription-models-on-the-edge-a-practical-guide-for-devices) (secondary blogs, not whisper.rn-specific)

**Cloud STT**

- Google Chirp 3: ~$0.016/min ($0.96/h) real-time, dynamic batch $0.004/min; Chirp 3 preview regions listed as asia-south1, europe-west2, **europe-west3**, northamerica-northeast1 — **not europe-west4**; Chirp 2 GA in europe-west4 — [Google STT pricing](https://cloud.google.com/speech-to-text/pricing); [release notes](https://docs.cloud.google.com/speech-to-text/docs/release-notes) (via snippets)
- Deepgram Nova-3: ~$0.0043/min batch, $0.0077/min streaming; languages incl. English, Spanish, French, German, Italian — [Deepgram Nova-3 intro](https://deepgram.com/learn/introducing-nova-3-speech-to-text-api); prices from [convertaudiototext](https://convertaudiototext.com/blog/deepgram-nova-3-explained) (secondary)
- Azure STT real-time ~$1.32/h per Q&A above (some sources say $1/h list) — [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/5608069/pricing-and-usage-of-pronunciation-assessment-feat); [brasstranscripts](https://brasstranscripts.com/blog/azure-speech-services-pricing-2025-microsoft-ecosystem-costs)

### Inferences

- Raw, un-normalised recognition for vocabulary answers: no mainstream recogniser offers "no language-model correction". Best practical recipe: (1) request 5 alternatives, (2) no punctuation, (3) compare the normalised expected answer against **all** alternatives with an edit-distance tolerance in code (not word lists), (4) treat "expected word appears only because of contextualStrings" with care: phrase hints bias toward the expected answer and can turn a wrong answer into the right one → for vocabulary tests use hints only for proper nouns/rare words, not for the answer itself.
- For pronunciation, never use the STT transcript — route to Azure PA scripted mode with the reference text.
- Word-level confidence (iOS 17+, Android 14+ on-device) can serve as a weak "unsure" signal, not as a pronunciation score.
- A 5 s answer via Deepgram streaming ≈ $0.0006; via Gemini ≈ $0.00015 (measured by team) — Gemini fallback remains cheapest; Chirp 3 isn't in europe-west4.

### Gaps

- Official Android on-device locale list (not found; it's device/Google-app dependent — check at runtime via `getSupportedLocales()`).
- whisper.rn-specific benchmarks on mid-range phones; German/French accuracy of tiny/base on children.
- Deepgram EU endpoint pricing and DPA for minors.

## 6. Text-to-speech for model pronunciation

### Takeaway

Cloud neural TTS is cheap enough to generate every model sentence once and cache it (content is not personal data); on-device expo-speech voice quality depends on which voices the device has installed.

### Cited Findings

- `expo-speech ~14.0.8` is already a dependency (`apps/mobile/package.json`).
- Google Cloud TTS: Neural2 $16/1M chars, **Chirp 3 HD $30/1M**, Standard $4/1M; 4M standard chars/month free — [texttolab](https://texttolab.com/blog/google-cloud-tts-pricing); WaveNet listed as $16/1M by [aloa](https://aloa.co/ai/comparisons/ai-voice-comparison/elevenlabs-vs-google-cloud-tts) but $4/1M by another snippet — **conflicting**, check the official page.
- Azure neural TTS: 500K chars free, then $16/1M — [texttolab Azure](https://texttolab.com/blog/azure-text-to-speech-pricing) (secondary)

### Inferences

- A 60-character model sentence at $16/1M = ~$0.001; cached in storage keyed by (text, lang, voice) it is paid once across all learners. Model sentences contain no personal data → caching is GDPR-uncritical; do not cache personalised sentences containing the child's name.
- Azure TTS in the same Azure Speech resource as PA simplifies DPA/vendor count.

### Gaps

- Official TTS price pages not fetched; no objective quality comparison of expo-speech device voices found.

## 7. Recommendation for LearnBuddy (synthesis)

### Takeaway

(a) **Pronunciation:** switch the judging to **Azure Pronunciation Assessment (scripted mode, granularity Phoneme, EU region)**; keep Gemini only for turning the structured scores into kind feedback. (b) **Speech answers:** keep expo-speech-recognition on-device first with n-best + tolerant matching in code, Gemini transcription as fallback. (c) **TTS:** cloud neural TTS, generated once and cached.

### Cited Findings

- Azure covers de/en/fr/es/it, phoneme-level scores, streaming, no data retention for PA, ~$1.32/h — see §2 sources.
- Zero-shot LLM judges over-score and are imprecise at error detection — see §4 sources.

### Inferences

- Map Azure AccuracyScore thresholds (per language, tuned with a small set of real recordings from the target age group) to the three learner-facing states; show the worst phoneme(s) as the one hint. Thresholds live in code (CLAUDE.md rule 1).
- Keep the provider behind the existing `src/llm/` style seam so a self-hosted wav2vec2 scorer can replace Azure later if GDPR/cost demands.
- Before production with minors: verify Azure EU region + DPA/EU Data Boundary coverage, update `docs/privacy.md` processors list, and obtain parental consent for voice processing (Art. 8; voice may be treated as biometric per Microsoft's note).
- Fallback if Azure is rejected: SpeechSuper (age-group scoring, no Italian, unclear EU hosting) or self-hosted wav2vec2 phoneme scoring.

### Gaps

- No A/B measurement yet of Azure vs current Gemini prompt on real German-L1 child recordings — recommended as the first spike (20–30 recordings, en + fr, correct / accented / wrong-word).
