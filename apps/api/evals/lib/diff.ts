// Tiny structural diff utility for the eval harness. Doc 06 §Eval harness.
//
// The harness doesn't replay byte-for-byte LLM output — the fixture's
// expected.json declares assertions (min_items, must_topics, must_answer_kinds,
// must_template_count, max_cost_usd, must_diagrams) that the actual result
// must satisfy. This module evaluates each assertion and returns a list of
// human-readable failure messages.
//
// No external dep — stdlib only.

import type { VisionResult, GeneratedVisionItem } from '../../src/lib/llm/gateway.js';

/** Assertions declared in fixtures/{name}/expected.json. */
export type ExpectedVision = {
  min_items?: number;
  must_topics?: string[];
  must_answer_kinds?: GeneratedVisionItem['answer_kind'][];
  must_template_count?: number;
  /** USD (not micros), so the fixture author can write 0.002 not 2000. */
  max_cost_usd?: number;
  must_diagrams?: boolean;
  /** When set, fail if the gateway returned a non-null `error` field. */
  expect_no_error?: boolean;
};

export type DiffFailure = {
  path: string;
  message: string;
};

/** Compare a VisionResult to an ExpectedVision spec. Returns one failure per
 *  unmet assertion. An empty array means the fixture passes. */
export function diffVision(actual: VisionResult, expected: ExpectedVision): DiffFailure[] {
  const failures: DiffFailure[] = [];

  if (expected.expect_no_error !== false && actual.error !== null) {
    failures.push({
      path: 'error',
      message: `gateway returned error=${JSON.stringify(actual.error)}, expected null`,
    });
  }

  if (typeof expected.min_items === 'number') {
    if (actual.items.length < expected.min_items) {
      failures.push({
        path: 'items.length',
        message: `expected at least ${expected.min_items} items, got ${actual.items.length}`,
      });
    }
  }

  if (expected.must_topics && expected.must_topics.length > 0) {
    const actualTopics = new Set(
      actual.items.map((i) => (i.topic ?? '').toLowerCase()).filter((t) => t.length > 0),
    );
    for (const topic of expected.must_topics) {
      const needle = topic.toLowerCase();
      const found =
        actualTopics.has(needle) ||
        [...actualTopics].some((t) => t.includes(needle) || needle.includes(t));
      if (!found) {
        failures.push({
          path: 'items[].topic',
          message: `expected topic "${topic}" to appear in at least one item`,
        });
      }
    }
  }

  if (expected.must_answer_kinds && expected.must_answer_kinds.length > 0) {
    const actualKinds = new Set(actual.items.map((i) => i.answer_kind));
    for (const kind of expected.must_answer_kinds) {
      if (!actualKinds.has(kind)) {
        failures.push({
          path: 'items[].answer_kind',
          message: `expected answer_kind "${kind}" to appear in at least one item`,
        });
      }
    }
  }

  if (typeof expected.must_template_count === 'number') {
    if (actual.problem_templates.length < expected.must_template_count) {
      failures.push({
        path: 'problem_templates.length',
        message: `expected at least ${expected.must_template_count} templates, got ${actual.problem_templates.length}`,
      });
    }
  }

  if (typeof expected.max_cost_usd === 'number') {
    const actualUsd = actual.usage.cost_usd_micros / 1_000_000;
    if (actualUsd > expected.max_cost_usd) {
      failures.push({
        path: 'usage.cost_usd_micros',
        message: `cost $${actualUsd.toFixed(6)} exceeds max $${expected.max_cost_usd.toFixed(6)}`,
      });
    }
  }

  if (expected.must_diagrams === true) {
    if (actual.diagrams.length === 0) {
      failures.push({
        path: 'diagrams',
        message: 'expected at least one diagram, got none',
      });
    }
    const hasDiagramLabelItem = actual.items.some((i) => i.answer_kind === 'diagram_label');
    if (actual.diagrams.length > 0 && !hasDiagramLabelItem) {
      failures.push({
        path: 'items[].answer_kind',
        message: 'fixture declares must_diagrams: true but no item has answer_kind="diagram_label"',
      });
    }
    for (const [di, diag] of actual.diagrams.entries()) {
      const [bx0, by0, bx1, by1] = diag.bounding_box;
      for (const [li, label] of diag.labels.entries()) {
        const [tx, ty] = label.target_xy;
        if (tx < bx0 || tx > bx1 || ty < by0 || ty > by1) {
          failures.push({
            path: `diagrams[${di}].labels[${li}].target_xy`,
            message: `target_xy [${tx}, ${ty}] outside bounding_box [${bx0}, ${by0}, ${bx1}, ${by1}]`,
          });
        }
      }
    }
  }

  return failures;
}
