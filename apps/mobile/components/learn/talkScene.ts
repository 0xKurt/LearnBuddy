// The learning domain's scene on the conversation screen (components/voice/talkScene.ts
// `talkScene`, issue #244): a running roleplay — its name, its language, who Buddy plays, its
// start card, and its end (the feedback lands in the thread).

import type { MessageView } from '@learnbuddy/shared-types/contracts';

import type { TalkScenes } from '../voice/talkScene.js';
import { roleplayLabel, useEndRoleplay } from './RoleplayLive.js';

type Action = MessageView['actions'][number];

/** Whether this action is the start card of that roleplay. */
export const startsRoleplay =
  (roleplayId: string) =>
  (a: Action): boolean =>
    a.summary.tool === 'start_roleplay' && a.summary.roleplay_id === roleplayId;

/** Who Buddy plays in the running roleplay, from its role card in the thread (if still there). */
export function roleIn(thread: readonly MessageView[], roleplayId: string): string | null {
  for (const m of thread)
    for (const a of m.actions)
      if (a.summary.tool === 'start_roleplay' && a.summary.roleplay_id === roleplayId)
        return a.summary.role;
  return null;
}

export const roleplayScene: TalkScenes = {
  of: (h) => {
    const roleplay = h.roleplay;
    return roleplay
      ? {
          id: roleplay.id,
          title: roleplay.scene,
          label: (t) => roleplayLabel(t, roleplay.language),
          language: roleplay.language,
          role: roleIn(h.thread, roleplay.id),
          starts: startsRoleplay(roleplay.id),
        }
      : null;
  },
  useEnd: useEndRoleplay,
};
