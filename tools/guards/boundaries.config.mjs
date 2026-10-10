// What is LearnBuddy's learning domain, and what is the generic Buddy (issue #107, owner 10.10.:
// "#107 setzt voraus, dass wir das hier alles richtig modular aufgebaut haben"). The generic part
// — identity, the buddy core (turn loop, context fence, tool runtime, memory, goals and steps,
// proactivity), scheduler, delivery, voice, llm, lib, the app shell and components/lb — never
// imports the domain; the domain registers itself into the core. dependency-cruiser (MIT) draws
// the import graph with this rule set; tools/guards/boundaries.mjs compares it with main.
//
// A file is DOMAIN when it matches one of these patterns. Everything else under the two apps is
// generic, except tests and the test harness (they may wire both) and the API's evals and
// scripts (they are run by hand against the whole app).

/** The learning domain, as repository paths. */
export const DOMAIN = [
  // API: practice, worksheets, the curriculum, the code-task sandbox …
  '^apps/api/src/modules/(practice|materials|curriculum)/',
  '^apps/api/src/sandbox/',
  // … and the school-specific tools, cards and connectors that still live in modules/buddy.
  '^apps/api/src/modules/buddy/(practiceTool|materialTools|grade|rehearse|roleplay|talkMeasure|talkTools|review)\\.ts$',
  '^apps/api/src/modules/buddy/connectors/(material|practice)\\.ts$',
  // App: the practice, worksheet and subject screens and their parts.
  '^apps/mobile/app/(practice|material|subject)/',
  '^apps/mobile/app/library\\.tsx$',
  '^apps/mobile/components/(practice|learn|library|math)/',
  '^apps/mobile/components/buddy/(RehearseCard|RehearsalResult|RoleplayCard|RoleplayResult|ReadAlongBubble)\\.tsx$',
  '^apps/mobile/components/capture/PhotoCheckCard\\.tsx$',
  '^apps/mobile/lib/(practice|math|music|photo)/',
  // The one place the domain gives the app's core what it adds (lib/learning/register.tsx):
  // app/_layout.tsx calls it once, the seam's only import of the domain.
  '^apps/mobile/lib/learning/',
  '^apps/mobile/lib/capture/materialUpload\\.ts$',
  '^apps/mobile/lib/buddy/(rehearsal|readingStages)\\.ts$',
  '^apps/mobile/lib/api/library(Cache|Queries)\\.ts$',
  // Maths, figures and the school sciences.
  '^packages/shared-math/',
];

/** Where the guard looks: the two apps' production code. */
export const ROOTS = [
  'apps/api/src',
  'apps/mobile/app',
  'apps/mobile/components',
  'apps/mobile/lib',
];

/** Not generic code: tests, the test harness, the API's evals and scripts. */
const NOT_GENERIC = ['(/__tests__/|\\.test\\.tsx?$|/testing/)', '^apps/api/(evals|scripts)/'];

/** dependency-cruiser's configuration (https://github.com/sverweij/dependency-cruiser). */
export default {
  forbidden: [
    {
      name: 'generic-to-domain',
      comment:
        'Generic Buddy code imports the learning domain (issue #107). Invert it: the domain registers itself into the core.',
      severity: 'error',
      from: { path: '^apps/(api/src|mobile)/', pathNot: [...DOMAIN, ...NOT_GENERIC] },
      to: { path: DOMAIN },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['node_modules', '\\.expo/', '/dist/', 'dist-web/'] },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.json'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
