# On-device phone recognition and pronunciation scoring for LearnBuddy (small models on a smartphone)

Research date: 2026-09-26. Network note: arxiv.org, aclanthology.org, huggingface.co, learn.microsoft.com, alphacephei.com, speechsuper.com, picovoice.ai and themoonlight.io were **blocked** by the sandbox egress proxy. Primary sources actually read in full: GitHub raw files (ZIPA README + LICENSE + ONNX sample output, Allosaurus README + LICENSE, Charsiu README, sherpa-onnx README, Epitran README, OpenPhonemizer README, Microsoft `embedded-speech.md` doc source on GitHub, SpeechSuper Android SDK repo page), PyPI JSON metadata. Everything else comes from **search-engine snippets** and is marked `[snippet]`. `[verified]` = read in the full primary source. `[inference]` = my reasoning, not a source.

## 1. Candidate models (size, languages, licence, accuracy, export formats)

### Takeaway

ZIPA-CR-small (64M params, CTC, MIT code, official ONNX fp32/fp16/int8 exports "for browsers and phones") is the strongest open candidate for on-device multilingual IPA recognition in 2025–2026; POWSM (CC-BY-4.0) is a close research peer but is Whisper-style encoder-decoder and larger. wav2vec2/XLS-R espeak phoneme models are ~300M params (Apache-2.0) and too heavy without distillation; Allosaurus is tiny (~11M) but GPL-3 code and clearly weaker; Vosk/Moonshine/Whisper are word recognisers and share the "auto-correct" problem.

### Cited Findings

**ZIPA (Zhu et al., ACL 2025)**

- ZIPA is "a family of efficient speech models" for crosslinguistic phone recognition, trained on IPAPack++ (17,132 h of multilingual speech with normalised phone transcriptions); variants are transducer (ZIPA-T) and CTC (ZIPA-CR) on a Zipformer backbone; further noisy-student training on 11,000 h pseudo-labelled data; error analysis shows "persistent limitations in modeling sociophonetic diversity". Published ACL 2025, arXiv 2505.23170 (29 May 2025). `[snippet]` — [arXiv abstract](https://arxiv.org/abs/2505.23170), [ACL Anthology](https://aclanthology.org/2025.acl-long.961/)
- Model sizes: ZIPA-T-small 65M, ZIPA-T-large 302M, ZIPA-CR-small 64M, ZIPA-CR-large 300M, ZIPA-CR-NS-small 64M (700k steps), ZIPA-CR-NS-large 300M; "no diacritics" variants of CR-NS small/large also exist. Hugging Face repos under `anyspeech/` (e.g. `anyspeech/zipa-small-crctc-ns-700k`). `[verified]` — [ZIPA README](https://github.com/lingjzhu/zipa)
- Official ONNX exports: "we provide optimized ONNX models (FP32, FP16, and INT8) for efficient inference (on your browsers and phones)"; "low precision models might lead to slightly worse performance". CTC models are a single `model.onnx`; transducers are encoder/decoder/joiner ONNX files. Output vocabulary: SentencePiece unigram with 127 IPA symbols (`ipa_simplified/unigram_127.model`). `[verified]` — [ZIPA README](https://github.com/lingjzhu/zipa)
- The published ONNX sample output on an English LibriSpeech-style sentence shows fp32/fp16/int8 outputs of `zipa-cr-large` and `zipa-cr-ns-small-700k` are nearly identical (int8 drops/changes ~1–2 phones per sentence, e.g. missing `ʌ` or `ɑ`→`ɔ`). `[verified]` — [inference_results_all.txt](https://github.com/lingjzhu/zipa/blob/main/scripts/onnx_scripts/inference_results_all.txt)
- Code licence: MIT ("Copyright (c) 2025 jzhu"). `[verified]` — [ZIPA LICENSE](https://github.com/lingjzhu/zipa/blob/main/LICENSE). Licence of the HF weight repos: **not verified** (HF blocked).
- Accuracy: search snippet of the paper's Table 2 (PFER, seen languages): ZIPA-CR-small (64M) 2.36 vs Allosaurus (11M) 4.18, W2V2P-lv-60-ft (300M) 4.09, MultIPA (300M) 11.26 "on the first evaluated language/metric"; "64M ZIPA models trained from scratch outperform larger (300M+) pretrained and fine-tuned baselines on seen languages". `[snippet — per-language breakdown not read]` — [ResearchGate/ZIPA PDF snippet](https://www.researchgate.net/publication/392203803_ZIPA_A_family_of_efficient_models_for_multilingual_phone_recognition)
- Built on Icefall / next-gen Kaldi (k2), i.e. the same family as sherpa-onnx. `[verified]` — [ZIPA README](https://github.com/lingjzhu/zipa)

**POWSM (ESPnet/CMU, arXiv 2510.24992, ACL 2026)**

- "First unified framework" jointly doing phone recognition, ASR, audio-guided G2P and P2G; attention encoder-decoder like Whisper (built on OWSM); trained from scratch on 17k h IPAPack++; "outperforms or matches specialized PR models of similar size (Wav2Vec2Phoneme and ZIPA)". `[snippet]` — [arXiv](https://arxiv.org/abs/2510.24992), [ACL 2026](https://aclanthology.org/2026.acl-long.813/)
- Licence CC-BY-4.0 on `espnet/powsm`; a **POWSM-CTC** encoder-only variant exists (HF Space `espnet/powsm-ctc`); January 2026 retrained version with better ASR text normalisation. `[snippet]` — [HF espnet/powsm](https://huggingface.co/espnet/powsm), [HF Space POWSM-CTC](https://huggingface.co/spaces/espnet/powsm-ctc)
- Parameter count, ONNX/mobile exports: **not found**.

**wav2vec2 / XLS-R espeak phoneme CTC (Wav2Vec2Phoneme, Xu, Baevski, Auli "Simple and Effective Zero-shot Cross-lingual Phoneme Recognition")**

- `facebook/wav2vec2-xlsr-53-espeak-cv-ft`: fine-tuned from wav2vec2-large-xlsr-53 on multilingual Common Voice to output espeak phonetic labels; 16 kHz input; licence Apache-2.0. `[snippet]` — [HF model card](https://huggingface.co/facebook/wav2vec2-xlsr-53-espeak-cv-ft)
- ZIPA paper lists Wav2Vec2Phoneme baselines at 300M params. `[snippet]` — [ZIPA PDF snippet](https://www.researchgate.net/publication/392203803_ZIPA_A_family_of_efficient_models_for_multilingual_phone_recognition)
- Widely used as the backbone in 2025 CTC-GOP mispronunciation papers (e.g. xlsr-53-espeak-cv-ft). `[snippet]` — [arXiv 2506.02080](https://arxiv.org/abs/2506.02080), [arXiv 2506.12067](https://arxiv.org/pdf/2506.12067)
- Known HF issues: "Inconsistent demo output", "Demo does not work", transformers bug #35064 when running the model. `[snippet: titles only]` — [HF discussion 4](https://huggingface.co/facebook/wav2vec2-xlsr-53-espeak-cv-ft/discussions/4), [transformers #35064](https://github.com/huggingface/transformers/issues/35064)

**MultIPA** — 300M params in ZIPA's comparison, PFER 11.26 in the cited cell (worst of the baselines). `[snippet]` — [ZIPA PDF snippet](https://www.researchgate.net/publication/392203803_ZIPA_A_family_of_efficient_models_for_multilingual_phone_recognition)

**Allosaurus**

- "Pretrained universal phone recognizer … more than 2000 languages"; default universal model `uni2005`; language-specific model only `eng2102` (English); `--lang` restricts the phone inventory, which "can improve your recognition accuracy"; supports fine-tuning on one language; blank-prior tuning changes number of output phones. `[verified]` — [Allosaurus README](https://github.com/xinjli/allosaurus)
- Code licence **GPL-3.0** (LICENSE file is GPLv3; PyPI 1.0.2 lists no licence field). `[verified]` — [Allosaurus LICENSE](https://github.com/xinjli/allosaurus/blob/master/LICENSE), [PyPI](https://pypi.org/project/allosaurus/)
- ~11M params in ZIPA's comparison, PFER 4.18 vs 2.36 for ZIPA-CR-small in the cited cell. `[snippet]` — [ZIPA PDF snippet](https://www.researchgate.net/publication/392203803_ZIPA_A_family_of_efficient_models_for_multilingual_phone_recognition)
- Team's own sandbox test: uni2005 (41 MB tarball) poor on synthetic espeak voices. `[project observation, from task brief]`

**Charsiu (phone aligner)**

- Transformer (wav2vec2-based) phonetic aligner: forced alignment from phone transcription, and text-independent alignment; checkpoints e.g. `charsiu/en_w2v2_fc_10ms`, `charsiu/zh_xlsr_fc_10ms`; language status table: English (American) and Mandarin done, British English "TBD"; MIT licence; uses g2p_en / g2pM. `[verified]` — [Charsiu README](https://github.com/lingjzhu/charsiu)
- So Charsiu does **not** cover fr/es/it/ru/de. `[verified from the language table]`

**sherpa-onnx (k2-fsa)**

- Runtime for ONNX speech models on Android, iOS, HarmonyOS, Windows, macOS, Linux, Flutter (incl. Web), plus keyword spotting, VAD, etc.; pre-built Android APKs. `[verified]` — [sherpa-onnx README](https://github.com/k2-fsa/sherpa-onnx)
- A React Native wrapper `react-native-sherpa-onnx` exists (ASR, TTS, VAD, KWS on iOS/Android/Web), Apache-2.0 sherpa-onnx + MIT ONNX Runtime, with an Expo config plugin and a model download manager. `[verified: README downloaded to scratchpad]` — [react-native-sherpa-onnx (npm)](https://www.npmjs.com/package/react-native-sherpa-onnx)
- No pre-packaged sherpa-onnx _phone-recognition_ model found in the README. `[verified: absence in README]`

**Vosk / Kaldi small models**

- Per-language portable models ~50 MB; 20+ languages including English, German, French, Spanish, Russian, Italian; Android/iOS APIs. `[snippet]` — [Vosk site](https://alphacephei.com/vosk/), [vosk-api GitHub](https://github.com/alphacep/vosk-api)
- The Vosk API returns words with confidences; I found no documented phone-level/GOP output. `[inference; Vosk docs were blocked]`

**Moonshine** — tiny ASR (27M) specialised monolingual models; "Flavors of Moonshine" (Sept 2025) releases Arabic, Chinese, Japanese, Korean, Ukrainian, Vietnamese; claims 5–15× faster than Whisper on-device. Word-level ASR, no phone output, and none of fr/es/it/ru/de in that release. `[snippet]` — [arXiv 2509.02523](https://arxiv.org/abs/2509.02523v1)

**Microsoft Azure embedded speech** — see §4.

### Inferences

- Size estimates `[inference]`: 64M params ≈ 250 MB fp32, ≈ 130 MB fp16, ≈ 65–75 MB int8; 300M ≈ 1.2 GB fp32 / ≈ 300–350 MB int8 — the 300M class is not realistic to bundle in a kids' app; ZIPA-CR-small int8 is a plausible "download on first use" asset.
- Latency: no phone benchmark found. A 64M Zipformer CTC on a 3–5 s school sentence should be well under a second on a recent phone via ONNX Runtime (Zipformer-based streaming ASR of similar size runs real-time in sherpa-onnx on phones) `[inference, unmeasured]`.
- ZIPA-CR (CTC) is preferable to ZIPA-T for our use: CTC posteriors directly support forced alignment and CTC-GOP (§2); transducers don't give frame posteriors per phone as simply.
- Because ZIPA is Icefall/k2-based and exports standard ONNX, it can likely be loaded through sherpa-onnx's generic CTC path or plain onnxruntime-react-native; needs fbank features identical to training (lhotse/kaldifeat 80-dim) — sherpa-onnx already computes those. `[inference, unverified]`
- Whisper-tiny/base "phoneme fine-tunes": found no reputable, maintained multilingual one; also, an autoregressive decoder has an implicit language model that tends to "correct" towards plausible sequences — the exact failure mode LearnBuddy saw with dictation. CTC models without an LM are less prone. `[inference]`

### Gaps

- ZIPA's per-language PER/PFER for en/fr/es/it/ru/de, and exact list of IPAPack++ languages: paper PDF blocked. Confirm IPAPack++ contains these six (very likely, since it draws on Common Voice/MLS-type corpora, but **not verified**).
- ZIPA HF weight licence and actual ONNX file sizes: HF blocked.
- POWSM parameter count and any mobile export: not found.
- NVIDIA NeMo small phone models: not researched in time (no evidence found).
- "BranchShine: Compact Raw-Audio-to-IPA Transcription with a RoPE E-Branchformer Encoder" (arXiv 2606.22824, 2026) appeared in search as a new compact IPA model — only the title seen. [arXiv](https://arxiv.org/pdf/2606.22824)
- No measured on-phone latency for any phone recogniser.

## 2. Techniques that work with small models (GOP, constrained decoding, G2P licensing)

### Takeaway

The robust pattern is: expected phones from a G2P → CTC phone model posteriors → forced alignment + per-phone GOP (ideally alignment-free/"substitution-aware" CTC-GOP restricted to plausible learner substitutions) → feedback on the weakest phones. Free recognition + edit distance is a useful secondary signal but noisier. espeak-ng is GPL-3 and incompatible with App Store distribution if bundled — but LearnBuddy can run G2P **on the server** when the exercise is prepared and ship only the phone strings.

### Cited Findings

- Classic GOP depends on forced alignment, which is "prone to labeling and segmentation errors due to acoustic variability"; alignment-free CTC GOP avoids this but is "computationally expensive and scale[s] poorly with phoneme sequence length and inventory size"; the Interspeech 2025 paper proposes a **substitution-aware alignment-free GOP** that restricts substitutions to phoneme clusters/common learner errors (RPS), evaluated on My Pronunciation Coach (child L2 speech) and speechocean762 (child + adult), outperforming the baseline. `[snippet]` — [arXiv 2506.02080](http://arxiv.org/abs/2506.02080v2), [ISCA archive](https://www.isca-archive.org/interspeech_2025/parikh25_interspeech.html)
- Earlier work: self-alignment GOP (GOP-SA) and segmentation-free GOP (GOP-SF) make CTC-trained models usable for MDD; logit-based GOP scores evaluated in 2025. `[snippet]` — [arXiv 2506.12067](https://arxiv.org/pdf/2506.12067), [ResearchGate CTC framework](https://www.researchgate.net/publication/383654926_A_Framework_for_Phoneme-Level_Pronunciation_Assessment_Using_CTC)
- Lightweight 2026 alternative: pronunciation scoring from discrete-token **surprisal** (SSL encoder + K-means codebook), trained only on native speech, exceeding prior zero-shot results on speechocean762 and transferring to L2-ARCTIC. `[snippet]` — [arXiv 2606.19910](https://arxiv.org/html/2606.19910v1)
- Allosaurus supports restricting output to a language's phone inventory and a blank prior to control deletions — a cheap form of constrained decoding. `[verified]` — [Allosaurus README](https://github.com/xinjli/allosaurus)
- Keyword spotting is built into sherpa-onnx (open-vocabulary KWS with thresholds). `[verified]` — [sherpa-onnx README](https://github.com/k2-fsa/sherpa-onnx). But KWS is word/BPE-based and would share the "near-miss accepted" problem unless used with a strict threshold. `[inference]`

**G2P options and licences**

- espeak-ng: GPLv3; "the GPL version 3 is not compatible with the app store"; statically linking libespeak-ng makes the extension GPLv3. There is an open issue "Switch license from GPL to LGPL" (#2131) and a discussion "Is espeak-ng license contaminating?" (#1868). `[snippet]` — [espeak-ng-ios-app LICENSE](https://github.com/espeak-ng/espeak-ng-ios-app/blob/master/LICENSE.md), [issue #2131](https://github.com/espeak-ng/espeak-ng/issues/2131), [discussion #1868](https://github.com/orgs/espeak-ng/discussions/1868)
- Downstream projects treat phonemizer (GPLv3+) as a real licence conflict and avoid bundling it (e.g. fetch on first run). `[snippet]` — [askwell issue #619](https://github.com/Rumeasiyan/askwell/issues/619), [clispeak issue #132](https://github.com/clispeak/clispeak/issues/132)
- Epitran: MIT ("MIT-Modern-Variant" on PyPI 1.35.2); has `deu-Latn`, `eng-Latn` (English requires the external Flite lexicon, marked ‡), `fra-Latn`, `ita-Latn`, `rus-Cyrl`, `spa-Latn` — all six target languages. `[verified]` — [Epitran README](https://github.com/dmort27/epitran), [PyPI](https://pypi.org/project/epitran/)
- OpenPhonemizer: permissive (BSD-3-Clause Clear per snippet), espeak-compatible DeepPhonemizer; **English only**, "no longer being maintained" (successor NextPhonemizer). `[verified README]` — [OpenPhonemizer](https://github.com/strjoedfuva-web/OpenPhonemizer)
- CharsiuG2P: not researched in time.

### Inferences

- LearnBuddy already has a server that prepares practice (CLAUDE.md "Buddy prepares practice"). Running espeak-ng/phonemizer **server-side** (no distribution → GPL obligations not triggered for the app binary) and sending the expected IPA sequence with the exercise avoids any on-device G2P. Only the phone recogniser/aligner + scoring code needs to be on the phone. `[inference; confirm with legal]`
- The expected-phone inventory must be mapped onto the model's inventory (ZIPA 127 symbols, Allosaurus per-language inventory, espeak labels for wav2vec2). A per-language mapping table plus "equivalence classes" (e.g. treat ɹ/r, ɑ/ɒ as acceptable for school level) will matter more than the model choice for "well enough" feedback. `[inference]`
- For a 12-year-old "well enough" target, a pragmatic scoring: (1) CTC forced alignment of expected phones; (2) per-phone GOP = log P(expected) − max log P(competitor within a small learner-error set, e.g. /θ/ vs /s,f,t/, /ʁ/ vs /r/, /y/ vs /u,i/); (3) only flag phones with a large, confident margin; never show a raw score. This mirrors the RPS approach above. `[inference]`

### Gaps

- No quantitative comparison found of CTC-GOP computed from a 64M model vs 300M model on speechocean762.
- CharsiuG2P licence/languages not checked.

## 3. Accuracy evidence on children's and L2 speech

### Takeaway

Evidence is thin and English-centric: speechocean762 (includes children) and My Pronunciation Coach (child L2 English) are the main public benchmarks; nothing found for child L2 French/Spanish/Italian/Russian. Expect to calibrate thresholds on our own recordings of real kids; synthetic espeak audio is not a valid test set.

### Cited Findings

- speechocean762: >5,000 English utterances from 250 non-native speakers with phoneme/word/utterance annotations; de facto benchmark for APA/MDD. `[snippet]` — [Emergent Mind summary](https://www.emergentmind.com/topics/speechocean762-dataset)
- speechocean762 includes child and adult speech; MPC is child L2 speech; substitution-aware CTC GOP improved over baseline on both. `[snippet]` — [arXiv 2506.02080](http://arxiv.org/abs/2506.02080v2)
- Phoneme-level mispronunciation screening for Polish-speaking children with a wav2vec2 token recogniser: 88.7% exact sequence match on unseen children (2026). `[snippet]` — [arXiv 2606.25181](https://arxiv.org/pdf/2606.25181)
- Whisper-small gave best F1 on L2-ARCTIC in one comparison vs XLS-R and HuBERT-large. `[snippet; source paper unclear]` — [Springer, Arabic MDD](https://link.springer.com/article/10.1007/s10791-024-09489-8)
- ZIPA authors report persistent weaknesses on sociophonetic variation (accents/dialects). `[snippet]` — [arXiv 2505.23170](https://arxiv.org/abs/2505.23170)
- SpeechAce claims its (cloud) models "perform well with kids from Kindergarten age and up". `[snippet, vendor claim]` — [Speechace blog](https://www.speechace.com/using-the-speechace-api-as-voice-ai-for-kids/)

### Inferences

- IPAPack++ is mostly adult read speech; children's higher F0/formants typically raise PER. Expect worse accuracy than paper numbers; mitigate with conservative thresholds ("only praise/flag when confident") rather than fine-grained scoring. `[inference]`
- The poor sandbox result on espeak synthetic voices is expected: espeak formant synthesis is far from training distribution. Evaluate with real recordings (Common Voice clips, own recordings with consent). `[inference]`

### Gaps

- No small-model (<100M) MDD numbers on speechocean762/L2-ARCTIC found with verifiable figures.
- No child L2 data for fr/es/it/ru found.

## 4. Ready-made offline pronunciation-assessment SDKs

### Takeaway

Only SpeechSuper clearly advertises an offline/on-device pronunciation SDK, and only for English and Mandarin. Azure embedded speech is on-device STT/TTS under limited access with no mention of pronunciation assessment, no iOS and no Russian. SpeechAce, ELSA, Chivox (on-prem container, not on-device) are server-based. No off-the-shelf SDK covers en+fr+es+it+ru+de on device.

### Cited Findings

- **Azure embedded speech**: designed for on-device speech-to-text and text-to-speech; "Microsoft limits access to embedded speech" (application via limited-access review); SDKs C#, C++, Java, Python, Go; targets Android (API 26+, arm64/arm32), Linux, macOS, Windows — **no iOS listed**; STT models: da-DK, de-DE, en-_, es-ES, es-MX, fr-CA, fr-FR, it-IT, ja-JP, ko-KR, pt-BR, pt-PT, zh-_ — **no ru-RU**; memory ≈ model files + 200 MB; the page does **not mention pronunciation assessment** at all. `[verified]` — [embedded-speech.md (MicrosoftDocs GitHub)](https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/embedded-speech.md)
- Azure pronunciation assessment itself (cloud) gives accuracy/fluency/completeness/prosody scores for scripted assessment. `[snippet]` — [Microsoft Learn how-to](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment)
- **SpeechSuper**: SDK for iOS and Android "available for English and Mandarin Chinese, ensuring offline capability and data privacy"; "works offline… unlimited pronunciation assessment for 1 year with phoneme-level, word-level, and sentence-level pronunciation scores"; also Flutter and Windows. `[snippet]` — [SpeechSuper site](https://www.speechsuper.com/), [SpeechSuper GitHub org](https://github.com/speechsuper). The Android repo confirms English (`native.res`) and Chinese (`native_cn.res`) resource files, free-trial key by form, no public price. `[verified]` — [SpeechSuper-SDK-Android](https://github.com/speechsuper/SpeechSuper-SDK-Android). Cloud API covers 8 languages. `[snippet]` — [SpeechSuper-API-Samples](https://github.com/speechsuper/SpeechSuper-API-Samples)
- **SpeechAce / ELSA**: API products (upload audio, get JSON); no offline SDK found in search results. `[snippet]` — [Speechace API docs](https://api-docs.speechace.com/), [ELSA API](https://elsaspeak.com/en/elsa-api/), [TonePerfect guide](https://api.toneperfect.app/blog/what-is-a-pronunciation-assessment-api/)
- **Chivox**: English/Mandarin assessment via API/SDK/MCP; for air-gapped use "we ship an on-prem container for enterprise customers" (server, not phone). `[snippet]` — [Chivox MCP GitHub](https://github.com/chivox-developer/chivox-speech-eval-mcp), [Chivox](https://www.chivox.com/en/products/english-speech-assessment)
- **Picovoice Cheetah / iFlytek**: docs blocked / not found; Cheetah is a streaming word-level STT engine, no pronunciation assessment known. `[inference — unverified]`

### Inferences

- A German school app needing fr/es/it/ru cannot rely on any found vendor for on-device assessment; the open route (ZIPA-CR-small int8 + server-side G2P + CTC-GOP in app code) is the only one that meets "all languages, on device, zero server cost, voice never leaves the phone". `[inference]`
- Vendor SDKs are licensed per year and need a key; costs unknown (no public price) — requires sales contact. `[inference from "free trial key" + no price]`

### Gaps

- SpeechSuper offline SDK price, binary size, child-speech accuracy: site blocked, no public figures.
- Whether Azure's embedded model can be combined with pronunciation assessment on-device: not documented; would need to ask Microsoft.
- Picovoice, iFlytek offline engines: not verified.
