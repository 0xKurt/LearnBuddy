import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { CheckAction } from './CheckBar.js';

type Entry = { key: string; action: CheckAction };
type Registration = (key: string, action: CheckAction | null) => void;
const Current = createContext<CheckAction | null>(null);
const Register = createContext<Registration>(() => undefined);

/** A secondary answer temporarily owns the existing Composer's primary slot. */
export function CheckOverrideProvider({ children }: { children: ReactNode }) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const register = useCallback<Registration>((key, action) => {
    setEntry((before) => (action ? { key, action } : before?.key === key ? null : before));
  }, []);
  return (
    <Register.Provider value={register}>
      <Current.Provider value={entry?.action ?? null}>{children}</Current.Provider>
    </Register.Provider>
  );
}

export function useCheckOverride(): CheckAction | null {
  return useContext(Current);
}

export function useRegisterCheckOverride(key: string, action: CheckAction | null): void {
  const register = useContext(Register);
  useEffect(() => {
    register(key, action);
  }, [register, key, action]);
  useEffect(() => () => register(key, null), [register, key]);
}
