// Query keys, in one place (no React Native import: unit tests use them too).

export const keys = {
  me: ['me'] as const,
  home: ['buddy', 'home'] as const,
  settings: ['buddy', 'settings'] as const,
  memory: ['buddy', 'memory'] as const,
  library: ['library'] as const,
  material: (id: string) => ['material', id] as const,
  materialItems: (id: string) => ['material', id, 'items'] as const,
  session: (id: string) => ['practice', id] as const,
};
