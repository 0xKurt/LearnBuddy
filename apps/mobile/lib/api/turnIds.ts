// A tap whose answer got lost on the way is sent again with the same client_turn_id,
// so the API replays it instead of recording it twice (hint-not-idempotent-from-app).

export type TurnIds = {
  /** Runs `send` with the id kept for `key`; a lost answer keeps it for the next tap. */
  run<T>(key: string, send: (clientTurnId: string) => Promise<T>): Promise<T>;
};

export function turnIds(mint: () => string, lost: (err: unknown) => boolean): TurnIds {
  const kept = new Map<string, string>();
  return {
    async run(key, send) {
      const id = kept.get(key) ?? mint();
      kept.set(key, id);
      try {
        const res = await send(id);
        kept.delete(key);
        return res;
      } catch (err) {
        // Only when the API may have it: a clear "no" (409 …) starts fresh next time.
        if (!lost(err)) kept.delete(key);
        throw err;
      }
    },
  };
}
