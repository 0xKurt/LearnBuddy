// Hierarchical back navigation. Doc 05 §navigation-structure.
//
// Back is NOT history replay. Every back action — Android hardware back, the
// in-app CircleBtn/Btn back affordances, and post-action returns — moves
// exactly one level UP the screen hierarchy, regardless of how the user
// arrived (loops, repeated taps, deep links). At a hierarchy root the app
// minimizes/exits instead of replaying history.
//
// The hierarchy is a static parent map keyed by the route's segment pattern
// (group + path, dynamic segments as `[name]`). Parent resolution may read
// the current params so a child can return to the correct parent instance
// (e.g. a folder returns to its owning subject).

import { router, useGlobalSearchParams, useSegments } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { BackHandler } from 'react-native';

type Params = Record<string, string | string[] | undefined>;

/** A concrete destination. Loosely typed on purpose — grouped routes don't
 *  satisfy expo-router's typed-href generics without a cast. */
type UpHref = string | { pathname: string; params: Record<string, string> };

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Resolve the direct parent of the current screen.
 *
 * Returns:
 *  - an `UpHref` → navigate one level up to it
 *  - `null`      → current screen is a hierarchy root: a back press should
 *                  exit/minimize the app (the caller lets the OS handle it)
 */
export function resolveParent(segments: string[], params: Params): UpHref | null {
  const key = segments.join('/');

  switch (key) {
    // ── Learner surface — root is home ──────────────────────────────────────
    case '(learner)/home':
      return null;

    case '(learner)/subject/[subjectId]':
      return '/(learner)/home';

    case '(learner)/folder/[folderId]': {
      const subjectId = one(params.subjectId);
      return subjectId
        ? { pathname: '/(learner)/subject/[subjectId]', params: { subjectId } }
        : '/(learner)/home';
    }

    case '(learner)/material/[materialId]': {
      const folderId = one(params.folderId);
      const subjectId = one(params.subjectId);
      if (folderId) {
        return {
          pathname: '/(learner)/folder/[folderId]',
          params: { folderId, ...(subjectId ? { subjectId } : {}) },
        };
      }
      if (subjectId) {
        return { pathname: '/(learner)/subject/[subjectId]', params: { subjectId } };
      }
      return '/(learner)/home';
    }

    case '(learner)/practice':
      return '/(learner)/home';

    case '(learner)/practice/[templateId]':
      return '/(learner)/home';

    case '(learner)/chat/[sessionId]':
      return '/(learner)/home';

    case '(learner)/result':
      return '/(learner)/home';

    case '(learner)/capture': {
      const folderId = one(params.folderId);
      const subjectId = one(params.subjectId);
      if (folderId) {
        return {
          pathname: '/(learner)/folder/[folderId]',
          params: { folderId, ...(subjectId ? { subjectId } : {}) },
        };
      }
      if (subjectId) {
        return { pathname: '/(learner)/subject/[subjectId]', params: { subjectId } };
      }
      return '/(learner)/home';
    }

    case '(learner)/upload':
      return '/(learner)/home';

    // ── Admin surface — root is overview; leaving admin returns to learner ──
    case '(admin)/unlock':
    case '(admin)/overview':
      return '/(learner)/home';

    default:
      // Every other admin sub-screen is one level below overview.
      if (segments[0] === '(admin)') return '/(admin)/overview';
      // Anything unmapped (auth, onboarding wizard) has no hierarchy parent;
      // the handler isn't mounted there, so this is just a safe fallback.
      return null;
  }
}

/**
 * Returns a stable `navigateUp()` callback.
 *
 * `navigateUp()` returns `true` when it moved up a level (caller treats the
 * back as handled) and `false` at a hierarchy root (caller lets the OS
 * minimize/exit the app). Up-navigation uses `replace` so interaction
 * history never accumulates — the visible stack always mirrors the
 * hierarchy, not the click path.
 */
export function useNavigateUp(): () => boolean {
  const segments = useSegments();
  const params = useGlobalSearchParams();

  return useCallback((): boolean => {
    const parent = resolveParent(segments as string[], params);
    if (parent == null) return false;
    // Cast: grouped routes ('/(learner)/…') aren't expressible in the typed
    // Href union but are valid hrefs at runtime — matches the codebase's
    // existing `as never` convention for group navigation.
    router.replace(parent as never);
    return true;
  }, [segments, params]);
}

/**
 * Mount in a surface layout (learner / admin). Routes the Android hardware
 * back button through the hierarchy: one level up per press, and at the
 * root returns `false` so Android performs its default action (background
 * the app) instead of replaying history.
 */
export function useHierarchicalBack(): void {
  const navigateUp = useNavigateUp();
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => navigateUp());
    return () => sub.remove();
  }, [navigateUp]);
}
