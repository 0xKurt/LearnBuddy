-- How much of a prompt the model served from its own prefix cache (issue #25).
--
-- Gemini's implicit caching discounts the stable *beginning* of consecutive requests, and
-- reports what it reused in usageMetadata.cachedContentTokenCount. The state block is
-- layered for it (modules/buddy/context.ts): stable sections first, the clock last. This
-- column is where that layering can be read back — it is the provider's number, not ours,
-- and 0 means "nothing reported", never "no saving proven" (rule 5).
--
-- cost_micros stays the undiscounted price: the provider's billing, not our arithmetic,
-- decides what a cache hit costs (docs/architecture.md §Speed).

alter table llm_calls add column cached_tokens int not null default 0;

comment on column llm_calls.cached_tokens is
  'Part of input_tokens the provider served from its prefix cache (0 = not reported).';
