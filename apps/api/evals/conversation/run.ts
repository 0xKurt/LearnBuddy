// requires live verification in Claude Code session
// Synthetic conversation only; real EU transport and production Buddy prompt/schema (#937).
import { writeFileSync } from 'node:fs';
import { loadConfig } from '../../src/config.js';
import { OpenAIGateway } from '../../src/llm/openai.js';
import { buildContents } from '../../src/modules/buddy/context.js';
import { buddyPrompt } from '../../src/modules/buddy/prompts.js';
import { registerLearning } from '../../src/modules/learning/register.js';

registerLearning();
const config = loadConfig({
  ...process.env,
  DATABASE_URL: 'postgres://unused/unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
  SUPABASE_URL: 'http://unused.local',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
});
const gateway = new OpenAIGateway(config);
const prompt = buddyPrompt();
const cases = [
  { id: 'smalltalk', text: 'Danke, das hat geholfen!', min: 2, max: 60 },
  {
    id: 'detail',
    text: 'Erklär mir den Wasserkreislauf ausführlich mit allen wichtigen Stationen und warum er wichtig ist.',
    min: 130,
    max: 700,
  },
  {
    id: 'everything',
    text: 'Erzähl mir alles Wichtige über den Wasserkreislauf für die Schule.',
    min: 120,
    max: 700,
  },
  {
    id: 'spoken',
    text: 'Ich spreche gerade mit dir. Erklär mir den Wasserkreislauf so, dass ich gut zuhören kann.',
    min: 60,
    max: 350,
  },
  {
    id: 'summary',
    text: 'Fasse unser ganzes Gespräch als übersichtliche Zusammenfassung zusammen.',
    min: 35,
    max: 250,
  },
];
const previous = [
  { role: 'learner' as const, text: 'Erklär mir den Wasserkreislauf.' },
  {
    role: 'buddy' as const,
    text: 'Die Sonne erwärmt das Wasser in Flüssen, Seen und Meeren. Ein Teil verdunstet und steigt als Wasserdampf auf. In kühleren Luftschichten kondensiert der Wasserdampf zu kleinen Tröpfchen. Viele Tröpfchen bilden Wolken. Als Niederschlag fällt Wasser zurück. Es versickert im Boden oder fließt in Bächen und Flüssen ins Meer. Dann beginnt alles von vorn.',
  },
  {
    role: 'learner' as const,
    text: 'Ich verwechsle Verdunstung und Kondensation. Die möchte ich noch üben.',
  },
  {
    role: 'buddy' as const,
    text: 'Verdunstung bedeutet flüssig zu gasförmig; Kondensation bedeutet gasförmig zu flüssig. Beim Wasserkreislauf liefert die Sonne die Wärme für die Verdunstung. Beim Abkühlen kondensiert Wasserdampf. Damit sind es entgegengesetzte Vorgänge. Du hast die Stationen schon genannt, möchtest aber diese zwei Begriffe noch auseinanderhalten können.',
  },
  {
    role: 'learner' as const,
    text: 'Ich will eine kalte Glasscheibe über warmes Wasser halten. Wie ich die Beobachtung festhalte, weiß ich noch nicht.',
  },
  {
    role: 'buddy' as const,
    text: 'Am kalten Glas kannst du Kondensation beobachten: Wasserdampf wird wieder zu flüssigen Tröpfchen. Das knüpft an die Wolkenbildung an. Dein Versuch steht damit als Idee fest. Offen ist noch, wie du deine Beobachtungen festhältst. Wir haben bisher weder eine Zeichnung noch ein Protokoll dafür vereinbart. Die Unterscheidung der Begriffe bleibt dein Übungswunsch.',
  },
];
const results = [];
let costMicros = 0;
for (const c of cases) {
  // Five bounded calls, no tools/retries requested by the runner, no production data.
  if (costMicros > 700_000) throw new Error('budget reserve reached');
  const result = await gateway.generate({
    purpose: 'buddy_turn',
    tier: 'smart',
    promptVersion: prompt.version,
    system: prompt.turnSystem,
    schema: prompt.turnStepSchema,
    contents: buildContents('Learner: age 12, language de. No pending offers or homework.', [
      ...(c.id === 'summary' ? previous : []),
      { role: 'learner', text: c.text },
    ]),
    maxOutputTokens: 4096,
    temperature: 0.4,
    timeoutMs: 60_000,
    thinking: 'minimal',
  });
  costMicros += result.usage.costMicros;
  const reply = (result.json as { reply: string }).reply;
  const words = reply.trim().split(/\s+/).length;
  const summary =
    c.id !== 'summary' ||
    (/^#{1,6} /m.test(reply) &&
      /^[-*] /m.test(reply) &&
      /[Vv]erdunst/.test(reply) &&
      /[Kk]ondens/.test(reply) &&
      /[Gg]las|[Vv]ersuch/.test(reply) &&
      /[Bb]eobacht|[Oo]ffen|festh/.test(reply) &&
      words <
        previous
          .map((m) => m.text)
          .join(' ')
          .split(/\s+/).length);
  const complete =
    /[.!?][*]*$/.test(reply.trim()) &&
    (c.id === 'smalltalk' ||
      c.id === 'summary' ||
      (/Niederschlag|Regen/.test(reply) && /[Mm]eer|[Bb]oden/.test(reply)));
  const passed = words >= c.min && words <= c.max && summary && complete;
  results.push({ id: c.id, words, passed, reply, usage: result.usage });
  console.log(JSON.stringify({ id: c.id, words, passed, costMicros }));
}
writeFileSync('evals/conversation/result.json', JSON.stringify({ costMicros, results }, null, 2));
if (results.some((r) => !r.passed)) process.exitCode = 1;
