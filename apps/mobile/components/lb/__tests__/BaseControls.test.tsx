import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { UI } from '../../../lib/theme/components.js';
import { Btn } from '../Btn.js';
import { Chip } from '../Chip.js';
import { CircleBtn } from '../CircleBtn.js';
import { IconBtn } from '../IconBtn.js';
import { Field } from '../Field.js';
import { ListGroup, Row } from '../ListGroup.js';
import { Progress } from '../Progress.js';
import { Segmented } from '../Segmented.js';

describe('base control compatibility (#548)', () => {
  it('keeps a waiting button disabled and dims it without submitting', () => {
    const submit = vi.fn();
    renderInApp(
      <Btn disabled onPress={submit}>
        Prüfen
      </Btn>,
    );
    const button = screen.getByRole('button', { name: 'Prüfen' });
    fireEvent.click(button);
    expect(submit).not.toHaveBeenCalled();
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(styleOf(button).opacity).toBe(String(UI.disabledOpacity));
  });
  it('shares one icon implementation and prevents busy actions', () => {
    expect(CircleBtn).toBe(IconBtn);
    const submit = vi.fn();
    renderInApp(<IconBtn icon="send" busy onPress={submit} accessibilityLabel="Senden" />);
    const button = screen.getByRole('button', { name: 'Senden' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(button);
    expect(submit).not.toHaveBeenCalled();
  });
  it('centers a smaller icon face within a full target and gives short chips the same reach', () => {
    renderInApp(
      <>
        <IconBtn
          icon="send"
          size={UI.iconButton.composer}
          onPress={() => undefined}
          accessibilityLabel="Senden"
        />
        <Chip onPress={() => undefined}>Ja</Chip>
      </>,
    );
    const icon = screen.getByRole('button', { name: 'Senden' });
    expect(styleOf(icon).minWidth).toBe('44px');
    expect(styleOf(icon).minHeight).toBe('44px');
    expect(styleOf(icon.firstElementChild as Element).width).toBe('40px');
    const chip = screen.getByRole('button', { name: 'Ja' });
    expect(styleOf(chip).minWidth).toBe('44px');
    expect(styleOf(chip).minHeight).toBe('44px');
  });
  it('keeps a chip trailing action outside its main press target', () => {
    const choose = vi.fn();
    const remove = vi.fn();
    renderInApp(
      <Chip onPress={choose} trailing={<Btn onPress={remove}>Entfernen</Btn>}>
        Mathe
      </Chip>,
    );
    const trailing = screen.getByRole('button', { name: 'Entfernen' });
    expect(trailing.parentElement?.closest('button')).toBeNull();
    fireEvent.click(trailing);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(choose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mathe' }));
    expect(choose).toHaveBeenCalledTimes(1);
  });
  // requires live verification in Claude Code session
  it('updates a mounted help chip when transparency is reduced without losing its action', async () => {
    const listeners = new Set<() => void>();
    let reduced = false;
    const media = vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      get matches() {
        return query.includes('reduced-transparency') && reduced;
      },
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        if (query.includes('reduced-transparency')) listeners.add(listener as () => void);
      },
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) =>
        listeners.delete(listener as () => void),
      dispatchEvent: () => true,
    }));
    try {
      const choose = vi.fn();
      renderInApp(
        <Chip tone="default" onPress={choose}>
          Tipp
        </Chip>,
      );
      const chip = screen.getByRole('button', { name: 'Tipp' });
      const fill = () => styleOf(screen.getByText('Tipp').parentElement!).backgroundColor;
      const initial = fill();
      await act(async () => {
        reduced = true;
        for (const notify of listeners) notify();
      });
      await waitFor(() => expect(fill()).not.toBe(initial));
      fireEvent.click(chip);
      expect(choose).toHaveBeenCalledOnce();
      await act(async () => {
        reduced = false;
        for (const notify of listeners) notify();
      });
      await waitFor(() => expect(fill()).toBe(initial));
    } finally {
      media.mockRestore();
    }
  });
  it('shows the error instead of its hint and retains the native field callback', () => {
    const change = vi.fn();
    renderInApp(
      <Field
        label="Name"
        hint="Dein Name"
        error
        errorMessage="Bitte ergänzen"
        value=""
        onChangeText={change}
      />,
    );
    expect(screen.queryByText('Dein Name')).toBeNull();
    expect(screen.getByText('Bitte ergänzen')).toBeDefined();
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Lea' } });
    expect(change).toHaveBeenCalledWith('Lea');
  });
  it('keeps row navigation separate from its trailing action and static rows noninteractive', () => {
    const open = vi.fn();
    const practice = vi.fn();
    renderInApp(
      <ListGroup label="Material">
        <Row title="Mathe" onPress={open} trailing={<Btn onPress={practice}>Üben</Btn>} />
        <Row title="Klasse" value="7" />
      </ListGroup>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Üben' }));
    expect(practice).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mathe' }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Klasse, 7' })).toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'Üben' })
        .closest('button')
        ?.parentElement?.closest('button'),
    ).toBeNull();
  });
  it('announces the chosen exclusive option and forwards the original typed value', () => {
    const change = vi.fn();
    renderInApp(
      <Segmented
        options={[
          { value: 'new', label: 'Neues Konto' },
          { value: 'login', label: 'Anmelden' },
        ]}
        value="new"
        onChange={change}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Neues Konto' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Anmelden' }));
    expect(change).toHaveBeenCalledWith('login');
  });
  it('clamps both legacy and segmented progress without invalid values', () => {
    const view = renderInApp(<Progress value={2} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1');
    view.rerender(<Progress total={3} current={1} part={0.25} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1.25');
    view.rerender(<Progress total={0} current={5} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
  });
});
