import { useMounted } from '../../lib/useMounted.js';
// One ephemeral destination menu. Routes and domain confirmations start only after its host closes.
import { router, usePathname } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { currentSession, onSessionChange } from '../../lib/auth/session.js';
import { MenuSheet } from '../buddy/MenuSheet.js';

export type Contextual = {
  owner: string;
  content: (choose: (run: () => void) => void) => ReactNode;
};
type Menu = {
  open: (contextual?: Contextual) => void;
  cancel: (expectedOwner?: string) => void;
  choose: (run: () => void) => void;
  closed: () => void;
  visible: boolean;
  contextual: Contextual | undefined;
};
const Context = createContext<Menu | null>(null);
export function MoreProvider({ children }: { children: ReactNode }) {
  const alive = useMounted();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [contextual, setContextual] = useState<Contextual>();
  const generation = useRef(0);
  const [epoch, setEpoch] = useState(0);
  const openNow = useRef(false);
  const pending = useRef<{ epoch: number; run: () => void } | null>(null);
  const owner = useRef(currentSession()?.user_id);
  const contextualOwner = useRef<string | undefined>(undefined);
  const cancel = useCallback(
    (expectedOwner?: string) => {
      if (expectedOwner !== undefined && contextualOwner.current !== expectedOwner) return;
      contextualOwner.current = undefined;
      generation.current += 1;
      openNow.current = false;
      pending.current = null;
      if (!alive.current) return;
      setEpoch(generation.current);
      setVisible(false);
      setContextual(undefined);
    },
    [alive],
  );
  useEffect(() => cancel(), [pathname, cancel]);
  useEffect(
    () =>
      onSessionChange((session) => {
        if (owner.current !== session?.user_id) cancel();
        owner.current = session?.user_id;
      }),
    [cancel],
  );
  useEffect(
    () => () => {
      pending.current = null;
      generation.current += 1;
      openNow.current = false;
    },
    [],
  );
  const open = useCallback(
    (next?: Contextual) => {
      if (!alive.current) return;
      generation.current += 1;
      setEpoch(generation.current);
      openNow.current = true;
      pending.current = null;
      contextualOwner.current = next?.owner;
      setContextual(next);
      setVisible(true);
    },
    [alive],
  );
  const choose = useCallback(
    (epoch: number, run: () => void) => {
      if (!alive.current || !openNow.current || generation.current !== epoch || pending.current)
        return;
      openNow.current = false;
      pending.current = { epoch, run };
      setVisible(false);
    },
    [alive],
  );
  const closed = useCallback(
    (epoch: number) => {
      if (!alive.current || generation.current !== epoch) return;
      const action = pending.current;
      pending.current = null;
      contextualOwner.current = undefined;
      setContextual(undefined);
      if (action?.epoch === epoch) action.run();
    },
    [alive],
  );
  return (
    <Context.Provider
      value={{
        open,
        cancel,
        choose: (run) => choose(epoch, run),
        closed: () => closed(epoch),
        visible,
        contextual,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useMore() {
  return useContext(Context);
}
/** Render inside the actual theme/query frame; replacing this host cancels an old pending handoff. */
export function MoreHost() {
  const menu = useMore();
  const cancel = menu?.cancel;
  useEffect(
    () => () => {
      cancel?.();
    },
    [cancel],
  );
  if (!menu) return null;
  return (
    <MenuSheet
      visible={menu.visible}
      onClose={() => menu.cancel()}
      onClosed={menu.closed}
      onGo={(path) => menu.choose(() => router.push(path))}
      contextual={menu.contextual?.content(menu.choose)}
    />
  );
}
