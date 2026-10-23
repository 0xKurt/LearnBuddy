// Her photo as her message (issue #632): before, a sheet she sent stood nowhere in the thread —
// the thumbnails above the field vanished, and 10–20 s nothing said that anything happened. Now
// it is her message from the tap, with the upload's own progress, then her stored message with
// the server's stage; and Buddy's "Blatt bereit" carries the start of what it announces.

import type { MessageView } from '@learnbuddy/shared-types/contracts';
import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { registerLearning } from '../../../lib/learning/register.js';
import { sendingShown, useSendingSheet } from '../../../lib/capture/sending.js';
import { renderInApp } from '../../../testing/render.js';
import { Conversation } from '../Conversation.js';
import { SheetBubble, SendingSheetBubble } from '../SheetBubble.js';

registerLearning();

const MATERIAL = '44444444-4444-4444-8444-444444444444';
const STEP = '55555555-5555-4555-8555-555555555555';

const base: Omit<MessageView, 'id' | 'role' | 'text'> = {
  status: 'done',
  failure_code: null,
  client_message_id: null,
  options: null,
  reply_to_id: null,
  outreach: null,
  actions: [],
  roleplay_feedback: null,
  created_at: '2026-10-14T14:00:00.000Z',
};

const sent = (stage: NonNullable<MessageView['sheet']>['stage'], pages = 1): MessageView => ({
  ...base,
  id: '66666666-6666-4666-8666-666666666666',
  role: 'learner',
  text: '',
  sheet: { material_id: MATERIAL, pages, stage },
});

const thread = (messages: MessageView[]) =>
  renderInApp(<Conversation messages={messages} pending={null} busy={false} />);

describe('her sheet in the thread (issue #632)', () => {
  it('keeps the photo zoom button outside an image role and labels its thumbnail (#870)', () => {
    const { container } = renderInApp(
      <SheetBubble
        uris={['blob:sheet']}
        pages={1}
        label="Du hast ein Foto geschickt"
        line={{ text: 'Buddy liest es gerade …', tone: 'busy' }}
      />,
    );
    expect(container.querySelector('[role="img"] button, [role="img"] [role="button"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Foto 1 von 1' })).toBeTruthy();
  });

  it('is her pages with where they stand, never an empty bubble', () => {
    thread([sent('reading', 2)]);
    expect(screen.getByText('2 Fotos · Buddy liest es gerade …')).toBeTruthy();
    expect(
      screen.getByLabelText('Du hast 2 Fotos geschickt. 2 Fotos · Buddy liest es gerade …'),
    ).toBeTruthy();
  });

  it.each([
    ['waiting', 'Angekommen · gleich liest Buddy es'],
    ['building', 'Gelesen · Buddy macht Übungen daraus …'],
    ['ready', 'Gelesen'],
    ['failed', 'Nicht gelesen'],
    ['deleted', 'Gelöscht'],
  ] as const)('says %s as the server reports it', (stage, words) => {
    thread([sent(stage)]);
    expect(screen.getByText(words)).toBeTruthy();
  });

  it('says nothing where nothing works on it', () => {
    thread([sent(null)]);
    expect(screen.getByLabelText('Du hast ein Foto geschickt')).toBeTruthy();
    expect(screen.queryByText(/Gelesen|liest/)).toBeNull();
  });

  it('carries the start of the practice a background message announces', () => {
    thread([
      sent('ready'),
      {
        ...base,
        id: '77777777-7777-4777-8777-777777777777',
        role: 'buddy',
        text: 'Neues Arbeitsblatt bereit.',
        announces: {
          step_id: STEP,
          title: 'Hauptstädte',
          question_count: 3,
          est_minutes: 4,
          outcome: null,
        },
        created_at: '2026-10-14T14:01:00.000Z',
      },
    ]);
    expect(screen.getByText('Hauptstädte')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Los geht/ })).toBeTruthy();
  });
});

describe('the sheet she is sending (issue #632)', () => {
  beforeEach(() => act(() => useSendingSheet.setState({ sheet: null })));

  it('stands from the tap with the upload’s own progress', () => {
    act(() => useSendingSheet.getState().start({ requestId: 'r1', uris: [], pages: 2 }));
    const sheet = useSendingSheet.getState().sheet!;
    renderInApp(<SendingSheetBubble sheet={sheet} />);
    expect(screen.getByText('Einen Moment …')).toBeTruthy();
  });

  it('gives way to her stored message, and leaves after a failed send', () => {
    const store = useSendingSheet.getState();
    act(() => store.start({ requestId: 'r1', uris: [], pages: 1 }));
    act(() => store.update('r1', { progress: null, materialId: MATERIAL }));
    const sheet = useSendingSheet.getState().sheet;
    expect(sendingShown(sheet, new Set())).not.toBeNull();
    expect(sendingShown(sheet, new Set([MATERIAL]))).toBeNull();
    // Another send's update or end does not touch this one.
    act(() => store.end('other'));
    expect(useSendingSheet.getState().sheet).not.toBeNull();
    act(() => store.end('r1'));
    expect(useSendingSheet.getState().sheet).toBeNull();
  });
});
