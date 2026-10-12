import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { StartChoice } from '../StartChoice.js';
import { StartStatus } from '../../learn/StartStatus.js';

describe('start presentation preserves actions and waiting', () => {
  it('keeps a long choice readable and invokes its real callback once', () => {
    const run = vi.fn();
    const title = 'Eine längere Aufgabe direkt von deinem Arbeitsblatt eintippen';
    renderInApp(<StartChoice title={title} icon="keyboard" tone="lavender" onPress={run} />);
    const choice = screen.getByRole('button', { name: title });
    expect(styleOf(choice).minHeight).toBe('64px');
    expect(styleOf(screen.getByText(title)).getPropertyValue('-webkit-line-clamp')).toBe('');
    fireEvent.click(choice);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('blocks a disabled choice without exposing decorative icons as additional actions', () => {
    const run = vi.fn();
    renderInApp(
      <StartChoice title="Foto machen" icon="camera" tone="sky" disabled onPress={run} />,
    );
    const choice = screen.getByRole('button', { name: 'Foto machen' });
    expect(choice.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(choice);
    expect(run).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
  it('retains actual preparing copy with static decoration, not an independent spinner', () => {
    renderInApp(<StartStatus state={{ status: 'preparing' }} />);
    expect(screen.getByText('Buddy bereitet vor …')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
