# On-device / offline pronunciation assessment: apps, SDKs, open-source references

Research date: 2026-09-26. Network note: learn.microsoft.com, docs.pytorch.org, arxiv.org, speechsuper.com, chivox.com, picovoice.ai and k2-fsa.github.io were **blocked** by the egress proxy. Where possible the same content was read in full from GitHub mirrors (MicrosoftDocs/azure-ai-docs, pytorch/audio, vendor repos). Evidence levels used below:

- **[FULL]** = read from the full primary source (usually the GitHub copy of the doc/README)
- **[SNIPPET]** = only a search-engine snippet/summary; not verified against the full page
- **[INFERENCE]** = my conclusion, not stated by a source

## 1. Which consumer apps assess pronunciation on-device or offline, and how?

### Takeaway

No major consumer app was found to publicly document on-device pronunciation _scoring_. ELSA, Speak, Duolingo, Rosetta Stone and Google describe their engines only in marketing terms, and Speak publicly uses a cloud ASR API (OpenAI). The on-device approaches that are documented come from B2B SDK vendors (section 2) and open source (section 3), not from consumer apps.

### Cited Findings

- **ELSA Speak:** uses "proprietary speech recognition technology based on deep-learning algorithms", trained on what ELSA calls the largest set of accented English voice data. ELSA also sells a B2B API that scores English at sentence, word and phoneme level. Nothing found says ELSA scores on-device. [SNIPPET] — [ELSA API](https://elsaspeak.com/en/elsa-api/); [api-evangelist/elsa](https://github.com/api-evangelist/elsa); [conversation.ai spotlight](https://www.conversation.ai/research/product-spotlight/elsa-teaches-english)
- **Speak (speak.com):** was a launch partner for OpenAI's new speech recognition API, which builds on Whisper. Speak says it was "testing the API in production", with lower latency and better word accuracy. This means server-side ASR. [SNIPPET] — [Speak + OpenAI Speech Recognition](https://www.speak.com/blog/speak-openai-speech-recognition)
- **Duolingo:** a Microsoft for Startups post (June 2025) names Fabio Lessa (Senior Director of Engineering) and Kevin Lenzo (Speech Lab Lead) as leading its speech work. No source was found that says whether speaking exercises are scored on-device or on a server. [SNIPPET] — [Microsoft for Startups blog](https://www.microsoft.com/en-us/startups/blog/duolingo-makes-learning-language-fun-with-help-from-ai/); [Duolingo blog](https://blog.duolingo.com/sneaky-pronunciation-practice/)
- **Rosetta Stone TruAccent:** compares the learner's speech in real time with "millions of examples from native speakers". It uses "statistical acoustic and language modeling methods" plus "feature-based adaptation methods to ensure learners are scored fairly, regardless of their vocal register". The last point is relevant to children and higher voices. The source does not say whether scoring runs on the device. Offline lesson download exists for Classic users (up to 30 days). [SNIPPET] — [Rosetta Stone TruAccent blog](https://blog.rosettastone.com/truaccent-learning-with-rosetta-stone/); [enterprise blog](https://enterpriseblog.rosettastone.com/accent-reduction/)
- **Google Search "Practice" pronunciation (2019):** records through the phone mic. Google's speech recognition "separates it into individual sounds" and compares them with expert pronunciation. It returns per-syllable feedback, a "Sounds like you said" phonetic respelling and tips. At launch it was American English only on mobile, with Spanish "coming soon". This is a good product pattern: a phonetic respelling of what was heard, not a word transcript. It runs server-side (part of Search). [SNIPPET] — [9to5Google](https://9to5google.com/2019/11/14/google-search-pronunciation/); [SlashGear](https://www.slashgear.com/google-search-lets-you-practice-pronunciations-directly-in-results-14599674/)
- **Babbel, Busuu, Apple:** no relevant engineering sources found in the searches run. [none]

### Inferences

- [INFERENCE] The big consumer apps treat the scoring engine as core IP and do not publish it. Nothing reusable can be taken from them except UX patterns (see section 5).
- [INFERENCE] Google's "Sounds like you said /…/" respelling addresses the product owner's complaint directly: it shows the phones that were _heard_ instead of an autocorrected word.

### Gaps

- Duolingo on-device vs. server: not found. The blog and the Duolingo Research pages were not reachable or not surfaced.
- Babbel, Busuu and Apple: no sources found. Apple's on-device `SFSpeechRecognizer` does not score pronunciation (my prior knowledge, not verified in this session).
- No patents were retrieved (the USPTO hit was unrelated).

## 2. Offline / embedded pronunciation SDKs (price model, languages, size, licence)

### Takeaway

The only commercial offline pronunciation-scoring SDK with public details is **SpeechSuper**, and its offline version covers only English and Mandarin. Its pricing is per device activation per year, per language. **Azure embedded speech does not document pronunciation assessment**: its docs cover only speech-to-text and TTS, and access requires Microsoft's approval. Picovoice, SoapBox and KidSense offer on-device _ASR_, but no documented pronunciation scoring. For German students learning EN/FR/ES/IT/RU on-device, no off-the-shelf SDK covers all five languages.

### Cited Findings

**Microsoft Azure AI Speech: embedded speech**

- "Embedded Speech is designed for on-device speech to text and text to speech scenarios where cloud connectivity is intermittent or unavailable." Pronunciation assessment does not appear anywhere in the embedded-speech doc. [FULL] — [embedded-speech.md (MicrosoftDocs GitHub)](https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/embedded-speech.md)
- "Microsoft limits access to embedded speech. You can apply for access through the … embedded speech limited access review." Model downloads are provided "upon successful completion of the limited access review". [FULL] — same source
- Platforms: C#, C++ and Java SDKs (Speech SDK 1.24.1 or later) and Python (1.51.0 or later). Android 8.0+ (API 26) on arm64-v8a or armeabi-v7a. "The other Speech SDKs, Speech CLI, and REST APIs don't support embedded speech." There is therefore no JavaScript/React Native binding, and **no iOS target is listed** (Android, Linux, macOS, Windows only). [FULL] — same source
- Memory: speech recognition needs "total size of the files of a model + 200 MB"; TTS needs 100–200 MB. Input must be 16-bit mono 8 or 16 kHz PCM. [FULL] — same source
- Cloud pronunciation assessment covers 33 locales, including en-GB, en-US, fr-FR, es-ES, it-IT, ru-RU and de-DE. Prosody assessment is en-US only. Syllable-level scores are en-US only. [FULL] — [language-support pronunciation include](https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/includes/language-support/pronunciation-assessment.md); [how-to-pronunciation-assessment.md](https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/how-to-pronunciation-assessment.md)
- Cloud pricing: "usage of pronunciation assessment costs the same as speech to text for Standard or commitment tier"; prosody and similar scores are an add-on charge. [FULL] — [pronunciation-assessment-tool.md](https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/pronunciation-assessment-tool.md)
- The speech-container overview doc also contains no mention of "pronunciation". [FULL, grep of the doc] — [speech-container-overview.md](https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/speech-container-overview.md)

**SpeechSuper**

- The offline SDK "works without the Internet, supports English and Mandarin Chinese". It gives phoneme-, word- and sentence-level scores and runs on iOS and Android. "Pricing is based on per device activation per year for a single language"; free trials are offered. [SNIPPET] — [speechsuper.com](https://www.speechsuper.com/); [Callin summary](https://callin.io/ai-tools/speechsuper/)
- The cloud API covers English, Chinese, German, French, Russian, Korean, Japanese and Spanish ("more to come"). **Italian is not listed.** Features: phoneme, syllable, word and sentence scores; stress; liaison; loss of plosion; insertion/deletion/substitution detection. [FULL] — [SpeechSuper-API-Samples README](https://github.com/speechsuper/SpeechSuper-API-Samples)
- The Android demo uses appKey/secretKey and an engine call `startSkegn(...)` with 16 kHz, 16-bit mono audio. The demo README does not say whether it is the online or offline engine. [FULL] — [SpeechSuper-SDK-Android-Java-Demo](https://github.com/speechsuper/SpeechSuper-SDK-Android-Java-Demo)

**Chivox (驰声)**

- Its team started from Cambridge University speech work in 2007. It scores English and Mandarin down to phonemes and delivers "API, SDK and MCP", covering "260+ English and Mandarin item types". Streaming scores arrive within "a few hundred milliseconds". No offline claim was found in the snippet. [SNIPPET] — [Chivox English assessment](https://www.chivox.com/en/products/english-speech-assessment); [Chivox about](https://www.chivox.com/about)

**iFlytek**

- An "Iflytek Voice Review SDK" appears in app-tracking data. iFlytek's consumer hardware (e.g. the dictionary pen) works offline. No public offline-SDK spec for pronunciation was found. [SNIPPET] — [Fork.ai](https://fork.ai/technologies/audio-processing/iflytek-voice-review); [iFlytek store](https://store.iflytek.com/blogs/news/how-to-use-iflytek-dictionary-pen)

**Picovoice (Leopard / Cheetah / Rhino)**

- Leopard (batch) and Cheetah (streaming) are on-device STT engines. Leopard supports EN, FR, DE, IT, JA, KO, PT and ES (**no Russian**). Custom vocabulary can include IPA pronunciations. Picovoice's language-learning blog only describes _how_ phoneme-based comparison could work ("predict phonemes and compare them to what you'd expect from a native speaker… requires a model that understands phonemes and a pronunciation dictionary"). None of the Picovoice engines outputs a pronunciation score. [SNIPPET] — [Picovoice language-learning blog](https://picovoice.ai/blog/speech-recognition-for-language-learning/); [Leopard docs](https://picovoice.ai/docs/leopard/); [Cheetah docs](https://picovoice.ai/docs/cheetah/)

**Speechace**

- Cloud API only in the sources found: "$40–125 monthly plans" plus "$0.008 per extra 15-second request". It scores from phoneme to spontaneous speech. No offline SDK found. [SNIPPET, second-hand via a competitor blog] — [Speechace API plans](https://www.speechace.com/api-plans/); [toneperfect blog](https://api.toneperfect.app/blog/what-is-a-pronunciation-assessment-api/)

**SoapBox Labs (now part of Curriculum Associates)**

- Built its engine from scratch for ages 2–12. It was trained on thousands of hours of children's speech from 192 countries and claims "95% accuracy for kids ages 2–12". It is "available as an on-device solution … or as an embedded solution on a chip". Privacy by design: kids' voice data is never re-used or sold. It is primarily English literacy/reading. soapboxlabs.com now reads "About AI Research & Innovation | Curriculum Associates", which suggests it is no longer an open vendor. [SNIPPET] — [SoapBox technology](https://www.soapboxlabs.com/technology/); [CNN 2021](https://edition.cnn.com/2021/08/23/tech/ireland-soapbox-labs-voice-technology-children-spc/index.html); [soapboxlabs.com](https://www.soapboxlabs.com/)

**KidSense.ai (Kadho, acquired by ROYBI in 2020)**

- Offers "embedded" (offline) children's ASR in English, French, Spanish, Mandarin, Korean and others. Built from 150,000+ children's voices. COPPA and GDPR-K compliant. It is ASR, not pronunciation scoring. The ROYBI acquisition makes availability as a third-party SDK doubtful. [SNIPPET] — [ABNewswire embedded KidSense](https://www.abnewswire.com/pressreleases/kadho-launches-embedded-kidsenseai-an-offline-speech-recognition-technology-for-children_234498.html); [BusinessWire ROYBI acquisition](https://www.businesswire.com/news/home/20200225005081/en/ROYBI-Acquires-KidSense.AI-The-Leading-Speech-Recognition-AI-Platform)

### Inferences

- [INFERENCE, strong] Azure embedded speech gives **no offline pronunciation assessment**. The full doc lists only STT and TTS, and has no iOS target and no JS/React-Native binding. For an Expo/React Native app it is not a fit even with approval.
- [INFERENCE] SpeechSuper offline is the only licensable drop-in, but it covers EN only for our target languages. FR/ES/IT/RU would still need cloud or a custom solution. The per-device-per-year-per-language pricing grows with the number of learners and languages.
- [INFERENCE] The children's-speech vendors (SoapBox, KidSense) did do on-device work. However, both were acquired, both do ASR or reading assessment rather than L2 phoneme scoring, and both are English-first.

### Gaps

- Actual SpeechSuper offline prices and model size in MB: not public in the sources reached (vendor site blocked).
- Whether Azure offers pronunciation assessment in _disconnected containers_: the container overview has no mention, but the disconnected-containers doc was not checked.
- Chivox and iFlytek offline SDK specs and pricing: not found (sites blocked or Chinese-only).
- Picovoice price: not retrieved.

## 3. Open-source reference projects for local pronunciation scoring

### Takeaway

There are three proven open patterns. (a) **Kaldi GOP** (the classic GMM/DNN-HMM posterior ratio, with the speechocean762 baseline recipe). (b) **CTC phone recognizer / forced alignment with wav2vec2** (OpenPronounce; torchaudio MMS_FA). (c) Learned scorers on top of GOP features (GOPT). All of them run locally; none was found packaged for mobile. **sherpa-onnx** (Apache-2.0) is the most practical mobile runtime (Android, iOS, Flutter, WASM; open-vocabulary keyword spotting), but it ships **no pronunciation-assessment example**.

### Cited Findings

- **Kaldi `egs/gop_speechocean762`:** implements GOP-NN, defined as "the log phone posterior ratio between the canonical phone and the one with the highest score (Hu et al., 2015)". GOP-GMM (Witt et al., 2000) is not implemented because "GOP-NN performs much better". The numerator comes from forced alignment, the denominator from an unconstrained phone loop. [FULL] — [Kaldi GOP README](https://github.com/kaldi-asr/kaldi/tree/master/egs/gop_speechocean762)
- **speechocean762 dataset:** 5,000 English utterances from 250 L2 speakers (native Mandarin), half of them children aged 5–15. Five experts annotated each utterance at sentence, word and phone level (phone labels: 0 = mispronounced, 1 = accented, 2 = correct). Licence CC BY 4.0, "free for commercial and non-commercial" use. Available on OpenSLR 101 and HF `mispeech/speechocean762`. [FULL for README/HF example; SNIPPET for the demographics] — [jimbozhang/speechocean762](https://github.com/jimbozhang/speechocean762); [arXiv 2104.01378](https://arxiv.org/abs/2104.01378); [GOPT README (licence)](https://github.com/YuanGongND/gopt)
- **GOPT (ICASSP 2022):** a transformer over Kaldi GOP features, multi-aspect and multi-granularity. With a public LibriSpeech acoustic model it reaches phone PCC 0.612, word 0.549 and utterance 0.742 on speechocean762. The PAII acoustic models "will not be released". [FULL] — [YuanGongND/gopt](https://github.com/YuanGongND/gopt)
- **OpenPronounce (MIT):** input is a recording plus a target sentence. `facebook/wav2vec2-lv-60-espeak-cv-ft` recognizes phones "straight from the audio. No language model gets a chance to 'correct' the learner". This is exactly the product owner's problem, solved by using a phone recognizer instead of word ASR. Expected phones come from espeak-ng, and alignment uses DTW. Score = 0.3·acoustic + 0.4·(1−PER) + 0.3·(1−WER), fitted on 500 speechocean762 utterances with Spearman ρ = 0.65 against the human total (0.83 per speaker). English is calibrated; FR/ES/DE/IT/PT/NL are "experimental" and reuse the English thresholds. Its own caveats: "children … degrade the recognition", the phone recognizer errs on "about one sound in ten on a clean native reading", and "one flagged word in five is rated as mispronounced by the human raters". It needs two ~1.2 GB checkpoints, which is server/desktop-scale, not phone-scale. [FULL] — [Halleck45/OpenPronounce](https://github.com/Halleck45/OpenPronounce)
- **torchaudio multilingual forced alignment (MMS_FA):** `Wav2Vec2FABundle` with an acoustic model "trained with 23,000 hours of audio from 1100+ languages". It needs romanized, normalized transcripts (uroman). The demos include German and Italian. Per-word score = length-weighted average of the token span scores. **Warning: "APIs described in this tutorial are deprecated in 2.8 and will be removed in 2.9".** [FULL] — [pytorch/audio tutorial source](https://github.com/pytorch/audio/blob/main/examples/tutorials/forced_alignment_for_multilingual_data_tutorial.py)
- **Other research code on speechocean762:** ConPCO (contrastive ordinal regularization), joint-apa-mdd-mtl (Interspeech 2023, joint assessment plus mispronunciation detection). [SNIPPET] — [ConPCO](https://github.com/bicheng1225/ConPCO); [joint-apa-mdd-mtl](https://github.com/rhss10/joint-apa-mdd-mtl)
- **Recent MDD/GOP directions:** CTC-based GOP with phonological knowledge (arXiv 2506.02080); segmentation-free GOP (2507.16838); training-free retrieval-based MDD with F1 69.6% on L2-ARCTIC (2511.20107); "Light-weight Pronunciation Assessment via Discrete Speech Token Surprisal" (2606.19910). [SNIPPET, titles/abstracts only] — [2506.02080](https://arxiv.org/pdf/2506.02080); [2507.16838](https://arxiv.org/pdf/2507.16838); [2511.20107](https://arxiv.org/html/2511.20107v1); [2606.19910](https://arxiv.org/pdf/2606.19910)
- **sherpa-onnx:** Apache-2.0. Offline STT, TTS, VAD and keyword spotting via onnxruntime. Runs on Android, iOS, HarmonyOS, Flutter, WASM and others, with pre-built KWS APKs. KWS models are tiny: `kws-zipformer-gigaspeech-3.3M` (English) and `kws-zipformer-zh-en-3M-2025-12-20`. [FULL for README/licence; SNIPPET for the model list] — [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx); [sherpa KWS docs](https://k2-fsa.github.io/sherpa/onnx/kws/index.html)
- sherpa-onnx has open-vocabulary KWS where keywords are given as token/phone sequences. An issue asks about syllable-level recognition with it. [SNIPPET] — [issue #920](https://github.com/k2-fsa/sherpa-onnx/issues/920)

### Inferences

- [INFERENCE] The most reusable recipe for LearnBuddy has four steps. (1) A multilingual CTC **phone** recognizer (wav2vec2-espeak / XLSR-phoneme class), quantized to ONNX. (2) Expected phones from espeak-ng G2P for EN/FR/ES/IT/RU. (3) CTC forced alignment plus a GOP-like posterior ratio per phone, or PER-based alignment as OpenPronounce does. (4) Per-word pass/fail thresholds. Nothing ready-made packages this for React Native; running it through onnxruntime-mobile or sherpa-onnx's runtime is custom engineering.
- [INFERENCE] sherpa-onnx KWS (a 3M-parameter zipformer, English/Chinese only) could handle "did the child say the target word at all?", but not _how well_ each sound was said. It also does not cover FR/ES/IT/RU without training.
- [INFERENCE] The torchaudio deprecation means we should not build on `torchaudio.pipelines.MMS_FA` long-term. Port the CTC alignment (Viterbi over CTC is ~50 lines) or use the model directly.

### Gaps

- Mobile-scale (<100 MB) multilingual phone recognizers: model sizes for quantized wav2vec2-phoneme or XLSR-53-espeak were not verified here.
- No open-source _mobile_ pronunciation-scoring app was found in these searches.

## 4. Children's speech (10–14 years)

### Takeaway

Children's speech degrades off-the-shelf ASR and phone recognizers substantially: higher f0, shifted formants, more variability, and little training data. Fine-tuning on child data such as MyST roughly cuts error by a third. A 12-year-old is less extreme than the 5–8-year-olds in most studies, but adult-trained models (OpenPronounce explicitly) will false-alarm more.

### Cited Findings

- Whisper fine-tuning on **MyST** (the largest public children's corpus, free for academic research) cut WER from 13.93% to 9.11% (Whisper-Small) and from 13.23% to 8.61% (Whisper-Medium). [SNIPPET] — [Kid-Whisper, arXiv 2309.07927](https://arxiv.org/html/2309.07927)
- On-device child ASR: a fine-tuned Whisper `tiny.en` reached 15.9% WER on MyST. With low-rank compression it runs in real time "without overhead to RAM or CPU" (edge device). [SNIPPET] — [arXiv 2507.14451](https://arxiv.org/pdf/2507.14451)
- Known remedies: feature normalization and augmentation based on the formant–f0 relationship (tested on OGI/CSLU Kids); pitch shifting, formant shifting and speed perturbation. [SNIPPET] — [Transducer/Whisper/wav2vec2 child ASR comparison, arXiv 2311.04936](https://arxiv.org/pdf/2311.04936)
- OpenPronounce: "Wav2Vec2 was trained on read speech by adults. Strong accents, children and noisy recordings degrade the recognition, and therefore the feedback." [FULL] — [OpenPronounce](https://github.com/Halleck45/OpenPronounce)
- speechocean762 contains children aged 5–15 (half the speakers), so it is a usable English child L2 calibration set, though with Mandarin L1 speakers. [SNIPPET] — [arXiv 2104.01378](https://arxiv.org/abs/2104.01378)
- Rosetta Stone says TruAccent uses "feature-based adaptation methods" so learners are scored "regardless of their vocal register". [SNIPPET] — [Rosetta Stone](https://blog.rosettastone.com/truaccent-learning-with-rosetta-stone/)

### Inferences

- [INFERENCE] For 12-year-olds, expect adult-trained phone recognizers to over-flag errors. Thresholds should be calibrated on child speech, and the feedback should be lenient: only flag high-confidence errors.
- [INFERENCE] No public child L2 corpus for French, Spanish, Italian or Russian was found. Calibration for those languages would need the app's own (consented) data, or native-child TTS/golden-speech approaches.

### Gaps

- CSLU Kids and the "SpeechOcean kids" corpora: licence and ages were not verified.
- No numbers were found specifically for 10–14-year-olds vs. younger children on phone-level MDD.

## 5. Product design when scoring is uncertain, and cost comparison

### Takeaway

The documented patterns are: a phonetic "sounds like you said" respelling (Google); per-phoneme or per-word scores with flagged words (Azure, SpeechSuper, OpenPronounce); and comparison with native examples (TruAccent). With an imperfect model, feedback should be coarse per word and flag only high-confidence errors (OpenPronounce reports that only 1 in 5 flagged words was confirmed by human raters). For cost, cloud APIs are cheap per sentence, but all send audio off-device. On-device has zero marginal cost but real engineering cost, and SpeechSuper offline licensing is per device per year.

### Cited Findings

- Google pattern: per-syllable match, a "Sounds like you said" phonetic respelling, and tips on the specific sounds. [SNIPPET] — [9to5Google](https://9to5google.com/2019/11/14/google-search-pronunciation/)
- Azure pattern: accuracy scores at phoneme, syllable (en-US only), word and full-text level; miscue detection (omission/insertion); scripted (reference text) vs. unscripted. Microsoft notes that the unscripted mode uses a different STT model. [FULL] — [how-to-pronunciation-assessment.md](https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/how-to-pronunciation-assessment.md)
- OpenPronounce precision caveat: roughly 1 in 10 phone errors on clean native speech, and 1 in 5 flagged words confirmed by humans. [FULL] — [OpenPronounce](https://github.com/Halleck45/OpenPronounce)
- Paid API prices: Speechace charges $0.008 per extra 15-second request on top of $40–125/month plans. [SNIPPET] — [Speechace plans](https://www.speechace.com/api-plans/). Azure pronunciation assessment is billed at the speech-to-text rate, and prosody costs extra. [FULL] — [pronunciation-assessment-tool.md](https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/pronunciation-assessment-tool.md)
- SpeechSuper offline: per device activation per year per language. [SNIPPET] — [speechsuper.com](https://www.speechsuper.com/)

### Inferences

- [INFERENCE, arithmetic] Speechace: 1,000 sentences of 15 s or less at $0.008 each ≈ **$8 per 1,000** in overage pricing, before the monthly base fee.
- [INFERENCE] Azure: 1,000 sentences × ~5 s ≈ 83 min of audio. At a typical standard STT list price of about $1/audio-hour (my prior knowledge, **not verified**: the Azure pricing page was not fetched), that is roughly **$1–2 per 1,000 sentences**, still cloud.
- [INFERENCE] Self-hosted OpenPronounce-class model on a CPU server: marginal cost of cents per 1,000 sentences, plus fixed server cost. Voice data would still leave the phone, which conflicts with the stated goal.
- [INFERENCE] On-device: €0 per use. The cost is engineering: model conversion to ONNX, quantization, G2P for five languages, threshold calibration on child speech, and roughly 100–400 MB of app download (unverified estimate).
- [INFERENCE] UX suited to imperfect models, consistent with LearnBuddy's "never harsh" rule:
  - one green/amber result per word, never a percentage;
  - flag at most one sound, and only if confidence is high;
  - always offer "listen and compare": native TTS at normal and slow speed next to the child's own recording;
  - use minimal-pair drills when a sound keeps failing.

### Gaps

- No A/B evidence was found comparing traffic-light, pass/fail and numeric score UX for learning outcomes.
- The Azure per-hour STT price and SpeechSuper offline license prices were not verified (pages blocked).
