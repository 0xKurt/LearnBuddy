# On-device speech runtimes for an Expo (SDK 54 / RN 0.81, New Architecture) app: pronunciation assessment

Research date: 2026-09-26. What could be read:

- **Reachable, read in full:** the npm registry (metadata plus package tarballs, which I unpacked and inspected), raw.githubusercontent.com (READMEs and docs), Maven Central (the ONNX Runtime AAR was downloaded and its contents listed), and Apple's developer JSON docs API.
- **Blocked by the egress proxy:** github.com HTML and the GitHub API, huggingface.co, docs.swmansion.com, executorch.swmansion.com, arxiv.org, support.google.com, micdrop.dev and jsdelivr.
- **Labels used below:**
  - **[V-full]** means verified from a full primary source or file.
  - **[V-pkg]** means verified by inspecting the published package or binary myself.
  - **[Snippet]** means taken only from a search-result summary.
  - **[Inference]** means my own reasoning.

## Runtimes and React Native bindings (maintenance, Expo/New-Arch compatibility, ops, audio frontends, acceleration)

### Takeaway

The most direct fit for "phones out of a 3–6 s clip" on Expo SDK 54 is either **onnxruntime-react-native** (generic ONNX, official Microsoft, Expo config plugin; you write the log-mel/fbank frontend and CTC decoding yourself) or **react-native-sherpa-onnx** (a community TurboModule over k2-fsa sherpa-onnx; it ships a kaldi fbank frontend and many ASR model types, but exposes decoded tokens rather than raw frame posteriors). **react-native-executorch** is the most polished, but its current release requires **RN 0.83+ / Expo SDK 55+**, iOS 17 and Android 13, so it does not fit SDK 54 without upgrading. **whisper.rn** is well maintained, but Whisper is a seq2seq word recognizer with a fixed 30 s window, a poor fit for phone-level scoring. **Vosk** and **tfjs-react-native** are poor fits. Every option needs an Expo development build (a prebuild); none runs in Expo Go.

### Cited Findings

**Package status (npm registry, read 2026-09-26) [V-full]** — [npm registry](https://registry.npmjs.org/)

| Package                       | Latest | Published  | Licence    | Notes                                                                                                                    |
| ----------------------------- | ------ | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| onnxruntime-react-native      | 1.24.3 | 2026-03-05 | MIT        | Registry modified 2026-07-16; onnxruntime-web is already at 1.30.0 (2026-09-14), so the RN package lags the core release |
| react-native-executorch       | 0.10.3 | 2026-09-25 | MIT        | 349 versions; nightly 0.11.0 dated 2026-09-26; `legacy` tag = 0.9.3                                                      |
| whisper.rn                    | 0.7.4  | 2026-08-27 | MIT        | Unpacked 26 MB                                                                                                           |
| react-native-sherpa-onnx      | 0.4.4  | 2026-09-08 | MIT        | 17 versions; single maintainer "XDcobra"                                                                                 |
| react-native-fast-tflite      | 3.0.1  | 2026-04-21 | MIT        | Peer dep react-native-nitro-modules                                                                                      |
| react-native-vosk             | 2.1.7  | 2025-11-17 | MIT        | Unpacked 186 MB                                                                                                          |
| @tensorflow/tfjs-react-native | 1.0.0  | 2023-11-30 | Apache-2.0 | Peer deps expo-gl ^13 and expo-camera ^13                                                                                |
| @huggingface/transformers     | 4.3.0  | 2026-09-16 | Apache-2.0 |                                                                                                                          |
| expo-speech-recognition       | 57.1.0 | 2026-09-16 | MIT        |                                                                                                                          |

The tfjs-react-native peer dependencies (expo-gl ^13, expo-camera ^13) are Expo SDK 49-era versions, so that package is effectively unmaintained [V-full + Inference].

**onnxruntime-react-native (Microsoft)**

- The npm README says it supports ONNX and ORT format models and "includes all operators and types" (since 1.13). It does not support unsigned tensor types (except uint8 on Android) or loading a model from an ArrayBuffer, so the model must be a file path — [npm README](https://www.npmjs.com/package/onnxruntime-react-native) [V-full]
- The package ships an Expo config plugin (`app.plugin.js`). On Android it adds `implementation project(':onnxruntime-react-native')` to app/build.gradle and **throws if build.gradle isn't Groovy**. On iOS it adds the pod through a `withDangerousMod` edit to the Podfile — [package tarball 1.24.3](https://registry.npmjs.org/onnxruntime-react-native/-/onnxruntime-react-native-1.24.3.tgz) [V-pkg]
- The native layer is a C++ JSI host object (`cpp/InferenceSessionHostObject.cpp`, `JsiMain.cpp`), which works with the New Architecture/bridgeless in principle. The podspec requires iOS 15.1 and depends on the `onnxruntime-c` pod. Optional `onnxruntimeExtensionsEnabled` and `onnxruntimeUseQnn` flags are read from the app's package.json — [tarball](https://registry.npmjs.org/onnxruntime-react-native/-/onnxruntime-react-native-1.24.3.tgz) [V-pkg]
- **Build-reproducibility risk:** `android/build.gradle` pulls `com.microsoft.onnxruntime:onnxruntime-android:latest.integration@aar` (or `-qnn`), a dynamic "latest" version rather than one pinned to 1.24.3. By default NNAPI is compiled in (`-DUSE_NNAPI=${!useQnn}`) — [tarball](https://registry.npmjs.org/onnxruntime-react-native/-/onnxruntime-react-native-1.24.3.tgz) [V-pkg]
- An open bug report exists: "[Mobile] onnxruntime-react-native fails to load model in Expo 54 standalone iOS" (#27062). It says `InferenceSession.create()` fails on iOS with "failed to load model" while Android works, and that copying the model to a writable directory did not help — [GitHub issue #27062](https://github.com/microsoft/onnxruntime/issues/27062) [Snippet; the issue page itself was blocked, and its status and resolution are unknown]
- No audio frontend in the RN package: you get raw tensors only. Mel/fbank features must be computed in JS/C++ or baked into the ONNX graph (e.g. an STFT/mel layer exported with the model). Exporting a log-mel layer as ONNX ops is possible (the Wav2Small paper mentions ONNX including LogMel layers) — [search summary citing arXiv 2408.13920](https://arxiv.org/html/2408.13920v4) [Snippet]. wav2vec2-style models take the raw waveform, so they need no frontend [Inference, from model design].

**react-native-sherpa-onnx (community, XDcobra)**

- A TurboModule over sherpa-onnx (bundled sherpa-onnx 1.12.35 on both platforms). It covers:
  - offline and streaming speech-to-text;
  - text-to-speech;
  - "TTS alignment" with **wav2vec2 CTC forced alignment**;
  - execution providers: CPU, NNAPI, XNNPACK, QNN and Core ML;
  - Play Asset Delivery.

  VAD and diarization are "not yet supported". Requirements: RN ≥0.70, Android API 24+, iOS 13+ — [npm README](https://www.npmjs.com/package/react-native-sherpa-onnx) [V-full]

- The iOS sherpa-onnx XCFramework (**~80 MB**) is not in npm. It is downloaded from GitHub Releases during `pod install`, which is a CI/EAS build dependency on github.com. An Expo config plugin exists for the background-downloader AppDelegate hook — [npm README](https://www.npmjs.com/package/react-native-sherpa-onnx) [V-full]
- **Model types** (`createSTT`): transducer, paraformer, nemo_ctc, wenet_ctc, zipformer_ctc, generic `ctc`, whisper, moonshine, omnilingual CTC and others.
  - Results return `text`, `tokens`, `timestamps` and `durations`.
  - **No per-frame posterior/logit API is documented**, and GOP-style scoring normally needs the frame posteriors.
  - Required files for CTC models: `model.onnx` plus `tokens.txt`.
  - Source: [docs/stt.md](https://raw.githubusercontent.com/XDcobra/react-native-sherpa-onnx/main/docs/stt.md) [V-full]
- Execution providers: QNN only on Qualcomm SM8xxx SoCs (context binaries must match the exact SoC family or they crash). NNAPI's `hasAccelerator` is not the same as `canInit`. Core ML on iOS. There is a probing API (`getNnapiSupport()` etc.) — [docs/execution-providers.md](https://raw.githubusercontent.com/XDcobra/react-native-sherpa-onnx/main/docs/execution-providers.md) [V-full]
- The sherpa-onnx core computes features with `kaldi-native-fbank` (fbank, plus a Whisper log-mel path) in `features.cc`, so the audio frontend is built in — [sherpa-onnx features.cc](https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/master/sherpa-onnx/csrc/features.cc) [V-full]
- Upstream sherpa-onnx lists a second RN wrapper, "Sherpa Voice / @siteed/sherpa-onnx.rn" (iOS, Android **and Web**) — [sherpa-onnx README](https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/master/README.md) [V-full]. Its maintenance state was not checked.
- Upstream sherpa-onnx also supports WebAssembly — [sherpa-onnx README](https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/master/README.md) [V-full]

**react-native-executorch (Software Mansion)**

- The current README requires:
  - the **New Architecture**;
  - **React Native 0.83+ or Expo SDK 55+** with development builds (Expo Go not supported);
  - react-native-worklets ≥0.10 <0.13;
  - **iOS 17.0+ / Android 13+** (minSdk ≥26).

  Backends: XNNPACK (CPU), Core ML and MLX (Apple), Vulkan (Android GPU). You can bring a custom `.pte` model and build a pipeline in TS with low-level tensor ops — [README (main)](https://raw.githubusercontent.com/software-mansion/react-native-executorch/main/README.md) [V-full]

- Version history:
  - 0.6.0 and 0.7.0 (Dec 2025 / Feb 2026) had peer dependencies `expo >=54`, `expo-asset ^12` and `expo-file-system ^19`, i.e. SDK 54-compatible.
  - 0.8.0 and 0.9.x dropped the Expo peers.
  - 0.10.0 (2026-09-08) adds worklets, blob-util and the background downloader.
  - The `legacy` dist-tag points to 0.9.3.

  Source: [npm registry](https://registry.npmjs.org/react-native-executorch) [V-full]. The 0.9.3 README gives minimums of iOS 17 and Android 13, New Architecture only, and points to a compatibility table for RN versions — [0.9.3 tarball](https://registry.npmjs.org/react-native-executorch/-/react-native-executorch-0.9.3.tgz) [V-pkg]. The compatibility table itself (docs.swmansion.com) was blocked, so **which exact version is the last to support RN 0.81 is unverified**. The 0.6/0.7 Expo ≥54 peers suggest those work on SDK 54 [Inference].

- The 0.9.3 speech models are Whisper tiny/base/small (multilingual and `.en`), exported as XNNPACK fp32 and Core ML fp16 `.pte` files hosted on Hugging Face under `software-mansion/react-native-executorch-whisper-*`. There are also general `useExecutorchModule` hooks for custom models and a C++ `dsp.h` with `hannWindow` and `stftFromWaveform` (an STFT exists, no ready mel/fbank) — [0.9.3 tarball](https://registry.npmjs.org/react-native-executorch/-/react-native-executorch-0.9.3.tgz) [V-pkg]. A Moonshine-tiny XNNPACK `.pte` exists on Hugging Face — [HF model card](https://huggingface.co/software-mansion/react-native-executorch-moonshine-tiny) [Snippet].
- 0.10.x moves native libraries to a postinstall download (`scripts/download-libs.js`), and the podspec is still iOS 17.0 — [0.10.3 tarball](https://registry.npmjs.org/react-native-executorch/-/react-native-executorch-0.10.3.tgz) [V-pkg]

**whisper.rn (mybigday, whisper.cpp)**

- Bindings for Whisper **and NVIDIA Parakeet TDT 0.6B v3** (English plus 24 European languages), plus a Silero VAD context.
  - Prebuilt iOS xcframework and Android jniLibs are downloaded from GitHub releases at `postinstall` and SHA-256 verified.
  - Expo: "You will need to prebuild".
  - Core ML encoder on iOS 15+ (the ggml model is still needed).
  - Android: a Hexagon NPU backend on Snapdragon 8 Gen 1+ (SM8450+), used automatically with `useGpu`.

  Parakeet GGUF sizes: 356 MB (q4_0) up to 1.26 GB (f16) — [whisper.rn README](https://raw.githubusercontent.com/mybigday/whisper.rn/main/README.md) [V-full]

- The whisper.cpp encoder can run on the ANE via Core ML ("more than x3 faster compared with CPU-only"). The first run on a device is slow because the ANE compiles the model — [whisper.cpp README](https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/README.md) [V-full]

**react-native-fast-tflite (mrousavy)**

- Built on Nitro Modules (JSI), with an Expo config plugin (`enableCoreMLDelegate`). Delegates: CoreML/Metal on iOS, GPU/NNAPI on Android (which "may" need extra native libraries on Android 12+). "Not all model operations are supported on the CoreML delegate" — [npm README](https://www.npmjs.com/package/react-native-fast-tflite) [V-full]
- It has no audio frontend and loads models via `require('...tflite')` or a URL (vision-oriented examples) [V-full, same source]. The app would need a TFLite export of the phoneme model [Inference].

**react-native-vosk**

- Ships an optional Expo config plugin (managed/prebuild) and supports grammar-constrained recognition (`grammar: ['left','right','[unk]']`) — [npm README](https://www.npmjs.com/package/react-native-vosk) [V-full]
- Vosk is a word-level Kaldi recognizer and the npm package is unpacked at 186 MB [V-full]. For phone scoring it would need custom Kaldi models [Inference].

**Expo side**

- As of SDK 53 all expo-\* packages support the New Architecture. SDK 54 is the last SDK that allows `newArchEnabled: false`, and SDK 55+ requires the New Architecture — [Expo docs, New Architecture](https://docs.expo.dev/guides/new-architecture/) [Snippet]

### Inferences

- Pronunciation assessment needs **frame-level phone posteriors** from a phone-CTC acoustic model, which feed GOP (goodness of pronunciation) or forced-alignment scoring against the expected phone string. That points to **generic runtimes** (ONNX Runtime, ExecuTorch custom `.pte`, TFLite) rather than ASR wrappers that only return decoded text:
  - **onnxruntime-react-native** gives full control.
  - **react-native-sherpa-onnx** would need a fork or a native addition to expose CTC log-probs; it already contains wav2vec2 CTC forced-alignment code for TTS, so that is a plausible extension point.
- **Candidate models** (not verified in this pass; they belong to the model-selection researcher): a phone-CTC model per language, or a multilingual IPA model such as the facebook wav2vec2 xlsr-53 espeak variants. The latter are ~300M parameters and too large for mobile; a distilled or small phone model would be needed.
- **Expo SDK 54 path:** a development build (EAS) plus the config plugin, with the model as a file in the document directory. Test iOS model loading early because of issue #27062.
- ExecuTorch requires an SDK 55+ upgrade (which the team must do eventually anyway, since SDK 55 forces the New Architecture) and drops devices below iOS 17 and Android 13. iOS 17 still covers iPhone XS/XR and later, so the Android 13 floor excludes more devices: some 3–4-year-old Android phones never got Android 13, which matters for school students' hand-me-down phones. (The device-OS mapping is from my own knowledge, not verified here.)

### Gaps

- The exact react-native-executorch compatibility table (docs.swmansion.com was blocked).
- The status and resolution of ORT issue #27062 (github.com was blocked).
- Stars, commit cadence and open-issue counts per repo (GitHub API was blocked); maintenance is judged from npm publish dates only.
- Whether @siteed/sherpa-onnx.rn exposes CTC logits, and its maintenance state (not checked).

## App size (runtime plus model) and how to ship large models

### Takeaway

The runtime alone adds roughly **20–26 MB of uncompressed native code per Android ABI** (ORT arm64 `.so` 25.8 MB; ExecuTorch arm64 `.so` 22.9 MB) and **~30–80 MB of iOS framework before stripping and App Thinning**. A quantized small phone model is likely 20–100 MB per language. Download it on demand after install into the app's document directory, per language, with Wi-Fi preference. Google Play Asset Delivery and Apple Background Assets are store-native alternatives.

### Cited Findings

- `onnxruntime-android-1.24.3.aar` is 40.9 MB compressed. `libonnxruntime.so` sizes (the full build with all operators):

  | ABI         | Size    |
  | ----------- | ------- |
  | arm64-v8a   | 25.8 MB |
  | armeabi-v7a | 18.4 MB |
  | x86         | 31.0 MB |
  | x86_64      | 31.3 MB |

  The JNI shim is about 0.1 MB. Source: [Maven Central AAR](https://repo1.maven.org/maven2/com/microsoft/onnxruntime/onnxruntime-android/1.24.3/onnxruntime-android-1.24.3.aar) [V-pkg]

- react-native-executorch 0.9.3 ships:
  - `libexecutorch.so` at 22.9 MB (arm64) and 27.9 MB (x86_64);
  - OpenCV static libraries (several MB per ABI);
  - an `ExecutorchLib.xcframework` of 33 MB.

  Unpacked package sizes: 0.5.0 = 170 MB, 0.6.0 = 282 MB, 0.9.x ≈ 101 MB; 0.10.x = 7 MB because libraries are downloaded at postinstall. Sources: [0.9.3 tarball](https://registry.npmjs.org/react-native-executorch/-/react-native-executorch-0.9.3.tgz) [V-pkg]; [npm registry](https://registry.npmjs.org/react-native-executorch) [V-full]

- One search summary claims that running Whisper with ExecuTorch "adds 151 MB for the smallest model and holds 375 to 410 MB of memory while it transcribes" — [micdrop.dev blog, search summary](https://micdrop.dev/blog/speech-to-text-react-native) [Snippet; page blocked, unverified]
- The sherpa-onnx iOS XCFramework is ~80 MB (downloaded at pod install). Version 0.3.0 claims a "~95% size reduction" of the RN SDK — [react-native-sherpa-onnx README](https://www.npmjs.com/package/react-native-sherpa-onnx) [V-full]
- whisper.cpp model and memory figures:

  | Model | Disk    | RAM     |
  | ----- | ------- | ------- |
  | tiny  | 75 MiB  | ~273 MB |
  | base  | 142 MiB | ~388 MB |
  | small | 466 MiB | ~852 MB |

  Source: [whisper.cpp README](https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/README.md) [V-full]

- whisper.rn: bundling models via `require` "will significantly increase the size of the app". Metro can't bundle files larger than 2 GB. The example app downloads Parakeet at runtime "because they are too large to bundle comfortably" — [whisper.rn README](https://raw.githubusercontent.com/mybigday/whisper.rn/main/README.md) [V-full]
- The PyTorch Android wav2vec2-base demo: 377 MB unquantized scripted model vs 207 MB quantized — [pytorch android-demo-app, search summary](https://github.com/pytorch/android-demo-app/blob/master/SpeechRecognition/README.md) [Snippet]. For comparison, wav2vec2-base has ~95M parameters, so int8 is about 95 MB [Inference].
- **Play Asset Delivery (Android)**:
  - Fast-follow and on-demand packs are limited to 512 MB each; install-time packs to 1 GB combined; everything to 2 GB per bundle; at most 50 packs. Higher limits apply for the Play Partner Program for Games — [search summary of Google Play help](https://support.google.com/googleplay/android-developer/answer/9859372) [Snippet; support.google.com blocked].
  - The Android developer page confirms that asset packs have "increased size limits", that install-time packs need 2× free disk space, and that fast-follow and on-demand packs need "a few hundred extra MBs" — [developer.android.com PAD guide](https://developer.android.com/guide/playcore/asset-delivery) [V-full].
  - react-native-sherpa-onnx has PAD helpers (`getAssetPackPath`, `.tar.zst` extraction) on Android only; iOS returns null — [docs/model-setup.md](https://raw.githubusercontent.com/XDcobra/react-native-sherpa-onnx/main/docs/model-setup.md) [V-full]
- **Apple Background Assets (iOS)**:
  - Managed Background Assets handle downloads, updates and compression.
  - Apple-Hosted Background Assets host "up to 200GB of compressed assets" for App Store apps.
  - Asset packs are uploaded to App Store Connect independently of builds and pass review.
  - Download policies: essential (part of install), prefetch (continues in the background after install) and on-demand (explicit API request).
  - It requires a Background Download **app extension**, which in Expo means a custom config plugin or an extension target [Inference].
  - Apple offers guidance on "downloading only immediately needed language assets", matching per-language packs.

  Sources: [Apple, Creating managed asset packs](https://developer.apple.com/documentation/backgroundassets/creating-managed-asset-packs); [Background Assets overview](https://developer.apple.com/documentation/backgroundassets) [V-full via Apple's JSON docs API]

- **iOS cellular threshold**: App Store downloads up to 200 MB are allowed over cellular without a prompt (raised in 2019) — [iDownloadBlog 2019](https://www.idownloadblog.com/2019/05/31/app-store-cellular-download-limit-200-mb/) [Snippet]. Background Assets content "counts towards the download size that triggers the cellular-network alert" with a 200 MB threshold — [search summary of Apple docs](https://developer.apple.com/documentation/backgroundassets/creating-managed-asset-packs) [Snippet]. Background Assets limits of 200 GB and 100 asset packs — [search summary](https://developer.apple.com/help/app-store-connect/reference/on-demand-resources-size-limit/) [Snippet].
- iOS On-Demand Resources (legacy mechanism) platform size limits are documented by Apple — [Apple ODR guide](https://developer.apple.com/library/ios/documentation/FileManagement/Conceptual/On_Demand_Resources_Guide/PlatformSizesforOn-DemandResources.html) [Snippet; not read]
- Background downloads in RN: sherpa-onnx RN and ExecuTorch 0.10 use `@kesha-antonov/react-native-background-downloader`. On Android this needs a foreground service and the `POST_NOTIFICATIONS` permission (API 33+) plus Play Console foreground-service declarations — [react-native-sherpa-onnx README](https://www.npmjs.com/package/react-native-sherpa-onnx) [V-full]

### Inferences

- **Android:** ship arm64-v8a (plus armeabi-v7a if old 32-bit devices matter) through the AAB's per-ABI splits, so the user downloads one ABI (about 8–12 MB compressed for ORT arm64, an estimate since `.so` files compress about 2–3×).
- **Reduce the runtime size:** a custom "reduced operator" ORT build (ORT format with only the operators the model uses) can cut the `.so` a lot, but it needs a custom build of onnxruntime-react-native. That is more build work for the team.
- **Model delivery** (simplest, and it also works on the web):
  1. Host per-language `.onnx`/`.ort` files on our own storage/CDN.
  2. Download them into `FileSystem.documentDirectory` on first use of pronunciation practice, with a checksum and a version tag.
  3. Keep the models out of the base app, so the initial install stays small and below the 200 MB cellular prompt.
- **Honest UX states:** an "is downloading / ready" state belongs in the UI, in the spirit of hard rule 5.
- **Store-native delivery:** PAD and Background Assets reduce hosting cost and pass store review, but each needs native configuration (a Gradle asset-pack module, an iOS extension) that Expo does not provide out of the box. Evaluate them only if CDN costs matter.
- **Privacy upside:** audio stays on the device. The download is only the model, so no personal data leaves the device.

### Gaps

- iOS runtime size after App Thinning and bitcode-free stripping for the onnxruntime-c pod (not measured).
- Exact compressed per-ABI download deltas (these need a real build and bundletool/App Store Connect size reports).
- The exact current Google Play limits (support.google.com was blocked; the figures come from a search snippet).

## Measured on-device latency (wav2vec2-base CTC, Whisper tiny, similar)

### Takeaway

Few trustworthy phone-level benchmarks were reachable.

- **ExecuTorch Whisper tiny:** encoding a 30 s chunk takes ~89 ms on an iPhone 17 Pro, ~277 ms on a Galaxy S24 and ~403 ms on an iPhone SE 3 [Snippet].
- **Encoder-only CTC models:** a short clip (3–6 s) runs through a CTC encoder in a single pass. A small (≤30M parameter) int8 phone-CTC model should score well within 1 s on a mid-range phone, but this is **inference, not a measured result**.
- **wav2vec2-base (95M):** plausible in about 0.5–1.5 s for 5 s on a mid-range CPU. It must be measured.

### Cited Findings

- "Encoding 30 seconds of audio with Whisper tiny takes 89 ms on an iPhone 17 Pro, 277 ms on a Galaxy S24, and 403 ms on an iPhone SE 3" (ExecuTorch). Whisper always pads to 30 s, and Software Mansion recommends Moonshine for the lowest latency — [RN ExecuTorch benchmark docs / micdrop blog, search summary](https://docs.swmansion.com/react-native-executorch/docs/0.3.x/benchmarks/inference-time) [Snippet; the pages were blocked, so it is unclear which page each figure comes from]
- whisper.rn demo screenshots were taken on an iPhone 13 Pro Max (tiny.en, Core ML, release) and a Pixel 6 (tiny.en, armv8.2-a+fp16), but the README gives no timing numbers — [whisper.rn README](https://raw.githubusercontent.com/mybigday/whisper.rn/main/README.md) [V-full]
- whisper.cpp: the Core ML/ANE encoder is ">x3 faster" than CPU, and ANEForge is about 2× faster than Core ML — [whisper.cpp README](https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/README.md) [V-full]
- "Wav2Vec2.0 on the Edge: Performance Evaluation" (arXiv 2202.05993) benchmarks wav2vec2 on edge devices — [arXiv](https://arxiv.org/pdf/2202.05993) [title only; arXiv was blocked, no numbers extracted]
- Moonshine advertises low-latency streaming models "down to tiny 1MB models". Code and most models are MIT; the "legacy non-streaming models for languages other than English" are under a **non-commercial Moonshine Community License** — [Moonshine README](https://raw.githubusercontent.com/moonshine-ai/moonshine/main/README.md) [V-full]

### Inferences

- The requirement "3–6 s scored in about 1 s on a 3–4-year-old Android phone" is plausible for a CTC encoder of ≤~30–40M parameters with int8 weights on XNNPACK/CPU with 4 threads.
- wav2vec2-base (95M, 20 ms frames) at 5 s is about 250 frames of transformer work over a 7-layer CNN feature extractor. That is likely around 1 s on Snapdragon 7-series CPUs, but must be measured.
- NNAPI is inconsistent across vendors and deprecated from Android 15 (from my knowledge, not verified here), so plan on CPU/XNNPACK as the baseline.
- The first run with Core ML includes model compilation, so warm up at app start or after download.
- Whisper-family models are a poor fit: fixed 30 s padding (in the ExecuTorch and whisper.cpp paths), word or BPE tokens instead of phones, and a tendency to "correct" mispronunciations toward the intended word, which defeats pronunciation assessment.

### Gaps

- Directly measured latency for wav2vec2-base or phone-CTC models on iPhone 12/13 and mid-range Android (e.g. Galaxy A52/A54, Pixel 6a) via ORT-mobile: not found in reachable sources. **Build a benchmark screen in a dev build before committing.**
- sherpa-onnx RTF tables for Android (the docs site k2-fsa.github.io was not tried; github.com was blocked).

## Web (browser) options

### Takeaway

The same ONNX model can run in the browser through **onnxruntime-web** (WASM SIMD/threads, WebGPU through the JSEP build) or **transformers.js v4**, which uses onnxruntime-web internally. That makes ONNX the one format shared by mobile and web. Expect WASM binaries of 14–28 MB, and multi-threading needs cross-origin isolation (COOP/COEP headers). **sherpa-onnx has a WASM build**, but only upstream.

### Cited Findings

- onnxruntime-web 1.30.0 (2026-09-14) WASM binaries:

  | File                                 | Size    |
  | ------------------------------------ | ------- |
  | `ort-wasm-simd-threaded.wasm`        | 14.2 MB |
  | `.jspi.wasm`                         | 16.8 MB |
  | `.asyncify.wasm`                     | 26.8 MB |
  | `.jsep.wasm` (the WebGPU/WebNN path) | 28.3 MB |

  Source: [onnxruntime-web tarball](https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-1.30.0.tgz) [V-pkg]

- transformers.js v4 (@huggingface/transformers 4.3.0, 2026-09-16) supports Wav2Vec2(-BERT), WavLM and Whisper ASR pipelines with WebGPU, falling back to WASM automatically — [transformers.js docs / search summary](https://huggingface.co/docs/transformers.js/en/guides/webgpu) [Snippet]; version from [npm](https://registry.npmjs.org/@huggingface/transformers) [V-full]
- Claimed speeds: "WebGPU provides 5–10x speedup over WASM for Whisper", and "Whisper tiny on WASM approximately 2–5x real-time" — [offlinetts.com blog, search summary](https://offlinetts.com/blog/browser-speech-recognition-whisper-comparison/) [Snippet; low-quality aggregator, and the "2–5× real-time" phrasing contradicts itself]. Community measurements are in [transformers.js issue #894, WebGPU vs WASM](https://github.com/huggingface/transformers.js/issues/894) [Snippet, not read].
- sherpa-onnx supports WebAssembly and hosts WASM ASR/VAD demo spaces — [sherpa-onnx README](https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/master/README.md) [V-full]

### Inferences

- Use onnxruntime-web directly (not transformers.js) for a custom phone-CTC model, so that mobile and web share one `.onnx` file and one TS scoring code path. The pre- and post-processing (normalisation, CTC/GOP) can be shared TS code.
- WebGPU is not guaranteed on students' school laptops or Chromebooks, so size the model to be acceptable on WASM.
- Load the WASM and the model lazily, only on the pronunciation screen. Otherwise the web bundle grows by 14–28 MB plus the model.
- A fallback for weak browsers: server-side scoring, or simply hiding the feature. That is a product decision.

### Gaps

- No verified WASM latency numbers for wav2vec2-class models on a mid-range laptop.

## Expected phones on device: espeak-ng and G2P licensing

### Takeaway

**espeak-ng is GPL-3.0-or-later.** Statically bundling it into a closed-source app would make the distributed app a combined work under the GPL, which is incompatible with a proprietary iOS or Android app. Avoid it on the device. The cleanest option is to **generate the expected phones on the server** (espeak-ng there is fine) and send them with the exercise, or to precompute a phone dictionary at build time. MIT alternatives: Epitran (Python, rule-based) and CharsiuG2P (ByT5, MIT; per-language accuracy varies).

### Cited Findings

- "eSpeak NG Text-to-Speech is released under the GPL version 3 or later license" — [espeak-ng README](https://raw.githubusercontent.com/espeak-ng/espeak-ng/master/README.md) [V-full]
- Epitran on PyPI: version 1.35.2, licence "MIT-Modern-Variant". There is no official npm package, so it is Python-only — [PyPI](https://pypi.org/pypi/epitran/json) [V-full]; [npm registry lookup](https://registry.npmjs.org/epitran) [V-full]
- CharsiuG2P: a ByT5 transformer G2P for 100 languages, MIT licence. The multilingual tiny models (8, 12 and 16 layers) reach PER 0.107, 0.098 and 0.096 respectively. External tokenizers are needed for languages without spaces (not relevant for en/fr/es/it/ru/de) — [CharsiuG2P README](https://raw.githubusercontent.com/lingjzhu/CharsiuG2P/main/README.md); [LICENSE](https://raw.githubusercontent.com/lingjzhu/CharsiuG2P/main/LICENSE) [V-full]
- The sherpa-onnx RN package ships model-licence CSVs (TTS and QNN ASR licence status), which shows that model licences vary a lot and must be checked per model — [react-native-sherpa-onnx tarball](https://registry.npmjs.org/react-native-sherpa-onnx/-/react-native-sherpa-onnx-0.4.4.tgz) [V-pkg]

### Inferences

- **Recommended:** the exercise text is authored or generated on the server, so run G2P there (espeak-ng with its GPL is fine on our own server if it is not distributed, or CharsiuG2P or Epitran).
  - Store the expected IPA or phone sequence with the exercise, in the same phone inventory as the acoustic model's output tokens. That mapping is a critical design detail.
  - The client then needs no G2P at all.
  - This fits "the model never writes ids" style determinism, because the expected phones are data and not guessed on the client.
- **Free-form input:** if the learner can type free text to practise, a small on-device G2P fallback is needed. Options are a precomputed dictionary (from a lexicon built with espeak-ng at build time; get legal review on whether GPL output data is itself covered, commonly considered not covered, but unverified here) or a CharsiuG2P ONNX export.
- **Consistency matters more than G2P accuracy:** the phone set the acoustic model was trained on (e.g. espeak-derived IPA for the facebook "espeak-cv-ft" models) should match the G2P that produced the expected phones. The cleanest way is to use the same espeak-ng version on the server that generated the model's training labels.

### Gaps

- No legal source was read on the "GPL output is not a derivative" question for pre-generated dictionaries.
- CharsiuG2P model sizes and ONNX export (huggingface.co was blocked).

## Energy, thermal and memory limits

### Takeaway

A few 1-second inferences per exercise are negligible for battery and thermals. Memory is the real constraint on low-end phones: whisper.cpp tiny needs about 273 MB of RAM, and ExecuTorch Whisper is reported at 375–410 MB. A small phone-CTC model under 100 MB int8 should stay well below iOS jetsam and Android low-memory-killer thresholds. Load the model lazily and release it when leaving the practice screen.

### Cited Findings

- whisper.cpp RAM use: tiny about 273 MB, base about 388 MB, small about 852 MB — [whisper.cpp README](https://raw.githubusercontent.com/ggml-org/whisper.cpp/master/README.md) [V-full]
- ExecuTorch Whisper: "375 to 410 MB of memory while it transcribes" — [micdrop.dev, search summary](https://micdrop.dev/blog/speech-to-text-react-native) [Snippet]
- whisper.rn recommends the iOS Extended Virtual Addressing entitlement for medium and large models. Contexts have explicit `release()` and `releaseAllWhisperVad()` calls — [whisper.rn README](https://raw.githubusercontent.com/mybigday/whisper.rn/main/README.md) [V-full]
- ExecuTorch warns that LLMs need significant RAM, and crashes are typical when memory is short — [0.9.3 README](https://registry.npmjs.org/react-native-executorch/-/react-native-executorch-0.9.3.tgz) [V-pkg]
- sherpa-onnx QNN: mismatched HTP context binaries crash, so accelerator paths need per-SoC testing — [execution-providers.md](https://raw.githubusercontent.com/XDcobra/react-native-sherpa-onnx/main/docs/execution-providers.md) [V-full]

### Inferences

- **Memory:** peak RAM is about the model weights (fp32 is 4× the int8 size) plus activations, which scale with clip length. With 3–6 s clips activations are small, and int8 weights keep a wav2vec2-base-class model near 100–150 MB resident.
- **Energy and thermals:** short bursts cause no sustained thermal throttling. Continuous streaming recognition (e.g. live feedback while speaking) would cost much more, so score after recording stops.
- **Tests:** add a memory and latency smoke test on the lowest-end target device, and fall back gracefully (hide the feature or use server scoring) when the model can't load. Never show a fake score (hard rule 5).

### Gaps

- No measured energy or thermal data for speech models on phones was found in reachable sources.
- No authoritative per-device jetsam limits were read.
