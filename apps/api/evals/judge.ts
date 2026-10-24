// requires live verification in Claude Code session
// A fixed judge across candidates: changing the tested model must not change the examiner.
import type { Config } from '../src/config.js';
import { llmGateway } from '../src/production.js';
export function evalJudge(config: Config) {
  return llmGateway(
    config.LLM_BACKEND === 'openai'
      ? {
          ...config,
          OPENAI_MODEL_SMART: 'gpt-5.4-mini',
          OPENAI_MODEL_FAST: 'gpt-5.4-mini',
          OPENAI_ROUTES: {},
        }
      : config,
  );
}
