// The design's press state (design folder readme.md "States": press = scale .97, nothing else;
// #599): a control dips under a finger and does not dim. Btn and IconBtn hold this through
// `pressedStyle` (DesignBase.test.tsx); here the choice controls that dimmed until the clean-up.
// With Reduce Motion the dip is off and the press dims instead, so no control stays mute.

import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UI } from '../../../lib/theme/components.js';
import * as motion from '../../../lib/theme/motion.js';
import { renderInApp } from '../../../testing/render.js';
import { Checkbox } from '../Checkbox.js';
import { Chip } from '../Chip.js';
import { FamilyChoice } from '../LookChoice.js';
import { Segmented } from '../Segmented.js';
import { VoiceOption } from '../VoiceOption.js';

const nothing = () => undefined;

/** Each control, the role and name of its target, and which element under it takes the press. */
const CONTROLS: Array<{
  name: string;
  draw: () => React.ReactElement;
  role: string;
  label: string;
  /** From the target to the element that answers: the painted face, or the box of a checkbox. */
  face: (target: HTMLElement) => HTMLElement;
}> = [
  {
    name: 'Chip',
    draw: () => <Chip onPress={nothing}>Tipp</Chip>,
    role: 'button',
    label: 'Tipp',
    face: (target) => target.firstElementChild as HTMLElement,
  },
  {
    name: 'Segmented',
    draw: () => (
      <Segmented
        options={[
          { value: 'a', label: 'Hell' },
          { value: 'b', label: 'Dunkel' },
        ]}
        value="a"
        onChange={nothing}
      />
    ),
    role: 'radio',
    label: 'Dunkel',
    face: (target) => target.firstElementChild as HTMLElement,
  },
  {
    name: 'Checkbox',
    draw: () => <Checkbox checked={false} onChange={nothing} label="Einverstanden" />,
    role: 'checkbox',
    label: 'Einverstanden',
    face: (target) => target.firstElementChild!.firstElementChild as HTMLElement,
  },
  {
    name: 'VoiceOption',
    draw: () => (
      <VoiceOption
        title="Ruhig"
        description="Eine ruhige Stimme"
        selected={false}
        disabled={false}
        hint="Tippe zum Wählen"
        onPress={nothing}
        previewing={false}
        previewLabel="Ruhig anhören"
        onPreview={nothing}
      />
    ),
    role: 'radio',
    label: 'Ruhig',
    face: (target) => target.firstElementChild as HTMLElement,
  },
  {
    name: 'FamilyChoice',
    draw: () => <FamilyChoice />,
    role: 'radio',
    label: 'Meer',
    face: (target) => target.firstElementChild as HTMLElement,
  },
];

/** The row of a checkbox dims under Reduce Motion; everywhere else the face itself does. */
const dimmed = (name: string, target: HTMLElement, face: HTMLElement) =>
  name === 'Checkbox' ? (target.firstElementChild as HTMLElement) : face;

afterEach(() => vi.restoreAllMocks());

describe('press = scale .97, no dimming (readme.md "States", #599)', () => {
  for (const control of CONTROLS) {
    it(`${control.name} dips under a finger and keeps its full strength`, () => {
      vi.spyOn(motion, 'useMotionReduced').mockReturnValue(false);
      renderInApp(control.draw());
      const target = screen.getByRole(control.role, { name: control.label });
      const face = control.face(target);
      expect(face.style.transform).toBe('');
      fireEvent.keyDown(target, { key: 'Enter' });
      expect(face.style.transform).toBe(`scale(${UI.pressScale})`);
      expect(dimmed(control.name, target, face).style.opacity).toBe('');
      fireEvent.keyUp(target, { key: 'Enter' });
      expect(face.style.transform).toBe('');
    });

    it(`${control.name} dims instead where motion is reduced`, () => {
      vi.spyOn(motion, 'useMotionReduced').mockReturnValue(true);
      renderInApp(control.draw());
      const target = screen.getByRole(control.role, { name: control.label });
      const face = control.face(target);
      fireEvent.keyDown(target, { key: 'Enter' });
      expect(face.style.transform).toBe('');
      expect(dimmed(control.name, target, face).style.opacity).toBe(String(UI.pressed.control));
    });
  }
});
