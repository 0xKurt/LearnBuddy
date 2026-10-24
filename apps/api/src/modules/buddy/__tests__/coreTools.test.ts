// The act tools the core declares, and where a domain's join them (issue #107, cut 7b). The core
// names only its own; the learning domain registers its ten at start-up, each where it always
// stood, because the order is part of the schema the model reads (the prompt itself is pinned
// byte for byte in prompt-pin.test.ts).

import { describe, expect, it } from 'vitest';

import { registerLearning } from '../../learning/register.js';
import { ACT_SCHEMAS } from '../decision.js';
import { ACT_TOOLS, toolsFor } from '../registry.js';

const CORE = [
  'remember',
  'correct_memory',
  'forget',
  'set_level',
  'plan_exam',
  'update_goal',
  'close_goal',
  'plan_step',
  'update_step',
  'mark_step_done',
  'set_contact',
  'set_voice',
  'schedule_check',
  'open_area',
];

describe('act tools: the core and what a domain adds (#107, cut 7b)', () => {
  it('declares only its own tools before a domain registers', () => {
    expect(Object.keys(ACT_SCHEMAS)).toEqual(CORE);
    expect(Object.keys(ACT_TOOLS).sort()).toEqual([...CORE].sort());
  });

  it("puts the learning domain's tools where they always stood, once however often it registers", () => {
    registerLearning();
    registerLearning();
    const all = [
      'remember',
      'correct_memory',
      'forget',
      'set_level',
      'plan_exam',
      'update_goal',
      'close_goal',
      'prepare_practice',
      'plan_step',
      'update_step',
      'mark_step_done',
      'request_material',
      'delete_material',
      'rename_material',
      'delete_item',
      'set_contact',
      'set_voice',
      'schedule_check',
      'offer_learning',
      'offer_drill',
      'show_figure',
      'open_area',
      'start_roleplay',
      'plan_talk',
      'offer_rehearsal',
    ];
    expect(Object.keys(ACT_SCHEMAS)).toEqual(all);
    expect(Object.keys(ACT_TOOLS).sort()).toEqual([...all].sort());
    expect(toolsFor('check')).toEqual(['prepare_practice', 'request_material', 'schedule_check']);
  });
});
