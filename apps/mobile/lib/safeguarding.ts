// Only this explicit response carries code's fixed help answer. Ordinary errors still use
// messageFor; neither an engine's message nor an arbitrary error detail is shown as help.
import { SafeguardingDetails } from '@learnbuddy/shared-types/contracts';

import { ApiError } from './api/apiError.js';

export function safeguardingReply(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const help = SafeguardingDetails.safeParse(error.details);
  return help.success ? help.data.reply : null;
}
