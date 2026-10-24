import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { TYPE } from '../../../lib/theme/type.js';
import { RichText } from '../RichText.js';
import { registerLearning } from '../../../lib/learning/register.js';

registerLearning();

it('renders summary structure as text without executing HTML, images or links', () => {
  const { container } = renderInApp(
    <RichText
      text={
        '## Überblick\n- **Wasser** steigt\n- Wolken entstehen\n\n<a href="javascript:alert(1)">Text</a>\n![Bild](https://example.test/image)'
      }
      style={TYPE.body}
    />,
  );
  expect(screen.getByText('Überblick')).toBeTruthy();
  expect(screen.getByText('Wasser')).toBeTruthy();
  expect(container.querySelector('a, img, script')).toBeNull();
  expect(container.textContent).not.toContain('##');
  expect(container.textContent).not.toContain('**');
});
