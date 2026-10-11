import type { TextProps } from 'react-native';
import { expect, it, vi } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { PickerField } from '../PickerField.js';

const label = vi.hoisted(() => ({ props: null as TextProps | null }));
vi.mock('react-native', async (original) => {
  const actual = await original<typeof import('react-native')>();
  const { createElement } = await import('react');
  return {
    ...actual,
    Text: (props: TextProps) => {
      if (props.children === 'Niedersachsen') label.props = props;
      return createElement(actual.Text, props);
    },
  };
});

it('keeps a selected full-width region label at readable native typography rather than auto-shrinking it', () => {
  renderInApp(
    <PickerField
      label="Bundesland"
      placeholder="Bundesland wählen"
      title="Bundesland"
      options={[{ value: 'ni', label: 'Niedersachsen' }]}
      value="ni"
      onChange={() => undefined}
    />,
  );
  expect(label.props).not.toBeNull();
  expect(label.props!.adjustsFontSizeToFit).not.toBe(true);
  expect(label.props!.numberOfLines).toBe(2);
});
