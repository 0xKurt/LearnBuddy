"""Offline, synthetic Vosk probe (#896). No network/model calls; no recordings in git.

Usage: python vosk_probe.py --models /path/to/models --output /path/to/results.json
Requires pip vosk, espeak-ng and ffmpeg. Run under scripts/test-lock.sh.
Grammar candidates below are EVALUATION FIXTURES, never production vocabulary.
"""
import argparse
import hashlib
import json
import pathlib
import platform
import re
import statistics
import subprocess
import tempfile
import time
import wave

from vosk import Model, KaldiRecognizer, SetLogLevel

CASES = [
    ("fr", "vosk-model-small-fr-0.22", "Je m'appelle Léna et j'habite à Berlin.",
     [("good", "fr", "Je m'appelle Léna et j'habite à Berlin."),
      ("german-accent", "de", "Je m'appelle Léna et j'habite à Berlin."),
      ("wrong-word", "fr", "Je m'appelle Léna et je mange à Berlin.")],
     ["je", "m'appelle", "léna", "et", "j'habite", "à", "berlin", "mange", "habite"]),
    ("en", "vosk-model-small-en-us-0.15", "I think three birds fly through the trees.",
     [("good", "en-us", "I think three birds fly through the trees."),
      ("german-accent", "de", "I think three birds fly through the trees."),
      ("wrong-word", "en-us", "I think three birds fly true the trees.")],
     ["i", "think", "sink", "thing", "three", "free", "tree", "birds", "births",
      "fly", "through", "true", "threw", "the", "a", "trees", "tries"]),
    ("de", "vosk-model-small-de-0.15", "Ich trinke heute kaltes Wasser.",
     [("good", "de", "Ich trinke heute kaltes Wasser."),
      ("english-accent", "en-us", "Ich trinke heute kaltes Wasser."),
      ("wrong-word", "de", "Ich trinke heute kaltes Messer.")],
     ["ich", "isch", "trinke", "trinken", "heute", "häute", "kaltes", "kalte",
      "wasser", "was", "messer"]),
]


CONFUSIONS = {
    "fr": [[], [], [], [], ["mange", "habite"], [], []],
    "en": [[], ["sink", "thing"], ["free", "tree"], ["births"], [],
           ["true", "threw", "free"], ["a"], ["tries"]],
    "de": [["isch"], ["trinken"], ["häute"], ["kalte"], ["was", "messer"]],
}


def recognize(model, wav, grammar, scorer, plan):
    # Recording has ended: a source WAV exists. Include conversion, decoder creation,
    # whole-clip decoding, finalization and the shared code verdict, not just FinalResult().
    start = time.perf_counter()
    pcm = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(wav),
                          "-ar", "16000", "-ac", "1", "-f", "s16le", "pipe:1"],
                         check=True, stdout=subprocess.PIPE).stdout
    converted = time.perf_counter()
    rec = (KaldiRecognizer(model, 16000, json.dumps(grammar, ensure_ascii=False))
           if grammar is not None else KaldiRecognizer(model, 16000))
    rec.SetWords(True)
    words = []
    for offset in range(0, len(pcm), 8000):
        if rec.AcceptWaveform(pcm[offset:offset + 8000]):
            words.extend(json.loads(rec.Result()).get("result", []))
    words.extend(json.loads(rec.FinalResult()).get("result", []))
    text = " ".join(w["word"] for w in words)
    decode_ms = (time.perf_counter() - converted) * 1000
    scorer.stdin.write(json.dumps({"plan": plan, "evidence": {
        "source": "vosk", "heard": text, "elapsed_ms": decode_ms, "unavailable": [],
        "words": [{"heard": w["word"], "confidence": w["conf"]} for w in words]
    }}, ensure_ascii=False) + "\n")
    scorer.stdin.flush()
    result = json.loads(scorer.stdout.readline())
    return {"words": words, "text": text, "result": result,
            "conversion_ms": round((converted - start) * 1000, 2),
            "decode_ms": round(decode_ms, 2),
            "post_recording_ms": round((time.perf_counter() - start) * 1000, 2)}


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--models", type=pathlib.Path, required=True)
    args.add_argument("--output", type=pathlib.Path, required=True)
    options = args.parse_args()
    SetLogLevel(-1)
    report = {"machine": platform.platform(), "runs": 3, "models": [], "cases": []}
    worker = pathlib.Path(__file__).with_name("vosk_score.ts")
    with subprocess.Popen(["node", "--import", "tsx", str(worker)], stdin=subprocess.PIPE,
                          stdout=subprocess.PIPE, text=True) as scorer, \
            tempfile.TemporaryDirectory(prefix="lb-vosk-clips-") as folder:
        assert scorer.stdout.readline().strip() == "ready"
        folder = pathlib.Path(folder)
        for lang, name, target, clips, candidates in CASES:
            start = time.perf_counter()
            model = Model(str(options.models / name))
            load_ms = (time.perf_counter() - start) * 1000
            missing = [w for w in candidates if model.vosk_model_find_word(w) < 0]
            grammar = [w for w in candidates if w not in missing] + ["[unk]"]
            targets = re.findall(r"[^\W_]+(?:['’-][^\W_]+)*", target)
            plan = {"version": 1, "language": lang, "words": [
                {"expected": word, "confusions": confusions}
                for word, confusions in zip(targets, CONFUSIONS[lang], strict=True)]}
            report["models"].append({"name": name, "load_ms": round(load_ms, 2),
                                     "oov": missing, "grammar": grammar})
            for label, voice, text in clips:
                wav = folder / "speech.wav"
                pcmwav = folder / "pcm.wav"
                subprocess.run(["espeak-ng", "-v", voice, "-s", "140", "-w", str(wav), text], check=True)
                subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav),
                                "-ar", "16000", "-ac", "1", str(pcmwav)], check=True)
                with wave.open(str(pcmwav)) as audio:
                    pcm = audio.readframes(audio.getnframes())
                case = {"language": lang, "condition": label, "target": target,
                        "spoken": text, "duration_s": len(pcm) / 32000,
                        "pcm_sha256": hashlib.sha256(pcm).hexdigest()}
                for mode, vocabulary in [("free", None), ("constrained", grammar)]:
                    results = [recognize(model, wav, vocabulary, scorer, plan) for _ in range(3)]
                    case[mode] = {"median_ms": statistics.median(r["post_recording_ms"] for r in results),
                                  "runs": results}
                report["cases"].append(case)
                print(lang, label, "free:", case["free"]["runs"][0]["text"],
                      "grammar:", case["constrained"]["runs"][0]["text"],
                      case["constrained"]["median_ms"], "ms", flush=True)
            del model
        scorer.stdin.close()
    options.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
