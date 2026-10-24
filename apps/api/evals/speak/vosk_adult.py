"""Offline adult calibration; run under scripts/test-lock.sh, no hosted calls.
Usage: python vosk_adult.py --assets .cache/vosk --output .cache/vosk/adult.json
Uses the six attributed SpeechOcean762 adults in ../media/human-results.json.
Candidates are evaluation fixtures, not production vocabulary or model-prepared confusions.
"""
import argparse
import json
import pathlib
import subprocess
import wave
from vosk import Model, KaldiRecognizer, SetLogLevel

parser = argparse.ArgumentParser()
parser.add_argument('--assets', type=pathlib.Path, required=True)
parser.add_argument('--output', type=pathlib.Path, required=True)
args = parser.parse_args()
SetLogLevel(-1)
model = Model(str(args.assets / 'vosk-model-small-en-us-0.15'))
reference = json.loads((pathlib.Path(__file__).parent / '../media/human-results.json').read_text())
results = []
for sample in reference['samples']:
    words = sample['target'].lower().split()
    # All targets compete with each other and unknown. No invented phonetic labels.
    grammar = list(dict.fromkeys(words + ['[unk]']))
    rec = KaldiRecognizer(model, 16000, json.dumps(grammar))
    rec.SetWords(True)
    observed = []
    with wave.open(str(args.assets / (sample['id'] + '.WAV'))) as wav:
        assert wav.getframerate() == 16000 and wav.getnchannels() == 1
        while pcm := wav.readframes(4000):
            if rec.AcceptWaveform(pcm):
                observed.extend(json.loads(rec.Result()).get('result', []))
    observed.extend(json.loads(rec.FinalResult()).get('result', []))
    results.append({k: sample[k] for k in ['id', 'age', 'target', 'reference_accuracy']} | {'grammar': grammar, 'observed': observed})
# Grade the recorded evidence with the actual application contract, not a parallel scorer.
worker = pathlib.Path(__file__).with_name('vosk_score.ts')
with subprocess.Popen(['node', '--import', 'tsx', str(worker)], stdin=subprocess.PIPE,
                      stdout=subprocess.PIPE, text=True) as scorer:
    assert scorer.stdout.readline().strip() == 'ready'
    for sample in results:
        scorer.stdin.write(json.dumps({
            'plan': {'version': 1, 'language': 'en', 'words': [
                {'expected': word, 'confusions': []} for word in sample['target'].split()]},
            'evidence': {'source': 'vosk', 'elapsed_ms': 0, 'unavailable': [],
                         'heard': ' '.join(w['word'] for w in sample['observed']),
                         'words': [{'heard': w['word'], 'confidence': w['conf']} for w in sample['observed']]}
        }) + '\n')
        scorer.stdin.flush()
        sample['result'] = json.loads(scorer.stdout.readline())
    scorer.stdin.close()
report = {key: reference[key] for key in ['source', 'revision', 'license', 'attribution']}
report.update({'samples': results,
    'method': 'Six adults; target-only grammar plus [unk], no generated competitors, no hosted calls. Actual shared grader; elapsed_ms=0 because latency was not measured here. Full-utterance fallback for any uncertainty.',
    'summary': {'accepted': sum(s['result']['overall'] == 'passt' for s in results),
                'fallback': sum(s['result']['overall'] == 'unsicher' for s in results)}})
args.output.write_text(json.dumps(report, indent=2) + '\n')
