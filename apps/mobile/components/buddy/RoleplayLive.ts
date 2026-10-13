// What a running roleplay (issue #244) is on both screens that show it — the chat with its strip
// (`RoleplayStrip`) and the conversation screen while the scene is spoken (app/talk.tsx): how it
// is named, and how it ends. Ending puts the feedback into the thread of the home that comes back.

import type { RoleplayLanguage } from '@learnbuddy/shared-types/contracts';
import type { TFunction } from 'i18next';
import { useState } from 'react';

import { endRoleplay } from '../../lib/api/endpoints.js';
import { setHome } from '../../lib/api/queries.js';
import { messageFor } from '../../lib/errors.js';
import { toast } from '../lb/Toast.js';

/** `end` resolves to whether it is over: false when the request failed (said in a toast). */
export function useEndRoleplay(roleplayId: string | null): {
  busy: boolean;
  end: () => Promise<boolean>;
} {
  const [busy, setBusy] = useState(false);
  async function end(): Promise<boolean> {
    if (busy || roleplayId === null) return false;
    setBusy(true);
    try {
      const res = await endRoleplay(roleplayId);
      setHome(res.home);
      return true;
    } catch (err) {
      toast.show(messageFor(err), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, end };
}

/** "Englisch · Rollenspiel": the language first, as the design names it (Modes.jsx:20). */
export function roleplayLabel(t: TFunction, language: RoleplayLanguage): string {
  return `${t(`buddy:roleplay.lang.${language}`)} · ${t('buddy:roleplay.label')}`;
}
