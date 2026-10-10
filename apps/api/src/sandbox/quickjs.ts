// The one isolation boundary for code that is not ours (issue #262, docs/architecture.md
// §Informatik): a QuickJS engine compiled to WebAssembly (quickjs-emscripten, MIT). What runs in
// it sees nothing of the server — no `require`, no `process`, no file, no network, no clock but
// the one it is handed — because the engine has none of them: only what this file puts into its
// global object reaches it, and that is plain strings.
//
// Every run gets a FRESH runtime with three limits the engine itself enforces:
//   · memory — `setMemoryLimit`: an allocation past it fails inside the engine;
//   · stack — `setMaxStackSize`: deep recursion ends as an error, not as a crash of the server;
//   · time — an interrupt handler polled by the engine while it executes: past the deadline the
//     run is aborted with an error no code inside can catch.
// The runtime is disposed after the run, so nothing one run leaves behind reaches the next.
//
// The engine runs synchronously on the API's thread: the deadline is also how long one request
// can block it, so the limits here are short (`docs/architecture.md` §Informatik, measurements).

import variant from '@jitl/quickjs-wasmfile-release-sync';
import {
  newQuickJSWASMModuleFromVariant,
  shouldInterruptAfterDeadline,
  type QuickJSContext,
  type QuickJSWASMModule,
} from 'quickjs-emscripten-core';

/** How a run ended when it did not finish by itself. */
export type SandboxLimit = 'time' | 'memory';

export type SandboxLimits = {
  /** Wall-clock budget of the whole run, in milliseconds. */
  ms: number;
  /** Heap of the engine, in bytes. */
  memory: number;
};

/** What a run returns: the JSON string its script evaluated to, or the limit that ended it. */
export type SandboxResult = { json: string } | { limit: SandboxLimit } | { failed: string };

let engine: Promise<QuickJSWASMModule> | null = null;

/** The WebAssembly module, compiled once per process; every run makes its own runtime from it. */
function quickjs(): Promise<QuickJSWASMModule> {
  engine ??= newQuickJSWASMModuleFromVariant(variant);
  return engine;
}

/**
 * The engine's own stack limit. Small on purpose: the engine's frames live on the host's stack, and
 * a limit near the host's own (about 1 MB in Node) lets a deep recursion overflow the HOST first —
 * that error tears through the engine and leaves it unable to free its runtime (measured: an abort
 * at dispose). At 256 kB the engine stops the recursion itself, as an error inside the run.
 */
const STACK_BYTES = 256 * 1024;

/** An error thrown out of the engine, as a plain message (for the limit it stands for). */
function messageOf(vm: QuickJSContext, error: Parameters<QuickJSContext['dump']>[0]): string {
  const dumped: unknown = vm.dump(error);
  if (dumped && typeof dumped === 'object' && 'message' in dumped) {
    return String((dumped as { message: unknown }).message);
  }
  return String(dumped);
}

/**
 * Runs `scripts` one after another in a fresh engine with `globals` set as strings, and returns
 * what the LAST script evaluates to (it must evaluate to a JSON string). Nothing else crosses the
 * boundary in either direction.
 */
export async function runIsolated(
  scripts: ReadonlyArray<{ name: string; code: string }>,
  globals: Readonly<Record<string, string>>,
  limits: SandboxLimits,
): Promise<SandboxResult> {
  const module = await quickjs();
  const runtime = module.newRuntime();
  runtime.setMemoryLimit(limits.memory);
  runtime.setMaxStackSize(STACK_BYTES);
  runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + limits.ms));
  const vm = runtime.newContext();
  try {
    for (const [name, value] of Object.entries(globals)) {
      const handle = vm.newString(value);
      vm.setProp(vm.global, name, handle);
      handle.dispose();
    }
    let last: SandboxResult = { failed: 'no script' };
    for (const script of scripts) {
      const result = vm.evalCode(script.code, script.name);
      if (result.error) {
        const message = messageOf(vm, result.error);
        result.error.dispose();
        if (/interrupted/i.test(message)) return { limit: 'time' };
        if (/out of memory/i.test(message)) return { limit: 'memory' };
        return { failed: message };
      }
      const value: unknown = vm.dump(result.value);
      result.value.dispose();
      last = typeof value === 'string' ? { json: value } : { failed: 'not a JSON string' };
    }
    return last;
  } finally {
    try {
      vm.dispose();
      runtime.dispose();
    } catch {
      // The engine could not free this runtime (an abort inside the WebAssembly module). Its
      // instance is not trusted again: the next run compiles a fresh one, and this one is dropped.
      engine = null;
    }
  }
}
