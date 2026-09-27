// The conversation history in day-sized pieces for a virtualised list (app/history.tsx,
// gaps.md #22): only the days on screen are drawn. Each piece keeps its messages in order;
// `line` says whether the list must draw the day line itself — for today when it follows
// earlier days (a piece that starts on an earlier day draws its own, like the home).

import { localDateOf } from './time.js';

export type DayGroup<T> = { day: string; messages: T[]; todayLine: boolean };

export function dayGroups<T extends { created_at: string }>(
  messages: readonly T[],
  now: Date = new Date(),
): DayGroup<T>[] {
  const today = localDateOf(now);
  const groups: DayGroup<T>[] = [];
  for (const m of messages) {
    const day = localDateOf(m.created_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.messages.push(m);
    else groups.push({ day, messages: [m], todayLine: day === today && groups.length > 0 });
  }
  return groups;
}
